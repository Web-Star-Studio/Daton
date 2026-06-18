/**
 * Backfill: popula `unit_id` em kpi_indicators a partir do texto
 * `unit`, via match exato (trim + lowercase) contra units.name.
 *
 * Modo dry-run por padrão. Use `--apply` para efetivar.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts backfill-kpi-unit-id
 *   pnpm --filter @workspace/scripts backfill-kpi-unit-id --apply
 */
import { db, pool, kpiIndicatorsTable, unitsTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

const apply = process.argv.includes("--apply");
console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

async function main() {
  const units = await db
    .select({ id: unitsTable.id, organizationId: unitsTable.organizationId, name: unitsTable.name })
    .from(unitsTable);

  // index: orgId -> normalizedName -> unitId
  const byOrg = new Map<number, Map<string, number>>();
  for (const u of units) {
    const key = (u.name ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!byOrg.has(u.organizationId)) byOrg.set(u.organizationId, new Map());
    byOrg.get(u.organizationId)!.set(key, u.id);
  }

  const indicators = await db
    .select({
      id: kpiIndicatorsTable.id,
      organizationId: kpiIndicatorsTable.organizationId,
      unit: kpiIndicatorsTable.unit,
      rollupStrategy: kpiIndicatorsTable.rollupStrategy,
    })
    .from(kpiIndicatorsTable)
    .where(isNull(kpiIndicatorsTable.unitId));

  const updates: { id: number; unitId: number }[] = [];
  const unmatched: { id: number; organizationId: number; unit: string | null }[] = [];

  for (const ind of indicators) {
    if (ind.rollupStrategy) continue; // corporativo: fica null por design
    const name = (ind.unit ?? "").trim().toLowerCase();
    const unitId = name ? byOrg.get(ind.organizationId)?.get(name) : undefined;
    if (unitId) {
      updates.push({ id: ind.id, unitId });
    } else {
      unmatched.push({ id: ind.id, organizationId: ind.organizationId, unit: ind.unit });
    }
  }

  console.log(`Vai associar ${updates.length} indicador(es) a uma unidade.`);

  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} indicador(es) sem match (ficam com unitId = null):`);
    for (const u of unmatched) {
      console.log(`  - indicador #${u.id} (org ${u.organizationId}) unit="${u.unit ?? ""}"`);
    }
    console.log();
  }

  if (!apply) {
    console.log("Para aplicar, rode novamente com --apply");
    await pool.end();
    return;
  }

  console.log("Aplicando UPDATE...");
  let updated = 0;
  for (const u of updates) {
    await db.update(kpiIndicatorsTable).set({ unitId: u.unitId }).where(eq(kpiIndicatorsTable.id, u.id));
    updated++;
  }
  console.log(`OK — ${updated} indicador(es) atualizado(s).`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});

import { db, kpiIndicatorsTable, unitsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

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

  let matched = 0;
  const unmatched: { id: number; organizationId: number; unit: string | null }[] = [];

  for (const ind of indicators) {
    if (ind.rollupStrategy) continue; // corporativo: fica null por design
    const name = (ind.unit ?? "").trim().toLowerCase();
    const unitId = name ? byOrg.get(ind.organizationId)?.get(name) : undefined;
    if (unitId) {
      await db.update(kpiIndicatorsTable).set({ unitId }).where(eq(kpiIndicatorsTable.id, ind.id));
      matched++;
    } else {
      unmatched.push({ id: ind.id, organizationId: ind.organizationId, unit: ind.unit });
    }
  }

  console.log(`Backfill concluído: ${matched} casados.`);
  console.log(`Não-casados (revisar manualmente): ${unmatched.length}`);
  for (const u of unmatched) {
    console.log(`  - indicador #${u.id} (org ${u.organizationId}) unit="${u.unit ?? ""}"`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

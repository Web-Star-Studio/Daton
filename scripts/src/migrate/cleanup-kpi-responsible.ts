/**
 * Cleanup: nullifies `responsible` em kpi_indicators quando o valor não bate
 * com o nome de nenhum usuário cadastrado na organização.
 *
 * Match: case-insensitive, trim, accent-strip.
 *
 * Modo dry-run por padrão. Use `--apply` para efetivamente atualizar.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts cleanup-kpi-responsible <orgId>           # dry-run
 *   pnpm --filter @workspace/scripts cleanup-kpi-responsible <orgId> --apply   # aplica
 */
import {
  db,
  pool,
  kpiIndicatorsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";

const rawOrgId = process.argv[2];
const apply = process.argv.includes("--apply");

if (!rawOrgId || isNaN(Number(rawOrgId))) {
  console.error("Usage: cleanup-kpi-responsible <orgId> [--apply]");
  process.exit(1);
}
const ORG_ID = Number(rawOrgId);

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
function normalize(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS, "").trim().toLowerCase();
}

async function main() {
  console.log(`Org ID: ${ORG_ID}`);
  console.log(`Mode:   ${apply ? "APPLY (vai atualizar o banco)" : "DRY-RUN (apenas relatório)"}`);
  console.log();

  const users = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.organizationId, ORG_ID));

  const validNames = new Set(users.map((u) => normalize(u.name)));
  console.log(`Usuários cadastrados: ${users.length}`);

  const indicators = await db
    .select({
      id: kpiIndicatorsTable.id,
      name: kpiIndicatorsTable.name,
      responsible: kpiIndicatorsTable.responsible,
    })
    .from(kpiIndicatorsTable)
    .where(
      and(
        eq(kpiIndicatorsTable.organizationId, ORG_ID),
        isNotNull(kpiIndicatorsTable.responsible),
      ),
    );

  console.log(`Indicadores com responsible preenchido: ${indicators.length}`);
  console.log();

  const invalid = indicators.filter((ind) => {
    const r = (ind.responsible ?? "").trim();
    if (!r) return true;
    return !validNames.has(normalize(r));
  });

  if (invalid.length === 0) {
    console.log("Nenhum responsável inválido encontrado. Nada a fazer.");
    await pool.end();
    return;
  }

  const uniqueInvalidValues = new Map<string, number>();
  for (const ind of invalid) {
    const v = (ind.responsible ?? "").trim() || "(vazio)";
    uniqueInvalidValues.set(v, (uniqueInvalidValues.get(v) ?? 0) + 1);
  }

  const sortedInvalid = [...uniqueInvalidValues.entries()].sort(
    (a, b) => b[1] - a[1],
  );

  console.log(`Responsáveis inválidos: ${invalid.length} indicador(es), ${sortedInvalid.length} valor(es) distinto(s):`);
  for (const [val, count] of sortedInvalid) {
    console.log(`  ${count}x  "${val}"`);
  }
  console.log();

  if (!apply) {
    console.log("Para aplicar a limpeza (nullificar esses responsibles), rode novamente com --apply");
    await pool.end();
    return;
  }

  console.log("Aplicando UPDATE...");
  const ids = invalid.map((i) => i.id);
  let updated = 0;
  for (const id of ids) {
    await db
      .update(kpiIndicatorsTable)
      .set({ responsible: null })
      .where(eq(kpiIndicatorsTable.id, id));
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

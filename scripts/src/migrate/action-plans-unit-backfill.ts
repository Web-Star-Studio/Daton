/**
 * Backfill: popula `action_plans.unit_id` para os planos já existentes,
 * reusando a MESMA regra que o POST já aplica aos planos novos —
 * `deriveActionPlanUnit()` em
 * `artifacts/api-server/src/services/action-plans/derive-unit.ts`:
 *   - origem com filial (kpi/swot/risk/training/environmental) → filial da
 *     entidade de origem;
 *   - família manual (manual/improvement/corrective/norm_requirement) →
 *     filial do ponto focal (`responsible_user_id`);
 *   - origens org-level (nonconformity/audit_finding/road_safety/incident/
 *     rac) ou sem filial derivável → null = corporativo.
 *
 * Por que importa: `unit_id = null` é lido como "corporativo" pela
 * visibilidade por papel (todo gestor vê). Sem este backfill, todo plano
 * antigo fica corporativo e a feature não vale nada para o acervo existente.
 *
 * Escopo: só planos com `unit_id IS NULL` — não todos. A coluna é FIXA na
 * criação e NÃO recalcula (ver o comentário dela no schema,
 * lib/db/src/schema/action-plans.ts): um plano que já tem unit_id (seja
 * porque o POST já gravou, seja de uma rodada anterior deste backfill) não é
 * tocado de novo, mesmo que a filial da origem mude depois — reprocessá-lo
 * seria recalcular, o que a spec proíbe. Os planos que ficam corporativo
 * (unit_id continua null) permanecem no filtro IS NULL e são reavaliados a
 * cada rodada, mas isso é inofensivo: a derivação é determinística e devolve
 * null de novo para o mesmo trio (org, origem, sourceRef/ponto focal) — nada
 * é escrito, nada muda. É isso que torna o script idempotente.
 *
 * Uso:
 *   TEST_ENV=integration pnpm exec tsx scripts/src/migrate/action-plans-unit-backfill.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, isNull } from "drizzle-orm";

// Carrega o .env certo ANTES de importar qualquer módulo que dependa de
// DATABASE_URL (import dinâmico logo abaixo). Este script roda sem
// `tsx --env-file` (o brief pede `TEST_ENV=integration pnpm exec tsx ...`
// puro), então quem garante a env é o próprio script. Espelha
// tests/setup/env.ts — mas resolve a raiz do repo a partir do próprio
// arquivo (não de `process.cwd()`): dependendo de como o `pnpm exec` é
// disparado (raiz do monorepo vs. dentro de scripts/, com ou sem
// `--filter`), o cwd muda; a localização deste arquivo, não.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const testEnv = process.env.TEST_ENV?.trim();
const envFileName =
  testEnv === "integration"
    ? ".env.integration"
    : testEnv === "unit"
      ? null
      : ".env";
const envPath = envFileName ? path.join(repoRoot, envFileName) : null;
if (envPath && fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL não definido (nem no ambiente, nem em .env/.env.integration).",
  );
  process.exit(1);
}

// Import dinâmico, só depois da env carregada: "@workspace/db" lê
// DATABASE_URL no top-level do módulo e lança se não estiver setado; um
// `import` estático seria avaliado antes do código acima (hoisting de ESM).
const { db, pool, actionPlansTable } = await import("@workspace/db");
// Reuso deliberado (não reimplementação) da regra de derivação — ver o
// tsconfig.json deste pacote (rootDir alargado) para o porquê de precisar
// disso para o typecheck passar.
const { deriveActionPlanUnit } =
  await import("../../../artifacts/api-server/src/services/action-plans/derive-unit");

// HOST do banco alvo, sempre impresso primeiro — antes de qualquer SELECT ou
// UPDATE — para quem rodar o script ver de imediato onde está batendo.
const dbHost = new URL(process.env.DATABASE_URL).host;
console.log(`Banco alvo: ${dbHost}`);
console.log(`TEST_ENV:   ${testEnv ?? "(não definido)"}\n`);

async function main() {
  const plans = await db
    .select({
      id: actionPlansTable.id,
      organizationId: actionPlansTable.organizationId,
      sourceModule: actionPlansTable.sourceModule,
      sourceRef: actionPlansTable.sourceRef,
      responsibleUserId: actionPlansTable.responsibleUserId,
    })
    .from(actionPlansTable)
    .where(isNull(actionPlansTable.unitId));

  console.log(`Planos com unit_id nulo: ${plans.length}`);

  let assignedToUnit = 0;
  let corporate = 0;
  const byOrg = new Map<number, { unit: number; corporate: number }>();

  for (const plan of plans) {
    const unitId = await deriveActionPlanUnit(
      plan.organizationId,
      plan.sourceModule,
      plan.sourceRef,
      plan.responsibleUserId,
    );

    const orgStats = byOrg.get(plan.organizationId) ?? {
      unit: 0,
      corporate: 0,
    };
    if (unitId != null) {
      await db
        .update(actionPlansTable)
        .set({ unitId })
        .where(eq(actionPlansTable.id, plan.id));
      assignedToUnit++;
      orgStats.unit++;
    } else {
      // Já é null — nada a gravar, só contabiliza.
      corporate++;
      orgStats.corporate++;
    }
    byOrg.set(plan.organizationId, orgStats);
  }

  console.log(`\nResumo:`);
  console.log(`  Processados:                 ${plans.length}`);
  console.log(`  Atribuídos a uma filial:     ${assignedToUnit}`);
  console.log(`  Corporativo (unit_id=null):  ${corporate}`);

  if (byOrg.size > 0) {
    console.log(`\nPor organização:`);
    for (const [orgId, stats] of [...byOrg.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      console.log(
        `  org ${orgId}: ${stats.unit} filial, ${stats.corporate} corporativo`,
      );
    }
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });

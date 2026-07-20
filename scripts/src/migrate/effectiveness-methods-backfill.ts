/**
 * Backfill (Catálogo de Métodos de verificação): traz organizações existentes
 * para o catálogo por-org `effectiveness_methods`.
 *
 *  1) Seed: garante os 6 métodos padrão em toda organização (idempotente).
 *  2) Planos: para `action_plans` com `effectiveness_method` (enum legado)
 *     preenchido e `effectiveness_method_id` ainda nulo, aponta o id do método
 *     correspondente no catálogo daquela org.
 *
 * Não-destrutivo: só INSERT ... ON CONFLICT DO NOTHING e UPDATE (nunca DELETE);
 * a coluna legada `effectiveness_method` não é apagada.
 *
 * SEM --commit: dry-run — calcula e imprime contagens, não grava nada.
 * COM --commit: aplica de verdade, em uma transação por organização
 * (BEGIN/COMMIT; ROLLBACK e segue para a próxima org em caso de erro).
 *
 * Uso:
 *   pnpm --filter @workspace/scripts backfill-effectiveness-methods           → dry-run
 *   pnpm --filter @workspace/scripts backfill-effectiveness-methods --commit  → aplica
 */
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

const COMMIT = process.argv.includes("--commit");

// Duplicado de propósito de
// `api-server/src/services/effectiveness-methods/defaults.ts`: `scripts/` não
// depende do build do api-server. Mantenha os dois em sincronia (há teste
// unitário travando os rótulos do lado do api-server).
const DEFAULT_LABELS = [
  "Verificação por indicador",
  "Auditoria interna",
  "Inspeção física (campo)",
  "Verificação por treinamento",
  "Verificação por amostragem",
  "Redução de risco",
];

const LEGACY_METHOD_TO_LABEL: Record<string, string> = {
  indicator: "Verificação por indicador",
  internal_audit: "Auditoria interna",
  field_inspection: "Inspeção física (campo)",
  training: "Verificação por treinamento",
  sampling: "Verificação por amostragem",
  risk_reduction: "Redução de risco",
};

type OrgRow = { id: number };
type MethodRow = { id: number; label: string };
type PlanRow = { id: number; effectiveness_method: string | null };

/** Planos que ainda carregam só o código legado (dry-run e apply usam o mesmo filtro). */
async function loadPlansToMigrate(
  runner: PoolClient | typeof pool,
  orgId: number,
): Promise<PlanRow[]> {
  const { rows } = await runner.query<PlanRow>(
    `SELECT id, effectiveness_method FROM action_plans
      WHERE organization_id = $1
        AND effectiveness_method IS NOT NULL
        AND effectiveness_method_id IS NULL`,
    [orgId],
  );
  return rows;
}

/** --commit: aplica de fato, dentro da transação já aberta pelo chamador. */
async function applyOrg(
  client: PoolClient,
  orgId: number,
): Promise<{ updated: number; unknown: string[] }> {
  // 1) Seed dos 6 métodos padrão (idempotente pelo índice único funcional).
  for (let i = 0; i < DEFAULT_LABELS.length; i++) {
    await client.query(
      `INSERT INTO effectiveness_methods (organization_id, label, sort_order)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgId, DEFAULT_LABELS[i], i],
    );
  }

  // 2) Mapa lower(label) → id.
  const { rows: methodRows } = await client.query<MethodRow>(
    `SELECT id, label FROM effectiveness_methods WHERE organization_id = $1`,
    [orgId],
  );
  const byLabel = new Map(methodRows.map((m) => [m.label.toLowerCase(), m.id]));

  // 3) Planos legados → id do catálogo.
  const plans = await loadPlansToMigrate(client, orgId);

  let updated = 0;
  const unknown: string[] = [];
  for (const plan of plans) {
    const code = plan.effectiveness_method;
    if (!code) continue;
    const label = LEGACY_METHOD_TO_LABEL[code];
    const id = label ? byLabel.get(label.toLowerCase()) : undefined;
    if (id == null) {
      unknown.push(code);
      continue;
    }
    // O `IS NULL` no WHERE evita sobrescrever uma escolha feita na UI entre a
    // leitura acima e este UPDATE.
    const result = await client.query(
      `UPDATE action_plans SET effectiveness_method_id = $1
        WHERE id = $2 AND effectiveness_method_id IS NULL`,
      [id, plan.id],
    );
    updated += result.rowCount ?? 0;
  }

  return { updated, unknown };
}

async function main(): Promise<void> {
  console.log(
    COMMIT ? "=== APLICANDO (--commit) ===" : "=== DRY-RUN (sem --commit) ===",
  );

  const { rows: orgs } = await pool.query<OrgRow>(
    `SELECT id FROM organizations ORDER BY id`,
  );
  let totalPlans = 0;
  let failures = 0;
  const allUnknown = new Set<string>();

  for (const { id: orgId } of orgs) {
    if (!COMMIT) {
      const { rows: existing } = await pool.query<MethodRow>(
        `SELECT id, label FROM effectiveness_methods WHERE organization_id = $1`,
        [orgId],
      );
      const have = new Set(existing.map((m) => m.label.toLowerCase()));
      const missing = DEFAULT_LABELS.filter(
        (l) => !have.has(l.toLowerCase()),
      ).length;
      const plans = await loadPlansToMigrate(pool, orgId);
      totalPlans += plans.length;
      if (missing || plans.length) {
        console.log(
          `Org ${orgId}: métodos padrão a criar=${missing} · planos a migrar=${plans.length}`,
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await applyOrg(client, orgId);
      await client.query("COMMIT");
      totalPlans += result.updated;
      for (const code of result.unknown) allUnknown.add(code);
      if (result.updated) {
        console.log(`Org ${orgId}: planos migrados=${result.updated}`);
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      failures++;
      console.error(`Org ${orgId}: falhou, revertido (ROLLBACK). Erro:`, err);
    } finally {
      client.release();
    }
  }

  console.log("");
  console.log("=== Totais ===");
  console.log(`Organizações processadas: ${orgs.length}`);
  console.log(
    COMMIT
      ? `Planos migrados: ${totalPlans}`
      : `Planos que SERIAM migrados: ${totalPlans}`,
  );
  if (allUnknown.size > 0) {
    console.warn(
      `Códigos legados sem método correspondente (ignorados): ${[...allUnknown].join(", ")}`,
    );
  }
  if (!COMMIT) {
    console.log(
      "\n*** DRY-RUN — nada foi gravado. Rode novamente com --commit para aplicar. ***",
    );
  }
  if (failures > 0) {
    console.error(
      `\n${failures} organização(ões) falharam e foram revertidas.`,
    );
    process.exitCode = 1;
  }
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    pool.end();
    process.exit(1);
  });

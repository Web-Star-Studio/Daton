/**
 * Backfill (Catálogo de opções de treinamento): semeia as três listas padrão
 * (categoria/modalidade/tipo de evidência) em toda organização existente,
 * trazendo-as ao catálogo por-org `training_catalog_options`.
 *
 * Os valores são exatamente os que eram fixos em código; os tipos de evidência
 * reusam os códigos legados (`capacitacao`/`habilitacao`/`conscientizacao`), então
 * os itens de `training_catalog` já classificados seguem válidos SEM migração de
 * linha — o backfill não toca em `training_catalog`.
 *
 * Não-destrutivo: só INSERT ... ON CONFLICT DO NOTHING (nunca UPDATE/DELETE) —
 * não sobrescreve rótulos/ordem/flags que o cliente já tenha editado.
 *
 * SEM --commit: dry-run — imprime o que seria criado, não grava nada.
 * COM --commit: aplica, em uma transação por organização.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts backfill-training-catalog-options           → dry-run
 *   pnpm --filter @workspace/scripts backfill-training-catalog-options --commit  → aplica
 */
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

const COMMIT = process.argv.includes("--commit");

// Duplicado de propósito de
// `api-server/src/services/training-catalog-options/defaults.ts`: `scripts/` não
// depende do build do api-server. Mantenha os dois em sincronia (há teste
// unitário travando estes valores do lado do api-server).
const DEFAULT_CATEGORIES = [
  "Integração",
  "Reciclagem",
  "Capacitação",
  "Certificação",
  "Reunião",
];
const DEFAULT_MODALITIES = ["Presencial", "EAD", "Híbrido", "Externo"];
const DEFAULT_EVIDENCE_TYPES: {
  label: string;
  code: string;
  proves: boolean;
  validity: boolean;
}[] = [
  { label: "Capacitação", code: "capacitacao", proves: true, validity: false },
  { label: "Habilitação", code: "habilitacao", proves: true, validity: true },
  {
    label: "Conscientização",
    code: "conscientizacao",
    proves: false,
    validity: false,
  },
];

type OrgRow = { id: number };
type OptionRow = { kind: string; label: string };

async function loadExisting(
  runner: PoolClient | typeof pool,
  orgId: number,
): Promise<Set<string>> {
  const { rows } = await runner.query<OptionRow>(
    `SELECT kind, label FROM training_catalog_options WHERE organization_id = $1`,
    [orgId],
  );
  return new Set(rows.map((r) => `${r.kind}::${r.label.toLowerCase()}`));
}

/** Quantas sementes faltam nesta org (dry-run e apply compartilham a contagem). */
function countMissing(have: Set<string>): number {
  let missing = 0;
  for (const l of DEFAULT_CATEGORIES)
    if (!have.has(`category::${l.toLowerCase()}`)) missing++;
  for (const l of DEFAULT_MODALITIES)
    if (!have.has(`modality::${l.toLowerCase()}`)) missing++;
  for (const t of DEFAULT_EVIDENCE_TYPES)
    if (!have.has(`evidence_type::${t.label.toLowerCase()}`)) missing++;
  return missing;
}

async function applyOrg(client: PoolClient, orgId: number): Promise<number> {
  let inserted = 0;
  const ins = async (
    kind: string,
    label: string,
    sortOrder: number,
    code: string | null,
    proves: boolean,
    validity: boolean,
  ) => {
    const r = await client.query(
      `INSERT INTO training_catalog_options
         (organization_id, kind, label, code, sort_order, proves_competency, requires_validity)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [orgId, kind, label, code, sortOrder, proves, validity],
    );
    inserted += r.rowCount ?? 0;
  };

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++)
    await ins("category", DEFAULT_CATEGORIES[i], i, null, false, false);
  for (let i = 0; i < DEFAULT_MODALITIES.length; i++)
    await ins("modality", DEFAULT_MODALITIES[i], i, null, false, false);
  for (let i = 0; i < DEFAULT_EVIDENCE_TYPES.length; i++) {
    const t = DEFAULT_EVIDENCE_TYPES[i];
    await ins("evidence_type", t.label, i, t.code, t.proves, t.validity);
  }
  return inserted;
}

async function main(): Promise<void> {
  console.log(
    COMMIT ? "=== APLICANDO (--commit) ===" : "=== DRY-RUN (sem --commit) ===",
  );

  const { rows: orgs } = await pool.query<OrgRow>(
    `SELECT id FROM organizations ORDER BY id`,
  );
  let totalInserted = 0;
  let failures = 0;

  for (const { id: orgId } of orgs) {
    if (!COMMIT) {
      const have = await loadExisting(pool, orgId);
      const missing = countMissing(have);
      totalInserted += missing;
      if (missing) console.log(`Org ${orgId}: opções a criar=${missing}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await applyOrg(client, orgId);
      await client.query("COMMIT");
      totalInserted += inserted;
      if (inserted) console.log(`Org ${orgId}: opções criadas=${inserted}`);
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
      ? `Opções criadas: ${totalInserted}`
      : `Opções que SERIAM criadas: ${totalInserted}`,
  );
  if (!COMMIT) {
    console.log(
      "\n*** DRY-RUN — nada foi gravado. Rode novamente com --commit para aplicar. ***",
    );
  }
  if (failures > 0) {
    console.error(`\n${failures} organização(ões) falharam e foram revertidas.`);
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

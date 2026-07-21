/**
 * Backfill (Catálogo de Áreas de cargo): traz organizações existentes para o
 * catálogo por-org `areas`, a partir do texto legado em `positions.area`.
 *
 *  1) Seed: para cada org, cria em `areas` os setores DISTINTOS já digitados nos
 *     cargos (idempotente; não inventa áreas genéricas — só o que a org já usa).
 *  2) Cargos: liga `positions.area_id` ao id da área correspondente, casando por
 *     lower(trim(area)). Só toca em cargos com `area_id` ainda nulo.
 *
 * Não-destrutivo: só INSERT ... ON CONFLICT DO NOTHING e UPDATE (nunca DELETE);
 * a coluna legada `positions.area` não é apagada.
 *
 * SEM --commit: dry-run — calcula e imprime contagens, não grava nada.
 * COM --commit: aplica de verdade, em uma transação por organização
 * (BEGIN/COMMIT; ROLLBACK e segue para a próxima org em caso de erro).
 *
 * Uso:
 *   pnpm --filter @workspace/scripts backfill-areas           → dry-run
 *   pnpm --filter @workspace/scripts backfill-areas --commit  → aplica
 */
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

const COMMIT = process.argv.includes("--commit");

type OrgRow = { id: number };
type LabelRow = { label: string };
type AreaRow = { id: number; label: string };

/** Setores distintos (não vazios) já digitados nos cargos da org. */
async function loadDistinctAreas(
  runner: PoolClient | typeof pool,
  orgId: number,
): Promise<string[]> {
  const { rows } = await runner.query<LabelRow>(
    `SELECT DISTINCT trim(area) AS label
       FROM positions
      WHERE organization_id = $1
        AND area IS NOT NULL
        AND trim(area) <> ''`,
    [orgId],
  );
  return rows.map((r) => r.label);
}

/** Cargos que ainda não têm area_id mas têm texto de área para casar. */
async function countPositionsToLink(
  runner: PoolClient | typeof pool,
  orgId: number,
): Promise<number> {
  const { rows } = await runner.query<{ n: string }>(
    `SELECT count(*) AS n
       FROM positions
      WHERE organization_id = $1
        AND area_id IS NULL
        AND area IS NOT NULL
        AND trim(area) <> ''`,
    [orgId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** --commit: aplica de fato, dentro da transação já aberta pelo chamador. */
async function applyOrg(
  client: PoolClient,
  orgId: number,
): Promise<{ created: number; linked: number }> {
  // 1) Seed das áreas a partir dos setores distintos já usados (idempotente).
  const labels = await loadDistinctAreas(client, orgId);
  let created = 0;
  for (let i = 0; i < labels.length; i++) {
    const result = await client.query(
      `INSERT INTO areas (organization_id, label, sort_order)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgId, labels[i], i],
    );
    created += result.rowCount ?? 0;
  }

  // 2) Mapa lower(label) → id.
  const { rows: areaRows } = await client.query<AreaRow>(
    `SELECT id, label FROM areas WHERE organization_id = $1`,
    [orgId],
  );
  const byLabel = new Map(areaRows.map((a) => [a.label.trim().toLowerCase(), a.id]));

  // 3) Liga cada cargo à sua área (só os que ainda não têm area_id). O `IS NULL`
  //    no WHERE evita sobrescrever uma escolha feita na UI entre leitura e UPDATE.
  let linked = 0;
  for (const [key, id] of byLabel) {
    const result = await client.query(
      `UPDATE positions SET area_id = $1
        WHERE organization_id = $2
          AND area_id IS NULL
          AND lower(trim(area)) = $3`,
      [id, orgId, key],
    );
    linked += result.rowCount ?? 0;
  }

  return { created, linked };
}

async function main(): Promise<void> {
  console.log(
    COMMIT ? "=== APLICANDO (--commit) ===" : "=== DRY-RUN (sem --commit) ===",
  );

  const { rows: orgs } = await pool.query<OrgRow>(
    `SELECT id FROM organizations ORDER BY id`,
  );
  let totalCreated = 0;
  let totalLinked = 0;
  let failures = 0;

  for (const { id: orgId } of orgs) {
    if (!COMMIT) {
      const labels = await loadDistinctAreas(pool, orgId);
      const { rows: existing } = await pool.query<AreaRow>(
        `SELECT id, label FROM areas WHERE organization_id = $1`,
        [orgId],
      );
      const have = new Set(existing.map((a) => a.label.trim().toLowerCase()));
      const toCreate = labels.filter((l) => !have.has(l.toLowerCase())).length;
      const toLink = await countPositionsToLink(pool, orgId);
      totalCreated += toCreate;
      totalLinked += toLink;
      if (toCreate || toLink) {
        console.log(
          `Org ${orgId}: áreas a criar=${toCreate} · cargos a ligar=${toLink}`,
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await applyOrg(client, orgId);
      await client.query("COMMIT");
      totalCreated += result.created;
      totalLinked += result.linked;
      if (result.created || result.linked) {
        console.log(
          `Org ${orgId}: áreas criadas=${result.created} · cargos ligados=${result.linked}`,
        );
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
      ? `Áreas criadas: ${totalCreated} · Cargos ligados: ${totalLinked}`
      : `Áreas que SERIAM criadas: ${totalCreated} · Cargos que SERIAM ligados: ${totalLinked}`,
  );
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

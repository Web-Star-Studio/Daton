/**
 * Backfill (Área → Departamento): liga `positions.department_id` ao departamento
 * cujo NOME casa (case-insensitive) com o rótulo de setor que o cargo já tem —
 * seja do catálogo `areas` (via `area_id`) ou do texto legado `positions.area`.
 *
 * Contexto: o campo de setor do cargo passou a referenciar Departamentos
 * (Organização) em vez do catálogo `areas`. Este script migra os vínculos
 * existentes por correspondência de nome. Cargos cujo setor NÃO tem departamento
 * equivalente ficam sem departamento (reportados) — a decisão é criar o
 * departamento faltante ou deixar em branco (ver `--commit`).
 *
 * Não-destrutivo: só UPDATE de `department_id` onde está NULL. Nada é apagado;
 * `area_id`/`area` permanecem intocados.
 *
 * SEM --commit: dry-run — mostra o que casaria e o que ficaria sem match.
 * COM --commit: aplica, em uma transação por organização (ROLLBACK em erro).
 *
 * Uso:
 *   pnpm --filter @workspace/scripts backfill-areas-to-departments           → dry-run
 *   pnpm --filter @workspace/scripts backfill-areas-to-departments --commit  → aplica
 */
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

const COMMIT = process.argv.includes("--commit");

type OrgRow = { id: number };
type DeptRow = { id: number; name: string };
type PosRow = { id: number; label: string | null };

/** Cargos sem departamento, com um rótulo de setor (catálogo `areas` OU texto legado). */
async function loadPositionsToLink(
  runner: PoolClient | typeof pool,
  orgId: number,
): Promise<PosRow[]> {
  const { rows } = await runner.query<PosRow>(
    `SELECT p.id, COALESCE(a.label, NULLIF(trim(p.area), '')) AS label
       FROM positions p
       LEFT JOIN areas a ON a.id = p.area_id
      WHERE p.organization_id = $1
        AND p.department_id IS NULL
        AND COALESCE(a.label, NULLIF(trim(p.area), '')) IS NOT NULL`,
    [orgId],
  );
  return rows;
}

async function loadDeptMap(
  runner: PoolClient | typeof pool,
  orgId: number,
): Promise<Map<string, number>> {
  const { rows } = await runner.query<DeptRow>(
    `SELECT id, name FROM departments WHERE organization_id = $1`,
    [orgId],
  );
  return new Map(rows.map((d) => [d.name.trim().toLowerCase(), d.id]));
}

async function main(): Promise<void> {
  console.log(
    COMMIT ? "=== APLICANDO (--commit) ===" : "=== DRY-RUN (sem --commit) ===",
  );

  const { rows: orgs } = await pool.query<OrgRow>(
    `SELECT id FROM organizations ORDER BY id`,
  );
  let totalLinked = 0;
  const unmatched = new Set<string>();
  let failures = 0;

  for (const { id: orgId } of orgs) {
    const runner = COMMIT ? await pool.connect() : pool;
    try {
      if (COMMIT) await (runner as PoolClient).query("BEGIN");
      const deptByName = await loadDeptMap(runner, orgId);
      const positions = await loadPositionsToLink(runner, orgId);

      let linked = 0;
      for (const p of positions) {
        const key = p.label?.trim().toLowerCase();
        const deptId = key ? deptByName.get(key) : undefined;
        if (deptId == null) {
          if (p.label) unmatched.add(`org${orgId}:${p.label}`);
          continue;
        }
        if (COMMIT) {
          const r = await (runner as PoolClient).query(
            `UPDATE positions SET department_id = $1
              WHERE id = $2 AND department_id IS NULL`,
            [deptId, p.id],
          );
          linked += r.rowCount ?? 0;
        } else {
          linked += 1;
        }
      }
      if (COMMIT) await (runner as PoolClient).query("COMMIT");
      totalLinked += linked;
      if (linked) console.log(`Org ${orgId}: cargos ligados=${linked}`);
    } catch (err) {
      if (COMMIT) await (runner as PoolClient).query("ROLLBACK").catch(() => {});
      failures++;
      console.error(`Org ${orgId}: falhou, revertido. Erro:`, err);
    } finally {
      if (COMMIT) (runner as PoolClient).release();
    }
  }

  console.log("");
  console.log("=== Totais ===");
  console.log(`Organizações processadas: ${orgs.length}`);
  console.log(
    COMMIT
      ? `Cargos ligados: ${totalLinked}`
      : `Cargos que SERIAM ligados: ${totalLinked}`,
  );
  if (unmatched.size > 0) {
    console.warn(
      `\nSetores SEM departamento equivalente (${unmatched.size}) — ficam em branco:`,
    );
    for (const u of unmatched) console.warn(`  - ${u}`);
  }
  if (!COMMIT) {
    console.log(
      "\n*** DRY-RUN — nada foi gravado. Rode com --commit para aplicar. ***",
    );
  }
  if (failures > 0) process.exitCode = 1;
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    pool.end();
    process.exit(1);
  });

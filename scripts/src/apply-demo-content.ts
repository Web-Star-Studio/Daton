/**
 * Aplica o conteúdo revisado das telas parciais da organização de demonstração.
 *
 * O SQL vive em `scripts/sql/demo-content.sql` — 43 statements que dão volume e
 * coerência às telas que renderizavam pobres (Documentação ISO, Fatores de
 * Desempenho, Aprendizagem, Conhecimento organizacional, ...). Cada statement é
 * escopado em `organization_id = 3` (ou via FK a um pai da org 3) e idempotente
 * (guardas `code IS NULL`, `content_sections = []`, `NOT EXISTS`, `= 'texto antigo'`).
 *
 * Roda o arquivo inteiro dentro de UMA transação: se qualquer statement falhar,
 * faz ROLLBACK e nada é escrito. Imprime contagens antes/depois e confirma que a
 * org 2 (cliente real) permanece intocada.
 *
 * `--org-id` é obrigatório e tem que ser 3: o SQL tem ids escopados a essa org;
 * apontar para outra é erro de operação, não um parâmetro.
 *
 * Uso: pnpm --filter @workspace/scripts apply-demo-content --org-id 3
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { pool } from "@workspace/db";

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = resolve(HERE, "../sql/demo-content.sql");

function parseOrgId(argv: string[]): number {
  const i = argv.indexOf("--org-id");
  const raw = i >= 0 ? argv[i + 1] : argv[0];
  if (!raw) throw new Error("--org-id é obrigatório. Uso: apply-demo-content --org-id 3");
  const n = Number(raw);
  if (n !== 3) {
    throw new Error(
      `Este script só se aplica à org 3 (demo): o SQL em demo-content.sql tem ids ` +
        `escopados a ela. Recebido --org-id=${raw}.`,
    );
  }
  return n;
}

async function main(): Promise<void> {
  parseOrgId(process.argv.slice(2));
  const sql = readFileSync(SQL_FILE, "utf-8");

  if (/organization_id\s*=\s*2\b/.test(sql)) {
    throw new Error("Abortado: demo-content.sql referencia organization_id = 2 (cliente real).");
  }

  const client = await pool.connect();
  try {
    const before = await client.query(`SELECT
      (SELECT count(*) FROM documents WHERE organization_id=3) docs,
      (SELECT count(*) FROM documents WHERE organization_id=3 AND jsonb_array_length(content_sections)>0) docs_conteudo,
      (SELECT count(*) FROM knowledge_assets WHERE organization_id=3) conhecimento,
      (SELECT count(*) FROM road_safety_factor_measurements WHERE organization_id=3) fd_medicoes`);
    console.log("ANTES :", before.rows[0]);

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✅ COMMIT — conteúdo aplicado");

    const after = await client.query(`SELECT
      (SELECT count(*) FROM documents WHERE organization_id=3) docs,
      (SELECT count(*) FROM documents WHERE organization_id=3 AND jsonb_array_length(content_sections)>0) docs_conteudo,
      (SELECT count(*) FROM knowledge_assets WHERE organization_id=3) conhecimento,
      (SELECT count(*) FROM road_safety_factor_measurements WHERE organization_id=3) fd_medicoes,
      (SELECT count(*) FROM documents WHERE id=57) doc57_lixo`);
    console.log("DEPOIS:", after.rows[0]);

    const gab = await client.query(`SELECT count(*)::int c FROM documents WHERE organization_id=2`);
    console.log(`Gabardo (org 2) documents: ${gab.rows[0].c} — deve estar inalterado`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e: unknown) => {
    console.error(`apply-demo-content falhou (ROLLBACK): ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

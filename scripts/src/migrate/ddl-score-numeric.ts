/**
 * DDL cirúrgica: alarga as duas colunas de `score` de integer para numeric(4,2).
 *
 * É um widening cast — o Postgres converte os inteiros existentes sem perda e
 * sem reescrever semântica (7 vira 7.00). Idempotente: se a coluna já for
 * numeric, o ALTER é no-op.
 *
 * NÃO usar `drizzle-kit push`: o .env aponta para a produção e o push tentaria
 * dropar colunas de outras branches.
 *
 * DATABASE_URL precisa estar no ambiente antes de rodar (este script não
 * carrega nenhum .env sozinho — o pacote `dotenv` não é dependência deste
 * workspace; ver `gabardo-513-report.ts` / `gabardo-verify-revert.ts` para o
 * mesmo padrão). Para o banco de TESTE local:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/daton_integration \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-score-numeric.ts
 *
 * Para produção (fora do escopo desta tarefa — portão humano separado):
 *   pnpm --filter @workspace/scripts ddl-score-numeric
 *
 * NÃO use `pnpm --filter @workspace/scripts exec tsx --env-file ../.env ...`:
 * sem o `sh -c` que o `pnpm run` interpõe, o Node resolve `--env-file` contra
 * o `$PWD` herdado do shell que invocou o pnpm (não o cwd real do pacote) e
 * falha com "../.env: not found" mesmo com o arquivo existindo — verificado
 * neste ambiente (Node 25). O script `ddl-score-numeric` em
 * `scripts/package.json` roda via `pnpm run`, que passa por um shell e não
 * tem esse problema — é o mesmo mecanismo de `seed`/`migrate`/etc.
 *
 * As duas ALTER TABLE rodam dentro de uma transação (BEGIN/COMMIT, com
 * ROLLBACK no catch): se a segunda falhar, a primeira não fica aplicada
 * sozinha. Mesmo padrão do PR #150 (DDL de `workload_hours`) e de
 * `norms-catalog-backfill.ts`.
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL ausente");

const STATEMENTS = [
  `ALTER TABLE training_effectiveness_reviews
     ALTER COLUMN score TYPE numeric(4,2) USING score::numeric(4,2)`,
  `ALTER TABLE training_class_participants
     ALTER COLUMN score TYPE numeric(4,2) USING score::numeric(4,2)`,
];

async function main() {
  // Sem `ssl` explícito: a produção (Neon) já embute `sslmode=require` na
  // própria DATABASE_URL; o banco de teste local (docker, sem SSL) quebraria
  // se forçássemos ssl aqui. Mesmo padrão de `lib/db/src/index.ts`.
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const before = await client.query(`
    SELECT table_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE column_name = 'score'
      AND table_name IN ('training_effectiveness_reviews', 'training_class_participants')
    ORDER BY table_name
  `);
  console.log("ANTES:");
  console.table(before.rows);

  try {
    await client.query("BEGIN");
    for (const sql of STATEMENTS) {
      console.log("\n→", sql.replace(/\s+/g, " ").trim());
      await client.query(sql);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }

  const after = await client.query(`
    SELECT table_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE column_name = 'score'
      AND table_name IN ('training_effectiveness_reviews', 'training_class_participants')
    ORDER BY table_name
  `);
  console.log("\nDEPOIS:");
  console.table(after.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

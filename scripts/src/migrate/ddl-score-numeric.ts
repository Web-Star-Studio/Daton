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
 *
 * Pré-flight OBRIGATÓRIO antes do BEGIN: `USING score::numeric(4,2)` NÃO
 * trunca — é um cast estrito, e qualquer linha com |score| >= 100 faz o
 * ALTER abortar com "numeric field overflow" em vez de arredondar/truncar
 * em silêncio. O script consulta min/max/contagem de estouro nas duas
 * tabelas e aborta sem tocar em nada (nenhum BEGIN sequer é aberto) se
 * alguma linha estouraria numeric(4,2).
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

  // Pré-flight: `USING score::numeric(4,2)` NÃO trunca — numeric(4,2) guarda
  // no máximo 99,99, e qualquer linha com |score| >= 100 faz o ALTER abortar
  // no meio com "numeric field overflow" (a primeira tabela já convertida,
  // dentro da mesma transação, é revertida pelo ROLLBACK — mas é melhor nunca
  // nem tentar). Verificamos as duas tabelas ANTES do BEGIN e abortamos sem
  // tocar em nada se alguma linha estouraria.
  console.log("\nPré-flight (limite de numeric(4,2): |score| < 100)...");
  const preflight = await client.query(`
    SELECT 'training_effectiveness_reviews' AS table_name,
           min(score) AS min_score,
           max(score) AS max_score,
           count(*) FILTER (WHERE abs(score) >= 100) AS overflow_count
    FROM training_effectiveness_reviews
    UNION ALL
    SELECT 'training_class_participants' AS table_name,
           min(score) AS min_score,
           max(score) AS max_score,
           count(*) FILTER (WHERE abs(score) >= 100) AS overflow_count
    FROM training_class_participants
  `);
  console.table(preflight.rows);

  const overflowing = preflight.rows.filter(
    (row) => Number(row.overflow_count) > 0,
  );
  if (overflowing.length > 0) {
    await client.end();
    const detail = overflowing
      .map(
        (row) =>
          `${row.table_name}: ${row.overflow_count} linha(s) com |score| >= 100 (max=${row.max_score}, min=${row.min_score})`,
      )
      .join("; ");
    throw new Error(
      `ABORTADO antes de qualquer ALTER: ${detail}. numeric(4,2) guarda no máximo 99,99 — ` +
        `essas linhas fariam o ALTER abortar com "numeric field overflow". Corrija ou trunque ` +
        `esses valores antes de rodar este script. Nenhuma alteração foi feita.`,
    );
  }
  console.log("Pré-flight OK: nenhuma linha estouraria numeric(4,2).\n");

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

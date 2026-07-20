/**
 * DDL aditiva: adiciona training_catalog.evidence_type (text, nullable).
 * Idempotente (IF NOT EXISTS). Nenhuma linha existente é alterada — todos os
 * itens nascem `null` = "não classificado", que é o estado correto até o RH revisar.
 *
 * Também cria um índice parcial (organization_id, evidence_type) restrito a
 * 'capacitacao'/'habilitacao' — as consultas de conformidade só olham itens
 * que provam algo; 'conscientizacao' e null ficam fora do índice.
 *
 * NÃO usar `drizzle-kit push`: o .env aponta para a produção e o push tentaria
 * dropar colunas de outras branches (ver memória do projeto).
 *
 * DATABASE_URL precisa estar no ambiente antes de rodar (este script não
 * carrega nenhum .env sozinho — o pacote `dotenv` não é dependência deste
 * workspace; ver `ddl-score-numeric.ts` para o mesmo padrão). Para o banco de
 * TESTE local:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/daton_integration \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-evidence-type.ts
 *
 * Para produção (fora do escopo desta tarefa — portão humano separado):
 *   DATABASE_URL=<url-de-produção> \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-evidence-type.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL ausente");

async function main() {
  // Sem `ssl` explícito: a produção (Neon) já embute `sslmode=require` na
  // própria DATABASE_URL; o banco de teste local (docker, sem SSL) quebraria
  // se forçássemos ssl aqui. Mesmo padrão de `lib/db/src/index.ts` e de
  // `ddl-score-numeric.ts`.
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(
    `ALTER TABLE training_catalog ADD COLUMN IF NOT EXISTS evidence_type text`,
  );

  // Índice parcial: as consultas de conformidade só olham itens que provam algo.
  await client.query(
    `CREATE INDEX IF NOT EXISTS training_catalog_evidence_idx
       ON training_catalog (organization_id, evidence_type)
       WHERE evidence_type IN ('capacitacao', 'habilitacao')`,
  );

  const check = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'training_catalog' AND column_name = 'evidence_type'
  `);
  console.table(check.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

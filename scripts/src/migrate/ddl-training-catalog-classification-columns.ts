/**
 * DDL aditiva: adiciona `training_catalog.development_nature` e
 * `training_catalog.knowledge_area` (text, nullable). Classificações extras
 * governadas pelo catálogo gerenciável (training_catalog_options, kinds
 * development_nature/knowledge_area). Idempotente (IF NOT EXISTS). Nenhuma linha
 * existente é alterada — nascem `null`. NÃO há seed/backfill: os dois catálogos
 * sobem SEM opções (o cliente cadastra em Configurações → Sistema → Treinamentos).
 *
 * NÃO usar `drizzle-kit push`: o .env aponta para a produção e o push tentaria
 * dropar colunas de outras branches (ver memória do projeto).
 *
 * DATABASE_URL precisa estar no ambiente. Banco de TESTE local:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/daton_integration \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-classification-columns.ts
 *
 * Produção (portão humano separado):
 *   DATABASE_URL=<url-de-produção> \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-classification-columns.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL ausente");

async function main() {
  // Sem `ssl` explícito: a produção (Neon) já embute `sslmode=require` na própria
  // DATABASE_URL; o banco de teste local (docker, sem SSL) quebraria se
  // forçássemos ssl aqui. Mesmo padrão de `ddl-training-catalog-options.ts`.
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(
    `ALTER TABLE training_catalog ADD COLUMN IF NOT EXISTS development_nature text`,
  );
  await client.query(
    `ALTER TABLE training_catalog ADD COLUMN IF NOT EXISTS knowledge_area text`,
  );

  const check = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'training_catalog'
      AND column_name IN ('development_nature', 'knowledge_area')
    ORDER BY column_name
  `);
  console.table(check.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

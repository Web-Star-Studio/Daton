/**
 * DDL aditiva: adiciona training_catalog.target_competencies (jsonb, not null,
 * default '[]'). Idempotente (IF NOT EXISTS). Nenhuma linha existente é alterada
 * — hoje, em produção, as colunas target_competency_* singulares estão todas
 * NULL (zero itens classificados), então a lista nasce vazia para todo mundo.
 *
 * Um treino pode comprovar VÁRIAS competências (ISO 10015). As colunas
 * target_competency_name/type/level (singulares) ficam como legado — passam a
 * ser espelhadas pelo primeiro item desta lista (ver rota training-catalog).
 *
 * NÃO usar `drizzle-kit push`: o .env aponta para a produção e o push tentaria
 * dropar colunas de outras branches (ver memória do projeto).
 *
 * DATABASE_URL precisa estar no ambiente antes de rodar (este script não
 * carrega nenhum .env sozinho — o pacote `dotenv` não é dependência deste
 * workspace; ver `ddl-training-catalog-evidence-type.ts` para o mesmo padrão).
 * Para o banco de TESTE local:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/daton_integration \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-target-competencies.ts
 *
 * Para produção (fora do escopo desta tarefa — portão humano separado):
 *   DATABASE_URL=<url-de-produção> \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-target-competencies.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL ausente");

async function main() {
  // Sem `ssl` explícito: a produção (Neon) já embute `sslmode=require` na
  // própria DATABASE_URL; o banco de teste local (docker, sem SSL) quebraria
  // se forçássemos ssl aqui. Mesmo padrão de `lib/db/src/index.ts` e de
  // `ddl-training-catalog-evidence-type.ts`.
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(
    `ALTER TABLE training_catalog ADD COLUMN IF NOT EXISTS target_competencies jsonb NOT NULL DEFAULT '[]'::jsonb`,
  );

  const check = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'training_catalog' AND column_name = 'target_competencies'
  `);
  console.table(check.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

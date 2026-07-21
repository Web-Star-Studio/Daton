/**
 * DDL aditiva: cria a tabela `training_catalog_options` (catálogo gerenciável das
 * listas do catálogo de treinamentos — categoria/modalidade/tipo de evidência).
 * Idempotente (IF NOT EXISTS). Nenhuma linha/coluna existente é alterada — o seed
 * dos valores atuais fica a cargo do backfill (training-catalog-options-backfill).
 *
 * NÃO usar `drizzle-kit push`: o .env aponta para a produção e o push tentaria
 * dropar colunas de outras branches (ver memória do projeto).
 *
 * DATABASE_URL precisa estar no ambiente. Banco de TESTE local:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/daton_integration \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-options.ts
 *
 * Produção (portão humano separado):
 *   DATABASE_URL=<url-de-produção> \
 *     pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-training-catalog-options.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL ausente");

async function main() {
  // Sem `ssl` explícito: a produção (Neon) já embute `sslmode=require` na própria
  // DATABASE_URL; o banco de teste local (docker, sem SSL) quebraria se
  // forçássemos ssl aqui. Mesmo padrão de `ddl-training-catalog-evidence-type.ts`.
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS training_catalog_options (
      id serial PRIMARY KEY,
      organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      kind text NOT NULL,
      label text NOT NULL,
      code text,
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      proves_competency boolean NOT NULL DEFAULT false,
      requires_validity boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Rótulo único por (org, kind), case-insensitive.
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS training_catalog_option_org_kind_lower_label_unique
      ON training_catalog_options (organization_id, kind, lower(label))
  `);

  // Código único por (org, kind) quando presente (tipos de evidência).
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS training_catalog_option_org_kind_code_unique
      ON training_catalog_options (organization_id, kind, code)
      WHERE code IS NOT NULL
  `);

  const check = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'training_catalog_options'
    ORDER BY ordinal_position
  `);
  console.table(check.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

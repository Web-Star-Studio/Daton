/**
 * Adiciona coluna responsible_user_id em kpi_indicators (com FK para users).
 *
 * Idempotente — checa se a coluna existe antes de adicionar.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts add-kpi-responsible-user-id
 */
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'kpi_indicators'
        AND column_name = 'responsible_user_id'
    `);

    if (existing.length > 0) {
      console.log("Coluna responsible_user_id já existe. Nada a fazer.");
      return;
    }

    console.log("Adicionando coluna responsible_user_id...");
    await client.query(`
      ALTER TABLE kpi_indicators
      ADD COLUMN responsible_user_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL
    `);
    console.log("OK.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});

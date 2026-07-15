/**
 * Adiciona a coluna norm_ids (jsonb number[]) em training_catalog — referência
 * ao catálogo de normas gerenciável (regulatory_norms), multi-seleção.
 *
 * Aditiva e idempotente (ADD COLUMN IF NOT EXISTS, DEFAULT '[]'::jsonb): segura
 * para o backend atual (Drizzle seleciona colunas nomeadas; ignora a nova).
 * Rode ANTES do backfill (norms-catalog-backfill), que preenche norm_ids.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts add-training-catalog-norm-ids
 */
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    await client.query(
      `ALTER TABLE training_catalog ADD COLUMN IF NOT EXISTS norm_ids jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    const { rows } = await client.query<{
      column_name: string;
      data_type: string;
      column_default: string | null;
    }>(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'training_catalog' AND column_name = 'norm_ids'
    `);
    if (rows.length === 1) {
      console.log("OK — coluna training_catalog.norm_ids presente:", rows[0]);
    } else {
      throw new Error("Falha: coluna norm_ids não encontrada após o ALTER.");
    }
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

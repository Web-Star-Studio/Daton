/**
 * Surgical DDL (PROD): add birth_date / gender / education columns to employees.
 * Additive and idempotent (IF NOT EXISTS). Does NOT run drizzle push.
 */
import { pool } from "@workspace/db";

async function main() {
  await pool.query(`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS birth_date date,
      ADD COLUMN IF NOT EXISTS gender text,
      ADD COLUMN IF NOT EXISTS education text;
  `);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='employees' AND column_name IN ('birth_date','gender','education')
     ORDER BY column_name;`,
  );
  console.log("colunas presentes:", rows.map((r) => r.column_name).join(", "));
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });

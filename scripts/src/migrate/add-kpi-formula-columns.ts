/**
 * Surgical column additions for KPI formulas, used when drizzle-kit push is
 * blocked by unrelated interactive prompts. Idempotent via `IF NOT EXISTS`.
 *
 * Usage: pnpm --filter @workspace/scripts exec tsx --env-file ../.env \
 *          ./src/migrate/add-kpi-formula-columns.ts
 */
import { pool } from "@workspace/db";

async function main() {
  console.log("Adding KPI formula columns (idempotent)...");
  await pool.query(`
    ALTER TABLE kpi_indicators
      ADD COLUMN IF NOT EXISTS formula_variables jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
  console.log("  ✓ kpi_indicators.formula_variables");
  await pool.query(`
    ALTER TABLE kpi_indicators
      ADD COLUMN IF NOT EXISTS formula_expression text NOT NULL DEFAULT '';
  `);
  console.log("  ✓ kpi_indicators.formula_expression");
  await pool.query(`
    ALTER TABLE kpi_monthly_values
      ADD COLUMN IF NOT EXISTS inputs jsonb NOT NULL DEFAULT '{}'::jsonb;
  `);
  console.log("  ✓ kpi_monthly_values.inputs");
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });

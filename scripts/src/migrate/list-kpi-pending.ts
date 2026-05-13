/**
 * Detailed inventory of KPI indicators pending formula migration.
 * Groups by exact measurement text to show unique formulas and affected IDs.
 *
 * Read-only. Run via:
 *   pnpm --filter @workspace/scripts exec tsx --env-file /abs/path/.env \
 *     /abs/path/scripts/src/migrate/list-kpi-pending.ts
 */
import { db, kpiIndicatorsTable, pool } from "@workspace/db";

async function main() {
  const indicators = await db.select().from(kpiIndicatorsTable);
  const pending = indicators.filter(
    (ind) =>
      !ind.formulaVariables ||
      ind.formulaVariables.length === 0 ||
      !ind.formulaExpression ||
      ind.formulaExpression.trim().length === 0,
  );

  console.log(`Total: ${indicators.length}. Pending: ${pending.length}.`);

  const groups = new Map<string, { ids: number[]; names: Set<string>; units: Set<string> }>();
  for (const ind of pending) {
    const key = ind.measurement.trim();
    if (!groups.has(key)) {
      groups.set(key, { ids: [], names: new Set(), units: new Set() });
    }
    const g = groups.get(key)!;
    g.ids.push(ind.id);
    g.names.add(ind.name);
    if (ind.unit) g.units.add(ind.unit);
  }

  console.log(`Unique measurements: ${groups.size}\n`);

  let i = 0;
  for (const [measurement, g] of groups) {
    i++;
    console.log(`─── #${i}  (${g.ids.length} rows)`);
    console.log(`measurement: ${measurement}`);
    console.log(`name:        ${[...g.names].join(" | ")}`);
    console.log(`units:       ${g.units.size > 0 ? [...g.units].join(" | ") : "—"}`);
    console.log(`ids:         ${g.ids.join(", ")}`);
    console.log("");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });

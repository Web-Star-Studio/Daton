/**
 * Backfill employee trainings that failed during initial migration.
 * Skips trainings that already exist (by employeeId + title match).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts backfill-trainings --company-id <uuid> [--dry-run] [--verbose]
 */
import { db, pool, employeesTable, employeeTrainingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sourcePool, sourceQuery } from "./source-db.js";
import { transformTrainingStatus, formatDate } from "./transform.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

function getFlagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const companyId = getFlagValue("--company-id");
if (!companyId) {
  console.error("Error: --company-id <uuid> is required.");
  process.exit(1);
}

interface V1EmployeeTraining {
  id: string;
  employee_id: string;
  program_name: string;
  program_description: string | null;
  trainer: string | null;
  duration_hours: number | null;
  completion_date: string | null;
  expiration_date: string | null;
  status: string | null;
  created_at: string | null;
}

async function main(): Promise<void> {
  console.log("=== Backfill employee trainings ===");
  console.log(`  Company: ${companyId}`);
  if (dryRun) console.log("  Mode: DRY RUN");

  // Build employee UUID → v2 ID map from target DB
  const v2Employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable);

  // We need to map source employee UUIDs to v2 IDs.
  // Get all employees for this company from source, match by name to v2.
  const sourceEmployees = await sourceQuery<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM employees WHERE company_id = $1`,
    [companyId],
  );

  // Build name → v2 id map (employees were already migrated successfully)
  const v2ByName = new Map<string, number>();
  for (const e of v2Employees) {
    v2ByName.set(e.name, e.id);
  }

  const empMap = new Map<string, number>();
  for (const se of sourceEmployees) {
    const v2Id = v2ByName.get(se.full_name);
    if (v2Id != null) empMap.set(se.id, v2Id);
  }
  console.log(`  Mapped ${empMap.size} / ${sourceEmployees.length} employees`);

  // Get all trainings from source for this company
  const trainings = await sourceQuery<V1EmployeeTraining>(
    `SELECT
      et.id, et.employee_id,
      tp.name AS program_name, tp.description AS program_description, et.trainer, tp.duration_hours,
      et.completion_date, et.expiration_date, et.status, et.created_at
    FROM employee_trainings et
    JOIN training_programs tp ON tp.id = et.training_program_id
    JOIN employees e ON e.id = et.employee_id
    WHERE e.company_id = $1
    ORDER BY et.created_at`,
    [companyId],
  );
  console.log(`  Found ${trainings.length} trainings in source`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const t of trainings) {
    const employeeId = empMap.get(t.employee_id);
    if (employeeId == null) {
      skipped++;
      continue;
    }

    // Check if already exists
    const existing = await db
      .select({ id: employeeTrainingsTable.id })
      .from(employeeTrainingsTable)
      .where(
        and(
          eq(employeeTrainingsTable.employeeId, employeeId),
          eq(employeeTrainingsTable.title, t.program_name),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      if (verbose) console.log(`  [SKIP] Already exists: ${t.program_name} (emp ${employeeId})`);
      continue;
    }

    if (dryRun) {
      if (verbose) console.log(`  [DRY RUN] Would insert: ${t.program_name} (emp ${employeeId})`);
      inserted++;
      continue;
    }

    try {
      await db.insert(employeeTrainingsTable).values({
        employeeId,
        title: t.program_name,
        description: t.program_description,
        institution: t.trainer,
        workloadHours: t.duration_hours != null ? Math.round(t.duration_hours) : null,
        completionDate: formatDate(t.completion_date),
        expirationDate: formatDate(t.expiration_date),
        status: transformTrainingStatus(t.status),
        createdAt: t.created_at ? new Date(t.created_at) : undefined,
      });
      inserted++;
      if (verbose) console.log(`  Inserted: ${t.program_name} (emp ${employeeId})`);
    } catch (err) {
      errors++;
      console.error(`  ERROR: ${t.id} (${t.program_name}):`, err);
    }
  }

  console.log(`\n  Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);

  await sourcePool.end();
  await pool.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

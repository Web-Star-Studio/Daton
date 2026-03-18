import { db, employeeTrainingsTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";
import { transformTrainingStatus, formatDate } from "./transform.js";

interface V1EmployeeTraining {
  id: string;
  employee_id: string;
  training_program_id: string;
  completion_date: string | null;
  expiration_date: string | null;
  status: string | null;
  created_at: string | null;
  // Joined from training_programs
  program_name: string;
  program_description: string | null;
  trainer: string | null;
  duration_hours: number | null;
}

export async function migrateEmployeeTrainings(
  employeeMap: IdMap,
  options: { dryRun: boolean; verbose: boolean; companyId: string },
): Promise<void> {
  console.log("\n--- Migrating employee trainings ---");

  const trainings = await sourceQuery<V1EmployeeTraining>(
    `SELECT
      et.id, et.employee_id, et.training_program_id, et.completion_date, et.expiration_date, et.status, et.created_at,
      tp.name AS program_name, tp.description AS program_description, et.trainer, tp.duration_hours
    FROM employee_trainings et
    JOIN training_programs tp ON tp.id = et.training_program_id
    JOIN employees e ON e.id = et.employee_id
    WHERE e.company_id = $1
    ORDER BY et.created_at`,
    [options.companyId],
  );
  console.log(`  Found ${trainings.length} employee trainings in source`);

  let migrated = 0;
  let errors = 0;

  for (const t of trainings) {
    try {
      const employeeId = employeeMap.tryGet(t.employee_id);
      if (employeeId === null) {
        if (options.verbose) console.log(`  Skipping training ${t.id}: employee ${t.employee_id} not migrated`);
        errors++;
        continue;
      }

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert training: ${t.program_name}`);
        migrated++;
        continue;
      }

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
      migrated++;
      if (options.verbose) console.log(`  Inserted training: ${t.program_name}`);
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating training ${t.id}:`, err);
    }
  }

  addReport("employee_trainings", trainings.length, migrated, errors);
}

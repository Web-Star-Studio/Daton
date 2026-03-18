import { db, employeeCompetenciesTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";
import { transformCompetencyType } from "./transform.js";

interface V1CompetencyAssessment {
  id: string;
  employee_id: string;
  competency_id: string;
  current_level: number | null;
  target_level: number | null;
  development_plan: string | null;
  created_at: string | null;
  // Joined from competency_matrix
  competency_name: string;
  competency_description: string | null;
  competency_category: string | null;
}

export async function migrateEmployeeCompetencies(
  employeeMap: IdMap,
  options: { dryRun: boolean; verbose: boolean; companyId: string },
): Promise<void> {
  console.log("\n--- Migrating employee competencies ---");

  const assessments = await sourceQuery<V1CompetencyAssessment>(
    `SELECT
      a.id, a.employee_id, a.competency_id, a.current_level, a.target_level, a.development_plan, a.created_at,
      m.competency_name, m.description AS competency_description, m.competency_category
    FROM employee_competency_assessments a
    JOIN competency_matrix m ON m.id = a.competency_id
    JOIN employees e ON e.id = a.employee_id
    WHERE e.company_id = $1
    ORDER BY a.created_at`,
    [options.companyId],
  );
  console.log(`  Found ${assessments.length} competency assessments in source`);

  let migrated = 0;
  let errors = 0;

  for (const a of assessments) {
    try {
      const employeeId = employeeMap.tryGet(a.employee_id);
      if (employeeId === null) {
        if (options.verbose) console.log(`  Skipping competency ${a.id}: employee ${a.employee_id} not migrated`);
        errors++;
        continue;
      }

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert competency: ${a.competency_name}`);
        migrated++;
        continue;
      }

      await db.insert(employeeCompetenciesTable).values({
        employeeId,
        name: a.competency_name,
        description: a.competency_description,
        type: transformCompetencyType(a.competency_category),
        requiredLevel: a.target_level ?? 1,
        acquiredLevel: a.current_level ?? 0,
        evidence: a.development_plan,
        createdAt: a.created_at ? new Date(a.created_at) : undefined,
      });
      migrated++;
      if (options.verbose) console.log(`  Inserted competency: ${a.competency_name}`);
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating competency assessment ${a.id}:`, err);
    }
  }

  addReport("employee_competencies", assessments.length, migrated, errors);
}

import { db, employeeProfileItemsTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";
import { formatDate } from "./transform.js";

interface V1Education {
  id: string;
  employee_id: string;
  course_name: string;
  institution_name: string | null;
  field_of_study: string | null;
  education_type: string | null;
  grade: string | null;
  certificate_number: string | null;
  created_at: string | null;
}

interface V1Experience {
  id: string;
  employee_id: string;
  position_title: string;
  company_name: string | null;
  department: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  created_at: string | null;
}

function buildEducationDescription(e: V1Education): string | null {
  const parts: string[] = [];
  if (e.institution_name) parts.push(`Instituição: ${e.institution_name}`);
  if (e.field_of_study) parts.push(`Área: ${e.field_of_study}`);
  if (e.education_type) parts.push(`Tipo: ${e.education_type}`);
  if (e.grade) parts.push(`Conceito: ${e.grade}`);
  if (e.certificate_number) parts.push(`Certificado: ${e.certificate_number}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

function buildExperienceDescription(e: V1Experience): string | null {
  const parts: string[] = [];
  if (e.company_name) parts.push(`Empresa: ${e.company_name}`);
  if (e.department) parts.push(`Departamento: ${e.department}`);
  const startStr = formatDate(e.start_date);
  const endStr = formatDate(e.end_date) || "Atual";
  if (startStr) parts.push(`Período: ${startStr} a ${endStr}`);
  if (e.description) parts.push(e.description);
  return parts.length > 0 ? parts.join("\n") : null;
}

export async function migrateEmployeeProfileItems(
  employeeMap: IdMap,
  options: { dryRun: boolean; verbose: boolean },
): Promise<void> {
  console.log("\n--- Migrating employee profile items ---");

  // Education
  const educations = await sourceQuery<V1Education>(
    `SELECT id, employee_id, course_name, institution_name, field_of_study, education_type, grade, certificate_number, created_at FROM employee_education ORDER BY created_at`,
  );
  console.log(`  Found ${educations.length} education records in source`);

  // Experiences
  const experiences = await sourceQuery<V1Experience>(
    `SELECT id, employee_id, position_title, company_name, department, start_date, end_date, description, created_at FROM employee_experiences ORDER BY created_at`,
  );
  console.log(`  Found ${experiences.length} experience records in source`);

  const totalSource = educations.length + experiences.length;
  let migrated = 0;
  let errors = 0;

  // Migrate education records
  for (const e of educations) {
    try {
      const employeeId = employeeMap.tryGet(e.employee_id);
      if (employeeId === null) {
        if (options.verbose) console.log(`  Skipping education ${e.id}: employee ${e.employee_id} not migrated`);
        errors++;
        continue;
      }

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert education: ${e.course_name}`);
        migrated++;
        continue;
      }

      await db.insert(employeeProfileItemsTable).values({
        employeeId,
        category: "formacao",
        title: e.course_name,
        description: buildEducationDescription(e),
        createdAt: e.created_at ? new Date(e.created_at) : undefined,
      });
      migrated++;
      if (options.verbose) console.log(`  Inserted education: ${e.course_name}`);
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating education ${e.id}:`, err);
    }
  }

  // Migrate experience records
  for (const e of experiences) {
    try {
      const employeeId = employeeMap.tryGet(e.employee_id);
      if (employeeId === null) {
        if (options.verbose) console.log(`  Skipping experience ${e.id}: employee ${e.employee_id} not migrated`);
        errors++;
        continue;
      }

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert experience: ${e.position_title}`);
        migrated++;
        continue;
      }

      await db.insert(employeeProfileItemsTable).values({
        employeeId,
        category: "experiencia",
        title: e.position_title,
        description: buildExperienceDescription(e),
        createdAt: e.created_at ? new Date(e.created_at) : undefined,
      });
      migrated++;
      if (options.verbose) console.log(`  Inserted experience: ${e.position_title}`);
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating experience ${e.id}:`, err);
    }
  }

  addReport("employee_profile_items", totalSource, migrated, errors);
}

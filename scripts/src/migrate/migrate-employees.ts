import { db, employeesTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";
import {
  transformEmployeeStatus,
  transformContractType,
  formatDate,
} from "./transform.js";

interface V1Employee {
  id: string;
  company_id: string;
  branch_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  termination_date: string | null;
  employment_type: string | null;
  status: string | null;
  created_at: string | null;
}

export async function migrateEmployees(
  companyMap: IdMap,
  branchMap: IdMap,
  employeeMap: IdMap,
  options: { dryRun: boolean; verbose: boolean; companyId: string },
): Promise<void> {
  console.log("\n--- Migrating employees ---");

  const employees = await sourceQuery<V1Employee>(
    `SELECT id, company_id, branch_id, full_name, email, phone, cpf, department, position, hire_date, termination_date, employment_type, status, created_at FROM employees WHERE company_id = $1 ORDER BY created_at`,
    [options.companyId],
  );
  console.log(`  Found ${employees.length} employees in source`);

  let migrated = 0;
  let errors = 0;

  for (const e of employees) {
    try {
      const organizationId = companyMap.get(e.company_id);
      const unitId = branchMap.tryGet(e.branch_id);

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert employee: ${e.full_name}`);
        employeeMap.set(e.id, -1);
        migrated++;
        continue;
      }

      const [inserted] = await db.insert(employeesTable).values({
        organizationId,
        unitId,
        name: e.full_name,
        cpf: e.cpf,
        email: e.email,
        phone: e.phone,
        position: e.position,
        department: e.department,
        contractType: transformContractType(e.employment_type),
        admissionDate: formatDate(e.hire_date),
        terminationDate: formatDate(e.termination_date),
        status: transformEmployeeStatus(e.status),
        createdAt: e.created_at ? new Date(e.created_at) : undefined,
      }).returning();

      employeeMap.set(e.id, inserted.id);
      migrated++;
      if (options.verbose) console.log(`  Inserted employee: ${inserted.name} (${e.id} → ${inserted.id})`);
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating employee ${e.id} (${e.full_name}):`, err);
    }
  }

  addReport("employees", employees.length, migrated, errors);
}

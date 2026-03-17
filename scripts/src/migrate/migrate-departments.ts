import { db, departmentsTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";

interface V1Department {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  created_at: string | null;
}

export async function migrateDepartments(
  companyMap: IdMap,
  options: { dryRun: boolean; verbose: boolean },
): Promise<void> {
  console.log("\n--- Migrating departments ---");

  const departments = await sourceQuery<V1Department>(
    `SELECT id, company_id, name, description, created_at FROM departments ORDER BY created_at`,
  );
  console.log(`  Found ${departments.length} departments in source`);

  let migrated = 0;
  let errors = 0;

  for (const d of departments) {
    try {
      const organizationId = companyMap.get(d.company_id);

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert dept: ${d.name}`);
        migrated++;
        continue;
      }

      const [inserted] = await db.insert(departmentsTable).values({
        organizationId,
        name: d.name,
        description: d.description,
        createdAt: d.created_at ? new Date(d.created_at) : undefined,
      }).returning();

      if (options.verbose) console.log(`  Inserted dept: ${inserted.name} (${d.id} → ${inserted.id})`);
      migrated++;
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating department ${d.id} (${d.name}):`, err);
    }
  }

  addReport("departments", departments.length, migrated, errors);
}

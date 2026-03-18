import { db, positionsTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";
import { transformExperience, arrayToText } from "./transform.js";

interface V1Position {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  required_education_level: string | null;
  required_experience_years: number | null;
  requirements: string[] | null;
  responsibilities: string[] | null;
  created_at: string | null;
}

export async function migratePositions(
  companyMap: IdMap,
  options: { dryRun: boolean; verbose: boolean; companyId: string },
): Promise<void> {
  console.log("\n--- Migrating positions ---");

  const positions = await sourceQuery<V1Position>(
    `SELECT id, company_id, title, description, required_education_level, required_experience_years, requirements, responsibilities, created_at FROM positions WHERE company_id = $1 ORDER BY created_at`,
    [options.companyId],
  );
  console.log(`  Found ${positions.length} positions in source`);

  let migrated = 0;
  let errors = 0;

  for (const p of positions) {
    try {
      const organizationId = companyMap.get(p.company_id);

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert position: ${p.title}`);
        migrated++;
        continue;
      }

      const [inserted] = await db.insert(positionsTable).values({
        organizationId,
        name: p.title,
        description: p.description,
        education: p.required_education_level,
        experience: transformExperience(p.required_experience_years),
        requirements: arrayToText(p.requirements),
        responsibilities: arrayToText(p.responsibilities),
        createdAt: p.created_at ? new Date(p.created_at) : undefined,
      }).returning();

      if (options.verbose) console.log(`  Inserted position: ${inserted.name} (${p.id} → ${inserted.id})`);
      migrated++;
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating position ${p.id} (${p.title}):`, err);
    }
  }

  addReport("positions", positions.length, migrated, errors);
}

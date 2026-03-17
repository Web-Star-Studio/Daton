import { db, organizationsTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";
import { buildV1MigrationData } from "./transform.js";

interface V1Company {
  id: string;
  name: string;
  cnpj: string | null;
  created_at: string | null;
  sector: string | null;
  legal_structure: string | null;
  governance_model: string | null;
  headquarters_address: string | null;
}

export async function migrateOrganizations(
  companyMap: IdMap,
  options: { dryRun: boolean; verbose: boolean },
): Promise<void> {
  console.log("\n--- Migrating organizations ---");

  const companies = await sourceQuery<V1Company>(
    `SELECT id, name, cnpj, created_at, sector, legal_structure, governance_model, headquarters_address FROM companies ORDER BY created_at`,
  );
  console.log(`  Found ${companies.length} companies in source`);

  let migrated = 0;
  let errors = 0;

  for (const c of companies) {
    try {
      const v1Migration = buildV1MigrationData(c);
      const onboardingData = v1Migration ? { _v1Migration: v1Migration } : undefined;

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert org: ${c.name}`);
        migrated++;
        continue;
      }

      const [inserted] = await db.insert(organizationsTable).values({
        name: c.name,
        legalIdentifier: c.cnpj,
        statusOperacional: "ativa",
        onboardingStatus: "completed",
        onboardingData: onboardingData as any,
        createdAt: c.created_at ? new Date(c.created_at) : undefined,
      }).returning();

      companyMap.set(c.id, inserted.id);
      migrated++;
      if (options.verbose) console.log(`  Inserted org: ${inserted.name} (${c.id} → ${inserted.id})`);
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating company ${c.id} (${c.name}):`, err);
    }
  }

  addReport("organizations", companies.length, migrated, errors);
}

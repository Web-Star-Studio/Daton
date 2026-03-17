import { db, unitsTable } from "@workspace/db";
import type { IdMap } from "./id-map.js";
import { addReport } from "./report.js";
import { sourceQuery } from "./source-db.js";
import { transformUnitStatus, transformUnitType } from "./transform.js";

interface V1Branch {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  address: string | null;
  street_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  cep: string | null;
  cnpj: string | null;
  is_headquarters: boolean | null;
  status: string | null;
  created_at: string | null;
}

export async function migrateUnits(
  companyMap: IdMap,
  branchMap: IdMap,
  options: { dryRun: boolean; verbose: boolean },
): Promise<void> {
  console.log("\n--- Migrating units ---");

  const branches = await sourceQuery<V1Branch>(
    `SELECT id, company_id, name, code, address, street_number, neighborhood, city, state, country, phone, cep, cnpj, is_headquarters, status, created_at FROM branches ORDER BY created_at`,
  );
  console.log(`  Found ${branches.length} branches in source`);

  let migrated = 0;
  let errors = 0;

  for (const b of branches) {
    try {
      const organizationId = companyMap.get(b.company_id);

      if (options.dryRun) {
        if (options.verbose) console.log(`  [DRY RUN] Would insert unit: ${b.name}`);
        migrated++;
        continue;
      }

      const [inserted] = await db.insert(unitsTable).values({
        organizationId,
        name: b.name,
        code: b.code,
        type: transformUnitType(b.is_headquarters),
        cnpj: b.cnpj,
        status: transformUnitStatus(b.status),
        cep: b.cep,
        address: b.address,
        streetNumber: b.street_number,
        neighborhood: b.neighborhood,
        city: b.city,
        state: b.state,
        country: b.country || "Brasil",
        phone: b.phone,
        createdAt: b.created_at ? new Date(b.created_at) : undefined,
      }).returning();

      branchMap.set(b.id, inserted.id);
      migrated++;
      if (options.verbose) console.log(`  Inserted unit: ${inserted.name} (${b.id} → ${inserted.id})`);
    } catch (err) {
      errors++;
      console.error(`  ERROR migrating branch ${b.id} (${b.name}):`, err);
    }
  }

  addReport("units", branches.length, migrated, errors);
}

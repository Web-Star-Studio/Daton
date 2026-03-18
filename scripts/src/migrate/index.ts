import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { IdMap } from "./id-map.js";
import { printReport } from "./report.js";
import { sourcePool } from "./source-db.js";
import { migrateOrganizations } from "./migrate-organizations.js";
import { migrateUnits } from "./migrate-units.js";
import { migrateDepartments } from "./migrate-departments.js";
import { migratePositions } from "./migrate-positions.js";
import { migrateEmployees } from "./migrate-employees.js";
import { migrateEmployeeProfileItems } from "./migrate-employee-profile-items.js";
import { migrateEmployeeCompetencies } from "./migrate-employee-competencies.js";
import { migrateEmployeeTrainings } from "./migrate-employee-trainings.js";

// --- CLI flags ---
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const verbose = args.includes("--verbose");

function getFlagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const companyId = getFlagValue("--company-id");

if (!companyId) {
  console.error("Error: --company-id <uuid> is required.");
  console.error(
    "\nUsage:\n  pnpm --filter @workspace/scripts migrate --company-id <uuid> [--dry-run] [--verbose] [--force]",
  );
  process.exit(1);
}

const options = { dryRun, verbose, companyId };

async function confirmDeletion(): Promise<boolean> {
  if (force) return true;
  if (dryRun) return true;

  return new Promise((resolve) => {
    process.stdout.write(
      `\n⚠ This will INSERT data for company ${companyId} into the target database.\n` +
      "  No existing data will be deleted.\n\n" +
      "  Continue? (yes/no): ",
    );
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (data) => {
      const answer = (data as unknown as string).trim().toLowerCase();
      resolve(answer === "yes" || answer === "y");
    });
    process.stdin.resume();
  });
}

async function testConnections(): Promise<void> {
  console.log("Testing database connections...");

  // Test source (Supabase)
  try {
    const result = await sourcePool.query("SELECT current_database() AS db");
    console.log(`  Source (Supabase): connected to "${result.rows[0].db}"`);
  } catch (err) {
    console.error("  ✗ Failed to connect to source database:", err);
    process.exit(1);
  }

  // Test target (Neon)
  try {
    const result = await db.execute(sql`SELECT current_database() AS db`);
    console.log(`  Target (Neon): connected to "${(result.rows[0] as any).db}"`);
  } catch (err) {
    console.error("  ✗ Failed to connect to target database:", err);
    process.exit(1);
  }
}

async function verifyCompanyExists(): Promise<void> {
  const result = await sourcePool.query(
    `SELECT id, name FROM companies WHERE id = $1`,
    [companyId],
  );
  if (result.rows.length === 0) {
    console.error(`\n✗ Company ${companyId} not found in source database.`);
    process.exit(1);
  }
  console.log(`  Source company: "${result.rows[0].name}" (${companyId})`);
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log("  Daton v1 → v2 Data Migration");
  console.log("  (single company mode)");
  console.log("========================================");
  console.log(`  Company: ${companyId}`);
  if (dryRun) console.log("  Mode: DRY RUN (no changes will be made)");
  if (verbose) console.log("  Verbose output enabled");
  console.log("");

  await testConnections();
  await verifyCompanyExists();

  // Confirm before operations
  if (!dryRun) {
    const confirmed = await confirmDeletion();
    if (!confirmed) {
      console.log("Migration cancelled.");
      process.exit(0);
    }
  }

  // ID maps
  const companyMap = new IdMap("companies");
  const branchMap = new IdMap("branches");
  const employeeMap = new IdMap("employees");

  // Execute in topological order
  await migrateOrganizations(companyMap, options);
  await migrateUnits(companyMap, branchMap, options);
  await migrateDepartments(companyMap, options);
  await migratePositions(companyMap, options);
  await migrateEmployees(companyMap, branchMap, employeeMap, options);
  await migrateEmployeeProfileItems(employeeMap, options);
  await migrateEmployeeCompetencies(employeeMap, options);
  await migrateEmployeeTrainings(employeeMap, options);

  // Summary
  printReport();

  // Post-migration verification
  if (!dryRun) {
    console.log("\n--- Post-migration verification ---");
    console.log(`  ID mappings: ${companyMap.size} orgs, ${branchMap.size} units, ${employeeMap.size} employees`);
  }

  // Cleanup connections
  await sourcePool.end();
  await pool.end();

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});

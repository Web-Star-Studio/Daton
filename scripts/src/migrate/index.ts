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

const options = { dryRun, verbose };

async function confirmDeletion(): Promise<boolean> {
  if (force) return true;
  if (dryRun) return true;

  return new Promise((resolve) => {
    process.stdout.write(
      "\n⚠ This will DELETE existing migrated data in the target database.\n" +
      "  Tables affected: employee_trainings, employee_competencies, employee_profile_items,\n" +
      "  employees, positions, departments, units, organizations\n\n" +
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

async function cleanTargetTables(): Promise<void> {
  console.log("\n--- Cleaning target tables (reverse dependency order) ---");

  // Check if any users reference organizations (safety check)
  const userCheck = await db.execute(
    sql`SELECT COUNT(*) as count FROM users WHERE organization_id IS NOT NULL`,
  );
  const userCount = Number((userCheck.rows[0] as any)?.count ?? 0);
  if (userCount > 0) {
    console.log(`  ⚠ Found ${userCount} users with organization references.`);
    console.log("  Users will NOT be deleted (they are managed separately).");
    console.log("  Organizations referenced by users will be preserved.\n");
  }

  // Delete in reverse dependency order (children first)
  const tables = [
    "employee_trainings",
    "employee_competencies",
    "employee_profile_items",
    "employees",
    "positions",
    "departments",
    "units",
  ];

  for (const table of tables) {
    const result = await db.execute(sql.raw(`DELETE FROM ${table}`));
    console.log(`  Deleted from ${table}: ${(result as any).rowCount ?? 0} rows`);
  }

  // Only delete organizations not referenced by users
  if (userCount > 0) {
    const result = await db.execute(
      sql`DELETE FROM organizations WHERE id NOT IN (SELECT DISTINCT organization_id FROM users WHERE organization_id IS NOT NULL)`,
    );
    console.log(`  Deleted from organizations: ${(result as any).rowCount ?? 0} rows (preserved ${userCount} user-linked orgs)`);
  } else {
    const result = await db.execute(sql.raw(`DELETE FROM organizations`));
    console.log(`  Deleted from organizations: ${(result as any).rowCount ?? 0} rows`);
  }

  // Reset sequences
  const sequences = [
    "organizations_id_seq",
    "units_id_seq",
    "departments_id_seq",
    "positions_id_seq",
    "employees_id_seq",
    "employee_profile_items_id_seq",
    "employee_competencies_id_seq",
    "employee_trainings_id_seq",
  ];

  for (const seq of sequences) {
    try {
      await db.execute(sql.raw(`ALTER SEQUENCE ${seq} RESTART`));
    } catch {
      // Sequence may not exist if table was never populated
    }
  }
  console.log("  Sequences reset.");
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

async function main(): Promise<void> {
  console.log("========================================");
  console.log("  Daton v1 → v2 Data Migration");
  console.log("========================================");
  if (dryRun) console.log("  Mode: DRY RUN (no changes will be made)");
  if (verbose) console.log("  Verbose output enabled");
  console.log("");

  await testConnections();

  // Confirm before destructive operations
  if (!dryRun) {
    const confirmed = await confirmDeletion();
    if (!confirmed) {
      console.log("Migration cancelled.");
      process.exit(0);
    }
    await cleanTargetTables();
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

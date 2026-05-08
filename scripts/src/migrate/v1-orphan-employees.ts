/**
 * Insert V1 employees that are missing in V2 for a given org.
 *
 * Used as a prerequisite to v1-trainings-historical: those orphan employees
 * exist in V1 but were not picked up by the original migrate-employees run
 * (typically because they were hired in V1 after that run).
 *
 * Source: data/v1-orphan-employees-<org>.json (extracted from V1 via Supabase MCP).
 *
 * Idempotent: skips an employee if a row with the same normalized CPF (digits)
 * or the same name already exists in the target org.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts seed-v1-orphan-employees -- \
 *     --payload ./src/migrate/data/v1-orphan-employees-gabardo.json \
 *     [--dry-run] [--verbose]
 */
import { db, pool, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import {
  transformContractType,
  transformEmployeeStatus,
  formatDate,
} from "./transform.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

const payloadPath = flag("--payload");
if (!payloadPath) {
  console.error("Usage: --payload <path.json> [--dry-run] [--verbose]");
  process.exit(1);
}

interface V1Emp {
  v1_id: string;
  full_name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  termination_date: string | null;
  employment_type: string | null;
  status: string | null;
  branch_id: string | null;
}

interface Payload {
  org_v1_id: string;
  org_v2_id: number;
  extracted_at: string;
  employees: V1Emp[];
}

const cpfDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const upper = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

async function main() {
  const raw = readFileSync(payloadPath!, "utf-8");
  const payload: Payload = JSON.parse(raw);
  console.log("=== Insert V1 orphan employees ===");
  console.log(`  Source org V1=${payload.org_v1_id} → V2=${payload.org_v2_id}`);
  console.log(`  Employees in payload: ${payload.employees.length}`);
  if (dryRun) console.log("  Mode: DRY RUN");

  const existing = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      cpf: employeesTable.cpf,
    })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, payload.org_v2_id));
  const existingByCpf = new Set(existing.map((r) => cpfDigits(r.cpf)).filter(Boolean));
  const existingByName = new Set(existing.map((r) => upper(r.name)).filter(Boolean));

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const e of payload.employees) {
    const cpf = cpfDigits(e.cpf);
    const nm = upper(e.full_name);
    const dup = (cpf && existingByCpf.has(cpf)) || (nm && existingByName.has(nm));
    if (dup) {
      skipped++;
      if (verbose) console.log(`  [skip-dup] ${e.full_name} cpf=${e.cpf}`);
      continue;
    }

    if (dryRun) {
      inserted++;
      if (verbose)
        console.log(`  [DRY] insert ${e.full_name} cpf=${e.cpf} pos=${e.position ?? "—"}`);
      continue;
    }

    try {
      const hireDate = formatDate(e.hire_date) ?? new Date().toISOString().split("T")[0];
      await db.insert(employeesTable).values({
        organizationId: payload.org_v2_id,
        unitId: null,
        name: e.full_name,
        cpf: e.cpf,
        email: e.email,
        phone: e.phone,
        position: e.position,
        department: e.department,
        contractType: transformContractType(e.employment_type),
        admissionDate: hireDate,
        terminationDate: formatDate(e.termination_date),
        status: transformEmployeeStatus(e.status),
      });
      inserted++;
      if (verbose) console.log(`  [ins] ${e.full_name}`);
    } catch (err) {
      errors++;
      console.error(`  ERROR insert ${e.full_name}:`, err);
    }
  }

  console.log(`\n  Inserted=${inserted}  skipped=${skipped}  errors=${errors}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});

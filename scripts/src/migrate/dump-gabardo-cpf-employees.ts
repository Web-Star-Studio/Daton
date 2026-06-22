/**
 * READ-ONLY: dump org-2 (Gabardo) employees that have a valid CPF, with ALL
 * fields relevant to enrichment, so the dry-run can compute a fill-if-empty diff
 * for the 111 rows that already exist. Writes /tmp/gabardo-existing-employees.json.
 */
import { db, pool } from "@workspace/db";
import { employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const ORG = 2;
  const emps = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      cpf: employeesTable.cpf,
      email: employeesTable.email,
      phone: employeesTable.phone,
      position: employeesTable.position,
      department: employeesTable.department,
      contractType: employeesTable.contractType,
      admissionDate: employeesTable.admissionDate,
      terminationDate: employeesTable.terminationDate,
      status: employeesTable.status,
      unitId: employeesTable.unitId,
      createdAt: employeesTable.createdAt,
    })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, ORG));

  const norm = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const withCpf = emps
    .filter((e) => norm(e.cpf).length === 11)
    .map((e) => ({
      ...e,
      cpf: norm(e.cpf),
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString().slice(0, 10) : null,
    }));

  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/gabardo-existing-employees.json", JSON.stringify(withCpf, null, 0));
  console.log(`org-2 total=${emps.length}, with valid CPF=${withCpf.length}`);
  console.log("wrote /tmp/gabardo-existing-employees.json (full fields)");
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });

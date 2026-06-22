/**
 * READ-ONLY inspection for the 1866-employee bulk load into Transportes Gabardo.
 * Does NOT write anything. Lists existing units / departments / positions /
 * employees so we can build the spreadsheet -> DB mapping and detect duplicates.
 */
import { db, pool } from "@workspace/db";
import {
  organizationsTable,
  unitsTable,
  departmentsTable,
  positionsTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const orgs = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable);
  console.log("=== ORGANIZATIONS ===");
  for (const o of orgs) console.log(`  org ${o.id}: ${o.name}`);

  // Resolve Gabardo
  const gabardo = orgs.find((o) => /gabardo/i.test(o.name));
  if (!gabardo) {
    console.log("\n!! Could not find a 'Gabardo' org by name. Aborting read.");
    return;
  }
  const orgId = gabardo.id;
  console.log(`\n>>> Using org ${orgId}: ${gabardo.name}\n`);

  const units = await db
    .select({
      id: unitsTable.id,
      name: unitsTable.name,
      code: unitsTable.code,
      type: unitsTable.type,
      status: unitsTable.status,
      city: unitsTable.city,
      state: unitsTable.state,
    })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, orgId));
  console.log(`=== UNITS (${units.length}) ===`);
  for (const u of units)
    console.log(
      `  [${u.id}] code=${u.code ?? "-"} | ${u.name} | ${u.city ?? "-"}/${u.state ?? "-"} | ${u.type} | ${u.status}`,
    );

  const deps = await db
    .select({ id: departmentsTable.id, name: departmentsTable.name })
    .from(departmentsTable)
    .where(eq(departmentsTable.organizationId, orgId));
  console.log(`\n=== DEPARTMENTS (${deps.length}) ===`);
  for (const d of deps) console.log(`  [${d.id}] ${JSON.stringify(d.name)}`);

  const positions = await db
    .select({ id: positionsTable.id, name: positionsTable.name })
    .from(positionsTable)
    .where(eq(positionsTable.organizationId, orgId));
  console.log(`\n=== POSITIONS (${positions.length}) ===`);
  for (const p of positions) console.log(`  [${p.id}] ${JSON.stringify(p.name)}`);

  const emps = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      cpf: employeesTable.cpf,
      unitId: employeesTable.unitId,
      status: employeesTable.status,
    })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));
  console.log(`\n=== EXISTING EMPLOYEES (${emps.length}) ===`);
  const withCpf = emps.filter((e) => e.cpf && e.cpf.trim() !== "");
  console.log(`  with non-empty cpf: ${withCpf.length}`);
  // print only the digit-normalized CPF set size + a small sample (avoid dumping PII en masse)
  const norm = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const cpfSet = new Set(withCpf.map((e) => norm(e.cpf)).filter((c) => c.length === 11));
  console.log(`  distinct valid-length CPFs already in system: ${cpfSet.size}`);
  console.log("  sample (first 10):");
  for (const e of emps.slice(0, 10))
    console.log(`    [${e.id}] ${e.name} | cpf=${e.cpf ?? "-"} | unit=${e.unitId ?? "-"} | ${e.status}`);

  // Emit the CPF set to a file the load script can read for dedup (digits only, no names)
  const fs = await import("node:fs");
  fs.writeFileSync(
    "/tmp/gabardo-existing-cpfs.json",
    JSON.stringify({ orgId, count: emps.length, cpfs: [...cpfSet] }, null, 0),
  );
  console.log("\n  (wrote distinct existing CPFs to /tmp/gabardo-existing-cpfs.json for dedup)");
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error("ERROR:", err);
    await pool.end();
    process.exit(1);
  });

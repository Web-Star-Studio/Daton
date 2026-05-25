// One-shot: list organizations with quick stats so we can pick the "demo" one.
import { db, organizationsTable, unitsTable, employeesTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";

async function main() {
  const orgs = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      createdAt: organizationsTable.createdAt,
    })
    .from(organizationsTable)
    .orderBy(organizationsTable.id);

  console.log(`\n${orgs.length} organização(ões) encontrada(s):\n`);
  console.log("  id  │ nome                                     │ filiais │ employees │ criada");
  console.log("─".repeat(95));

  for (const org of orgs) {
    const [{ value: unitCount }] = await db
      .select({ value: count() })
      .from(unitsTable)
      .where(eq(unitsTable.organizationId, org.id));
    const [{ value: empCount }] = await db
      .select({ value: count() })
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, org.id));

    const idStr = String(org.id).padStart(4);
    const name = (org.name ?? "").slice(0, 40).padEnd(40);
    const date = org.createdAt.toISOString().slice(0, 10);
    console.log(`  ${idStr} │ ${name} │ ${String(unitCount).padStart(7)} │ ${String(empCount).padStart(9)} │ ${date}`);
  }
  console.log();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

interface TableReport {
  table: string;
  source: number;
  migrated: number;
  errors: number;
}

const reports: TableReport[] = [];

export function addReport(table: string, source: number, migrated: number, errors: number): void {
  reports.push({ table, source, migrated, errors });
}

export function printReport(): void {
  console.log("\n=== Migration Summary ===");
  console.log(
    "Table".padEnd(30) +
    "| Source".padEnd(10) +
    "| Migrated".padEnd(12) +
    "| Errors",
  );
  console.log("-".repeat(62));
  for (const r of reports) {
    console.log(
      r.table.padEnd(30) +
      `| ${String(r.source).padStart(6)}` +
      `| ${String(r.migrated).padStart(8)}  ` +
      `| ${String(r.errors).padStart(6)}`,
    );
  }

  const totalErrors = reports.reduce((sum, r) => sum + r.errors, 0);
  if (totalErrors > 0) {
    console.log(`\n⚠ ${totalErrors} total errors during migration.`);
  } else {
    console.log("\n✓ All rows migrated successfully.");
  }
}

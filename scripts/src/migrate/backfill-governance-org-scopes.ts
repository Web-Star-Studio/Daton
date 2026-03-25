/**
 * Backfill organization_id on governance tables introduced in the staged tenant-scope rollout.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts backfill-governance-org-scopes
 *   pnpm --filter @workspace/scripts backfill-governance-org-scopes --dry-run
 *   pnpm --filter @workspace/scripts backfill-governance-org-scopes --verify-only
 */
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verifyOnly = args.includes("--verify-only");

type CountRow = { count: string };

async function countRiskItemMismatches(): Promise<number> {
  const result = await db.execute<CountRow>(sql`
    select count(*)::text as count
    from strategic_plan_risk_opportunity_items item
    join strategic_plans plan on plan.id = item.plan_id
    where item.organization_id is distinct from plan.organization_id
  `);

  return Number((result.rows[0] as CountRow | undefined)?.count ?? "0");
}

async function countAuditFindingMismatches(): Promise<number> {
  const result = await db.execute<CountRow>(sql`
    select count(*)::text as count
    from internal_audit_findings finding
    join internal_audits audit on audit.id = finding.audit_id
    where finding.organization_id is distinct from audit.organization_id
  `);

  return Number((result.rows[0] as CountRow | undefined)?.count ?? "0");
}

async function backfillRiskItems(): Promise<number> {
  const result = await db.execute(sql`
    update strategic_plan_risk_opportunity_items item
    set organization_id = plan.organization_id
    from strategic_plans plan
    where plan.id = item.plan_id
      and item.organization_id is distinct from plan.organization_id
  `);

  return result.rowCount ?? 0;
}

async function backfillAuditFindings(): Promise<number> {
  const result = await db.execute(sql`
    update internal_audit_findings finding
    set organization_id = audit.organization_id
    from internal_audits audit
    where audit.id = finding.audit_id
      and finding.organization_id is distinct from audit.organization_id
  `);

  return result.rowCount ?? 0;
}

async function main(): Promise<void> {
  console.log("=== Governance tenant-scope backfill ===");
  if (dryRun) console.log("Mode: DRY RUN");
  if (verifyOnly) console.log("Mode: VERIFY ONLY");

  try {
    const beforeRiskItems = await countRiskItemMismatches();
    const beforeFindings = await countAuditFindingMismatches();

    console.log(`Risk/opportunity items needing backfill: ${beforeRiskItems}`);
    console.log(`Internal audit findings needing backfill: ${beforeFindings}`);

    if (!dryRun && !verifyOnly) {
      const updatedRiskItems = await backfillRiskItems();
      const updatedFindings = await backfillAuditFindings();

      console.log(`Updated risk/opportunity items: ${updatedRiskItems}`);
      console.log(`Updated internal audit findings: ${updatedFindings}`);
    }

    const afterRiskItems = await countRiskItemMismatches();
    const afterFindings = await countAuditFindingMismatches();

    console.log(`Remaining risk/opportunity mismatches: ${afterRiskItems}`);
    console.log(`Remaining audit finding mismatches: ${afterFindings}`);

    if (afterRiskItems > 0 || afterFindings > 0) {
      process.exitCode = 1;
      console.error(
        "Backfill verification failed. Resolve remaining organization_id mismatches before phase 2.",
      );
      return;
    }

    console.log("Backfill verification passed.");
  } catch (error) {
    console.error(
      "Backfill failed. Run the phase-1 db push first so the organization_id columns exist in the target branch.",
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

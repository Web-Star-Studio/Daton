import { and, eq, like } from "drizzle-orm";
import { actionPlansTable, db, type ActionPlanType } from "@workspace/db";

const CODE_PREFIX: Record<ActionPlanType, string> = {
  corrective: "AC", // Ação Corretiva
  preventive: "AP", // Ação Preventiva
  improvement: "AM", // Ação de Melhoria
};

/**
 * Generate the next per-org human-readable code, e.g. "AC-2026-047".
 * Sequence is the highest existing suffix for the org/prefix/year + 1. Codes are
 * advisory (not a DB unique constraint) so a rare race just yields a duplicate
 * that can be corrected; we keep it simple rather than locking.
 */
export async function generateActionPlanCode(
  orgId: number,
  actionType: ActionPlanType,
  year: number,
): Promise<string> {
  const prefix = CODE_PREFIX[actionType] ?? "AC";
  const pattern = `${prefix}-${year}-%`;
  const rows = await db
    .select({ code: actionPlansTable.code })
    .from(actionPlansTable)
    .where(and(eq(actionPlansTable.organizationId, orgId), like(actionPlansTable.code, pattern)));
  let max = 0;
  for (const r of rows) {
    const tail = r.code?.split("-").pop();
    const n = tail ? Number.parseInt(tail, 10) : Number.NaN;
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

import { and, eq, inArray } from "drizzle-orm";
import { db, regulatoryNormsTable } from "@workspace/db";

/** True if every id (deduped) exists in this org's norms catalog. Empty → true. */
export async function assertNormsBelongToOrg(
  orgId: number,
  ids: number[],
): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return true;
  const rows = await db
    .select({ id: regulatoryNormsTable.id })
    .from(regulatoryNormsTable)
    .where(
      and(
        eq(regulatoryNormsTable.organizationId, orgId),
        inArray(regulatoryNormsTable.id, unique),
      ),
    );
  return rows.length === unique.length;
}

import { and, eq } from "drizzle-orm";
import { db, effectivenessMethodsTable } from "@workspace/db";

/** True se o método existe e pertence a esta organização. */
export async function assertEffectivenessMethodBelongsToOrg(
  orgId: number,
  id: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: effectivenessMethodsTable.id })
    .from(effectivenessMethodsTable)
    .where(
      and(
        eq(effectivenessMethodsTable.id, id),
        eq(effectivenessMethodsTable.organizationId, orgId),
      ),
    );
  return !!row;
}

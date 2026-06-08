import { and, eq } from "drizzle-orm";
import {
  db,
  kpiIndicatorsTable,
  nonconformitiesTable,
  type ActionPlanNormRef,
  type ActionPlanSourceModule,
  type ActionPlanSourceRef,
} from "@workspace/db";

const KPI_NORM_LABELS: Record<string, string> = {
  "9001": "ISO 9001",
  "14001": "ISO 14001",
  "39001": "ISO 39001",
};

export type ActionPlanDerivedDefaults = {
  normRefs?: ActionPlanNormRef[];
  relatedIndicatorIds?: number[];
  relatedRiskIds?: number[];
  rootCause?: string;
};

/**
 * Best-effort auto-fill from the origin so users type less. Only fills fields
 * the client did NOT provide (merged at create time). New origins plug in here
 * without touching the route.
 */
export async function deriveCreateDefaults(
  orgId: number,
  sourceModule: ActionPlanSourceModule,
  sourceRef: ActionPlanSourceRef,
): Promise<ActionPlanDerivedDefaults> {
  if (sourceModule === "kpi" && typeof sourceRef.kpiIndicatorId === "number") {
    const [ind] = await db
      .select({ norms: kpiIndicatorsTable.norms })
      .from(kpiIndicatorsTable)
      .where(and(eq(kpiIndicatorsTable.id, sourceRef.kpiIndicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
    const normRefs = (ind?.norms ?? [])
      .map((n) => (KPI_NORM_LABELS[n] ? { code: KPI_NORM_LABELS[n] } : null))
      .filter((x): x is ActionPlanNormRef => x !== null);
    return {
      relatedIndicatorIds: [sourceRef.kpiIndicatorId],
      ...(normRefs.length > 0 ? { normRefs } : {}),
    };
  }

  if (sourceModule === "nonconformity" && typeof sourceRef.nonconformityId === "number") {
    const [nc] = await db
      .select({ rootCause: nonconformitiesTable.rootCause, riskId: nonconformitiesTable.riskOpportunityItemId })
      .from(nonconformitiesTable)
      .where(and(eq(nonconformitiesTable.id, sourceRef.nonconformityId), eq(nonconformitiesTable.organizationId, orgId)));
    const out: ActionPlanDerivedDefaults = {};
    if (nc?.rootCause && nc.rootCause.trim()) out.rootCause = nc.rootCause;
    if (typeof nc?.riskId === "number") out.relatedRiskIds = [nc.riskId];
    return out;
  }

  if (sourceModule === "risk" && typeof sourceRef.riskOpportunityItemId === "number") {
    return { relatedRiskIds: [sourceRef.riskOpportunityItemId] };
  }

  return {};
}

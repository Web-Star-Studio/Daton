import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  kpiIndicatorsTable,
  nonconformitiesTable,
  regulatoryNormsTable,
  type ActionPlanNormRef,
  type ActionPlanSourceModule,
  type ActionPlanSourceRef,
} from "@workspace/db";

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
    // ind.norms holds catalog ids (regulatory_norms.id) — resolve to labels via
    // the org's catalog. Do NOT reintroduce a hardcoded code→label map: the
    // catalog label is the source of truth (org-defined, e.g. "ISO 9001 · cl. 9.1").
    const normIds = ind?.norms ?? [];
    let normRefs: ActionPlanNormRef[] = [];
    if (normIds.length > 0) {
      const normRows = await db
        .select({ id: regulatoryNormsTable.id, label: regulatoryNormsTable.label })
        .from(regulatoryNormsTable)
        .where(
          and(
            eq(regulatoryNormsTable.organizationId, orgId),
            inArray(regulatoryNormsTable.id, normIds),
          ),
        );
      const labelById = new Map(normRows.map((n) => [n.id, n.label]));
      normRefs = normIds
        .map((id) => {
          const label = labelById.get(id);
          return label ? { code: label } : null;
        })
        .filter((x): x is ActionPlanNormRef => x !== null);
    }
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

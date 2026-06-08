import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  employeeTrainingsTable,
  employeesTable,
  internalAuditFindingsTable,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
  laiaAssessmentsTable,
  nonconformitiesTable,
  roadSafetyFactorsTable,
  strategicPlanRiskOpportunityItemsTable,
  swotFactorsTable,
  type ActionPlanSourceRef,
} from "@workspace/db";

const MONTH_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const SWOT_TYPE_PT: Record<string, string> = {
  strength: "Força",
  weakness: "Fraqueza",
  opportunity: "Oportunidade",
  threat: "Ameaça",
};

function formatNumber(v: number): string {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
}

function truncate(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export type KpiSourceContext = {
  indicatorId: number;
  indicatorName: string;
  year: number;
  month: number;
  value: number | null;
  goal: number | null;
  direction: "up" | "down";
};

export type SourceContext = {
  label: string;
  kpi: KpiSourceContext | null;
};

export type SourceContextInput = {
  id: number;
  sourceModule: string;
  sourceRef: ActionPlanSourceRef;
};

/** Collect the referenced ids of a given module across all refs. */
function idsFor(refs: SourceContextInput[], module: string, key: keyof ActionPlanSourceRef): number[] {
  return refs
    .filter((r) => r.sourceModule === module && typeof r.sourceRef[key] === "number")
    .map((r) => r.sourceRef[key] as number);
}

/**
 * Resolve a server-side display label (and, for KPI, an expanded payload) for
 * each action-plan source reference. The action module is the unified hub, so
 * this resolves every origin. New origins plug in here without touching routes.
 */
export async function resolveSourceContexts(
  orgId: number,
  refs: SourceContextInput[],
): Promise<Map<number, SourceContext>> {
  const out = new Map<number, SourceContext>();
  if (refs.length === 0) return out;

  // ─── KPI ─────────────────────────────────────────────────────────────────
  const kpiMvIds = idsFor(refs, "kpi", "kpiMonthlyValueId");
  type KpiRow = { mvId: number; month: number; value: string | null; indicatorId: number; indicatorName: string; direction: string; year: number; goal: string | null };
  let kpiMap = new Map<number, KpiRow>();
  if (kpiMvIds.length > 0) {
    const rows = await db
      .select({
        mvId: kpiMonthlyValuesTable.id,
        month: kpiMonthlyValuesTable.month,
        value: kpiMonthlyValuesTable.value,
        indicatorId: kpiIndicatorsTable.id,
        indicatorName: kpiIndicatorsTable.name,
        direction: kpiIndicatorsTable.direction,
        year: kpiYearConfigsTable.year,
        goal: kpiYearConfigsTable.goal,
      })
      .from(kpiMonthlyValuesTable)
      .innerJoin(kpiYearConfigsTable, eq(kpiYearConfigsTable.id, kpiMonthlyValuesTable.yearConfigId))
      .innerJoin(kpiIndicatorsTable, eq(kpiIndicatorsTable.id, kpiYearConfigsTable.indicatorId))
      .where(and(eq(kpiMonthlyValuesTable.organizationId, orgId), inArray(kpiMonthlyValuesTable.id, kpiMvIds)));
    kpiMap = new Map(rows.map((r) => [r.mvId, r]));
  }

  // ─── SWOT ────────────────────────────────────────────────────────────────
  const swotFactorIds = idsFor(refs, "swot", "swotFactorId");
  type SwotRow = { id: number; description: string; type: string; performance: number; relevance: number };
  let swotMap = new Map<number, SwotRow>();
  if (swotFactorIds.length > 0) {
    const rows = await db
      .select({ id: swotFactorsTable.id, description: swotFactorsTable.description, type: swotFactorsTable.type, performance: swotFactorsTable.performance, relevance: swotFactorsTable.relevance })
      .from(swotFactorsTable)
      .where(and(eq(swotFactorsTable.organizationId, orgId), inArray(swotFactorsTable.id, swotFactorIds)));
    swotMap = new Map(rows.map((r) => [r.id, r]));
  }

  // ─── Nonconformities ───────────────────────────────────────────────────────
  const ncIds = idsFor(refs, "nonconformity", "nonconformityId");
  const ncMap = new Map<number, { id: number; title: string }>();
  if (ncIds.length > 0) {
    const rows = await db
      .select({ id: nonconformitiesTable.id, title: nonconformitiesTable.title })
      .from(nonconformitiesTable)
      .where(and(eq(nonconformitiesTable.organizationId, orgId), inArray(nonconformitiesTable.id, ncIds)));
    for (const r of rows) ncMap.set(r.id, r);
  }

  // ─── Audit findings ──────────────────────────────────────────────────────
  const findingIds = idsFor(refs, "audit_finding", "auditFindingId");
  const findingMap = new Map<number, { id: number; classification: string; description: string }>();
  if (findingIds.length > 0) {
    const rows = await db
      .select({ id: internalAuditFindingsTable.id, classification: internalAuditFindingsTable.classification, description: internalAuditFindingsTable.description })
      .from(internalAuditFindingsTable)
      .where(and(eq(internalAuditFindingsTable.organizationId, orgId), inArray(internalAuditFindingsTable.id, findingIds)));
    for (const r of rows) findingMap.set(r.id, r);
  }

  // ─── Strategic-plan risks/opportunities ────────────────────────────────────
  const riskIds = idsFor(refs, "risk", "riskOpportunityItemId");
  const riskMap = new Map<number, { id: number; type: string; title: string }>();
  if (riskIds.length > 0) {
    const rows = await db
      .select({ id: strategicPlanRiskOpportunityItemsTable.id, type: strategicPlanRiskOpportunityItemsTable.type, title: strategicPlanRiskOpportunityItemsTable.title })
      .from(strategicPlanRiskOpportunityItemsTable)
      .where(and(eq(strategicPlanRiskOpportunityItemsTable.organizationId, orgId), inArray(strategicPlanRiskOpportunityItemsTable.id, riskIds)));
    for (const r of rows) riskMap.set(r.id, r);
  }

  // ─── Trainings ──────────────────────────────────────────────────────────────
  const trainingIds = idsFor(refs, "training", "trainingId");
  const trainingMap = new Map<number, { id: number; title: string }>();
  if (trainingIds.length > 0) {
    const rows = await db
      .select({ id: employeeTrainingsTable.id, title: employeeTrainingsTable.title })
      .from(employeeTrainingsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, employeeTrainingsTable.employeeId))
      .where(and(eq(employeesTable.organizationId, orgId), inArray(employeeTrainingsTable.id, trainingIds)));
    for (const r of rows) trainingMap.set(r.id, r);
  }

  // ─── LAIA environmental assessments ─────────────────────────────────────────
  const laiaIds = idsFor(refs, "environmental", "laiaAssessmentId");
  const laiaMap = new Map<number, { id: number; aspect: string }>();
  if (laiaIds.length > 0) {
    const rows = await db
      .select({ id: laiaAssessmentsTable.id, aspect: laiaAssessmentsTable.environmentalAspect })
      .from(laiaAssessmentsTable)
      .where(and(eq(laiaAssessmentsTable.organizationId, orgId), inArray(laiaAssessmentsTable.id, laiaIds)));
    for (const r of rows) laiaMap.set(r.id, r);
  }

  // ─── Road safety factors ─────────────────────────────────────────────────────
  const rsIds = idsFor(refs, "road_safety", "roadSafetyFactorId");
  const rsMap = new Map<number, { id: number; code: string; name: string }>();
  if (rsIds.length > 0) {
    const rows = await db
      .select({ id: roadSafetyFactorsTable.id, code: roadSafetyFactorsTable.code, name: roadSafetyFactorsTable.name })
      .from(roadSafetyFactorsTable)
      .where(and(eq(roadSafetyFactorsTable.organizationId, orgId), inArray(roadSafetyFactorsTable.id, rsIds)));
    for (const r of rows) rsMap.set(r.id, r);
  }

  for (const r of refs) {
    out.set(r.id, resolveOne(r, { kpiMap, swotMap, ncMap, findingMap, riskMap, trainingMap, laiaMap, rsMap }));
  }
  return out;
}

type Maps = {
  kpiMap: Map<number, { mvId: number; month: number; value: string | null; indicatorId: number; indicatorName: string; direction: string; year: number; goal: string | null }>;
  swotMap: Map<number, { id: number; description: string; type: string; performance: number; relevance: number }>;
  ncMap: Map<number, { id: number; title: string }>;
  findingMap: Map<number, { id: number; classification: string; description: string }>;
  riskMap: Map<number, { id: number; type: string; title: string }>;
  trainingMap: Map<number, { id: number; title: string }>;
  laiaMap: Map<number, { id: number; aspect: string }>;
  rsMap: Map<number, { id: number; code: string; name: string }>;
};

function resolveOne(r: SourceContextInput, m: Maps): SourceContext {
  const ref = r.sourceRef;
  switch (r.sourceModule) {
    case "kpi": {
      const k = typeof ref.kpiMonthlyValueId === "number" ? m.kpiMap.get(ref.kpiMonthlyValueId) : undefined;
      if (!k) return { label: "KPI · origem removida", kpi: null };
      const value = k.value !== null ? parseFloat(k.value) : null;
      const goal = k.goal !== null ? parseFloat(k.goal) : null;
      const monthLabel = MONTH_PT[k.month - 1] ?? String(k.month);
      const valuePart = value !== null && goal !== null ? ` · ${formatNumber(value)} / meta ${formatNumber(goal)}` : "";
      return {
        label: `KPI · ${k.indicatorName} · ${monthLabel}/${k.year}${valuePart}`,
        kpi: { indicatorId: k.indicatorId, indicatorName: k.indicatorName, year: k.year, month: k.month, value, goal, direction: k.direction as "up" | "down" },
      };
    }
    case "swot": {
      const f = typeof ref.swotFactorId === "number" ? m.swotMap.get(ref.swotFactorId) : undefined;
      if (!f) return { label: "SWOT · origem removida", kpi: null };
      const typeLabel = SWOT_TYPE_PT[f.type] ?? f.type;
      return { label: `SWOT · ${typeLabel} · ${truncate(f.description)} · resultado ${f.performance * f.relevance}`, kpi: null };
    }
    case "nonconformity": {
      const nc = typeof ref.nonconformityId === "number" ? m.ncMap.get(ref.nonconformityId) : undefined;
      return { label: nc ? `Não conformidade · ${truncate(nc.title)}` : "Não conformidade · origem removida", kpi: null };
    }
    case "audit_finding": {
      const fd = typeof ref.auditFindingId === "number" ? m.findingMap.get(ref.auditFindingId) : undefined;
      return { label: fd ? `Auditoria · ${truncate(fd.description)}` : "Auditoria · origem removida", kpi: null };
    }
    case "risk": {
      const rk = typeof ref.riskOpportunityItemId === "number" ? m.riskMap.get(ref.riskOpportunityItemId) : undefined;
      const kind = rk?.type === "opportunity" ? "Oportunidade" : "Risco";
      return { label: rk ? `${kind} · ${truncate(rk.title)}` : "Risco · origem removida", kpi: null };
    }
    case "training": {
      const tr = typeof ref.trainingId === "number" ? m.trainingMap.get(ref.trainingId) : undefined;
      return { label: tr ? `Treinamento · ${truncate(tr.title)}` : "Treinamento · origem removida", kpi: null };
    }
    case "environmental": {
      const la = typeof ref.laiaAssessmentId === "number" ? m.laiaMap.get(ref.laiaAssessmentId) : undefined;
      return { label: la ? `Ambiental · ${truncate(la.aspect)}` : "Ambiental · origem removida", kpi: null };
    }
    case "road_safety": {
      const rs = typeof ref.roadSafetyFactorId === "number" ? m.rsMap.get(ref.roadSafetyFactorId) : undefined;
      return { label: rs ? `Seg. Viária · ${rs.code} ${truncate(rs.name, 40)}` : "Seg. Viária · origem removida", kpi: null };
    }
    case "incident": {
      const desc = typeof ref.incidentDescription === "string" ? ref.incidentDescription.trim() : "";
      return { label: desc ? `Incidente · ${truncate(desc)}` : "Incidente", kpi: null };
    }
    case "manual": {
      const ctx = typeof ref.manualContext === "string" ? ref.manualContext.trim() : "";
      return { label: ctx ? `Manual · ${truncate(ctx)}` : "Ação manual", kpi: null };
    }
    case "rac": {
      const lbl = typeof ref.racLabel === "string" ? ref.racLabel.trim() : "";
      return { label: lbl ? `Análise Crítica · ${truncate(lbl)}` : "Análise Crítica", kpi: null };
    }
    default:
      return { label: r.sourceModule, kpi: null };
  }
}

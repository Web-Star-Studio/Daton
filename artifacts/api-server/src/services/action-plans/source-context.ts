import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
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

/**
 * Resolve a server-side display label and expanded payload for each action-plan
 * source reference. Currently only KPI is supported; new sourceModules plug in
 * here without touching route handlers.
 */
export async function resolveSourceContexts(
  orgId: number,
  refs: SourceContextInput[],
): Promise<Map<number, SourceContext>> {
  const out = new Map<number, SourceContext>();
  if (refs.length === 0) return out;

  const kpiMvIds = refs
    .filter((r) => r.sourceModule === "kpi" && typeof r.sourceRef.kpiMonthlyValueId === "number")
    .map((r) => r.sourceRef.kpiMonthlyValueId as number);

  type KpiRow = {
    mvId: number;
    month: number;
    value: string | null;
    indicatorId: number;
    indicatorName: string;
    direction: string;
    year: number;
    goal: string | null;
  };
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
      .where(and(
        eq(kpiMonthlyValuesTable.organizationId, orgId),
        inArray(kpiMonthlyValuesTable.id, kpiMvIds),
      ));
    kpiMap = new Map(rows.map((r) => [r.mvId, r]));
  }

  // ─── SWOT factors ──────────────────────────────────────────────────────────
  const swotFactorIds = refs
    .filter((r) => r.sourceModule === "swot" && typeof r.sourceRef.swotFactorId === "number")
    .map((r) => r.sourceRef.swotFactorId as number);

  type SwotRow = { id: number; description: string; type: string; performance: number; relevance: number };
  let swotMap = new Map<number, SwotRow>();
  if (swotFactorIds.length > 0) {
    const rows = await db
      .select({
        id: swotFactorsTable.id,
        description: swotFactorsTable.description,
        type: swotFactorsTable.type,
        performance: swotFactorsTable.performance,
        relevance: swotFactorsTable.relevance,
      })
      .from(swotFactorsTable)
      .where(and(
        eq(swotFactorsTable.organizationId, orgId),
        inArray(swotFactorsTable.id, swotFactorIds),
      ));
    swotMap = new Map(rows.map((r) => [r.id, r]));
  }

  for (const r of refs) {
    if (r.sourceModule === "kpi" && typeof r.sourceRef.kpiMonthlyValueId === "number") {
      const k = kpiMap.get(r.sourceRef.kpiMonthlyValueId);
      if (k) {
        const value = k.value !== null ? parseFloat(k.value) : null;
        const goal = k.goal !== null ? parseFloat(k.goal) : null;
        const monthLabel = MONTH_PT[k.month - 1] ?? String(k.month);
        const valuePart = value !== null && goal !== null
          ? ` · ${formatNumber(value)} / meta ${formatNumber(goal)}`
          : "";
        out.set(r.id, {
          label: `KPI · ${k.indicatorName} · ${monthLabel}/${k.year}${valuePart}`,
          kpi: {
            indicatorId: k.indicatorId,
            indicatorName: k.indicatorName,
            year: k.year,
            month: k.month,
            value,
            goal,
            direction: (k.direction as "up" | "down"),
          },
        });
      } else {
        out.set(r.id, { label: "KPI · origem removida", kpi: null });
      }
    } else if (r.sourceModule === "swot" && typeof r.sourceRef.swotFactorId === "number") {
      const f = swotMap.get(r.sourceRef.swotFactorId);
      if (f) {
        const typeLabel = SWOT_TYPE_PT[f.type] ?? f.type;
        const result = f.performance * f.relevance;
        const desc = f.description.length > 60 ? `${f.description.slice(0, 60)}…` : f.description;
        out.set(r.id, { label: `SWOT · ${typeLabel} · ${desc} · resultado ${result}`, kpi: null });
      } else {
        out.set(r.id, { label: "SWOT · origem removida", kpi: null });
      }
    } else {
      out.set(r.id, { label: r.sourceModule, kpi: null });
    }
  }
  return out;
}

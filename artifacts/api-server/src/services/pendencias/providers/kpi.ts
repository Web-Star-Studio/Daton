import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
} from "@workspace/db";
import { firstOverdueMonth } from "../../kpi/feed-status";
import {
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** "YYYY-MM-DD" do último dia do mês (1-indexado), sem drift de fuso. */
function lastDayIso(year: number, month: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const kpiPendenciaProvider: PendenciaProvider = {
  source: "kpi",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const year = ctx.now.getFullYear();

    const indicators = await db
      .select({
        id: kpiIndicatorsTable.id,
        name: kpiIndicatorsTable.name,
        periodicity: kpiIndicatorsTable.periodicity,
        referenceMonth: kpiIndicatorsTable.referenceMonth,
        responsibleUserId: kpiIndicatorsTable.responsibleUserId,
      })
      .from(kpiIndicatorsTable)
      .where(
        and(
          eq(kpiIndicatorsTable.organizationId, ctx.orgId),
          isNotNull(kpiIndicatorsTable.responsibleUserId),
          inArray(kpiIndicatorsTable.responsibleUserId, ctx.responsibleUserIds),
          isNull(kpiIndicatorsTable.rollupStrategy),
        ),
      );
    if (indicators.length === 0) return [];

    const indicatorIds = indicators.map((i) => i.id);
    const configs = await db
      .select({
        id: kpiYearConfigsTable.id,
        indicatorId: kpiYearConfigsTable.indicatorId,
      })
      .from(kpiYearConfigsTable)
      .where(
        and(
          eq(kpiYearConfigsTable.organizationId, ctx.orgId),
          eq(kpiYearConfigsTable.year, year),
          inArray(kpiYearConfigsTable.indicatorId, indicatorIds),
        ),
      );
    if (configs.length === 0) return [];

    const configByIndicator = new Map(configs.map((c) => [c.indicatorId, c.id]));
    const configIds = configs.map((c) => c.id);

    const values = await db
      .select({
        yearConfigId: kpiMonthlyValuesTable.yearConfigId,
        month: kpiMonthlyValuesTable.month,
        value: kpiMonthlyValuesTable.value,
      })
      .from(kpiMonthlyValuesTable)
      .where(inArray(kpiMonthlyValuesTable.yearConfigId, configIds));

    // configId -> month(1..12) -> filled?
    const filledByConfig = new Map<number, (number | null)[]>();
    for (const cid of configIds) filledByConfig.set(cid, Array(12).fill(null));
    for (const v of values) {
      const arr = filledByConfig.get(v.yearConfigId);
      if (arr && v.value !== null) arr[v.month - 1] = 1; // any non-null marks "filled"
    }

    const items: Pendencia[] = [];
    for (const ind of indicators) {
      const configId = configByIndicator.get(ind.id);
      if (configId === undefined || ind.responsibleUserId === null) continue;
      const monthValues = filledByConfig.get(configId) ?? Array(12).fill(null);
      const month = firstOverdueMonth(
        monthValues,
        ind.periodicity,
        ind.referenceMonth ?? null,
        year,
        ctx.now,
      );
      if (month === null) continue;
      items.push({
        id: `kpi:${ind.id}:${year}:${month}`,
        source: "kpi",
        sourceLabel: SOURCE_LABELS.kpi,
        title: ind.name,
        statusLabel: `Lançamento em atraso (${MONTH_LABELS[month - 1]}/${year})`,
        dueDate: lastDayIso(year, month),
        urgency: "overdue",
        responsibleUserId: ind.responsibleUserId,
        link: { route: "/app/kpi/lancamentos", ctaLabel: "Alimentar" },
        meta: { indicatorId: ind.id, year, month },
      });
    }
    return items;
  },
};

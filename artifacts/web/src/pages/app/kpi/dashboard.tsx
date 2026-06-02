import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { YearPicker } from "@/components/ui/year-picker";
import {
  type KpiIndicator,
  useKpiIndicators,
  useKpiObjectives,
  useKpiYearData,
} from "@/lib/kpi-client";
import {
  type FeedFilter,
  type StatusFilter,
} from "./_components/summary-tiles";
import { DashboardSummary } from "./_components/dashboard-summary";
import { getIndicatorStatus, type CardStatus } from "./_components/indicator-card";
import { FilialStatus } from "./_components/filial-status";
import { ObjectiveStatus } from "./_components/objective-status";
import { CategorySemaphore } from "./_components/category-semaphore";
import { CriticalIndicators } from "./_components/critical-indicators";
import { EvolutionPanel } from "./_components/evolution-panel";
import { CORPORATE_UNIT_LABEL } from "@/lib/kpi-constants";

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type KpiDashboardPageProps = {
  /** Shell mode: clicking a critical indicator switches to the Indicadores
   *  tab instead of navigating by route. */
  onSelectIndicator?: (indicatorId: number) => void;
  /** Shell mode: clicking an objective card switches to the Indicadores tab
   *  filtered by that objective (`null` = "sem objetivo") instead of navigating. */
  onSelectObjective?: (objectiveId: number | null) => void;
};

export default function KpiDashboardPage({
  onSelectIndicator,
  onSelectObjective,
}: KpiDashboardPageProps = {}) {
  const { organization } = useAuth();
  const orgId = organization!.id;
  const [, navigate] = useLocation();

  const [year, setYear] = useState(CURRENT_YEAR);
  const [unitFilter, setUnitFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("");

  const { data: indicators = [], isLoading } = useKpiIndicators(orgId);
  const { data: objectives = [] } = useKpiObjectives(orgId);
  const { data: yearRows = [] } = useKpiYearData(
    orgId,
    year,
    unitFilter || undefined,
  );

  const yearIndicatorIds = useMemo(
    () => new Set(yearRows.map((r) => r.indicator.id)),
    [yearRows],
  );
  const indicatorsForYear = useMemo(
    () => indicators.filter((i) => yearIndicatorIds.has(i.id)),
    [indicators, yearIndicatorIds],
  );

  const uniqueUnits = useMemo(
    () =>
      [
        ...new Set(
          indicators.map((i) => i.unit).filter(Boolean) as string[],
        ),
      ].sort(),
    [indicators],
  );

  usePageTitle("Gestão à vista");
  const currentMonth = MONTH_NAMES[new Date().getMonth()];
  usePageSubtitle(
    `${currentMonth} de ${year} · ${uniqueUnits.length || 0} ${uniqueUnits.length === 1 ? "unidade" : "unidades"}`,
  );

  useHeaderActions(
    <Button variant="outline" size="sm" disabled>
      <FileText className="mr-1.5 h-4 w-4" />
      Relatório ISO
    </Button>,
  );

  const indicatorStatusMap = useMemo(() => {
    const map = new Map<number, CardStatus>();
    for (const ind of indicatorsForYear) {
      const row = yearRows.find((r) => r.indicator.id === ind.id);
      map.set(ind.id, getIndicatorStatus(ind, row));
    }
    return map;
  }, [indicatorsForYear, yearRows]);

  const statusCounts = useMemo(() => {
    const counts: Record<CardStatus, number> = {
      green: 0,
      yellow: 0,
      red: 0,
      nodata: 0,
    };
    for (const ind of indicatorsForYear) {
      counts[indicatorStatusMap.get(ind.id) ?? "nodata"] += 1;
    }
    return counts;
  }, [indicatorsForYear, indicatorStatusMap]);

  const feedCounts = useMemo(() => {
    let fed = 0;
    let overdue = 0;
    for (const ind of indicatorsForYear) {
      const row = yearRows.find((r) => r.indicator.id === ind.id);
      if (!row) continue;
      if (row.feedStatus === "overdue") overdue += 1;
      else fed += 1;
    }
    return { fed, overdue };
  }, [indicatorsForYear, yearRows]);

  /** Caption under the "Total" tile — norm coverage, or no-data fallback. */
  const totalCaption = useMemo(() => {
    const norms = new Set<string>();
    for (const ind of indicatorsForYear) {
      for (const n of ind.norms ?? []) norms.add(n);
    }
    if (norms.size > 0) {
      return [...norms]
        .sort()
        .map((n) => `ISO ${n}`)
        .join(" · ");
    }
    return statusCounts.nodata > 0
      ? `${statusCounts.nodata} sem dados no ano`
      : "Sem normas marcadas";
  }, [indicatorsForYear, statusCounts.nodata]);

  /** Tile selection narrows the widgets below; tile counts stay global. */
  const focusedIndicators = useMemo(() => {
    if (!statusFilter && !feedFilter) return indicatorsForYear;
    return indicatorsForYear.filter((ind) => {
      const matchesStatus =
        !statusFilter ||
        (indicatorStatusMap.get(ind.id) ?? "nodata") === statusFilter;
      const matchesFeed =
        !feedFilter ||
        (yearRows.find((r) => r.indicator.id === ind.id)?.feedStatus ?? "fed") ===
          feedFilter;
      return matchesStatus && matchesFeed;
    });
  }, [indicatorsForYear, indicatorStatusMap, statusFilter, feedFilter, yearRows]);

  const handleCriticalSelect = (ind: KpiIndicator) => {
    if (onSelectIndicator) {
      onSelectIndicator(ind.id);
      return;
    }
    navigate(`/kpi/indicadores#ind-card-${ind.id}`);
  };

  const handleObjectiveSelect = (objectiveId: number | null) => {
    if (onSelectObjective) {
      onSelectObjective(objectiveId);
      return;
    }
    const frag = objectiveId == null ? "none" : String(objectiveId);
    navigate(`/kpi/indicadores#obj-${frag}`);
  };

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Gestão à vista
            <span className="text-foreground/60">
              {" — "}
              {unitFilter || CORPORATE_UNIT_LABEL}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {currentMonth} de {year} · {uniqueUnits.length || 0}{" "}
            {uniqueUnits.length === 1 ? "unidade" : "unidades"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <YearPicker value={year} onChange={setYear} />
          <Select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="max-w-xs"
          >
            <option value="">Todas as unidades</option>
            {uniqueUnits.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : indicatorsForYear.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhum indicador configurado para {year}.
        </div>
      ) : (
        <>
          <DashboardSummary
            total={indicatorsForYear.length}
            statusCounts={statusCounts}
            feedCounts={feedCounts}
            totalCaption={totalCaption}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            feedFilter={feedFilter}
            onFeedChange={setFeedFilter}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            <FilialStatus indicators={focusedIndicators} yearRows={yearRows} />
            <CategorySemaphore
              indicators={focusedIndicators}
              yearRows={yearRows}
            />
          </div>

          <ObjectiveStatus
            objectives={objectives}
            indicators={focusedIndicators}
            yearRows={yearRows}
            onSelectObjective={handleObjectiveSelect}
          />

          <CriticalIndicators
            indicators={focusedIndicators}
            yearRows={yearRows}
            onSelect={handleCriticalSelect}
            limit={6}
          />

          <EvolutionPanel
            indicators={focusedIndicators}
            yearRows={yearRows}
            limit={3}
          />
        </>
      )}
    </div>
  );
}

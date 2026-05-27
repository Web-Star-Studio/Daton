/**
 * Sheet (drawer lateral) que abre quando o user clica num Corporativo "Já
 * configurado" na tab Corporativos. Mostra:
 *
 * - Header: nome, medição, status, valor mais recente, meta
 * - Sparkline grande do ano corrente
 * - Lista de filiais que compõem o rollup
 * - Tabela mensal: para cada período (respeitando periodicity), mostra
 *   o valor calculado/manual, quantos filhos reportaram, e a lista
 *   nominal dos que faltam (com link pra editar o filho via deep link
 *   no /app/kpi/lancamentos)
 * - Atalho pra ir pro lançamento direto deste Corporativo
 *
 * Dados: usa `useKpiYearData(orgId, year)` (já tem compose on-read +
 * isComputed/childrenWithData/childrenTotal) + `useListKpiRollupChildren`
 * pra resolver nomes dos filhos quando algum mês está incompleto.
 */
import { Loader2, ExternalLink, AlertTriangle, Wand2 } from "lucide-react";
import {
  getListKpiIndicatorsQueryKey,
  getListKpiRollupChildrenQueryKey,
  getListKpiYearDataQueryKey,
  useListKpiRollupChildren,
  useListKpiYearData,
  useListKpiIndicators,
  type KpiIndicator,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatKpiNumberFixed, getTrafficLight } from "@/lib/kpi-client";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import type { CardStatus } from "./indicator-card";

const MONTH_NAMES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const formatValue = formatKpiNumberFixed;

/**
 * Mapeia periodicity → lista de meses (1-based) que esperamos ter valor.
 * Pra periodicidades não-mensais, retorna só os meses do ciclo.
 */
function expectedMonths(periodicity: string, referenceMonth: number | null): number[] {
  const ref = referenceMonth ?? 1;
  switch (periodicity) {
    case "monthly":
    case "monthly_15d":
    case "monthly_45d":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case "quarterly":
      return [ref, ref + 3, ref + 6, ref + 9].filter((m) => m <= 12);
    case "semiannual":
      return [ref, ref + 6].filter((m) => m <= 12);
    case "annual":
      return [ref];
    default:
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
}

interface CorporateExploreSheetProps {
  open: boolean;
  onClose: () => void;
  orgId: number;
  indicator: KpiIndicator | null;
  year: number;
  /** Abre o dialog de composição manual (uso avançado). */
  onConfigureManually?: (ind: KpiIndicator) => void;
  /**
   * Callback pra trocar pra aba "Lançar" do módulo KPI focando num
   * indicador específico. Como as abas de KPI são state interno em
   * KpiModulePage (não rotas), Link/href não funciona — precisa ser
   * callback propagado top-down.
   */
  onOpenInLancar?: (indicatorId: number) => void;
}

export function CorporateExploreSheet({
  open,
  onClose,
  orgId,
  indicator,
  year,
  onConfigureManually,
  onOpenInLancar,
}: CorporateExploreSheetProps) {
  const { data: yearRows = [], isLoading: yearLoading } = useListKpiYearData(orgId, year, undefined, {
    query: {
      queryKey: getListKpiYearDataQueryKey(orgId, year),
      enabled: open && !!indicator,
    },
  });
  const { data: children = [], isLoading: childrenLoading } = useListKpiRollupChildren(
    orgId,
    indicator?.id ?? 0,
    {
      query: {
        queryKey: getListKpiRollupChildrenQueryKey(orgId, indicator?.id ?? 0),
        enabled: open && !!indicator,
      },
    },
  );
  // Catálogo de indicadores pra resolver nomes dos filhos (yearRows só traz
  // os do ano corrente; um filho pode estar fora se não tem year config).
  const { data: allIndicators = [] } = useListKpiIndicators(orgId, undefined, {
    query: {
      queryKey: getListKpiIndicatorsQueryKey(orgId),
      enabled: open && !!indicator,
    },
  });
  const indById = new Map(allIndicators.map((i) => [i.id, i]));

  if (!indicator) return null;

  const yearRow = yearRows.find((r) => r.indicator.id === indicator.id);
  const goal = yearRow?.yearConfig.goal ?? null;
  const direction = (indicator.direction as "up" | "down") ?? "down";

  // 12-month value array (nulls allowed) — base pro sparkline
  const monthValueArray: (number | null)[] = Array.from({ length: 12 }, (_, i) => {
    const m = yearRow?.monthlyValues.find((v) => v.month === i + 1);
    return m?.value ?? null;
  });

  // Último valor (mais recente)
  let latest: { month: number; value: number } | null = null;
  for (const mv of yearRow?.monthlyValues ?? []) {
    if (mv.value === null || mv.value === undefined) continue;
    if (!latest || mv.month > latest.month) latest = { month: mv.month, value: mv.value };
  }

  const status: CardStatus = !latest
    ? "nodata"
    : getTrafficLight(latest.value, goal, direction) ?? "nodata";

  // Linhas da tabela mensal — uma linha por período esperado pelo periodicity.
  // referenceMonth não está no DTO atualmente; usa 1 como default (jan).
  const periods = expectedMonths(indicator.periodicity, null);

  // "Mês fechado" = mês que já passou e deveria ter dado. Meses futuros
  // (e o atual em curso) NÃO emitem aviso de "faltam filhos" — não faz
  // sentido cobrar dado que ainda não foi gerado.
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const isMonthPast = (m: number): boolean => {
    if (year < currentYear) return true;
    if (year > currentYear) return false;
    return m < currentMonth;
  };
  const isMonthCurrent = (m: number): boolean => year === currentYear && m === currentMonth;

  // Pra cada filho, mapa de month → tem dado?
  // Cruzamos com yearRows pra saber qual filho reportou em qual mês.
  const childReportingByMonth = new Map<number, Set<number>>(); // childId → Set<month>
  for (const child of children) {
    const childYearRow = yearRows.find((r) => r.indicator.id === child.childIndicatorId);
    const reportedMonths = new Set<number>();
    for (const mv of childYearRow?.monthlyValues ?? []) {
      // Considera "reportou" se inputs OU value não-vazio
      const hasInputs = mv.inputs && Object.keys(mv.inputs).length > 0;
      const hasValue = mv.value !== null && mv.value !== undefined;
      if (hasInputs || hasValue) reportedMonths.add(mv.month);
    }
    childReportingByMonth.set(child.childIndicatorId, reportedMonths);
  }

  const isLoading = yearLoading || childrenLoading;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-base">{indicator.name}</SheetTitle>
          {indicator.measurement && (
            <SheetDescription className="text-xs">{indicator.measurement}</SheetDescription>
          )}
        </SheetHeader>

        {/* Header — valor mais recente + meta + status */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-card p-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Último valor
            </span>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                status === "green" && "text-emerald-700 dark:text-emerald-300",
                status === "yellow" && "text-amber-700 dark:text-amber-300",
                status === "red" && "text-red-700 dark:text-red-300",
              )}
            >
              {latest ? formatValue(latest.value, indicator.measureUnit) : "—"}
            </span>
            {latest && (
              <span className="text-[11px] text-muted-foreground">
                {MONTH_NAMES_FULL[latest.month - 1]}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            {/* "Tolerância" (e não "Meta") — convenção do produto, alinhado
                ao IndicatorCard padrão e à preferência expressa do cliente. */}
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tolerância
            </span>
            <span className="text-2xl font-semibold tabular-nums text-foreground/80">
              {goal !== null && goal !== undefined ? formatValue(goal, indicator.measureUnit) : "—"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {direction === "up" ? "↑ Maior é melhor" : "↓ Menor é melhor"}
            </span>
          </div>
        </div>

        {/* Sparkline */}
        {monthValueArray.some((v) => v !== null) && (
          <div className="mt-3 rounded-lg border bg-card p-3">
            <Sparkline values={monthValueArray} goal={goal} status={status} height={60} />
          </div>
        )}

        {/* Composição — quais filhos */}
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-foreground">
            Composição{" "}
            <span className="font-normal text-muted-foreground">
              ({children.length} filia{children.length === 1 ? "l" : "is"})
            </span>
          </h4>
          {childrenLoading ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando filhos...
            </div>
          ) : children.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-3 text-center text-xs text-muted-foreground">
              Nenhum filho configurado. Use "Composição manual" no card pra adicionar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {children.map((c) => {
                const childInd = indById.get(c.childIndicatorId);
                const label = (
                  <>
                    {childInd?.unit ?? "sem filial"}
                    {childInd?.name && (
                      <span className="ml-1 text-muted-foreground">
                        · {childInd.name.slice(0, 30)}{childInd.name.length > 30 ? "…" : ""}
                      </span>
                    )}
                  </>
                );
                // Badge vira botão clicável quando há callback pra abrir o
                // indicador filho — leva pra aba Lançar focando nele.
                if (onOpenInLancar) {
                  return (
                    <button
                      key={c.childIndicatorId}
                      type="button"
                      onClick={() => {
                        onOpenInLancar(c.childIndicatorId);
                        onClose();
                      }}
                      title={childInd?.name ?? "Abrir indicador filho"}
                    >
                      <Badge
                        variant="outline"
                        className="cursor-pointer px-2 py-0.5 text-[11px] font-normal transition hover:border-foreground/40 hover:bg-muted/60"
                      >
                        {label}
                      </Badge>
                    </button>
                  );
                }
                return (
                  <Badge
                    key={c.childIndicatorId}
                    variant="outline"
                    className="px-2 py-0.5 text-[11px] font-normal"
                    title={childInd?.name}
                  >
                    {label}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabela mensal */}
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-foreground">
            Por período ({year})
          </h4>
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-medium text-muted-foreground">Mês</th>
                    <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">Valor</th>
                    <th className="px-2.5 py-1.5 text-center font-medium text-muted-foreground">Origem</th>
                    <th className="px-2.5 py-1.5 text-center font-medium text-muted-foreground">Filiais</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((month) => {
                    const mv = yearRow?.monthlyValues.find((m) => m.month === month);
                    const past = isMonthPast(month);
                    const current = isMonthCurrent(month);
                    const future = !past && !current;
                    const hasValue = mv?.value !== null && mv?.value !== undefined;

                    const childrenTotal = children.length;
                    const childrenWithData = mv?.childrenWithData ?? children.filter((c) =>
                      childReportingByMonth.get(c.childIndicatorId)?.has(month),
                    ).length;
                    const missingChildren = children.filter(
                      (c) => !childReportingByMonth.get(c.childIndicatorId)?.has(month),
                    );

                    // Só consideramos o valor como computed/manual quando há dado.
                    const isComputed = hasValue && mv?.isComputed === true;
                    const isOverridden = hasValue && mv?.isOverridden === true && !isComputed;
                    return (
                      <tr key={month} className={cn("border-t", future && "text-muted-foreground/60")}>
                        <td className="px-2.5 py-1.5">
                          {MONTH_NAMES_FULL[month - 1]}
                          {current && (
                            <span className="ml-1.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                              em curso
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">
                          {formatValue(mv?.value ?? null, indicator.measureUnit)}
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          {isComputed ? (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              auto
                            </span>
                          ) : isOverridden ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
                              manual
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          {childrenTotal === 0 || future ? (
                            // Sem composição OU mês ainda no futuro: célula neutra.
                            // Não faz sentido cobrar dado que ainda não foi gerado.
                            <span className="text-[10px] text-muted-foreground">—</span>
                          ) : missingChildren.length === 0 ? (
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                              {childrenWithData}/{childrenTotal} ✓
                            </span>
                          ) : current ? (
                            // Mês corrente: mostra status sem warning vermelho;
                            // ainda dá pra preencher.
                            <span className="text-[11px] text-muted-foreground">
                              {childrenWithData}/{childrenTotal}
                            </span>
                          ) : (
                            // Mês passado com pendências: warning + tooltip.
                            <span
                              className="flex items-center justify-center gap-1 text-[11px] text-amber-700 dark:text-amber-400"
                              title={`Faltam: ${missingChildren
                                .map((c) => indById.get(c.childIndicatorId)?.unit ?? "?")
                                .join(", ")}`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {childrenWithData}/{childrenTotal}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Legenda da coluna Filiais */}
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Filiais com dado no mês / total da composição. Passe o mouse para ver quem falta.
          </p>
        </div>

        {/* Ações */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          {onOpenInLancar && (
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                onOpenInLancar(indicator.id);
                onClose();
              }}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Abrir nos Lançamentos
            </Button>
          )}
          {onConfigureManually && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onConfigureManually(indicator)}
              title="Editar manualmente quais filhos compõem este Corporativo (uso avançado)"
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              Composição manual
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

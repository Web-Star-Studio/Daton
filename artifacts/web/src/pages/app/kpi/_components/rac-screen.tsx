import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  ACTION_PLAN_STATUS_LABELS,
  actionPlanPriorityColor,
  actionPlanStatusColor,
  formatCalendarDateBR,
  useActionPlans,
  type ActionPlanPriority,
  type ActionPlanStatus,
} from "@/lib/action-plans-client";
import { useKpiIndicators } from "@/lib/kpi-client";

const PILL = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold";

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const STATUSES: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];
const PRIORITIES: ActionPlanPriority[] = ["high", "medium", "low"];

export function RacScreen() {
  const { organization } = useAuth();
  const orgId = organization!.id;
  const [, navigate] = useLocation();

  usePageTitle("Registro de Ação Corretiva");
  usePageSubtitle("RAC — planos de ação vinculados a indicadores fora da meta");

  const [statusFilter, setStatusFilter] = useState<ActionPlanStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<ActionPlanPriority | "">("");

  const { data: plans = [], isLoading } = useActionPlans(orgId, {
    sourceModule: "kpi",
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
  });
  const { data: indicators = [] } = useKpiIndicators(orgId);

  const indicatorMap = useMemo(() => {
    const map = new Map<number, { unit: string | null; norms: string[] }>();
    for (const ind of indicators) {
      map.set(ind.id, { unit: ind.unit ?? null, norms: ind.norms ?? [] });
    }
    return map;
  }, [indicators]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ActionPlanStatus | "")}
          className="w-44"
        >
          <option value="">Todos os status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{ACTION_PLAN_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as ActionPlanPriority | "")}
          className="w-44"
        >
          <option value="">Toda prioridade</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">
          {plans.length} RAC{plans.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : plans.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma RAC registrada. As RACs são abertas a partir de um resultado
            fora da meta na tela de Lançar / planilha de lançamentos.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Norma</TableHead>
                <TableHead>Desvio</TableHead>
                <TableHead>Plano de ação</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => {
                const kpi = plan.sourceContext.kpi;
                const ind = kpi ? indicatorMap.get(kpi.indicatorId) : undefined;
                const deviation =
                  kpi && kpi.value !== null
                    ? `${fmt(kpi.value)}${kpi.goal !== null ? ` · meta ${fmt(kpi.goal)}` : ""}`
                    : "—";
                return (
                  <TableRow
                    key={plan.id}
                    onClick={() => navigate(`/planos-acao/${plan.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="max-w-[220px] font-medium text-foreground">
                      {kpi?.indicatorName ?? plan.sourceContext.label}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ind?.unit ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(ind?.norms ?? []).length > 0 ? (
                          (ind?.norms ?? []).map((n) => (
                            <span
                              key={n}
                              className="rounded border px-1 text-[9px] font-medium leading-4 text-muted-foreground"
                            >
                              {n}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-red-600 dark:text-red-400">
                      {deviation}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-foreground">{plan.title}</span>
                        <span className={cn(PILL, actionPlanPriorityColor(plan.priority))}>
                          {ACTION_PLAN_PRIORITY_LABELS[plan.priority]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {plan.responsibleUserName ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatCalendarDateBR(plan.dueDate) || "—"}
                    </TableCell>
                    <TableCell>
                      <span className={cn(PILL, actionPlanStatusColor(plan.status))}>
                        {ACTION_PLAN_STATUS_LABELS[plan.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

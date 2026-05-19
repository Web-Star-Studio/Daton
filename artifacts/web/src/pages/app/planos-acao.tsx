import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ClipboardList, Filter } from "lucide-react";
import { getListOrgUsersQueryKey, useListOrgUsers } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
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

const STATUS_OPTIONS: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];
const PRIORITY_OPTIONS: ActionPlanPriority[] = ["low", "medium", "high"];

export default function ActionPlansListPage() {
  const { organization } = useAuth();
  const orgId = organization!.id;
  const [, setLocation] = useLocation();

  usePageTitle("Planos de Ação");
  usePageSubtitle("Acompanhe ações corretivas vindas dos diferentes módulos");

  const [statusFilter, setStatusFilter] = useState<"" | ActionPlanStatus>("");
  const [priorityFilter, setPriorityFilter] = useState<"" | ActionPlanPriority>("");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const queryParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (statusFilter) p.status = statusFilter;
    if (priorityFilter) p.priority = priorityFilter;
    if (responsibleFilter) p.responsibleUserId = Number(responsibleFilter);
    if (sourceFilter) p.sourceModule = sourceFilter;
    return Object.keys(p).length > 0 ? p : undefined;
  }, [statusFilter, priorityFilter, responsibleFilter, sourceFilter]);

  const { data: plans = [], isLoading } = useActionPlans(orgId, queryParams);

  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | ActionPlanStatus)}
          className="w-44"
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{ACTION_PLAN_STATUS_LABELS[s]}</option>
          ))}
        </Select>

        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as "" | ActionPlanPriority)}
          className="w-44"
        >
          <option value="">Todas as prioridades</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>
          ))}
        </Select>

        <Select
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
          className="w-52"
        >
          <option value="">Todos os responsáveis</option>
          {orgUsers.map((u) => (
            <option key={u.id} value={String(u.id)}>{u.name}</option>
          ))}
        </Select>

        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="w-40"
        >
          <option value="">Todas as origens</option>
          <option value="kpi">KPI</option>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          {plans.length} plano{plans.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* List */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : plans.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Nenhum plano de ação encontrado.
            </p>
            <p className="text-xs text-muted-foreground">
              Os planos são criados a partir de células vermelhas em Indicadores → Lançamentos.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setLocation(`/planos-acao/${plan.id}`)}
                className="block w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium leading-tight">{plan.title}</p>
                      <Badge variant="secondary" className={cn("text-[10px] px-1.5", actionPlanStatusColor(plan.status))}>
                        {ACTION_PLAN_STATUS_LABELS[plan.status]}
                      </Badge>
                      <Badge variant="secondary" className={cn("text-[10px] px-1.5", actionPlanPriorityColor(plan.priority))}>
                        {ACTION_PLAN_PRIORITY_LABELS[plan.priority]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {plan.sourceContext?.label ?? plan.sourceModule}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {plan.responsibleUserName && <span>👤 {plan.responsibleUserName}</span>}
                      {plan.dueDate && (
                        <span>📅 até {formatCalendarDateBR(plan.dueDate)}</span>
                      )}
                      {plan.evidencesCount > 0 && (
                        <span>📎 {plan.evidencesCount} evidência{plan.evidencesCount !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                    Atualizado {new Date(plan.updatedAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

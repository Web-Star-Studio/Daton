import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, ExternalLink, Plus, Search, ShieldCheck, UserCheck } from "lucide-react";
import { getListOrgUsersQueryKey, useListOrgUsers } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ACTION_PLAN_STATUS_LABELS,
  EFFECTIVENESS_RESULT_LABELS,
  SOURCE_MODULE_LABELS,
  SOURCE_MODULE_OPTIONS,
  actionPlanStatusColor,
  effectivenessResultColor,
  formatCalendarDateBR,
  formatResponsibles,
  gutScoreColor,
  todayCalendarDate,
  useActionPlans,
  useActionPlansSummary,
  useExternalActions,
  type ActionPlanStatus,
} from "@/lib/action-plans-client";

const STATUS_OPTIONS: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];

function StatCard({ label, value, tone, hint, icon: Icon }: { label: string; value: number | string; tone?: string; hint?: string; icon: typeof ClipboardList }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ListaScreen({ orgId, canWrite, onNova }: { orgId: number; canWrite: boolean; onNova: () => void }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | ActionPlanStatus>("");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [mineOnly, setMineOnly] = useState(false);

  const queryParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (statusFilter) p.status = statusFilter;
    // "Atribuídas a mim" forces the responsible to the current user, overriding the dropdown.
    if (mineOnly && user?.id) p.responsibleUserId = user.id;
    else if (responsibleFilter) p.responsibleUserId = Number(responsibleFilter);
    if (sourceFilter) p.sourceModule = sourceFilter;
    return Object.keys(p).length > 0 ? p : undefined;
  }, [statusFilter, responsibleFilter, sourceFilter, mineOnly, user?.id]);

  const { data: plans = [], isLoading } = useActionPlans(orgId, queryParams);
  const { data: summary } = useActionPlansSummary(orgId);
  const { data: externalActions = [] } = useExternalActions(orgId);
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];

  const today = todayCalendarDate();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) =>
      [p.title, p.code, p.responsibleUserName, ...p.coResponsibles.map((r) => r.name), p.sourceContext?.label]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [plans, search]);

  const active = (summary?.byStatus?.open ?? 0) + (summary?.byStatus?.in_progress ?? 0);

  // Governance corrective actions (read-only bridge). They aren't one of the
  // source-filter options, so hide them when a source filter is active.
  const filteredExternal = useMemo(() => {
    // The governance bridge doesn't expose a responsible user id, so it can't be
    // reliably narrowed to the current user — hide it under "Atribuídas a mim".
    if (sourceFilter || mineOnly) return [];
    const q = search.trim().toLowerCase();
    return externalActions.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (!q) return true;
      return [e.title, e.nonconformityTitle, e.responsibleUserName].filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    });
  }, [externalActions, search, sourceFilter, statusFilter, mineOnly]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ativas" value={active} icon={ClipboardList} hint="abertas + em andamento" />
        <StatCard label="Vencidas" value={summary?.overdue ?? 0} tone="text-red-600 dark:text-red-400" icon={AlertTriangle} hint="requer atenção" />
        <StatCard label="Vencendo (7d)" value={summary?.dueSoon ?? 0} tone="text-amber-600 dark:text-amber-400" icon={Clock} hint="próximos 7 dias" />
        <StatCard label="Concluídas no mês" value={summary?.completedThisMonth ?? 0} tone="text-emerald-600 dark:text-emerald-400" icon={CheckCircle2} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ação, código, responsável..." className="h-9 w-72 pl-8" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | ActionPlanStatus)} className="w-44">
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{ACTION_PLAN_STATUS_LABELS[s]}</option>)}
        </Select>
        <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="w-44">
          <option value="">Todas as origens</option>
          {SOURCE_MODULE_OPTIONS.map((s) => <option key={s} value={s}>{SOURCE_MODULE_LABELS[s]}</option>)}
        </Select>
        {user?.id && (
          <Button
            type="button"
            variant={mineOnly ? "default" : "outline"}
            size="sm"
            className="h-9"
            aria-pressed={mineOnly}
            onClick={() => setMineOnly((v) => !v)}
          >
            <UserCheck className="mr-1.5 h-4 w-4" /> Atribuídas a mim
          </Button>
        )}
        <Select
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
          className="w-52"
          disabled={mineOnly}
        >
          <option value="">Todos os responsáveis</option>
          {orgUsers.map((u) => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} açõe{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed p-12 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma ação encontrada.</p>
          <p className="text-xs text-muted-foreground">Crie uma ação manual, ou elas surgem de células vermelhas em Indicadores e de fatores SWOT que exigem ação.</p>
          {canWrite && <Button size="sm" className="mt-1" onClick={onNova}><Plus className="mr-1.5 h-4 w-4" /> Nova ação</Button>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">GUT</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Responsáveis</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Eficácia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const overdue = p.dueDate && p.status !== "completed" && p.status !== "cancelled" && p.dueDate.slice(0, 10) < today;
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setLocation(`/planos-acao/${p.id}`)}>
                    <TableCell>
                      <span className={cn("font-semibold tabular-nums", gutScoreColor(p.gutScore))}>{p.gutScore ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium leading-tight">{p.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.code ? `${p.code} · ` : ""}{p.sourceContext?.label ?? p.sourceModule}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{SOURCE_MODULE_LABELS[p.sourceModule] ?? p.sourceModule}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatResponsibles(p.responsibleUserName, p.coResponsibles) ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-sm tabular-nums whitespace-nowrap", overdue && "text-red-600 dark:text-red-400")}>
                      {p.dueDate ? formatCalendarDateBR(p.dueDate) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("text-[10px]", actionPlanStatusColor(p.status))}>{ACTION_PLAN_STATUS_LABELS[p.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.effectivenessResult ? (
                        <Badge variant="secondary" className={cn("text-[10px]", effectivenessResultColor(p.effectivenessResult))}>
                          {EFFECTIVENESS_RESULT_LABELS[p.effectivenessResult]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Governance corrective actions — read-only bridge */}
      {filteredExternal.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Ações da Governança (corretivas de NC)</h3>
            <span className="text-xs text-muted-foreground">{filteredExternal.length} · somente leitura</span>
          </div>
          <div className="overflow-hidden rounded-lg border">
            {filteredExternal.map((e) => (
              <button
                key={`ca-${e.id}`}
                type="button"
                onClick={() => setLocation(e.link)}
                className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {e.nonconformityTitle ? `NC: ${e.nonconformityTitle}` : "Não conformidade"}
                    {e.responsibleUserName ? ` · ${e.responsibleUserName}` : ""}
                  </div>
                </div>
                {e.dueDate && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatCalendarDateBR(e.dueDate)}</span>}
                <Badge variant="secondary" className={cn("shrink-0 text-[10px]", actionPlanStatusColor(e.status))}>{ACTION_PLAN_STATUS_LABELS[e.status]}</Badge>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

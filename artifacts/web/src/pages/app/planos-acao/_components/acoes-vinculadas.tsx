import { useState } from "react";
import { useLocation } from "wouter";
import { Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  ACTION_PLAN_STATUS_LABELS,
  actionPlanPriorityColor,
  actionPlanStatusColor,
  formatCalendarDateBR,
  useActionsForSource,
  type ActionPlanSourceModule,
} from "@/lib/action-plans-client";

/**
 * Compact affordance showing the action plans spawned from ONE origin entity
 * (a SWOT factor, a nonconformity, a risk item, ...), with a modal to browse and
 * open them. Drop it next to the module's "Criar ação" button so the origin and
 * the central hub stay bidirectionally linked.
 *
 *   <AcoesVinculadas orgId={orgId} sourceModule="swot" refId={factor.id} />
 */
export function AcoesVinculadas({
  orgId,
  sourceModule,
  refId,
  className,
}: {
  orgId: number;
  sourceModule: ActionPlanSourceModule;
  refId: number | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { data: actions, isLoading } = useActionsForSource(orgId, sourceModule, refId);

  if (refId == null) return null;
  if (isLoading) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Carregando ações…</span>;
  }
  if (!actions.length) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Sem ações vinculadas</span>;
  }

  const prefix = location.startsWith("/app/") ? "/app" : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10",
          className,
        )}
        title="Ver ações vinculadas"
      >
        <Link2 className="h-3.5 w-3.5" />
        {actions.length} {actions.length === 1 ? "ação vinculada" : "ações vinculadas"}
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Ações vinculadas"
        description="Planos de ação originados deste item. Clique para abrir na gestão de ações."
        size="lg"
      >
        <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setOpen(false);
                setLocation(`${prefix}/planos-acao/${a.id}`);
              }}
              className="flex w-full items-center gap-3 rounded-lg border bg-card/50 px-3 py-2 text-left hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.code ? `${a.code} · ` : ""}
                  {a.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className={cn("text-[10px]", actionPlanStatusColor(a.status))}>
                    {ACTION_PLAN_STATUS_LABELS[a.status]}
                  </Badge>
                  <Badge variant="secondary" className={cn("text-[10px]", actionPlanPriorityColor(a.priority))}>
                    {ACTION_PLAN_PRIORITY_LABELS[a.priority]}
                  </Badge>
                  {a.dueDate && (
                    <span className="text-[10px] text-muted-foreground">Prazo {formatCalendarDateBR(a.dueDate)}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}

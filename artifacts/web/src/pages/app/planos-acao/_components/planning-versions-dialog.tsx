import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import {
  getGetActionPlanQueryKey,
  getListActionPlanActivityQueryKey,
  useRestoreActionPlanPlanning,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { useActionPlanActivity } from "@/lib/action-plans-client";
import { buildPlanningVersions, diffPlanningFields } from "./planning-versions";

function whenText(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function usePlanningVersionCount(orgId: number, planId: number | null): number {
  const { data: activity = [] } = useActionPlanActivity(orgId, planId);
  return useMemo(() => buildPlanningVersions(activity).length, [activity]);
}

export function PlanningVersionsDialog({
  orgId,
  planId,
  canEdit,
  open,
  onOpenChange,
  onBeforeRestore,
}: {
  orgId: number;
  planId: number;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Flush pending edits before restoring. Resolves `true` when saved (or nothing
  // to save), `false` on failure — see `handleRestore` for why this matters.
  // Optional so other callers keep working unchanged.
  onBeforeRestore?: () => Promise<boolean> | boolean;
}) {
  const queryClient = useQueryClient();
  const { data: activity = [] } = useActionPlanActivity(orgId, planId);
  const versions = useMemo(() => buildPlanningVersions(activity), [activity]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const restore = useRestoreActionPlanPlanning();

  async function handleRestore(activityId: number, createdAt: string) {
    if (!window.confirm(`Restaurar o planejamento como estava em ${whenText(createdAt)}?`)) return;
    // Flush pending edits FIRST. The plan detail refuses to re-hydrate a dirty
    // form, so restoring with unsaved edits would (1) discard the restored block
    // when the refetch arrives and (2) let the queued autosave write the stale
    // draft back over it. Saving first lands the draft as its own version, leaves
    // the form clean, and lets the post-invalidation hydration apply the restore.
    const ok = (await onBeforeRestore?.()) ?? true;
    if (!ok) {
      toast({
        title: "Há alterações pendentes não salvas",
        description:
          "Salve suas edições (ou preencha os campos obrigatórios) antes de restaurar uma versão.",
        variant: "destructive",
      });
      return;
    }
    try {
      await restore.mutateAsync({ orgId, planId, data: { activityId } });
      // Targeted: the plan detail and its activity. A bare invalidateQueries()
      // would drop every cached query in the app.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetActionPlanQueryKey(orgId, planId) }),
        queryClient.invalidateQueries({ queryKey: getListActionPlanActivityQueryKey(orgId, planId) }),
      ]);
      toast({ title: "Planejamento restaurado" });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Não foi possível restaurar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Versões do planejamento"
      description="Cada alteração do 5W2H, da causa raiz e dos 5 porquês fica registrada. Nada é perdido."
      size="lg"
    >
      {versions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Ainda não há versões registradas para este planejamento.
        </p>
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
          {versions.map((version, index) => {
            const changes = diffPlanningFields(version.from, version.to);
            const isCurrent = index === 0;
            return (
              <div key={version.activityId} className="rounded-lg border bg-card/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {version.userName ?? "Usuário removido"}
                      {isCurrent && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          versão atual
                        </Badge>
                      )}
                      {version.restoredFrom && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          restauração
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {whenText(version.createdAt)}
                      {version.saves > 1 && ` · ${version.saves} edições`}
                      {changes.length > 0 && ` · ${changes.map((c) => c.label).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(expanded === version.activityId ? null : version.activityId)}
                    >
                      {expanded === version.activityId ? "Ocultar" : "Ver mudanças"}
                    </Button>
                    {canEdit && !isCurrent && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        isLoading={restore.isPending}
                        onClick={() => void handleRestore(version.activityId, version.createdAt)}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Restaurar
                      </Button>
                    )}
                  </div>
                </div>

                {expanded === version.activityId && (
                  <dl className="mt-3 space-y-2 border-t pt-3">
                    {changes.length === 0 && (
                      <p className="text-xs text-muted-foreground">Sem diferença de conteúdo.</p>
                    )}
                    {changes.map((change) => (
                      <div key={change.label} className="text-xs">
                        <dt className="font-medium text-muted-foreground">{change.label}</dt>
                        <dd className="mt-0.5 grid gap-1 sm:grid-cols-2">
                          <span className="rounded bg-destructive/5 px-2 py-1 text-muted-foreground line-through">
                            {change.before}
                          </span>
                          <span className="rounded bg-primary/5 px-2 py-1">{change.after}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

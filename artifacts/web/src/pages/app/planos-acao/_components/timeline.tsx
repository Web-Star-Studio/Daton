import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_PLAN_STAGES,
  ACTION_PLAN_STAGE_ANCHORS,
  actionPlanStageLevel,
  type ActionPlan,
} from "@/lib/action-plans-client";

/** Scroll to the section a stage maps to and briefly highlight it. */
function goToStage(i: number) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(ACTION_PLAN_STAGE_ANCHORS[i]);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  const ring = ["ring-2", "ring-primary/50", "ring-offset-2", "ring-offset-background"];
  el.classList.add(...ring);
  window.setTimeout(() => el.classList.remove(...ring), 1400);
}

/**
 * Workflow stepper: Identificação → … → Encerramento. The reached stage is
 * derived from the plan state (status + evidence + effectiveness), never stored.
 * Each circle and label is clickable and scrolls to that stage's section.
 */
export function ActionPlanTimeline({ plan }: { plan: ActionPlan }) {
  const level = actionPlanStageLevel(plan);
  const cancelled = plan.status === "cancelled";

  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {ACTION_PLAN_STAGES.map((label, i) => {
        const stage = i + 1;
        const done = stage < level || (stage === level && level === 6);
        const active = stage === level && level !== 6 && !cancelled;
        const isLast = i === ACTION_PLAN_STAGES.length - 1;
        return (
          <div key={label} className="flex min-w-[64px] flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className={cn("h-px flex-1", i === 0 ? "opacity-0" : done || active ? "bg-emerald-400" : "bg-border")} />
              <button
                type="button"
                onClick={() => goToStage(i)}
                title={`Ir para ${label}`}
                aria-label={`Ir para a etapa ${label}`}
                className={cn(
                  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border p-0 text-[11px] font-medium transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  done && "border-emerald-500/60 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                  active && "border-blue-500 bg-blue-100 text-blue-700 ring-2 ring-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
                  !done && !active && "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : stage}
              </button>
              <span className={cn("h-px flex-1", isLast ? "opacity-0" : stage < level ? "bg-emerald-400" : "bg-border")} />
            </div>
            <button
              type="button"
              onClick={() => goToStage(i)}
              title={`Ir para ${label}`}
              className={cn(
                "mt-1.5 cursor-pointer rounded text-center text-[10px] leading-tight transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

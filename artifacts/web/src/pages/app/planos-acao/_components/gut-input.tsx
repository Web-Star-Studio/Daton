import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  GUT_RELEVANCE_LABELS,
  gutRelevance,
  gutScore,
  gutScoreColor,
} from "@/lib/action-plans-client";

export type GutValue = {
  gravity: number | null;
  urgency: number | null;
  tendency: number | null;
};

const AXES: { key: keyof GutValue; label: string; hint: string }[] = [
  { key: "gravity", label: "Gravidade", hint: "impacto se nada for feito" },
  { key: "urgency", label: "Urgência", hint: "pressão do tempo" },
  { key: "tendency", label: "Tendência", hint: "piora se não agir" },
];

/** GUT prioritization input — three 1–5 axes with a live score + relevance band. */
export function GutInput({
  value,
  onChange,
  readOnly = false,
}: {
  value: GutValue;
  onChange: (next: GutValue) => void;
  readOnly?: boolean;
}) {
  const score = gutScore(value.gravity, value.urgency, value.tendency);

  return (
    <div className="space-y-2.5">
      {AXES.map((axis) => {
        const current = value[axis.key];
        return (
          <div key={axis.key} className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <p className="text-xs font-medium">{axis.label}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">{axis.hint}</p>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const on = current === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange({ ...value, [axis.key]: on ? null : n })}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                      on
                        ? "border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                        : "border-border bg-background text-muted-foreground hover:border-blue-300 hover:text-foreground",
                      readOnly && "cursor-default opacity-70 hover:border-border hover:text-muted-foreground",
                    )}
                    aria-label={`${axis.label} ${n}`}
                    aria-pressed={on}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 border-t pt-2.5">
        <span className="text-xs text-muted-foreground">Prioridade GUT</span>
        <span className={cn("text-lg font-semibold tabular-nums", gutScoreColor(score))}>{score ?? "—"}</span>
        {score !== null && (
          <Badge variant="secondary" className={cn("text-[10px]", gutScoreColor(score))}>
            {GUT_RELEVANCE_LABELS[gutRelevance(score)]}
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">G × U × T (1–125)</span>
      </div>
    </div>
  );
}

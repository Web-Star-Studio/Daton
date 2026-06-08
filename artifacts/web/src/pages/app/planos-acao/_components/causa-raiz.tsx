import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MAX_WHYS = 5;

/**
 * Root-cause analysis: chained "Por quê?" (5 whys) plus a consolidated root cause.
 * Whys are stored as a string array; empty entries are dropped on save by the caller.
 */
export function CausaRaiz({
  rootCause,
  whys,
  onChange,
  readOnly = false,
}: {
  rootCause: string;
  whys: string[];
  onChange: (next: { rootCause: string; whys: string[] }) => void;
  readOnly?: boolean;
}) {
  const list = whys.length > 0 ? whys : [""];

  const setWhy = (i: number, text: string) => {
    const next = [...list];
    next[i] = text;
    onChange({ rootCause, whys: next });
  };
  const addWhy = () => onChange({ rootCause, whys: [...list, ""] });
  const removeWhy = (i: number) => onChange({ rootCause, whys: list.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {list.map((why, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[11px] font-medium text-muted-foreground">
              {i + 1}º porquê
            </span>
            <Input
              value={why}
              onChange={(e) => setWhy(i, e.target.value)}
              placeholder={i === 0 ? "Por que o problema ocorreu?" : "Por quê?"}
              readOnly={readOnly}
            />
            {!readOnly && list.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => removeWhy(i)}
                aria-label={`Remover ${i + 1}º porquê`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {!readOnly && list.length < MAX_WHYS && (
          <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={addWhy}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Adicionar porquê
          </Button>
        )}
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Causa raiz identificada
        </label>
        <Textarea
          value={rootCause}
          onChange={(e) => onChange({ rootCause: e.target.value, whys: list })}
          placeholder="Conclusão da análise — a causa fundamental a ser tratada."
          rows={2}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

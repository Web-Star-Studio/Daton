import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutoGrowTextarea } from "../../auto-grow-textarea";
import { MAX_WHYS } from "../types";

export function CadeiaPorques({
  whys,
  onChange,
  readOnly = false,
  max = MAX_WHYS,
}: {
  whys: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  max?: number;
}) {
  const list = whys.length > 0 ? whys : [""];
  const setWhy = (i: number, text: string) =>
    onChange(list.map((w, idx) => (idx === i ? text : w)));

  return (
    <div className="space-y-2">
      {list.map((why, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="w-16 shrink-0 pt-2 text-[11px] font-medium text-muted-foreground">
            {i + 1}º porquê
          </span>
          <AutoGrowTextarea
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
              className="mt-1 h-7 w-7 shrink-0 text-muted-foreground"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              aria-label={`Remover ${i + 1}º porquê`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && list.length < max && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => onChange([...list, ""])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar porquê
        </Button>
      )}
    </div>
  );
}

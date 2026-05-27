import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  useSuggestLaiaLegislation,
  type LaiaLegislationSuggestion,
} from "@/lib/environmental-laia-client";

interface LegislationSuggesterButtonProps {
  orgId?: number;
  context: {
    sectorName?: string | null;
    activityOperation?: string | null;
    environmentalAspect: string;
    environmentalImpact: string;
    controlTypes?: string[] | null;
    existingControls?: string | null;
    lifecycleStages?: string[] | null;
    branchState?: string | null;
    branchCity?: string | null;
  };
  onApply?: (suggestion: LaiaLegislationSuggestion) => void;
}

export function LegislationSuggesterButton({
  orgId,
  context,
  onApply,
}: LegislationSuggesterButtonProps) {
  const [suggestions, setSuggestions] = useState<LaiaLegislationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const mutation = useSuggestLaiaLegislation(orgId);

  const canSuggest =
    !!orgId &&
    !!context.environmentalAspect.trim() &&
    !!context.environmentalImpact.trim();

  const run = async () => {
    if (!canSuggest) {
      toast({
        title: "Preencha o aspecto e impacto antes",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await mutation.mutateAsync(context);
      setSuggestions(result.suggestions);
      setOpen(true);
      if (result.suggestions.length === 0) {
        toast({
          title: "Sem sugestões",
          description: "A IA não encontrou requisitos legais aplicáveis.",
        });
      }
    } catch (error) {
      toast({
        title: "Falha ao sugerir",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={mutation.isPending || !canSuggest}
      >
        {mutation.isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        )}
        Sugerir leis (IA)
      </Button>
      {open && suggestions.length > 0 && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-medium">
              {suggestions.length} sugestão(ões) — clique para aplicar
            </p>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:underline"
              onClick={() => setOpen(false)}
            >
              fechar
            </button>
          </div>
          <ul className="space-y-1.5">
            {suggestions.map((s, idx) => (
              <li key={idx} className="rounded border bg-background p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold">{s.reference}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.summary}
                    </p>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[10px] text-primary hover:underline"
                      >
                        Abrir referência ↗
                      </a>
                    )}
                  </div>
                  {onApply && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onApply(s)}
                    >
                      Aplicar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

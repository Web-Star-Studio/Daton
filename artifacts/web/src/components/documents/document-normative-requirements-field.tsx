import { useMemo, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { useSuggestDocumentNormativeRequirements } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type DocumentNormativeRequirementsFieldProps = {
  orgId?: number;
  title: string;
  type: string;
  referenceIds: number[];
  value: string[];
  onChange: (nextValue: string[]) => void;
  disabled?: boolean;
};

function normalizeNormativeRequirements(requirements: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const requirement of requirements) {
    const value = requirement.trim();
    if (!value) {
      continue;
    }

    const key = value.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

export function DocumentNormativeRequirementsField({
  orgId,
  title,
  type,
  referenceIds,
  value,
  onChange,
  disabled = false,
}: DocumentNormativeRequirementsFieldProps) {
  const [manualValue, setManualValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestMutation = useSuggestDocumentNormativeRequirements();

  const visibleSuggestions = useMemo(() => {
    const selected = new Set(
      value.map((item) => item.toLocaleLowerCase("pt-BR")),
    );
    return suggestions.filter(
      (item) => !selected.has(item.toLocaleLowerCase("pt-BR")),
    );
  }, [suggestions, value]);

  const applyValue = (items: string[]) => {
    onChange(normalizeNormativeRequirements(items));
  };

  const handleAddRequirement = (requirement: string) => {
    const normalized = requirement.trim();
    if (!normalized) {
      return;
    }

    applyValue([...value, normalized]);
    setManualValue("");
  };

  const handleRemoveRequirement = (requirement: string) => {
    const target = requirement.toLocaleLowerCase("pt-BR");
    onChange(
      value.filter((item) => item.toLocaleLowerCase("pt-BR") !== target),
    );
  };

  const handleSuggest = async () => {
    if (!orgId) {
      return;
    }
    if (!title.trim()) {
      toast({
        title: "Informe o título do documento",
        description:
          "O título ajuda a IA a sugerir requisitos normativos mais precisos.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await suggestMutation.mutateAsync({
        orgId,
        data: {
          title: title.trim(),
          type,
          referenceIds,
          currentRequirements: value,
        },
      });

      setSuggestions(response.suggestions ?? []);

      if ((response.suggestions ?? []).length === 0) {
        toast({
          title: "Nenhuma sugestão encontrada",
          description:
            "Tente ajustar o título, o tipo ou as referências do documento.",
        });
      }
    } catch (error) {
      toast({
        title: "Falha ao sugerir requisitos normativos",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>Requisitos normativos</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe manualmente os requisitos aplicáveis ou use a sugestão por
            IA.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleSuggest()}
          isLoading={suggestMutation.isPending}
          disabled={disabled || !orgId}
        >
          {!suggestMutation.isPending && (
            <Sparkles className="mr-2 h-3.5 w-3.5" />
          )}
          Sugerir por IA
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAddRequirement(manualValue);
            }
          }}
          placeholder="Ex.: ISO 9001:2015 7.5"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleAddRequirement(manualValue)}
          disabled={disabled || manualValue.trim().length === 0}
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((requirement) => (
            <Badge
              key={requirement}
              variant="secondary"
              className="gap-1.5 px-3 py-1 text-xs"
            >
              <span>{requirement}</span>
              {!disabled ? (
                <button
                  type="button"
                  className="rounded-full p-0.5 transition-colors hover:bg-black/5"
                  onClick={() => handleRemoveRequirement(requirement)}
                  aria-label={`Remover ${requirement}`}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum requisito normativo selecionado.
        </p>
      )}

      {visibleSuggestions.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sugestões
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                onClick={() => handleAddRequirement(suggestion)}
                disabled={disabled}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

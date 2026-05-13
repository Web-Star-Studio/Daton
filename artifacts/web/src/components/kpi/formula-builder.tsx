import { useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormulaPreview } from "@/components/kpi/formula-preview";
import { cn } from "@/lib/utils";
import {
  evaluateFormula,
  parseNaturalFormula,
  validateFormula,
} from "@/lib/formula-evaluator";

interface FormulaBuilderProps {
  /** Natural-language formula text — e.g. "(consumo de água / área plantada) * 100" */
  value: string;
  onChange: (next: string) => void;
}

const TEMPLATES = [
  {
    id: "percent",
    label: "% Percentual",
    hint: "A / B × 100",
    snippet: "(numerador / denominador) * 100",
  },
  {
    id: "ratio",
    label: "Razão",
    hint: "A / B",
    snippet: "numerador / denominador",
  },
  {
    id: "subtract_percent",
    label: "100 − Percentual",
    hint: "100 − (A/B × 100)",
    snippet: "100 - (numerador / denominador) * 100",
  },
  {
    id: "single",
    label: "Valor único",
    hint: "Só A",
    snippet: "valor",
  },
];

const OPERATORS = ["(", ")", "+", "-", "*", "/"] as const;

export function FormulaBuilder({ value, onChange }: FormulaBuilderProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [previewInputs, setPreviewInputs] = useState<Record<string, string>>({});

  const parsed = useMemo(() => parseNaturalFormula(value), [value]);
  const validation = useMemo(
    () => validateFormula(parsed.expression, parsed.variables),
    [parsed],
  );

  const previewResult = useMemo(() => {
    if (!validation.ok) return null;
    const inputs: Record<string, number | null> = {};
    for (const v of parsed.variables) {
      const raw = previewInputs[v.key]?.trim().replace(",", ".");
      if (!raw) inputs[v.key] = null;
      else {
        const n = Number(raw);
        inputs[v.key] = Number.isNaN(n) ? null : n;
      }
    }
    return evaluateFormula(parsed.expression, inputs);
  }, [parsed, previewInputs, validation]);

  function insertAtCursor(snippet: string, selectFirst?: { start: number; end: number }) {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      if (selectFirst) {
        el.setSelectionRange(start + selectFirst.start, start + selectFirst.end);
      } else {
        const pos = start + snippet.length;
        el.setSelectionRange(pos, pos);
      }
    });
  }

  function applyTemplate(snippet: string) {
    // Find first placeholder word to select it
    const firstWord = snippet.match(/[a-záéíóúâêôãõç]+/i);
    if (firstWord && typeof firstWord.index === "number") {
      insertAtCursor(snippet, {
        start: firstWord.index,
        end: firstWord.index + firstWord[0].length,
      });
    } else {
      insertAtCursor(snippet);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex: (consumo de água / área plantada) * 100"
          rows={2}
          className="font-mono text-sm"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Digite a fórmula como você fala. Cada termo entre operadores vira uma variável automaticamente.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-muted-foreground self-center mr-1">Modelos:</span>
        {TEMPLATES.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => applyTemplate(t.snippet)}
            title={t.hint}
          >
            <Sparkles className="h-3 w-3" />
            {t.label}
          </Button>
        ))}
        <span className="w-px bg-border mx-1" />
        {OPERATORS.map((op) => (
          <Button
            key={op}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-7 font-mono text-xs p-0"
            onClick={() => insertAtCursor(op)}
          >
            {op}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 font-mono text-xs"
          onClick={() => insertAtCursor("100")}
        >
          100
        </Button>
      </div>

      {!validation.ok && value.trim() && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {validation.error}
        </p>
      )}

      {parsed.expression && validation.ok && (
        <div className="rounded-md border border-border bg-card p-4">
          <Label className="text-xs font-semibold uppercase text-muted-foreground mb-3 block">
            Como será calculado
          </Label>
          <FormulaPreview expression={parsed.expression} variables={parsed.variables} />
        </div>
      )}

      {parsed.variables.length > 0 && validation.ok && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
              Testar com valores
            </Label>
            <div className="space-y-1.5">
              {parsed.variables.map((v) => (
                <div key={v.key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-1/2 truncate">{v.label}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={previewInputs[v.key] ?? ""}
                    onChange={(e) => setPreviewInputs((p) => ({ ...p, [v.key]: e.target.value }))}
                    placeholder="0"
                    className="flex-1 h-7 text-sm"
                  />
                </div>
              ))}
              <div className={cn(
                "mt-2 rounded-md border px-3 py-1.5 text-sm",
                previewResult !== null
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-border bg-muted/40",
              )}>
                <span className="text-xs text-muted-foreground">Resultado:</span>{" "}
                <span className="font-mono font-semibold">
                  {previewResult !== null
                    ? previewResult.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

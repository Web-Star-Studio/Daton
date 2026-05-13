import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FormulaPreview } from "@/components/kpi/formula-preview";
import { cn } from "@/lib/utils";
import { evaluateFormula, type FormulaVariable } from "@/lib/formula-evaluator";

interface FormulaCellEditorProps {
  indicatorName: string;
  variables: FormulaVariable[];
  expression: string;
  measurement: string;
  value: number | null;
  inputs: Record<string, number | null>;
  triggerClassName?: string;
  formatNumber: (v: number | null | undefined) => string;
  onSave: (next: { value: number | null; inputs: Record<string, number | null> }) => Promise<void> | void;
  children?: React.ReactNode;
}

export function FormulaCellEditor({
  indicatorName,
  variables,
  expression,
  measurement,
  value,
  inputs,
  triggerClassName,
  formatNumber,
  onSave,
  children,
}: FormulaCellEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const v of variables) {
      const stored = inputs[v.key];
      next[v.key] = stored == null ? "" : String(stored).replace(".", ",");
    }
    setDraft(next);
  }, [open, variables, inputs]);

  const parsedInputs = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const v of variables) {
      const raw = draft[v.key]?.trim().replace(",", ".");
      if (!raw) out[v.key] = null;
      else {
        const n = Number(raw);
        out[v.key] = Number.isNaN(n) ? null : n;
      }
    }
    return out;
  }, [draft, variables]);

  const previewResult = useMemo(
    () => evaluateFormula(expression, parsedInputs),
    [expression, parsedInputs],
  );

  const allEmpty = variables.every((v) => !draft[v.key]?.trim());

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        value: allEmpty ? null : previewResult,
        inputs: allEmpty ? {} : parsedInputs,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onSave({ value: null, inputs: {} });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full h-full text-right cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          {children ?? <span>{value != null ? formatNumber(value) : ""}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={16}
        className="w-80"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold leading-tight">{indicatorName}</p>
            {measurement && (
              <p className="text-xs text-muted-foreground mt-0.5">{measurement}</p>
            )}
          </div>

          {variables.length > 0 && expression && (
            <div className="rounded-md border border-border bg-muted/30 p-2.5">
              <FormulaPreview
                expression={expression}
                variables={variables}
                size="sm"
              />
            </div>
          )}

          <div className="space-y-2">
            {variables.map((v) => (
              <div key={v.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{v.label || v.key}</label>
                <Input
                  autoFocus={variables[0]?.key === v.key}
                  type="text"
                  inputMode="decimal"
                  value={draft[v.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [v.key]: e.target.value }))}
                  placeholder="0"
                  className="h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSave();
                    }
                    if (e.key === "Escape") setOpen(false);
                  }}
                />
              </div>
            ))}
          </div>

          <div className={cn(
            "rounded-md border px-3 py-2",
            previewResult !== null
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
              : "border-border bg-muted/40",
          )}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Resultado</span>
              <span className="font-mono text-base font-semibold">
                {previewResult !== null ? formatNumber(previewResult) : "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={saving || (value === null && Object.keys(inputs).length === 0)}
              className="text-xs"
            >
              Limpar
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

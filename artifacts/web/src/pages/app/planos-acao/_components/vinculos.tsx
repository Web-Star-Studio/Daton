import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionPlanNormRef } from "@/lib/action-plans-client";

/** Official UN SDG (ODS) palette, 1–17. */
export const ODS_COLORS: Record<number, string> = {
  1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21", 6: "#26BDE2",
  7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367", 11: "#FD9D24", 12: "#BF8B2E",
  13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B", 16: "#00689D", 17: "#19486A",
};
const ODS_NUMBERS = Object.keys(ODS_COLORS).map(Number);

export type VinculosValue = {
  odsNumbers: number[];
  normRefs: ActionPlanNormRef[];
};

export function Vinculos({
  value,
  onChange,
  readOnly = false,
}: {
  value: VinculosValue;
  onChange: (next: VinculosValue) => void;
  readOnly?: boolean;
}) {
  const [normCode, setNormCode] = useState("");
  const [normClause, setNormClause] = useState("");

  const ods = value.odsNumbers ?? [];
  const norms = value.normRefs ?? [];

  const toggleOds = (n: number) =>
    onChange({ ...value, odsNumbers: ods.includes(n) ? ods.filter((x) => x !== n) : [...ods, n].sort((a, b) => a - b) });

  const addNorm = () => {
    const code = normCode.trim();
    if (!code) return;
    onChange({ ...value, normRefs: [...norms, { code, ...(normClause.trim() ? { clause: normClause.trim() } : {}) }] });
    setNormCode("");
    setNormClause("");
  };
  const removeNorm = (i: number) => onChange({ ...value, normRefs: norms.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      {/* Normas */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Normas atendidas</p>
        {norms.length === 0 && readOnly && <p className="text-xs text-muted-foreground">Nenhuma norma vinculada.</p>}
        <div className="flex flex-wrap gap-1.5">
          {norms.map((n, i) => (
            <span
              key={`${n.code}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
            >
              {n.code}{n.clause ? `:${n.clause}` : ""}
              {!readOnly && (
                <button type="button" onClick={() => removeNorm(i)} aria-label={`Remover ${n.code}`} className="opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {!readOnly && (
          <div className="mt-2 flex items-center gap-2">
            <Input value={normCode} onChange={(e) => setNormCode(e.target.value)} placeholder="Norma (ex.: ISO 45001)" className="h-8 max-w-[200px]" />
            <Input value={normClause} onChange={(e) => setNormClause(e.target.value)} placeholder="Cláusula (ex.: 8.1)" className="h-8 max-w-[140px]" />
            <Button type="button" variant="outline" size="sm" onClick={addNorm} disabled={!normCode.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* ODS */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ODS vinculados</p>
        <div className="flex flex-wrap gap-1.5">
          {ODS_NUMBERS.map((n) => {
            const on = ods.includes(n);
            return (
              <button
                key={n}
                type="button"
                disabled={readOnly}
                onClick={() => toggleOds(n)}
                title={`ODS ${n}`}
                aria-pressed={on}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold transition-all",
                  on ? "text-white shadow-sm" : "border border-border bg-muted text-muted-foreground hover:text-foreground",
                  readOnly && "cursor-default",
                )}
                style={on ? { backgroundColor: ODS_COLORS[n] } : undefined}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

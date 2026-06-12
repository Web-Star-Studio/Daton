import { ArrowRight, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EFFECTIVENESS_METHOD_LABELS,
  EFFECTIVENESS_RESULT_LABELS,
  effectivenessResultColor,
  type ActionPlanEffectivenessMethod,
  type ActionPlanEffectivenessResult,
} from "@/lib/action-plans-client";

export type EficaciaValue = {
  method: ActionPlanEffectivenessMethod | "";
  dueDate: string;
  evaluatorUserId: string;
  before: string;
  after: string;
  result: ActionPlanEffectivenessResult | "";
  comment: string;
};

const METHOD_OPTIONS = Object.entries(EFFECTIVENESS_METHOD_LABELS) as [ActionPlanEffectivenessMethod, string][];

function num(s: string): number | null {
  const v = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** Effectiveness verification block: method, deadline, evaluator, before×after,
 * verdict + comment. The before→after delta is a deterministic hint (no IA). */
export function EficaciaPanel({
  value,
  onChange,
  orgUsers,
  readOnly = false,
  canEvaluate = true,
}: {
  value: EficaciaValue;
  onChange: (next: EficaciaValue) => void;
  orgUsers: { id: number; name: string }[];
  readOnly?: boolean;
  /** Only the designated evaluator (or an admin) may issue the verdict. */
  canEvaluate?: boolean;
}) {
  const set = <K extends keyof EficaciaValue>(key: K, v: EficaciaValue[K]) => onChange({ ...value, [key]: v });

  const before = num(value.before);
  const after = num(value.after);
  const delta = before !== null && after !== null ? after - before : null;
  const improved = delta !== null && delta > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Método de verificação</Label>
          <Select
            value={value.method}
            onChange={(e) => set("method", e.target.value as ActionPlanEffectivenessMethod | "")}
            disabled={readOnly}
          >
            <option value="">Selecione…</option>
            {METHOD_OPTIONS.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Prazo de verificação</Label>
          <Input type="date" value={value.dueDate} onChange={(e) => set("dueDate", e.target.value)} readOnly={readOnly} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Avaliador</Label>
          <SearchableSelect
            value={value.evaluatorUserId}
            onChange={(v) => set("evaluatorUserId", v)}
            options={orgUsers.map((u) => ({ value: String(u.id), label: u.name }))}
            placeholder="Quem confirma a eficácia"
            searchPlaceholder="Buscar usuário..."
            emptyMessage="Nenhum usuário encontrado"
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Before × After */}
      <div>
        <Label className="mb-1.5 block">Comparativo antes × depois</Label>
        <div className="flex items-end gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground">Antes</span>
            <Input value={value.before} onChange={(e) => set("before", e.target.value)} placeholder="ex.: 73%" readOnly={readOnly} />
          </div>
          <ArrowRight className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <span className="text-[10px] text-muted-foreground">Depois</span>
            <Input value={value.after} onChange={(e) => set("after", e.target.value)} placeholder="ex.: 98%" readOnly={readOnly} />
          </div>
          {delta !== null && (
            <Badge variant="secondary" className={cn("mb-2 shrink-0", improved ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300")}>
              {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta).toLocaleString("pt-BR")}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Parecer / observações</Label>
        <Textarea
          value={value.comment}
          onChange={(e) => set("comment", e.target.value)}
          placeholder="Resumo da verificação: indicador atingiu a meta? houve reincidência? risco residual?"
          rows={3}
          readOnly={readOnly}
        />
      </div>

      {/* Verdict */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Veredito:</span>
        {value.result ? (
          <Badge variant="secondary" className={effectivenessResultColor(value.result)}>
            {EFFECTIVENESS_RESULT_LABELS[value.result]}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">Não avaliado</Badge>
        )}
        {!readOnly && canEvaluate && (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant={value.result === "effective" ? "default" : "outline"}
              size="sm"
              onClick={() => set("result", value.result === "effective" ? "" : "effective")}
            >
              <Check className="mr-1 h-4 w-4" /> Eficaz
            </Button>
            <Button
              type="button"
              variant={value.result === "ineffective" ? "destructive" : "outline"}
              size="sm"
              onClick={() => set("result", value.result === "ineffective" ? "" : "ineffective")}
            >
              <X className="mr-1 h-4 w-4" /> Não eficaz
            </Button>
          </div>
        )}
        {!readOnly && !canEvaluate && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            Somente o avaliador designado pode emitir o veredito.
          </span>
        )}
      </div>
    </div>
  );
}

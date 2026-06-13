import type { ActionPlan5W2H } from "@/lib/action-plans-client";
import { AutoGrowTextarea } from "./auto-grow-textarea";

type FieldKey = keyof ActionPlan5W2H;

const FIELDS: { key: FieldKey; label: string; placeholder: string }[] = [
  { key: "what", label: "O quê", placeholder: "O que será feito (a ação em si)" },
  { key: "why", label: "Por quê", placeholder: "Justificativa / objetivo" },
  { key: "where", label: "Onde", placeholder: "Local / processo / unidade" },
  { key: "who", label: "Quem", placeholder: "Responsável pela execução" },
  { key: "when", label: "Quando", placeholder: "Prazo / janela de execução" },
  { key: "how", label: "Como", placeholder: "Método / passos" },
  { key: "howMuch", label: "Quanto", placeholder: "Custo estimado (ex.: R$ 2.400,00)" },
];

/**
 * Structured 5W2H editor. Empty by default so users only fill what's relevant.
 * Single column: every field spans the full width like the "Como" quadrant, so
 * answers read across the full horizontal space instead of being cramped into a
 * narrow half-column where the text truncated or stacked into many short lines.
 */
export function Plano5W2H({
  value,
  onChange,
  readOnly = false,
}: {
  value: ActionPlan5W2H | null;
  onChange: (next: ActionPlan5W2H) => void;
  readOnly?: boolean;
}) {
  const v = value ?? {};
  const set = (key: FieldKey, text: string) => onChange({ ...v, [key]: text });

  return (
    <div className="flex flex-col gap-3">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {f.label}
          </label>
          <AutoGrowTextarea
            value={v[f.key] ?? ""}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  );
}

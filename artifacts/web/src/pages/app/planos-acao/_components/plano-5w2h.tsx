import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionPlan5W2H } from "@/lib/action-plans-client";

type FieldKey = keyof ActionPlan5W2H;

const FIELDS: { key: FieldKey; label: string; placeholder: string; long?: boolean }[] = [
  { key: "what", label: "O quê", placeholder: "O que será feito (a ação em si)", long: true },
  { key: "why", label: "Por quê", placeholder: "Justificativa / objetivo" },
  { key: "where", label: "Onde", placeholder: "Local / processo / unidade" },
  { key: "who", label: "Quem", placeholder: "Responsável pela execução" },
  { key: "when", label: "Quando", placeholder: "Prazo / janela de execução" },
  { key: "how", label: "Como", placeholder: "Método / passos", long: true },
  { key: "howMuch", label: "Quanto", placeholder: "Custo estimado (ex.: R$ 2.400,00)" },
];

/** Structured 5W2H editor. Empty by default so users only fill what's relevant. */
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <div key={f.key} className={f.long ? "sm:col-span-2" : undefined}>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {f.label}
          </label>
          {f.long ? (
            <Textarea
              value={v[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={2}
              readOnly={readOnly}
            />
          ) : (
            <Input
              value={v[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              readOnly={readOnly}
            />
          )}
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatKpiNumber } from "@/lib/kpi-client";

/** Exibe a carga horária em pt-BR (0,33h). Não renderiza nada se não houver valor. */
export function TrainingWorkloadCell({
  hours,
}: {
  hours: number | null | undefined;
}) {
  if (!hours) return null;
  return <span>{formatKpiNumber(hours)}h</span>;
}

function toDisplayText(value: number | string): string {
  return value === "" || value === null || value === undefined
    ? ""
    : String(value);
}

/**
 * Input de carga horária: aceita centésimos de hora (um treino de 20 min = 0,33).
 *
 * O texto do campo é mantido em estado local em vez de derivado só da prop
 * `value`. Isso é necessário porque alguns formulários guardam
 * `workloadHours` como número e convertem a cada tecla
 * (`onChange={(v) => setForm({ ...form, workloadHours: Number(v) })}`). Ao
 * digitar um decimal, existe um trecho do caminho em que o texto do campo
 * fica vazio ou incompleto e `Number(...)` disso é igual ao valor anterior
 * do formulário — o React então força o input de volta para o valor antigo
 * (`element.value = "0"`), apagando o que acabou de ser digitado. Guardando
 * o texto localmente, o campo sempre mostra exatamente o que o usuário
 * digitou enquanto ele está editando, e ainda assim ressincroniza com o
 * valor vindo de fora quando o campo não está em edição (ex.: abrir um
 * treinamento diferente para editar).
 */
export function TrainingWorkloadInput({
  value,
  onChange,
  className,
}: {
  value: number | string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => toDisplayText(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setText(toDisplayText(value));
    }
  }, [value, isEditing]);

  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={text}
      onFocus={() => setIsEditing(true)}
      onBlur={() => setIsEditing(false)}
      onChange={(event) => {
        setText(event.target.value);
        onChange(event.target.value);
      }}
      className={className}
    />
  );
}

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

/** Input de carga horária: aceita centésimos de hora (um treino de 20 min = 0,33). */
export function TrainingWorkloadInput({
  value,
  onChange,
  className,
}: {
  value: number | string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
}

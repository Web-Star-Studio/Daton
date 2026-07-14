/**
 * Vencimento do diagnóstico do Fator de Desempenho (ISO 39001 §6.3).
 *
 * Função pura, sem banco e sem relógio global: `now` é injetado para os testes
 * e para o provider de pendências, que já injeta o seu.
 */

export type DiagnosisPeriodicity =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type DiagnosisStatus = "none" | "ok" | "due_soon" | "overdue";

/** Meses somados à data do último diagnóstico para achar o próximo. */
export const DIAGNOSIS_PERIODICITY_MONTHS: Record<
  DiagnosisPeriodicity,
  number
> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Parse date-only sem drift de fuso: "2026-01-31" vira 31/01 local, não UTC. */
function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toDateOnly(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Soma meses preservando o fim do mês: 31/01 + 1 mês = 28/02 (ou 29 em bissexto),
 * não 03/03 como o overflow nativo de Date faria.
 */
function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));
  return result;
}

function isDiagnosisPeriodicity(v: string | null): v is DiagnosisPeriodicity {
  return v !== null && v in DIAGNOSIS_PERIODICITY_MONTHS;
}

/**
 * Data do próximo diagnóstico. Null quando o fator não tem revisão programada.
 * Sem diagnóstico registrado, a contagem começa na criação do fator — um fator
 * criado hoje com revisão anual vence daqui a um ano, não imediatamente.
 */
export function nextDiagnosisDate(input: {
  periodicity: string | null;
  factorCreatedAt: Date;
  lastReferenceDate: string | null;
}): string | null {
  if (!isDiagnosisPeriodicity(input.periodicity)) return null;
  const base =
    (input.lastReferenceDate ? parseDateOnly(input.lastReferenceDate) : null) ??
    input.factorCreatedAt;
  const months = DIAGNOSIS_PERIODICITY_MONTHS[input.periodicity];
  return toDateOnly(addMonths(base, months));
}

/** Vencido / vence em breve (janela de `dueSoonDays`) / em dia. */
export function diagnosisStatus(
  nextDate: string | null,
  now: Date,
  dueSoonDays = 7,
): DiagnosisStatus {
  if (!nextDate) return "none";
  const next = parseDateOnly(nextDate);
  if (!next) return "none";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next.getTime() < today.getTime()) return "overdue";
  const limit = new Date(today);
  limit.setDate(limit.getDate() + dueSoonDays);
  return next.getTime() <= limit.getTime() ? "due_soon" : "ok";
}

/**
 * Lógica de "indicador a alimentar / atrasado", extraída da rota KPI para ser
 * reusada pelo provider de pendências (sem duplicar a regra). Comportamento de
 * `computeFeedStatus` é idêntico ao da rota original.
 */
export function expectedMonthsFor(
  periodicity: string,
  referenceMonth: number | null,
): number[] {
  if (!referenceMonth || referenceMonth < 1 || referenceMonth > 12) return [];
  const at = (offset: number) => ((referenceMonth - 1 + offset) % 12) + 1;
  if (periodicity === "annual") return [at(0)];
  if (periodicity === "semiannual") return [at(0), at(6)];
  if (periodicity === "quarterly") return [at(0), at(3), at(6), at(9)];
  return [];
}

/** Primeiro mês (1-indexado) esperado, já exigível e sem lançamento. null = nenhum. */
export function firstOverdueMonth(
  monthValues: (number | null)[],
  periodicity: string,
  referenceMonth: number | null,
  year: number,
  now: Date = new Date(),
): number | null {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const maxMonthDue =
    year < currentYear ? 12 : year > currentYear ? 0 : currentMonth - 1;
  if (maxMonthDue === 0) return null;

  if (
    periodicity === "monthly" ||
    periodicity === "monthly_15d" ||
    periodicity === "monthly_45d"
  ) {
    for (let m = 1; m <= maxMonthDue; m++) {
      if (monthValues[m - 1] === null || monthValues[m - 1] === undefined) return m;
    }
    return null;
  }

  if (!referenceMonth || referenceMonth < 1 || referenceMonth > 12) return null;
  const expected = expectedMonthsFor(periodicity, referenceMonth);
  for (const m of expected) {
    if (m <= maxMonthDue && (monthValues[m - 1] === null || monthValues[m - 1] === undefined)) {
      return m;
    }
  }
  return null;
}

export function computeFeedStatus(
  monthValues: (number | null)[],
  periodicity: string,
  referenceMonth: number | null,
  year: number,
  now: Date = new Date(),
): "fed" | "overdue" {
  return firstOverdueMonth(monthValues, periodicity, referenceMonth, year, now) === null
    ? "fed"
    : "overdue";
}

/**
 * Adds `months` to an ISO date string (YYYY-MM-DD), clamping the day to the
 * last valid day of the target month.  Prevents the Date#setMonth overflow
 * where e.g. "2026-01-31" + 1 month would silently land on "2026-03-03"
 * instead of "2026-02-28".
 *
 * All arithmetic is done in UTC so the result is independent of the server's
 * local timezone.
 */
export function addMonthsClamped(isoDate: string, months: number): string | null {
  // Force UTC parse: YYYY-MM-DD spec is UTC, but T00:00:00Z is unambiguous.
  const d = new Date(isoDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const srcYear = d.getUTCFullYear();
  const srcMonth = d.getUTCMonth(); // 0-based
  const srcDay = d.getUTCDate();
  const targetMonth = srcMonth + months; // JS Date handles year overflow in Date.UTC
  // Day 0 of (targetMonth + 1) → last day of targetMonth (UTC, handles year rollover)
  const lastDayOfTarget = new Date(Date.UTC(srcYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(srcDay, lastDayOfTarget);
  return new Date(Date.UTC(srcYear, targetMonth, clampedDay))
    .toISOString()
    .slice(0, 10);
}

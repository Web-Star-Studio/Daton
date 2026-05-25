// Default alert window when the document has no override (mirrors v1 default).
export const DEFAULT_ALERT_DAYS = 30;

export type RegulatoryDocumentStatus = "vigente" | "a_vencer" | "vencido";

/**
 * Compute the current status of a regulatory document.
 *
 * - `vencido`: expirationDate is in the past.
 * - `a_vencer`: expirationDate is within `alertDays` from today.
 * - `vigente`: otherwise.
 *
 * `alertDays` falls back to DEFAULT_ALERT_DAYS when the doc has no override.
 */
export function computeStatus(
  expirationDate: string,
  alertDaysOverride: number | null,
  now: Date = new Date(),
): RegulatoryDocumentStatus {
  const days = alertDaysOverride ?? DEFAULT_ALERT_DAYS;
  // Anchor to midnight so off-by-one hours don't flip the bucket.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = expirationDate.split("-").map(Number);
  const exp = new Date(y, (m ?? 1) - 1, d ?? 1);
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "vencido";
  if (diffDays <= days) return "a_vencer";
  return "vigente";
}

/** Number of days from today until the expiration (negative if past). */
export function daysUntilExpiration(expirationDate: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = expirationDate.split("-").map(Number);
  const exp = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Math.ceil((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

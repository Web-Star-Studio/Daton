/**
 * GUT prioritization helpers. Axes are 1–5 (matching the road-safety module),
 * so the score G×U×T ranges 1–125. Kept server-side so list/detail/summary all
 * compute the score the same way.
 */

export function gutScore(
  g: number | null | undefined,
  u: number | null | undefined,
  t: number | null | undefined,
): number | null {
  if (g == null || u == null || t == null) return null;
  return g * u * t;
}

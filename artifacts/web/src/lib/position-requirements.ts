import type { Position } from "@workspace/api-client-react";

/**
 * Normalize a string for comparison: lowercase, trim, remove accents.
 */
export function normalizeForComparison(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.$/, ""); // remove trailing period
}

/**
 * Find a position object by matching the employee's position name.
 */
export function findPositionByName(
  positions: Position[],
  positionName: string | null | undefined,
): Position | null {
  if (!positionName) return null;
  const normalized = normalizeForComparison(positionName);
  return (
    positions.find((p) => normalizeForComparison(p.name) === normalized) ?? null
  );
}

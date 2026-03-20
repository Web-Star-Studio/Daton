import type { EmployeeCompetency, Position } from "@workspace/api-client-react";

export type ComplianceItem = {
  requirement: string;
  matched: boolean;
  competency?: EmployeeCompetency;
};

/**
 * Parse a position's requirements text field into individual requirement strings.
 * Splits by newline, semicolon, and filters empty entries.
 */
export function getRequirementsList(requirements: string | null | undefined): string[] {
  if (!requirements) return [];
  return requirements
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  return positions.find((p) => normalizeForComparison(p.name) === normalized) ?? null;
}

/**
 * Match position requirements against employee competencies.
 * Returns a ComplianceItem for each requirement indicating if it's met.
 */
export function matchRequirementsToCompetencies(
  requirements: string[],
  competencies: EmployeeCompetency[],
): ComplianceItem[] {
  return requirements.map((req) => {
    const normalizedReq = normalizeForComparison(req);
    // Find the best matching competency (highest acquiredLevel if multiple match)
    let bestMatch: EmployeeCompetency | undefined;
    for (const comp of competencies) {
      if (normalizeForComparison(comp.name) === normalizedReq) {
        if (!bestMatch || (comp.acquiredLevel ?? 0) > (bestMatch.acquiredLevel ?? 0)) {
          bestMatch = comp;
        }
      }
    }
    return {
      requirement: req,
      matched: !!bestMatch,
      competency: bestMatch,
    };
  });
}

/**
 * Bulk aggregates for the employee listing: competency gap status and
 * mandatory training completion percentage per employee.
 *
 * Both helpers take the full page of employees and run a single batch
 * query — no N+1 queries.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  positionsTable,
} from "@workspace/db";

type Db = Pick<typeof db, "select">;

type GapStatus = "ok" | "gap" | "critical";

// ─── Internal helpers (mirror employees.ts:167–179) ──────────────────────────

function normalizeCompetencyText(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase("pt-BR");
}

function buildCompetencyKey(
  name: string | null | undefined,
  type: string | null | undefined,
): string {
  return `${normalizeCompetencyText(name)}::${normalizeCompetencyText(type) || "habilidade"}`;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * For each employee in the given list, compute a gap status based on their
 * position's competency requirements vs. their recorded competencies.
 *
 * Algorithm (mirrors competency-gaps endpoint in employees.ts ~1768–1804 and
 * computeCriticalGapCountsByUnit in lms-metrics.ts):
 *   - gapLevel = max(requiredLevel - acquiredLevel, 0)
 *   - critical = gapLevel >= 2 || requiredLevel >= 4
 *   - "critical" if any gap is critical; "gap" if any gap is non-critical; else "ok"
 *
 * NOTE: A future refactor could unify this with computeCriticalGapCountsByUnit
 * in lms-metrics.ts (which currently duplicates the same algorithm). That
 * refactor is out of scope for this task — see task A1 notes.
 *
 * @returns Map<employeeId, GapStatus> — employees not in the map default to "ok"
 */
export async function computeCompetencyGapStatusByEmployee(
  database: Db,
  orgId: number,
  employees: { id: number; position: string | null }[],
): Promise<Map<number, GapStatus>> {
  const statusMap = new Map<number, GapStatus>();

  if (employees.length === 0) return statusMap;

  // ── 1. Resolve unique position names → position rows ─────────────────────
  const positionNames = [
    ...new Set(
      employees.map((e) => e.position).filter((v): v is string => !!v),
    ),
  ];

  if (positionNames.length === 0) return statusMap; // no positions → all "ok"

  const positions = await database
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.organizationId, orgId),
        inArray(positionsTable.name, positionNames),
      ),
    );

  if (positions.length === 0) return statusMap;

  const positionByName = new Map(positions.map((p) => [p.name, p]));
  const positionIds = positions.map((p) => p.id);

  // ── 2. Load all competency requirements for those positions ───────────────
  const requirements = await database
    .select()
    .from(positionCompetencyRequirementsTable)
    .where(
      inArray(positionCompetencyRequirementsTable.positionId, positionIds),
    );

  if (requirements.length === 0) return statusMap;

  const requirementsByPositionId = new Map<
    number,
    (typeof positionCompetencyRequirementsTable.$inferSelect)[]
  >();
  for (const req of requirements) {
    const items = requirementsByPositionId.get(req.positionId) ?? [];
    items.push(req);
    requirementsByPositionId.set(req.positionId, items);
  }

  // ── 3. Load all competencies for the page's employees ────────────────────
  const employeeIds = employees.map((e) => e.id);

  const competencies = await database
    .select()
    .from(employeeCompetenciesTable)
    .where(inArray(employeeCompetenciesTable.employeeId, employeeIds));

  const competenciesByEmployeeId = new Map<
    number,
    (typeof employeeCompetenciesTable.$inferSelect)[]
  >();
  for (const comp of competencies) {
    const items = competenciesByEmployeeId.get(comp.employeeId) ?? [];
    items.push(comp);
    competenciesByEmployeeId.set(comp.employeeId, items);
  }

  // ── 4. Compute gap status per employee ────────────────────────────────────
  for (const employee of employees) {
    const position = employee.position
      ? positionByName.get(employee.position)
      : null;
    if (!position) continue;

    const posReqs = requirementsByPositionId.get(position.id) ?? [];
    if (posReqs.length === 0) continue;

    const empComps = competenciesByEmployeeId.get(employee.id) ?? [];

    // Max acquiredLevel per competency key (handles duplicate entries)
    const compByKey = new Map<
      string,
      typeof employeeCompetenciesTable.$inferSelect
    >();
    for (const comp of empComps) {
      const key = buildCompetencyKey(comp.name, comp.type);
      const existing = compByKey.get(key);
      if (!existing || comp.acquiredLevel > existing.acquiredLevel) {
        compByKey.set(key, comp);
      }
    }

    let hasCritical = false;
    let hasGap = false;

    for (const req of posReqs) {
      const key = buildCompetencyKey(req.competencyName, req.competencyType);
      const acquired = compByKey.get(key)?.acquiredLevel ?? 0;
      const gapLevel = Math.max(req.requiredLevel - acquired, 0);
      if (gapLevel === 0) continue;

      const critical = gapLevel >= 2 || req.requiredLevel >= 4;
      if (critical) {
        hasCritical = true;
        break; // cannot get worse than "critical"
      } else {
        hasGap = true;
      }
    }

    if (hasCritical) {
      statusMap.set(employee.id, "critical");
    } else if (hasGap) {
      statusMap.set(employee.id, "gap");
    }
    // "ok" is the default — not set in map; callers use ?? "ok"
  }

  return statusMap;
}

/**
 * For each employee, compute the percentage of mandatory trainings completed
 * up to and including `endOfMonth`.
 *
 * "Mandatory" = `requirementId IS NOT NULL` (generated by the requirements
 * engine in applyTrainingRequirements).
 *
 * Formula (mirrors mandatory_coverage in lms-metrics.ts:307–327):
 *   total === 0 ? null : Math.round((done / total) * 1000) / 10
 *
 * @returns Map<employeeId, number | null> — employees with no mandatory
 *          trainings are not present in the map (callers use ?? null).
 */
export async function computeTrainingCompletionByEmployee(
  database: Db,
  orgId: number,
  employeeIds: number[],
  endOfMonth: string,
): Promise<Map<number, number | null>> {
  const completionMap = new Map<number, number | null>();

  if (employeeIds.length === 0) return completionMap;

  // Single batch query scoped to the page's employees.
  // org-scoping: employees already belong to orgId (filtered by route);
  // we add an implicit org check by only querying for this page's employee ids.
  const rows = await database
    .select({
      employeeId: employeeTrainingsTable.employeeId,
      total: sql<number>`count(*) filter (where ${employeeTrainingsTable.requirementId} is not null)`,
      done: sql<number>`count(*) filter (where ${employeeTrainingsTable.requirementId} is not null and ${employeeTrainingsTable.status} = 'concluido' and (${employeeTrainingsTable.completionDate} is null or ${employeeTrainingsTable.completionDate} <= ${endOfMonth}))`,
    })
    .from(employeeTrainingsTable)
    .where(inArray(employeeTrainingsTable.employeeId, employeeIds))
    .groupBy(employeeTrainingsTable.employeeId);

  for (const row of rows) {
    const total = Number(row.total);
    const done = Number(row.done);
    completionMap.set(
      row.employeeId,
      total === 0 ? null : Math.round((done / total) * 1000) / 10,
    );
  }

  return completionMap;
}

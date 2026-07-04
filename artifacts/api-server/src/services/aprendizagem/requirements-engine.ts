import { and, eq } from "drizzle-orm";
import {
  db as defaultDb,
  employeesTable,
  positionsTable,
  trainingRequirementsTable,
  trainingCatalogTable,
  employeeTrainingsTable,
} from "@workspace/db";

// Aceita o db principal ou uma transação tx (ambos satisfazem select/insert).
type Database = Pick<typeof defaultDb, "select" | "insert">;

function addDaysIso(isoDate: string, days: number): string | null {
  // Force UTC parse so arithmetic is timezone-safe regardless of server locale.
  const d = new Date(isoDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Motor de auto-vínculo de obrigatoriedades. Para o colaborador informado,
 * resolve o cargo (texto → positionId), aplica as regras de training_requirements
 * (filtrando escopo geral/filial), aproveita os treinos concluídos e válidos e
 * gera os pendentes faltantes (snapshot do item do catálogo) com dueDate.
 *
 * Idempotente: dedup por requirement/catalogItem pendente. Seguro para re-rodar
 * na admissão e na mudança de cargo. Nunca remove registros.
 *
 * Aceita `database` (db principal ou uma transação tx) — ambos têm a mesma API.
 */
export async function applyTrainingRequirements(args: {
  orgId: number;
  employeeId: number;
  database: Database;
}): Promise<{ generated: number; reused: number }> {
  const { orgId, employeeId, database } = args;

  const [emp] = await database
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.organizationId, orgId),
      ),
    );
  if (!emp || !emp.position) return { generated: 0, reused: 0 };

  const [position] = await database
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.organizationId, orgId),
        eq(positionsTable.name, emp.position),
      ),
    );
  if (!position) return { generated: 0, reused: 0 };

  const rules = await database
    .select()
    .from(trainingRequirementsTable)
    .where(
      and(
        eq(trainingRequirementsTable.organizationId, orgId),
        eq(trainingRequirementsTable.positionId, position.id),
      ),
    );

  const existing = await database
    .select()
    .from(employeeTrainingsTable)
    .where(eq(employeeTrainingsTable.employeeId, employeeId));

  const today = new Date().toISOString().slice(0, 10);
  const completedCatalogIds = new Set(
    existing
      .filter(
        (t) =>
          t.status === "concluido" &&
          (!t.expirationDate || t.expirationDate >= today),
      )
      .map((t) => t.catalogItemId)
      .filter((id): id is number => id != null),
  );
  const pendingByRequirement = new Set(
    existing
      .filter((t) => t.status === "pendente")
      .map((t) => t.requirementId)
      .filter((id): id is number => id != null),
  );
  const pendingCatalogIds = new Set(
    existing
      .filter((t) => t.status === "pendente")
      .map((t) => t.catalogItemId)
      .filter((id): id is number => id != null),
  );

  let generated = 0;
  let reused = 0;

  for (const rule of rules) {
    // escopo de filial
    if (rule.scope === "filial") {
      const units = (rule.filialUnitIds as number[]) ?? [];
      if (!emp.unitId || !units.includes(emp.unitId)) continue;
    }
    // aproveitamento de concluído válido
    if (completedCatalogIds.has(rule.catalogItemId)) {
      reused += 1;
      continue;
    }
    // dedup de pendente
    if (
      pendingByRequirement.has(rule.id) ||
      pendingCatalogIds.has(rule.catalogItemId)
    ) {
      continue;
    }

    const [item] = await database
      .select()
      .from(trainingCatalogTable)
      .where(
        and(
          eq(trainingCatalogTable.id, rule.catalogItemId),
          eq(trainingCatalogTable.organizationId, orgId),
        ),
      );
    if (!item) continue;

    const dueDate =
      rule.deadlineType === "fixo" && rule.deadlineDays != null && emp.admissionDate
        ? addDaysIso(emp.admissionDate, rule.deadlineDays)
        : null;

    await database.insert(employeeTrainingsTable).values({
      employeeId,
      title: item.title,
      description: item.programContent ?? null,
      objective: item.objective ?? null,
      institution: item.defaultInstructor ?? null,
      targetCompetencyName: item.targetCompetencyName ?? null,
      targetCompetencyType: item.targetCompetencyType ?? null,
      targetCompetencyLevel: item.targetCompetencyLevel ?? null,
      evaluationMethod: item.evaluationMethod ?? null,
      workloadHours: item.workloadHours ?? null,
      renewalMonths: item.validityMonths ?? null,
      status: "pendente",
      catalogItemId: item.id,
      requirementId: rule.id,
      dueDate,
    });
    pendingByRequirement.add(rule.id);
    pendingCatalogIds.add(rule.catalogItemId);
    generated += 1;
  }

  return { generated, reused };
}

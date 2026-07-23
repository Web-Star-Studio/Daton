import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  trainingClassUnitsTable,
  trainingClassesTable,
  unitsTable,
  usersTable,
} from "@workspace/db";

/**
 * Filiais de uma turma (N:N). Uma turma pode atender várias filiais e cada
 * filial tem o seu próprio responsável local.
 *
 * A coluna legada `training_classes.unit_id` continua existindo como espelho da
 * PRIMEIRA filial da lista. Ela é escrita exclusivamente por
 * `replaceClassUnits`, na mesma transação dos vínculos — é o que impede as duas
 * representações de divergirem.
 */

export type ClassUnitInput = {
  unitId: number;
  responsibleUserId?: number | null;
};

export type SerializedClassUnit = {
  unitId: number;
  unitName: string | null;
  responsibleUserId: number | null;
  responsibleUserName: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Remove filiais repetidas mantendo a primeira ocorrência (unique index). */
export function dedupeClassUnits(units: ClassUnitInput[]): ClassUnitInput[] {
  const seen = new Set<number>();
  const out: ClassUnitInput[] = [];
  for (const u of units) {
    if (seen.has(u.unitId)) continue;
    seen.add(u.unitId);
    out.push(u);
  }
  return out;
}

/**
 * Isolamento multi-tenant: filiais e responsáveis têm de ser da própria org.
 * Devolve a mensagem de erro (400) ou null quando está tudo certo.
 */
export async function validateClassUnits(
  orgId: number,
  units: ClassUnitInput[],
): Promise<string | null> {
  if (units.length === 0) return null;

  const unitIds = units.map((u) => u.unitId);
  const orgUnits = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(
      and(inArray(unitsTable.id, unitIds), eq(unitsTable.organizationId, orgId)),
    );
  const validUnitIds = new Set(orgUnits.map((u) => u.id));
  if (unitIds.some((id) => !validUnitIds.has(id))) {
    return "Filial não encontrada";
  }

  const responsibleIds = units
    .map((u) => u.responsibleUserId)
    .filter((id): id is number => id != null);
  if (responsibleIds.length > 0) {
    const orgUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          inArray(usersTable.id, responsibleIds),
          eq(usersTable.organizationId, orgId),
        ),
      );
    const validUserIds = new Set(orgUsers.map((u) => u.id));
    if (responsibleIds.some((id) => !validUserIds.has(id))) {
      return "Responsável não encontrado";
    }
  }

  return null;
}

/**
 * Substitui a lista inteira de filiais da turma (replace-all) e sincroniza o
 * espelho legado `training_classes.unit_id`. Precisa rodar dentro da mesma
 * transação da escrita da turma.
 */
export async function replaceClassUnits(
  tx: Tx,
  classId: number,
  units: ClassUnitInput[],
): Promise<void> {
  await tx
    .delete(trainingClassUnitsTable)
    .where(eq(trainingClassUnitsTable.classId, classId));

  if (units.length > 0) {
    await tx.insert(trainingClassUnitsTable).values(
      units.map((u) => ({
        classId,
        unitId: u.unitId,
        responsibleUserId: u.responsibleUserId ?? null,
      })),
    );
  }

  await tx
    .update(trainingClassesTable)
    .set({ unitId: units[0]?.unitId ?? null })
    .where(eq(trainingClassesTable.id, classId));
}

/**
 * Filiais serializadas por turma. Os ids já devem vir com escopo de org
 * (a consulta que os produziu filtra por organization_id).
 */
export async function loadClassUnits(
  classIds: number[],
): Promise<Map<number, SerializedClassUnit[]>> {
  const byClass = new Map<number, SerializedClassUnit[]>();
  if (classIds.length === 0) return byClass;

  const rows = await db
    .select({
      classId: trainingClassUnitsTable.classId,
      unitId: trainingClassUnitsTable.unitId,
      unitName: unitsTable.name,
      responsibleUserId: trainingClassUnitsTable.responsibleUserId,
      responsibleUserName: usersTable.name,
    })
    .from(trainingClassUnitsTable)
    .leftJoin(unitsTable, eq(trainingClassUnitsTable.unitId, unitsTable.id))
    .leftJoin(
      usersTable,
      eq(trainingClassUnitsTable.responsibleUserId, usersTable.id),
    )
    .where(inArray(trainingClassUnitsTable.classId, classIds))
    .orderBy(asc(unitsTable.name), asc(trainingClassUnitsTable.unitId));

  for (const r of rows) {
    const list = byClass.get(r.classId) ?? [];
    list.push({
      unitId: r.unitId,
      unitName: r.unitName ?? null,
      responsibleUserId: r.responsibleUserId ?? null,
      responsibleUserName: r.responsibleUserName ?? null,
    });
    byClass.set(r.classId, list);
  }
  return byClass;
}

/**
 * Normaliza o corpo da requisição: `units` é a forma canônica; `unitId` é o
 * atalho legado (uma filial só). Devolve `undefined` quando nenhum dos dois
 * veio — no PATCH isso significa "não mexer nas filiais".
 */
export function resolveUnitsFromBody(body: {
  units?: ClassUnitInput[] | undefined;
  unitId?: number | null | undefined;
}): ClassUnitInput[] | undefined {
  if (body.units !== undefined) return dedupeClassUnits(body.units);
  if (body.unitId !== undefined) {
    return body.unitId == null ? [] : [{ unitId: body.unitId }];
  }
  return undefined;
}

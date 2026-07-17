import { and, eq } from "drizzle-orm";
import {
  db as defaultDb,
  trainingClassesTable,
  trainingClassParticipantsTable,
  trainingCatalogTable,
  employeeTrainingsTable,
} from "@workspace/db";
import { addMonthsClamped } from "./date-helpers";

type Database = Pick<typeof defaultDb, "select" | "insert" | "update">;

/**
 * Conclui uma turma: para cada participante presente e aprovado, grava/atualiza o
 * employee_training como concluído (completionDate = data da turma; expirationDate
 * = conclusão + validade do catálogo). Reaproveita o pendente vinculado quando
 * existe; senão tenta reusar um pendente do mesmo item; senão cria via snapshot.
 * Idempotente: participante já concluído é pulado. Marca a turma como realizada.
 */
export async function completeTrainingClass(args: {
  orgId: number;
  classId: number;
  database: Database;
}): Promise<{ completed: number }> {
  const { orgId, classId, database } = args;

  const [cls] = await database
    .select()
    .from(trainingClassesTable)
    .where(
      and(
        eq(trainingClassesTable.id, classId),
        eq(trainingClassesTable.organizationId, orgId),
      ),
    );
  if (!cls) return { completed: 0 };

  const [item] = await database
    .select()
    .from(trainingCatalogTable)
    .where(
      and(
        eq(trainingCatalogTable.id, cls.catalogItemId),
        eq(trainingCatalogTable.organizationId, orgId),
      ),
    );

  const completionDate = cls.endDate ?? cls.startDate;
  const expirationDate =
    item?.validityMonths && completionDate
      ? addMonthsClamped(completionDate, item.validityMonths)
      : null;

  const participants = await database
    .select()
    .from(trainingClassParticipantsTable)
    .where(eq(trainingClassParticipantsTable.classId, classId));

  let completed = 0;
  for (const p of participants) {
    if (p.attendance !== "presente" || p.result === "reprovado") continue;

    if (p.employeeTrainingId) {
      const [t] = await database
        .select()
        .from(employeeTrainingsTable)
        .where(eq(employeeTrainingsTable.id, p.employeeTrainingId));
      if (t && t.status === "concluido") continue; // idempotente
      await database
        .update(employeeTrainingsTable)
        .set({ status: "concluido", completionDate, expirationDate })
        .where(eq(employeeTrainingsTable.id, p.employeeTrainingId));
      completed += 1;
      continue;
    }

    // reaproveita um pendente do mesmo item, se existir
    const [pending] = await database
      .select()
      .from(employeeTrainingsTable)
      .where(
        and(
          eq(employeeTrainingsTable.employeeId, p.employeeId),
          eq(employeeTrainingsTable.catalogItemId, cls.catalogItemId),
          eq(employeeTrainingsTable.status, "pendente"),
        ),
      );
    if (pending) {
      await database
        .update(employeeTrainingsTable)
        .set({ status: "concluido", completionDate, expirationDate })
        .where(eq(employeeTrainingsTable.id, pending.id));
      await database
        .update(trainingClassParticipantsTable)
        .set({ employeeTrainingId: pending.id })
        .where(eq(trainingClassParticipantsTable.id, p.id));
      completed += 1;
      continue;
    }

    // cria novo (snapshot do catálogo) já concluído
    const [created] = await database
      .insert(employeeTrainingsTable)
      .values({
        employeeId: p.employeeId,
        title: item?.title ?? "Treinamento",
        description: item?.programContent ?? null,
        objective: item?.objective ?? null,
        instructor: item?.defaultInstructor ?? null,
        targetCompetencyName: item?.targetCompetencyName ?? null,
        targetCompetencyType: item?.targetCompetencyType ?? null,
        targetCompetencyLevel: item?.targetCompetencyLevel ?? null,
        evaluationMethod: item?.evaluationMethod ?? null,
        workloadHours: item?.workloadHours ?? cls.workloadHours ?? null,
        renewalMonths: item?.validityMonths ?? null,
        status: "concluido",
        completionDate,
        expirationDate,
        catalogItemId: cls.catalogItemId,
      })
      .returning();
    await database
      .update(trainingClassParticipantsTable)
      .set({ employeeTrainingId: created.id })
      .where(eq(trainingClassParticipantsTable.id, p.id));
    completed += 1;
  }

  await database
    .update(trainingClassesTable)
    .set({ status: "realizada" })
    .where(eq(trainingClassesTable.id, classId));

  return { completed };
}

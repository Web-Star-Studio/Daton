import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
  employeeTrainingsTable,
} from "@workspace/db";
import { completeTrainingClass } from "../../src/services/aprendizagem/complete-class";
import {
  cleanupTestContext,
  createEmployee,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function setup(ctx: TestOrgContext, validityMonths: number | null) {
  const [item] = await db
    .insert(trainingCatalogTable)
    .values({
      organizationId: ctx.organizationId,
      title: `Treino ${ctx.prefix}`,
      validityMonths,
    })
    .returning();
  const [cls] = await db
    .insert(trainingClassesTable)
    .values({
      organizationId: ctx.organizationId,
      catalogItemId: item.id,
      startDate: "2026-06-15",
      minScore: 7,
    })
    .returning();
  return { item, cls };
}

describe("completeTrainingClass", () => {
  it("conclui só os aprovados, com completionDate/expirationDate", async () => {
    const ctx = await createTestContext({ seed: "complete-approve" });
    contexts.push(ctx);
    const { cls } = await setup(ctx, 12);
    const empOk = await createEmployee(ctx, { name: `Ok ${ctx.prefix}` });
    const empBad = await createEmployee(ctx, { name: `Bad ${ctx.prefix}` });
    const empAbsent = await createEmployee(ctx, { name: `Abs ${ctx.prefix}` });
    await db.insert(trainingClassParticipantsTable).values([
      { classId: cls.id, employeeId: empOk.id, attendance: "presente", result: "aprovado" },
      { classId: cls.id, employeeId: empBad.id, attendance: "presente", result: "reprovado" },
      { classId: cls.id, employeeId: empAbsent.id, attendance: "faltou" },
    ]);

    const result = await completeTrainingClass({
      orgId: ctx.organizationId,
      classId: cls.id,
      database: db,
    });
    expect(result.completed).toBe(1);

    const [trainingOk] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, empOk.id));
    expect(trainingOk.status).toBe("concluido");
    expect(trainingOk.completionDate).toBe("2026-06-15");
    expect(trainingOk.expirationDate).toBe("2027-06-15");

    const badRows = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, empBad.id));
    expect(badRows.length).toBe(0);

    const [updated] = await db
      .select()
      .from(trainingClassesTable)
      .where(eq(trainingClassesTable.id, cls.id));
    expect(updated.status).toBe("realizada");
  });

  it("reaproveita o pendente vinculado (não cria novo)", async () => {
    const ctx = await createTestContext({ seed: "complete-reuse" });
    contexts.push(ctx);
    const { item, cls } = await setup(ctx, null);
    const emp = await createEmployee(ctx, { name: `Reuse ${ctx.prefix}` });
    const [pending] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: emp.id,
        title: "Pendente",
        status: "pendente",
        catalogItemId: item.id,
      })
      .returning();
    await db.insert(trainingClassParticipantsTable).values({
      classId: cls.id,
      employeeId: emp.id,
      attendance: "presente",
      result: "aprovado",
      employeeTrainingId: pending.id,
    });

    const result = await completeTrainingClass({
      orgId: ctx.organizationId,
      classId: cls.id,
      database: db,
    });
    expect(result.completed).toBe(1);

    const rows = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, emp.id));
    expect(rows.length).toBe(1); // o mesmo registro, não duplicou
    expect(rows[0].id).toBe(pending.id);
    expect(rows[0].status).toBe("concluido");
  });

  it("é idempotente (concluir 2x não duplica)", async () => {
    const ctx = await createTestContext({ seed: "complete-idem" });
    contexts.push(ctx);
    const { cls } = await setup(ctx, 12);
    const emp = await createEmployee(ctx, { name: `Idem ${ctx.prefix}` });
    await db.insert(trainingClassParticipantsTable).values({
      classId: cls.id,
      employeeId: emp.id,
      attendance: "presente",
      result: "aprovado",
    });

    const first = await completeTrainingClass({
      orgId: ctx.organizationId,
      classId: cls.id,
      database: db,
    });
    const second = await completeTrainingClass({
      orgId: ctx.organizationId,
      classId: cls.id,
      database: db,
    });
    expect(first.completed).toBe(1);
    expect(second.completed).toBe(0);
    const rows = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.employeeId, emp.id));
    expect(rows.length).toBe(1);
  });
});

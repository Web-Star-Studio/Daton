import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
} from "@workspace/db";
import app from "../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  type TestOrgContext,
} from "../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("GET training-classes — confirmedCount/approvedCount", () => {
  it("Inscritos=3, Confirmados=2 (presente), Realizados=1 (aprovado)", async () => {
    const ctx = await createTestContext({ seed: "turmas-counts" });
    contexts.push(ctx);

    const [cat] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `${ctx.prefix} Dir. defensiva`,
        status: "ativo",
      })
      .returning();
    const [cls] = await db
      .insert(trainingClassesTable)
      .values({
        organizationId: ctx.organizationId,
        catalogItemId: cat.id,
        startDate: "2026-04-02",
        status: "realizada",
      })
      .returning();
    const e1 = await createEmployee(ctx, { name: `${ctx.prefix} A` });
    const e2 = await createEmployee(ctx, { name: `${ctx.prefix} B` });
    const e3 = await createEmployee(ctx, { name: `${ctx.prefix} C` });
    // 3 inscritos: 2 presentes (1 aprovado, 1 sem resultado), 1 faltou
    await db.insert(trainingClassParticipantsTable).values([
      { classId: cls.id, employeeId: e1.id, attendance: "presente", result: "aprovado" },
      { classId: cls.id, employeeId: e2.id, attendance: "presente", result: null },
      { classId: cls.id, employeeId: e3.id, attendance: "faltou", result: "reprovado" },
    ]);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/training-classes`)
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    const found = res.body.data.find((c: { id: number }) => c.id === cls.id);
    expect(found.participantCount).toBe(3);
    expect(found.confirmedCount).toBe(2);
    expect(found.approvedCount).toBe(1);
  });
});

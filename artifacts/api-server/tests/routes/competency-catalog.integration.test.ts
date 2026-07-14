import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  employeeCompetenciesTable,
  positionCompetencyRequirementsTable,
} from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("competency-catalog routes", () => {
  it("POST é idempotente por nome (case-insensitive)", async () => {
    const context = await createTestContext({ seed: "comp-catalog-idem" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/competency-catalog`;

    const first = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ name: "Direção segura", competencyType: "habilidade" });
    expect(first.status).toBe(201);

    const again = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ name: "direção SEGURA" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
  });

  it("renomear propaga para employee_competencies e position_competency_requirements; delete só tira do catálogo", async () => {
    const context = await createTestContext({ seed: "comp-catalog-rename" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/competency-catalog`;

    const position = await createPosition(context, { name: `Motorista ${context.prefix}` });
    const employee = await createEmployee(context, { name: `João ${context.prefix}` });

    // usos texto-livre com o nome antigo (grafias diferentes p/ testar case-insensitive)
    await db.insert(employeeCompetenciesTable).values({
      employeeId: employee.id,
      name: "Direção segura",
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "direção Segura",
      createdById: context.userId,
      updatedById: context.userId,
    });

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ name: "Direção segura" });
    expect(created.status).toBe(201);

    const renamed = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ name: "Direção defensiva" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Direção defensiva");

    const [emp] = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, employee.id));
    expect(emp.name).toBe("Direção defensiva");

    const [req2] = await db
      .select()
      .from(positionCompetencyRequirementsTable)
      .where(eq(positionCompetencyRequirementsTable.positionId, position.id));
    expect(req2.competencyName).toBe("Direção defensiva");

    // delete: catálogo perde o item, mas os usos preservam o texto
    const removed = await request(app)
      .delete(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.body.data.some((i: { id: number }) => i.id === created.body.id)).toBe(
      false,
    );
    const [empAfter] = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, employee.id));
    expect(empAfter.name).toBe("Direção defensiva");
  });
});

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, trainingRequirementsTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createUnit,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function makeRule(
  context: TestOrgContext,
  positionId: number,
  catalogTitle: string,
) {
  const item = await request(app)
    .post(`/api/organizations/${context.organizationId}/training-catalog`)
    .set(authHeader(context))
    .send({ title: catalogTitle });
  await db.insert(trainingRequirementsTable).values({
    organizationId: context.organizationId,
    positionId,
    catalogItemId: item.body.id as number,
    deadlineType: "fixo",
    deadlineDays: 30,
    scope: "geral",
  });
}

describe("auto-link de obrigatoriedades", () => {
  it("admissão gera pendentes e devolve autoLinkedTrainings", async () => {
    const context = await createTestContext({ seed: "autolink-create" });
    contexts.push(context);
    const position = await createPosition(context, { name: `Motorista ${context.prefix}` });
    await makeRule(context, position.id, `Dir. defensiva ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: `Novo ${context.prefix}`,
        position: position.name,
        admissionDate: "2026-01-10",
      });
    expect(created.status).toBe(201);
    expect(created.body.autoLinkedTrainings.generated).toBeGreaterThanOrEqual(1);

    const trainings = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${created.body.id}/trainings`,
      )
      .set(authHeader(context));
    expect(trainings.status).toBe(200);
    const pending = (trainings.body as Array<{ status: string; dueDate: string | null }>).find(
      (t) => t.status === "pendente",
    );
    expect(pending).toBeDefined();
    expect(pending?.dueDate).toBe("2026-02-09");
  });

  it("mudança de cargo gera pendentes do novo cargo", async () => {
    const context = await createTestContext({ seed: "autolink-update" });
    contexts.push(context);
    const newPosition = await createPosition(context, { name: `Supervisor ${context.prefix}` });
    await makeRule(context, newPosition.id, `ISO 9001 ${context.prefix}`);
    const employee = await createEmployee(context, {
      name: `Colab ${context.prefix}`,
      position: `Auxiliar ${context.prefix}`,
      admissionDate: "2026-01-10",
    });

    const patched = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/employees/${employee.id}`,
      )
      .set(authHeader(context))
      .send({ position: newPosition.name });
    expect(patched.status).toBe(200);
    expect(patched.body.autoLinkedTrainings.generated).toBeGreaterThanOrEqual(1);
  });

  it("mudança de filial (unitId) gera pendentes filial-scoped", async () => {
    const context = await createTestContext({ seed: "autolink-unitchange" });
    contexts.push(context);

    const position = await createPosition(context, { name: `Operador ${context.prefix}` });
    const unit = await createUnit(context, `Filial ${context.prefix}`);

    // Regra de obrigatoriedade com escopo de filial
    const item = await request(app)
      .post(`/api/organizations/${context.organizationId}/training-catalog`)
      .set(authHeader(context))
      .send({ title: `NR-35 ${context.prefix}` });
    await db.insert(trainingRequirementsTable).values({
      organizationId: context.organizationId,
      positionId: position.id,
      catalogItemId: item.body.id as number,
      deadlineType: "rh",
      scope: "filial",
      filialUnitIds: [unit.id],
    });

    // Colaborador criado sem unitId → regra filial não se aplica ainda
    const employee = await createEmployee(context, {
      name: `Trab ${context.prefix}`,
      position: position.name,
    });

    // Após criação, não deve ter gerado pendente filial-scoped
    const beforeTrainings = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}/trainings`)
      .set(authHeader(context));
    const beforePending = (beforeTrainings.body as Array<{ status: string }>).filter(
      (t) => t.status === "pendente",
    );
    expect(beforePending.length).toBe(0);

    // Mudar unitId para a filial da regra → deve re-aplicar obrigatoriedades
    const patched = await request(app)
      .patch(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context))
      .send({ unitId: unit.id });
    expect(patched.status).toBe(200);
    expect(patched.body.autoLinkedTrainings.generated).toBeGreaterThanOrEqual(1);

    // Verifica que o pendente foi gerado
    const afterTrainings = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}/trainings`)
      .set(authHeader(context));
    const afterPending = (afterTrainings.body as Array<{ status: string }>).filter(
      (t) => t.status === "pendente",
    );
    expect(afterPending.length).toBeGreaterThanOrEqual(1);
  });
});

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, employeeTrainingsTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("POST /employees/:empId/trainings/:trainId/effectiveness-reviews — precisão do score", () => {
  it("persiste e devolve o score com casas decimais", async () => {
    const ctx = await createTestContext({ seed: "eff-score-decimal" });
    contexts.push(ctx);

    const employee = await createEmployee(ctx, {
      name: `Motorista ${ctx.prefix}`,
      position: "Motorista",
    });

    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `NR-35 ${ctx.prefix}`,
        status: "concluido",
        completionDate: "2026-03-15",
      })
      .returning();

    // 3 critérios Kirkpatrick com média 3,67 → score 7,3 na escala 0–10.
    const res = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`,
      )
      .set(authHeader(ctx))
      .send({
        evaluationDate: "2026-05-15",
        score: 7.3,
        isEffective: true,
        resultLevel: 4,
        evaluatorRole: "gestor",
      });

    expect(res.status).toBe(201);
    // Antes da migração para numeric(4,2), isto falhava com 500: o node-pg
    // manda o parâmetro como texto ("7.3") pelo protocolo estendido, e o
    // Postgres rejeita esse texto como entrada de coluna integer (22P02,
    // "invalid input syntax for type integer") — não havia arredondamento
    // silencioso, a requisição inteira quebrava.
    expect(res.body.score).toBe(7.3);
  });
});

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  type TestOrgContext,
} from "../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("resolvedor de competência expõe manualCompetencyId por requisito", () => {
  it("aponta para a linha de employee_competencies que atesta o requisito manualmente, e null quando não há atestado", async () => {
    const context = await createTestContext({ seed: "manual-comp-id" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });

    const attestedCompetencyName = `Direção defensiva ${context.prefix}`;
    const unattestedCompetencyName = `Trabalho em equipe ${context.prefix}`;

    // Dois requisitos no mesmo cargo: um vai ganhar atestado manual, o outro fica sem.
    const reqWithManual = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName: attestedCompetencyName,
        competencyType: "habilidade",
        requiredLevel: 3,
      });
    expect(reqWithManual.status).toBe(201);

    const reqWithoutManual = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName: unattestedCompetencyName,
        competencyType: "atitude",
        requiredLevel: 2,
      });
    expect(reqWithoutManual.status).toBe(201);

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
    });

    // Atestado manual: mesmo nome/tipo do primeiro requisito.
    const manualCompetency = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competencies`,
      )
      .set(authHeader(context))
      .send({
        name: attestedCompetencyName,
        type: "habilidade",
        acquiredLevel: 3,
      });
    expect(manualCompetency.status).toBe(201);

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${employee.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    const requirements = detail.body.competencyConformance.requirements as {
      competencyName: string;
      manualCompetencyId: number | null;
    }[];

    const attested = requirements.find(
      (r) => r.competencyName === attestedCompetencyName,
    );
    const unattested = requirements.find(
      (r) => r.competencyName === unattestedCompetencyName,
    );

    expect(attested).toBeDefined();
    expect(attested?.manualCompetencyId).toBe(manualCompetency.body.id);

    expect(unattested).toBeDefined();
    expect(unattested?.manualCompetencyId).toBeNull();
  });
});

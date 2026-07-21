import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("POST .../competency-requirement-evidence — upsert por requisito", () => {
  it("cria, casa com o requisito (manualCompetencyId + atende), atualiza sem duplicar, e volta a gap ao baixar o nível", async () => {
    const context = await createTestContext({ seed: "comp-req-evidencia" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });

    const competencyName = `Auditor X ${context.prefix}`;
    const requirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName,
        competencyType: "conhecimento",
        requiredLevel: 3,
      });
    expect(requirement.status).toBe(201);

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
    });

    // (a) Evidência manual, mesmo nome/tipo do requisito mas em CAIXA ALTA —
    // buildCompetencyKey normaliza, então tem que casar do mesmo jeito.
    const created = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competency-requirement-evidence`,
      )
      .set(authHeader(context))
      .send({
        competencyName: competencyName.toUpperCase(),
        competencyType: "conhecimento",
        requiredLevel: 3,
        acquiredLevel: 3,
        evidence: "Certificado",
      });
    expect(created.status).toBe(201);
    expect(created.body.acquiredLevel).toBe(3);

    // (b) GET do colaborador: requisito "atende" com manualCompetencyId
    // apontando para a linha criada, e a competência aparece marcada como
    // requisito do cargo.
    const detailAfterCreate = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${employee.id}`,
      )
      .set(authHeader(context));
    expect(detailAfterCreate.status).toBe(200);

    const requirementRow = (
      detailAfterCreate.body.competencyConformance.requirements as {
        competencyName: string;
        status: string;
        manualCompetencyId: number | null;
      }[]
    ).find((r) => r.competencyName === competencyName);
    expect(requirementRow).toBeDefined();
    expect(requirementRow?.status).toBe("atende");
    expect(requirementRow?.manualCompetencyId).toBe(created.body.id);

    const competencyRow = (
      detailAfterCreate.body.competencies as {
        id: number;
        isPositionRequirement: boolean;
      }[]
    ).find((c) => c.id === created.body.id);
    expect(competencyRow).toBeDefined();
    expect(competencyRow?.isPositionRequirement).toBe(true);

    // (c) Repetir o POST com nível mais baixo: upsert na MESMA chave, sem
    // duplicar linha, e o requisito volta a "gap".
    const updated = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competency-requirement-evidence`,
      )
      .set(authHeader(context))
      .send({
        competencyName: competencyName.toUpperCase(),
        competencyType: "conhecimento",
        requiredLevel: 3,
        acquiredLevel: 1,
        evidence: "Certificado revisado",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.acquiredLevel).toBe(1);

    const detailAfterUpdate = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${employee.id}`,
      )
      .set(authHeader(context));
    expect(detailAfterUpdate.status).toBe(200);

    const competenciesForKey = (
      detailAfterUpdate.body.competencies as { name: string; type: string }[]
    ).filter(
      (c) =>
        c.name.trim().toLocaleLowerCase("pt-BR") ===
          competencyName.trim().toLocaleLowerCase("pt-BR") &&
        c.type === "conhecimento",
    );
    expect(competenciesForKey).toHaveLength(1);

    const requirementRowAfterUpdate = (
      detailAfterUpdate.body.competencyConformance.requirements as {
        competencyName: string;
        status: string;
      }[]
    ).find((r) => r.competencyName === competencyName);
    expect(requirementRowAfterUpdate?.status).toBe("gap");
  });

  it("analyst não pode registrar evidência (403)", async () => {
    const context = await createTestContext({ seed: "comp-req-evidencia-403" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });
    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
    });
    const analyst = await createTestUser(context, { role: "analyst" });

    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competency-requirement-evidence`,
      )
      .set({ Authorization: `Bearer ${analyst.token}` })
      .send({
        competencyName: `Auditor Y ${context.prefix}`,
        competencyType: "conhecimento",
        requiredLevel: 3,
        acquiredLevel: 3,
      });

    expect(response.status).toBe(403);
  });

  it("anexo inválido retorna 400", async () => {
    const context = await createTestContext({ seed: "comp-req-evidencia-400" });
    contexts.push(context);

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
    });

    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competency-requirement-evidence`,
      )
      .set(authHeader(context))
      .send({
        competencyName: `Auditor Z ${context.prefix}`,
        competencyType: "conhecimento",
        requiredLevel: 3,
        acquiredLevel: 3,
        attachments: [
          {
            fileName: "arquivo.txt",
            fileSize: 100,
            contentType: "text/plain",
            objectPath: "/objects/uploads/arquivo.txt",
          },
        ],
      });

    expect(response.status).toBe(400);
  });
});

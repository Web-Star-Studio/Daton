import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  strategicPlanObjectivesTable,
  strategicPlansTable,
} from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createDepartment,
  createPosition,
  createEmployee,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

describe("employees routes", () => {
  async function createDocumentForTest(
    context: TestOrgContext,
    options?: { type?: "manual" | "politica" },
  ) {
    const employee = await createEmployee(context, {
      name: `Elaborador ${context.prefix}`,
    });
    const reviewer = await createTestUser(context, {
      role: "analyst",
      suffix: `reviewer-${Date.now()}`,
      modules: ["documents"],
    });
    const approver = await createTestUser(context, {
      role: "operator",
      suffix: `approver-${Date.now()}`,
      modules: ["documents"],
    });
    const recipient = await createTestUser(context, {
      role: "operator",
      suffix: `recipient-${Date.now()}`,
      modules: ["documents"],
    });

    const response = await request(app)
      .post(`/api/organizations/${context.organizationId}/documents`)
      .set(authHeader(context))
      .send({
        title: `Documento ${context.prefix} ${options?.type ?? "manual"}`,
        type: options?.type ?? "manual",
        validityDate: "2030-01-01",
        elaboratorIds: [employee.id],
        criticalReviewerIds: [reviewer.id],
        approverIds: [approver.id],
        recipientIds: [recipient.id],
      });

    expect(response.status).toBe(201);
    return response.body as { id: number; title: string };
  }

  it("creates, lists and loads an employee detail with nested profile items", async () => {
    const context = await createTestContext({ seed: "employees-crud" });
    contexts.push(context);
    const unit = await createUnit(context, `Matriz ${context.prefix}`);
    await createDepartment(context, { name: "Qualidade" });
    await createPosition(context, { name: "Analista da Qualidade" });

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: `Maria ${context.prefix}`,
        email: `${context.prefix}.employee@daton.example`,
        unitId: unit.id,
        department: "Qualidade",
        position: "Analista da Qualidade",
        admissionDate: "2024-02-01",
        professionalExperiences: [
          {
            title: "Experiência em inspeção final",
            description: "Atuação em recebimento e liberação",
          },
        ],
      });

    expect(created.status).toBe(201);
    expect(created.body.name).toContain("Maria");

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context));

    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].unitName).toBe(`Matriz ${context.prefix}`);

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${created.body.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    expect(detail.body.professionalExperiences).toHaveLength(1);
    expect(detail.body.professionalExperiences[0].title).toContain("inspeção");
  });

  it("rejects missing required fields", async () => {
    const context = await createTestContext({
      seed: "employees-required-fields",
    });
    contexts.push(context);

    const response = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: "",
        admissionDate: "",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('"name"');
  });

  it("validates department and position ownership and supports nested competency records", async () => {
    const context = await createTestContext({ seed: "employees-references" });
    contexts.push(context);

    const invalidReference = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: `João ${context.prefix}`,
        admissionDate: "2024-01-03",
        department: "Compras",
        position: "Inspetor",
      });

    expect(invalidReference.status).toBe(400);
    expect(invalidReference.body.error).toContain("Departamento");

    await createDepartment(context, { name: "Compras" });
    await createPosition(context, { name: "Inspetor" });

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context))
      .send({
        name: `João ${context.prefix}`,
        admissionDate: "2024-01-03",
        department: "Compras",
        position: "Inspetor",
      });

    expect(created.status).toBe(201);

    const competency = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${created.body.id}/competencies`,
      )
      .set(authHeader(context))
      .send({
        name: "Inspeção de recebimento",
        type: "habilidade",
        requiredLevel: 4,
        acquiredLevel: 3,
      });

    expect(competency.status).toBe(201);

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${created.body.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    expect(detail.body.competencies).toHaveLength(1);
    expect(detail.body.competencies[0].name).toBe("Inspeção de recebimento");
  });

  it("requires employee module access for non-admin users", async () => {
    const context = await createTestContext({
      seed: "employees-module-access",
      role: "analyst",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });

  it("manages competency matrix revisions, computes gaps and closes them after an effective review", async () => {
    const context = await createTestContext({
      seed: "employees-training-gaps",
    });
    contexts.push(context);

    await createDepartment(context, { name: "Qualidade" });
    const position = await createPosition(context, { name: "Auditor Interno" });
    const employee = await createEmployee(context, {
      name: `Ana ${context.prefix}`,
      department: "Qualidade",
      position: position.name,
    });

    const createRequirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName: "Auditoria interna",
        competencyType: "habilidade",
        requiredLevel: 4,
        notes: "Necessario para conduzir auditorias do SGQ",
        sortOrder: 1,
      });

    expect(createRequirement.status).toBe(201);

    const updateRequirement = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements/${createRequirement.body.id}`,
      )
      .set(authHeader(context))
      .send({
        requiredLevel: 5,
        notes: "Nivel maximo requerido",
      });

    expect(updateRequirement.status).toBe(200);
    expect(updateRequirement.body.requiredLevel).toBe(5);

    const createSecondaryRequirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({
        competencyName: "Relatorio de auditoria",
        competencyType: "habilidade",
        requiredLevel: 3,
        sortOrder: 2,
      });

    expect(createSecondaryRequirement.status).toBe(201);

    const revisionsBeforeDelete = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-matrix-revisions`,
      )
      .set(authHeader(context));

    expect(revisionsBeforeDelete.status).toBe(200);
    expect(revisionsBeforeDelete.body.length).toBeGreaterThanOrEqual(3);

    const deleteSecondaryRequirement = await request(app)
      .delete(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements/${createSecondaryRequirement.body.id}`,
      )
      .set(authHeader(context));

    expect(deleteSecondaryRequirement.status).toBe(204);

    const gapsBeforeTraining = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/competency-gaps`,
      )
      .set(authHeader(context));

    expect(gapsBeforeTraining.status).toBe(200);
    expect(gapsBeforeTraining.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: employee.id,
          competencyName: "Auditoria interna",
          requiredLevel: 5,
          acquiredLevel: 0,
          gapLevel: 5,
        }),
      ]),
    );

    const training = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/trainings`,
      )
      .set(authHeader(context))
      .send({
        title: "Formacao de Auditor Interno ISO 9001",
        objective: "Preparar colaboradora para conduzir auditorias internas",
        targetCompetencyName: "Auditoria interna",
        targetCompetencyType: "habilidade",
        targetCompetencyLevel: 5,
        evaluationMethod: "Observacao em auditoria real",
        status: "concluido",
      });

    expect(training.status).toBe(201);

    const review = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/trainings/${training.body.id}/effectiveness-reviews`,
      )
      .set(authHeader(context))
      .send({
        evaluationDate: "2024-07-01",
        score: 9,
        isEffective: true,
        resultLevel: 5,
        comments: "Demonstrou dominio na auditoria acompanhada.",
      });

    expect(review.status).toBe(201);
    expect(review.body.isEffective).toBe(true);

    const employeeDetail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${employee.id}`,
      )
      .set(authHeader(context));

    expect(employeeDetail.status).toBe(200);
    expect(employeeDetail.body.competencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Auditoria interna",
          acquiredLevel: 5,
        }),
      ]),
    );
    expect(employeeDetail.body.trainings[0].latestEffectivenessReview).toEqual(
      expect.objectContaining({
        isEffective: true,
        resultLevel: 5,
      }),
    );

    const gapsAfterReview = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/competency-gaps`,
      )
      .set(authHeader(context));

    expect(gapsAfterReview.status).toBe(200);
    expect(
      gapsAfterReview.body.data.find(
        (item: { employeeId: number; competencyName: string }) =>
          item.employeeId === employee.id &&
          item.competencyName === "Auditoria interna",
      ),
    ).toBeUndefined();
  });

  it("validates policy documents in awareness records and returns linked SGQ references on employee detail", async () => {
    const context = await createTestContext({
      seed: "employees-awareness-links",
    });
    contexts.push(context);

    const employee = await createEmployee(context, {
      name: `Bruno ${context.prefix}`,
    });
    const policyDocument = await createDocumentForTest(context, {
      type: "politica",
    });
    const supportDocument = await createDocumentForTest(context, {
      type: "manual",
    });

    const processOwner = await createTestUser(context, {
      role: "analyst",
      suffix: "process-owner",
      modules: ["governance"],
    });

    const processResponse = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/sgq-processes`,
      )
      .set(authHeader(context))
      .send({
        name: `Processo ${context.prefix}`,
        objective: "Controlar execucao do SGQ",
        ownerUserId: processOwner.id,
        inputs: ["Demandas"],
        outputs: ["Resultados"],
        interactions: [],
        changeSummary: "Cadastro inicial",
      });

    expect(processResponse.status).toBe(201);

    const [plan] = await db
      .insert(strategicPlansTable)
      .values({
        organizationId: context.organizationId,
        title: `Plano ${context.prefix}`,
        createdById: context.userId,
        updatedById: context.userId,
      })
      .returning({ id: strategicPlansTable.id });

    const [objective] = await db
      .insert(strategicPlanObjectivesTable)
      .values({
        planId: plan.id,
        code: "OBJ-1",
        description: "Fortalecer a competencia organizacional",
        sortOrder: 1,
        createdById: context.userId,
        updatedById: context.userId,
      })
      .returning({ id: strategicPlanObjectivesTable.id });

    const invalidAwareness = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/awareness`,
      )
      .set(authHeader(context))
      .send({
        topic: "Conscientizacao invalida",
        date: "2024-06-01",
        policyDocumentId: supportDocument.id,
      });

    expect(invalidAwareness.status).toBe(400);
    expect(invalidAwareness.body.error).toContain("tipo política");

    const validAwareness = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/awareness`,
      )
      .set(authHeader(context))
      .send({
        topic: "Politica da Qualidade",
        description: "Reforco de responsabilidades e impacto no SGQ.",
        date: "2024-06-01",
        policyDocumentId: policyDocument.id,
        documentId: supportDocument.id,
        processId: processResponse.body.id,
        objectiveId: objective.id,
        verificationMethod: "Checklist dialogado",
        result: "Compreendido",
      });

    expect(validAwareness.status).toBe(201);
    expect(validAwareness.body.policyDocumentId).toBe(policyDocument.id);
    expect(validAwareness.body.documentId).toBe(supportDocument.id);
    expect(validAwareness.body.processId).toBe(processResponse.body.id);
    expect(validAwareness.body.objectiveId).toBe(objective.id);

    const employeeDetail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/employees/${employee.id}`,
      )
      .set(authHeader(context));

    expect(employeeDetail.status).toBe(200);
    expect(employeeDetail.body.awareness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: "Politica da Qualidade",
          policyDocumentTitle: expect.stringContaining(context.prefix),
          documentTitle: expect.stringContaining(context.prefix),
          processName: `Processo ${context.prefix}`,
          objectiveLabel: expect.stringContaining("OBJ-1"),
        }),
      ]),
    );
  });
});

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
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
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

describe("project development routes", () => {
  it("records and approves applicability decisions for requirement 8.3", async () => {
    const context = await createTestContext({
      seed: "project-development-applicability",
    });
    contexts.push(context);

    const responsible = await createEmployee(context, {
      name: `Responsável ${context.prefix}`,
    });

    const initial = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/governance/project-development/applicability`,
      )
      .set(authHeader(context));

    expect(initial.status).toBe(200);
    expect(initial.body.workflowEnabled).toBe(false);
    expect(initial.body.history).toHaveLength(0);

    const created = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/project-development/applicability`,
      )
      .set(authHeader(context))
      .send({
        isApplicable: true,
        scopeSummary: "Desenvolvimento de novos serviços",
        justification:
          "A organização conduz desenvolvimento próprio e customizações relevantes.",
        responsibleEmployeeId: responsible.id,
        validFrom: "2026-01-01",
      });

    expect(created.status).toBe(201);
    expect(created.body.approvalStatus).toBe("pending");
    expect(created.body.responsibleEmployeeId).toBe(responsible.id);

    const approved = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/project-development/applicability/${created.body.id}/approve`,
      )
      .set(authHeader(context))
      .send({});

    expect(approved.status).toBe(200);
    expect(approved.body.approvalStatus).toBe("approved");
    expect(approved.body.isApplicable).toBe(true);

    const listed = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/governance/project-development/applicability`,
      )
      .set(authHeader(context));

    expect(listed.status).toBe(200);
    expect(listed.body.workflowEnabled).toBe(true);
    expect(listed.body.currentDecision.id).toBe(created.body.id);
    expect(listed.body.history).toHaveLength(1);
  });

  it("blocks project writes without approved applicability and allows the main F2 flow after approval", async () => {
    const context = await createTestContext({
      seed: "project-development-flow",
    });
    contexts.push(context);

    const responsible = await createEmployee(context, {
      name: `P&D ${context.prefix}`,
    });

    const blocked = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/project-development/projects`,
      )
      .set(authHeader(context))
      .send({
        title: `Projeto ${context.prefix}`,
        scope: "Criar uma nova oferta auditável.",
      });

    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toContain("item 8.3");

    const decision = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/project-development/applicability`,
      )
      .set(authHeader(context))
      .send({
        isApplicable: true,
        scopeSummary: "Linha de serviços com desenho e validação própria",
        justification:
          "Há planejamento e validação formal de serviços entregues.",
        responsibleEmployeeId: responsible.id,
      });

    expect(decision.status).toBe(201);

    const approval = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/project-development/applicability/${decision.body.id}/approve`,
      )
      .set(authHeader(context))
      .send({});

    expect(approval.status).toBe(200);

    const project = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/governance/project-development/projects`,
      )
      .set(authHeader(context))
      .send({
        projectCode: `PD-${context.prefix}`,
        title: `Projeto ${context.prefix}`,
        scope: "Controlar desenvolvimento de nova solução.",
        objective: "Validar o fluxo mínimo de P&D.",
        status: "active",
        responsibleEmployeeId: responsible.id,
      });

    expect(project.status).toBe(201);
    expect(project.body.applicabilityDecisionId).toBe(decision.body.id);

    const [input, stage, output, review, change] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${context.organizationId}/governance/project-development/projects/${project.body.id}/inputs`,
        )
        .set(authHeader(context))
        .send({
          title: "Requisitos do cliente",
          description: "Lista de requisitos e restrições iniciais.",
          source: "Cliente",
          sortOrder: 1,
        }),
      request(app)
        .post(
          `/api/organizations/${context.organizationId}/governance/project-development/projects/${project.body.id}/stages`,
        )
        .set(authHeader(context))
        .send({
          title: "Protótipo inicial",
          description: "Construção da primeira versão controlada.",
          responsibleEmployeeId: responsible.id,
          status: "in_progress",
          evidenceNote: "Ata da revisão técnica.",
          sortOrder: 1,
        }),
      request(app)
        .post(
          `/api/organizations/${context.organizationId}/governance/project-development/projects/${project.body.id}/outputs`,
        )
        .set(authHeader(context))
        .send({
          title: "Especificação aprovada",
          description: "Documento final de saída.",
          outputType: "specification",
          status: "approved",
          sortOrder: 1,
        }),
      request(app)
        .post(
          `/api/organizations/${context.organizationId}/governance/project-development/projects/${project.body.id}/reviews`,
        )
        .set(authHeader(context))
        .send({
          reviewType: "validation",
          title: "Validação com stakeholder",
          notes: "A solução atende ao escopo definido.",
          outcome: "approved",
          responsibleEmployeeId: responsible.id,
        }),
      request(app)
        .post(
          `/api/organizations/${context.organizationId}/governance/project-development/projects/${project.body.id}/changes`,
        )
        .set(authHeader(context))
        .send({
          title: "Ajuste de escopo",
          changeDescription: "Inclusão de etapa extra de verificação.",
          reason: "Risco identificado na revisão.",
          impactDescription: "Impacto moderado no cronograma.",
          status: "approved",
        }),
    ]);

    expect(input.status).toBe(201);
    expect(stage.status).toBe(201);
    expect(output.status).toBe(201);
    expect(review.status).toBe(201);
    expect(change.status).toBe(201);

    const detail = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/governance/project-development/projects/${project.body.id}`,
      )
      .set(authHeader(context));

    expect(detail.status).toBe(200);
    expect(detail.body.inputs).toHaveLength(1);
    expect(detail.body.stages).toHaveLength(1);
    expect(detail.body.outputs).toHaveLength(1);
    expect(detail.body.reviews).toHaveLength(1);
    expect(detail.body.changes).toHaveLength(1);
    expect(detail.body.stages[0].responsibleEmployeeName).toContain("P&D");
  });
});

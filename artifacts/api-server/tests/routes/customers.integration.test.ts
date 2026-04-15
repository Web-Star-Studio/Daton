import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, sgqProcessesTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createCustomer,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

async function createSgqProcess(context: TestOrgContext, name: string) {
  const [process] = await db
    .insert(sgqProcessesTable)
    .values({
      organizationId: context.organizationId,
      name,
      objective: "Controlar requisitos do cliente no SGI.",
      inputs: [],
      outputs: [],
      status: "active",
      createdById: context.userId,
      updatedById: context.userId,
    })
    .returning();

  return process;
}

describe("customers routes", () => {
  it("requires customer module access for non-admin users", async () => {
    const context = await createTestContext({
      seed: "customers-module-access",
      role: "analyst",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/customers`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });

  it("creates customers, validates references and lists only organization data", async () => {
    const context = await createTestContext({ seed: "customers-create" });
    const foreignContext = await createTestContext({
      seed: "customers-foreign",
    });
    contexts.push(context, foreignContext);

    const unit = await createUnit(context, `Unidade ${context.prefix}`);
    const process = await createSgqProcess(
      context,
      `Processo ${context.prefix}`,
    );
    const foreignUnit = await createUnit(
      foreignContext,
      `Unidade ${foreignContext.prefix}`,
    );

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/customers`)
      .set(authHeader(context))
      .send({
        personType: "pj",
        legalIdentifier: `${context.prefix}-001`,
        legalName: `Cliente ${context.prefix}`,
        responsibleName: "Responsável SGI",
        status: "active",
        criticality: "high",
      });

    expect(created.status).toBe(201);
    expect(created.body.legalName).toBe(`Cliente ${context.prefix}`);

    const requirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/customers/${created.body.id}/requirements`,
      )
      .set(authHeader(context))
      .send({
        unitId: unit.id,
        processId: process.id,
        responsibleUserId: context.userId,
        serviceType: "Prestação de serviço controlado",
        title: "Prazo de resposta acordado",
        description: "Responder solicitações críticas em até 24 horas.",
        source: "Contrato",
      });

    expect(requirement.status).toBe(201);
    expect(requirement.body.requirements).toHaveLength(1);
    expect(requirement.body.history).toHaveLength(1);

    const invalidRequirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/customers/${created.body.id}/requirements`,
      )
      .set(authHeader(context))
      .send({
        unitId: foreignUnit.id,
        serviceType: "Serviço externo",
        title: "Referência inválida",
        description: "Não deve aceitar unidade de outra organização.",
      });

    expect(invalidRequirement.status).toBe(400);
    expect(invalidRequirement.body.error).toContain("Referências inválidas");

    await createCustomer(foreignContext, {
      legalIdentifier: `${foreignContext.prefix}-001`,
      legalName: `Cliente ${foreignContext.prefix}`,
    });

    const list = await request(app)
      .get(`/api/organizations/${context.organizationId}/customers`)
      .set(authHeader(context));

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].legalName).toBe(`Cliente ${context.prefix}`);
    expect(list.body[0].requirementCount).toBe(1);
  });

  it("reviews capacity, updates requirement status and preserves history snapshots", async () => {
    const context = await createTestContext({ seed: "customers-review" });
    contexts.push(context);

    const customer = await createCustomer(context, {
      legalIdentifier: `${context.prefix}-001`,
      legalName: `Cliente ${context.prefix}`,
    });

    const createdRequirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/customers/${customer.id}/requirements`,
      )
      .set(authHeader(context))
      .send({
        serviceType: "Serviço SGI",
        title: "Requisito inicial",
        description: "Primeira versão do requisito.",
        source: "Reunião",
      });

    const requirementId = createdRequirement.body.requirements[0].id;

    const updatedRequirement = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/customers/${customer.id}/requirements/${requirementId}`,
      )
      .set(authHeader(context))
      .send({
        description: "Segunda versão do requisito.",
        changeSummary: "Detalhamento do combinado com o cliente.",
      });

    expect(updatedRequirement.status).toBe(200);
    expect(updatedRequirement.body.requirements[0].currentVersion).toBe(2);
    expect(updatedRequirement.body.history).toHaveLength(2);
    expect(updatedRequirement.body.history[0].previousSnapshot).not.toBeNull();

    const review = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/customers/${customer.id}/requirements/${requirementId}/reviews`,
      )
      .set(authHeader(context))
      .send({
        decision: "accepted_with_restrictions",
        capacityAnalysis: "Há capacidade com reforço de equipe no período.",
        restrictions: "Aceite condicionado à janela operacional definida.",
      });

    expect(review.status).toBe(201);
    expect(review.body.requirements[0].status).toBe(
      "accepted_with_restrictions",
    );
    expect(review.body.requirements[0].currentVersion).toBe(3);
    expect(review.body.reviews).toHaveLength(1);
    expect(review.body.history).toHaveLength(3);
  });
});

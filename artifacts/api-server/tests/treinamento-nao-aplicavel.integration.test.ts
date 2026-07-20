import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
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

describe("Treinamento status nao_aplicavel — motivo obrigatório", () => {
  it("rejeita nao_aplicavel sem motivo e aceita com motivo", async () => {
    const ctx = await createTestContext({ seed: "na-motivo" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Fulano` });

    const semMotivo = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({ title: `${ctx.prefix} NR-35`, status: "nao_aplicavel" });
    expect(semMotivo.status).toBe(400);

    const comMotivo = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-35`,
        status: "nao_aplicavel",
        notApplicableReason: "Colaborador não executa atividade em altura",
      });
    expect(comMotivo.status).toBe(201);
    expect(comMotivo.body.status).toBe("nao_aplicavel");
    expect(comMotivo.body.notApplicableReason).toBe(
      "Colaborador não executa atividade em altura",
    );
  });

  it("sair de nao_aplicavel limpa o motivo", async () => {
    const ctx = await createTestContext({ seed: "na-limpa-motivo" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Ciclano` });
    const criado = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-10`,
        status: "nao_aplicavel",
        notApplicableReason: "Não se aplica",
      });
    expect(criado.status).toBe(201);

    const patch = await request(app)
      .patch(
        `/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings/${criado.body.id}`,
      )
      .set(authHeader(ctx))
      .send({ status: "pendente" });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("pendente");
    expect(patch.body.notApplicableReason).toBeNull();
  });

  it("PATCH rejeita motivo vazio quando o status vigente do registro já é nao_aplicavel", async () => {
    // Cobre o caso em que `status` NÃO vem no body do PATCH (atualização
    // parcial): a regra precisa usar o status ATUAL do registro para decidir
    // se o motivo é obrigatório, e aqui o motivo enviado é string vazia.
    const ctx = await createTestContext({ seed: "na-patch-status-atual" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Beltrano` });
    const criado = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-12`,
        status: "nao_aplicavel",
        notApplicableReason: "Motivo original",
      });
    expect(criado.status).toBe(201);

    const patch = await request(app)
      .patch(
        `/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings/${criado.body.id}`,
      )
      .set(authHeader(ctx))
      .send({ notApplicableReason: "   " });
    expect(patch.status).toBe(400);
  });

  // Regressão: o mapper da resposta de treinamento enumera campos manualmente
  // (foi assim que catalogItemId/requirementId/dueDate ficaram de fora antes,
  // ver gestao-trainings-stats.integration.test.ts). notApplicableReason
  // precisa aparecer também no detalhe (GET) e no pageData da listagem
  // organizacional (GET /employees/trainings), não só em POST/PATCH.
  it("detalhe (GET) e listagem organizacional (pageData) devolvem notApplicableReason", async () => {
    const ctx = await createTestContext({ seed: "na-serializacao" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Sicrano` });
    const criado = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-33`,
        status: "nao_aplicavel",
        notApplicableReason: "Colaborador não entra em espaço confinado",
      });
    expect(criado.status).toBe(201);

    const detalhe = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx));
    expect(detalhe.status).toBe(200);
    const detalheRow = detalhe.body.find(
      (t: { id: number }) => t.id === criado.body.id,
    );
    expect(detalheRow?.notApplicableReason).toBe(
      "Colaborador não entra em espaço confinado",
    );

    const listagem = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?pageSize=50`)
      .set(authHeader(ctx));
    expect(listagem.status).toBe(200);
    const listagemRow = listagem.body.data.find(
      (t: { id: number }) => t.id === criado.body.id,
    );
    expect(listagemRow?.notApplicableReason).toBe(
      "Colaborador não entra em espaço confinado",
    );
  });
});

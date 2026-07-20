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

  // Regressão: deriveTrainingStatus sobrescrevia o status para "vencido"
  // sempre que expirationDate já tinha passado, SEM checar se o status
  // vigente era nao_aplicavel. Um treino NA com validade antiga voltava como
  // "vencido" em toda resposta (inclusive a do próprio PATCH que acabou de
  // marcá-lo como NA) — corrompendo qualquer contagem de obrigação a jusante.
  it("nao_aplicavel com expirationDate no passado não vira vencido (POST, PATCH e listagem)", async () => {
    const ctx = await createTestContext({ seed: "na-nao-vence" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Vencido` });

    const criado = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-06`,
        status: "nao_aplicavel",
        notApplicableReason: "EPI não se aplica à função",
        expirationDate: "2020-01-01",
      });
    expect(criado.status).toBe(201);
    expect(criado.body.status).toBe("nao_aplicavel");

    const patch = await request(app)
      .patch(
        `/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings/${criado.body.id}`,
      )
      .set(authHeader(ctx))
      .send({
        status: "nao_aplicavel",
        notApplicableReason: "EPI não se aplica à função",
        expirationDate: "2020-01-01",
      });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("nao_aplicavel");

    const listagem = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?pageSize=50`)
      .set(authHeader(ctx));
    expect(listagem.status).toBe(200);
    const listagemRow = listagem.body.data.find(
      (t: { id: number }) => t.id === criado.body.id,
    );
    expect(listagemRow?.status).toBe("nao_aplicavel");
  });

  // Regressão: o mapper de /effectiveness-assignment foi corrigido para
  // emitir notApplicableReason, mas nenhum teste cobria isso — este módulo já
  // perdeu campo em mapper manual duas vezes (ver testes acima).
  it("effectiveness-assignment devolve notApplicableReason na resposta", async () => {
    const ctx = await createTestContext({ seed: "na-effectiveness-assignment" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Eficacia` });

    const criado = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-20`,
        status: "nao_aplicavel",
        notApplicableReason: "Função não manuseia inflamáveis",
      });
    expect(criado.status).toBe(201);

    const assignment = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings/${criado.body.id}/effectiveness-assignment`,
      )
      .set(authHeader(ctx))
      .send({ evaluatorRole: "gestor", dueDate: "2026-08-01" });
    expect(assignment.status).toBe(200);
    expect(assignment.body.status).toBe("nao_aplicavel");
    expect(assignment.body.notApplicableReason).toBe(
      "Função não manuseia inflamáveis",
    );
  });

  // Regressão: vencidoCount/pendenteCount do statsRow e o ramo `vencido` do
  // filtro de status replicam em SQL a lógica de deriveTrainingStatus — o
  // curto-circuito de NA foi corrigido só no JS (commit 7e7dda77). Um NA com
  // expirationDate vencida continuava contado como "vencido" nas stats e
  // aparecendo em `?status=vencido` / `?onlyPendenteSemTurma=true`.
  it("NA não conta como pendente nem vencido, e não vira vencido pela validade", async () => {
    const ctx = await createTestContext({ seed: "na-fora-das-contagens" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Beltrano` });
    // NA com validade JÁ VENCIDA: não pode virar "vencido"
    await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-33`,
        status: "nao_aplicavel",
        notApplicableReason: "Não executa espaço confinado",
        expirationDate: "2020-01-01",
      });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?pageSize=50`)
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.stats.pendente).toBe(0);
    expect(res.body.stats.vencido).toBe(0);
    const row = res.body.data.find((t: { title: string }) => t.title.includes("NR-33"));
    expect(row.status).toBe("nao_aplicavel"); // não derivou para vencido

    const soPendentes = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?status=pendente&pageSize=50`)
      .set(authHeader(ctx));
    expect(soPendentes.body.data.length).toBe(0);

    const soVencidos = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?status=vencido&pageSize=50`)
      .set(authHeader(ctx));
    expect(soVencidos.body.data.length).toBe(0);

    const semTurma = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?onlyPendenteSemTurma=true&pageSize=50`)
      .set(authHeader(ctx));
    expect(semTurma.body.data.length).toBe(0);
  });

  // Regressão adicional (achada ao confirmar o código, fora da lista original
  // do brief): `expiringWithinDays` — usado tanto no filtro quanto no bucket
  // "a vencer" do painel "Por prazo" — não checava o status e contaria um NA
  // com expirationDate nos próximos N dias como "a vencer". NA "não vence",
  // então nunca deveria aparecer aqui.
  it("NA com expirationDate futura não aparece no bucket 'a vencer' (expiringWithinDays)", async () => {
    const ctx = await createTestContext({ seed: "na-fora-de-a-vencer" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Sicrano` });
    const future = new Date(Date.now() + 10 * 86400000)
      .toISOString()
      .split("T")[0];

    await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-12`,
        status: "nao_aplicavel",
        notApplicableReason: "Não opera máquinas",
        expirationDate: future,
      });

    const aVencer = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?expiringWithinDays=30&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(aVencer.status).toBe(200);
    expect(
      aVencer.body.data.find((t: { title: string }) => t.title.includes("NR-12")),
    ).toBeUndefined();
  });
});

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, employeeTrainingsTable } from "@workspace/db";
import app from "../src/app";
import { applyTrainingRequirements } from "../src/services/aprendizagem/requirements-engine";
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

  // Regressão: `stats.total` era `count(*)` cru, sem excluir nao_aplicavel —
  // única contagem do statsRow que não passava por `notNaoAplicavel`. Isso
  // inflava o "Total" exibido em Minha área e em Colaboradores > Treinamentos
  // e quebrava a invariante total === pendente+concluido+vencido, que é
  // exatamente a incoerência que a regra central (NA fora de toda contagem
  // de obrigação) existe para evitar.
  it("stats.total exclui nao_aplicavel e bate com pendente+concluido+vencido", async () => {
    const ctx = await createTestContext({ seed: "na-fora-do-total" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Total` });

    await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({ title: `${ctx.prefix} NR-01 concluido`, status: "concluido" });
    await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({ title: `${ctx.prefix} NR-06 pendente`, status: "pendente" });
    await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-33 na`,
        status: "nao_aplicavel",
        notApplicableReason: "Não executa espaço confinado",
      });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?pageSize=50`)
      .set(authHeader(ctx));
    expect(res.status).toBe(200);
    expect(res.body.stats.total).toBe(2);
    expect(res.body.stats.total).toBe(
      res.body.stats.pendente + res.body.stats.concluido + res.body.stats.vencido,
    );
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

  // Regressão: as 4 leituras de status que negavam por `<> 'concluido'`
  // ("tudo que não está concluído é pendência") contavam o NA como
  // pendência, exatamente o oposto do que a regra central pede — um treino
  // NA é invisível para toda contagem de obrigação. Este caso cobre o
  // agregado exposto como `dependencies.pendencias` no item do catálogo
  // (routes/training-catalog.ts, endpoint DELETE sem cascade — a única rota
  // que expõe esse campo; a listagem GET /training-catalog não agrega por
  // item).
  it("NA não conta como pendência no agregado do catálogo (dependencies.pendencias)", async () => {
    const ctx = await createTestContext({ seed: "na-fora-de-pendencias-catalogo" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-catalog`;

    const item = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ title: `${ctx.prefix} NR-06 catálogo` });
    expect(item.status).toBe(201);
    const itemId = item.body.id as number;

    // Precisa de alguma obrigatoriedade/turma/PAT para o DELETE sem cascade
    // recusar com 409 e expor `dependencies` (senão ele simplesmente apaga
    // o item sem nunca calcular pendencias/concluidos).
    const position = await createPosition(ctx, { name: `${ctx.prefix} Cargo` });
    const requirement = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/training-requirements`)
      .set(authHeader(ctx))
      .send({
        positionId: position.id,
        catalogItemId: itemId,
        deadlineType: "rh",
      });
    expect(requirement.status).toBe(201);

    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Marcado NA` });
    const training = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        catalogItemId: itemId,
        status: "nao_aplicavel",
        notApplicableReason: "Colaborador não exerce a atividade",
      });
    expect(training.status).toBe(201);
    expect(training.body.status).toBe("nao_aplicavel");

    const blocked = await request(app)
      .delete(`${base}/${itemId}`)
      .set(authHeader(ctx));
    expect(blocked.status).toBe(409);
    expect(blocked.body.dependencies).toEqual({
      obrigatoriedades: 1,
      turmas: 0,
      pat: 0,
      pendencias: 0,
      concluidos: 0,
    });
  });

  // Task 4: o motor de requisitos (applyTrainingRequirements) deduplicava
  // olhando só status === "pendente" — um treino marcado NA não entrava
  // nesse conjunto, então a próxima execução (admissão, mudança de cargo)
  // recriava um segundo pendente para o MESMO requisito, ressuscitando
  // exatamente o que o RH acabou de dispensar. NA precisa contar como
  // "requisito já tratado" no dedup, igual a "pendente".
  it("motor de requisitos não recria um treino marcado como não aplicável", async () => {
    const ctx = await createTestContext({ seed: "na-motor-nao-recria" });
    contexts.push(ctx);
    const position = await createPosition(ctx, {
      name: `${ctx.prefix} Motorista`,
    });
    const emp = await createEmployee(ctx, {
      name: `${ctx.prefix} Recria`,
      position: position.name,
    });

    const catalogItem = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/training-catalog`)
      .set(authHeader(ctx))
      .send({ title: `${ctx.prefix} NR-35 motor` });
    expect(catalogItem.status).toBe(201);

    const requirement = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/training-requirements`)
      .set(authHeader(ctx))
      .send({
        positionId: position.id,
        catalogItemId: catalogItem.body.id,
        deadlineType: "rh",
      });
    expect(requirement.status).toBe(201);

    // 1ª rodada: gera o pendente a partir da obrigatoriedade do cargo.
    const first = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: emp.id,
      database: db,
    });
    expect(first.generated).toBe(1);

    const afterFirst = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx));
    expect(afterFirst.body).toHaveLength(1);
    const trainingId = afterFirst.body[0].id;

    // RH declara que o requisito não se aplica a esta pessoa.
    const patch = await request(app)
      .patch(
        `/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings/${trainingId}`,
      )
      .set(authHeader(ctx))
      .send({
        status: "nao_aplicavel",
        notApplicableReason: "Não exerce atividade em altura",
      });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe("nao_aplicavel");

    // 2ª rodada (ex.: mudança de cargo): o motor NÃO pode recriar o pendente
    // para o mesmo requisito só porque ele não está mais "pendente".
    const second = await applyTrainingRequirements({
      orgId: ctx.organizationId,
      employeeId: emp.id,
      database: db,
    });
    expect(second.generated).toBe(0);

    const afterSecond = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx));
    expect(afterSecond.body).toHaveLength(1);
    expect(afterSecond.body[0].status).toBe("nao_aplicavel");
  });

  // Regressão (revisão final): boardPendentes/getEffectivenessStatus não
  // olhavam status. A condição de entrada do board de eficácia é ter
  // evaluationMethod/targetCompetencyName não-vazios — campos que são
  // snapshot do catálogo, então um treino marcado NA que veio de um item com
  // evaluationMethod preenchido continuava serializando effectivenessStatus
  // "pending", entrando em stats.effectivenessPending e aparecendo na coluna
  // "Pendentes" do board. Eficácia só faz sentido sobre treino realizado —
  // NA nunca é realizado.
  it("NA com critério de eficácia herdado do catálogo não aparece em boardColumn=pendentes nem em stats.effectivenessPending", async () => {
    const ctx = await createTestContext({ seed: "na-fora-do-board-eficacia" });
    contexts.push(ctx);
    const emp = await createEmployee(ctx, { name: `${ctx.prefix} Board` });

    const catalogItem = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/training-catalog`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-35 board`,
        evaluationMethod: "Prova prática",
      });
    expect(catalogItem.status).toBe(201);

    // Treino NA vinculado ao item: herda evaluationMethod do catálogo (o
    // mesmo caminho do motor de requisitos / snapshot no POST), sem review
    // e sem atribuição de avaliador — exatamente o "pendente" que a coluna
    // do board detectaria se não excluísse NA.
    const training = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
      .set(authHeader(ctx))
      .send({
        catalogItemId: catalogItem.body.id,
        status: "nao_aplicavel",
        notApplicableReason: "Colaborador não exerce a atividade",
      });
    expect(training.status).toBe(201);
    expect(training.body.status).toBe("nao_aplicavel");
    expect(training.body.evaluationMethod).toBe("Prova prática");

    // Também cria um pendente "normal" com o mesmo critério, para garantir
    // que o filtro exclui só o NA — não zera a coluna inteira.
    const outroEmp = await createEmployee(ctx, {
      name: `${ctx.prefix} Board Pendente`,
    });
    const pendente = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/employees/${outroEmp.id}/trainings`)
      .set(authHeader(ctx))
      .send({ catalogItemId: catalogItem.body.id });
    expect(pendente.status).toBe(201);
    expect(pendente.body.status).toBe("pendente");

    const board = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?boardColumn=pendentes&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(board.status).toBe(200);
    expect(
      board.body.data.find((t: { id: number }) => t.id === training.body.id),
    ).toBeUndefined();
    expect(
      board.body.data.find((t: { id: number }) => t.id === pendente.body.id),
    ).toBeDefined();

    const listagem = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/employees/trainings?pageSize=50`)
      .set(authHeader(ctx));
    expect(listagem.status).toBe(200);
    const naRow = listagem.body.data.find(
      (t: { id: number }) => t.id === training.body.id,
    );
    expect(naRow?.effectivenessStatus).toBeNull();
    // Só o pendente "normal" deve contar — o NA fica de fora dos dois lados.
    expect(listagem.body.stats.effectivenessPending).toBe(1);
    expect(listagem.body.stats.boardCounts.pendentes).toBe(1);
  });

  // Regressão (revisão final, item 2): mesmo defeito de mandatory_coverage no
  // agregado por colaborador (computeTrainingCompletionByEmployee), exibido
  // como `trainingCompletionPercent` na listagem de Colaboradores. O
  // comentário do arquivo diz "mirrors mandatory_coverage" — os dois
  // precisam ser corrigidos juntos, senão a % da lista de Colaboradores
  // desalinha do KPI para o mesmo colaborador.
  it("trainingCompletionPercent (listagem de Colaboradores) ignora nao_aplicavel no denominador", async () => {
    const ctx = await createTestContext({ seed: "na-fora-do-completion-colab" });
    contexts.push(ctx);
    const position = await createPosition(ctx, {
      name: `${ctx.prefix} Cargo Completion`,
    });
    const emp = await createEmployee(ctx, {
      name: `${ctx.prefix} Completion`,
      position: position.name,
    });

    const catalogItem = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/training-catalog`)
      .set(authHeader(ctx))
      .send({ title: `${ctx.prefix} NR-35 completion` });
    expect(catalogItem.status).toBe(201);

    const requirement = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/training-requirements`)
      .set(authHeader(ctx))
      .send({
        positionId: position.id,
        catalogItemId: catalogItem.body.id,
        deadlineType: "rh",
      });
    expect(requirement.status).toBe(201);
    const requirementId = requirement.body.id as number;

    // 3 obrigatoriedades concluídas + 1 marcada NA para o mesmo requisito: a
    // % exibida na lista de Colaboradores deve ser 100%, não 75%.
    await db.insert(employeeTrainingsTable).values([
      {
        employeeId: emp.id,
        title: `${ctx.prefix} Obrigatório A`,
        status: "concluido",
        requirementId,
        completionDate: "2026-01-15",
      },
      {
        employeeId: emp.id,
        title: `${ctx.prefix} Obrigatório B`,
        status: "concluido",
        requirementId,
        completionDate: "2026-01-15",
      },
      {
        employeeId: emp.id,
        title: `${ctx.prefix} Obrigatório C`,
        status: "concluido",
        requirementId,
        completionDate: "2026-01-15",
      },
      {
        employeeId: emp.id,
        title: `${ctx.prefix} Obrigatório D NA`,
        status: "nao_aplicavel",
        requirementId,
        notApplicableReason: "Não se aplica ao colaborador",
      },
    ]);

    const listagem = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees?search=${encodeURIComponent(ctx.prefix)}&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(listagem.status).toBe(200);
    const row = listagem.body.data.find(
      (e: { id: number }) => e.id === emp.id,
    );
    expect(row).toBeDefined();
    expect(row.trainingCompletionPercent).toBe(100);
  });

  // Regressão (último ajuste): boardNeedsEvaluationScope — o gate que decide
  // quais treinos entram no board via `scope=needs_evaluation` — era um OR de
  // 5 condições e nenhuma olhava o status. Um treino NA com critério de
  // eficácia (evaluationMethod herdado do catálogo, OU
  // effectivenessAssignedRole/effectivenessDueDate já atribuídos ANTES da
  // marcação como NA — o PATCH não limpa esses campos) continuava entrando no
  // escopo do board mesmo depois do RH marcar "Não aplicável" justamente para
  // parar de ser cobrado por aquele item. Avaliação de eficácia só faz
  // sentido sobre treino realizado — NA nunca é.
  it("NA com critério de eficácia não aparece em scope=needs_evaluation (nem em data, nem nas contagens do board)", async () => {
    const ctx = await createTestContext({
      seed: "na-fora-do-scope-needs-evaluation",
    });
    contexts.push(ctx);

    const catalogItem = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/training-catalog`)
      .set(authHeader(ctx))
      .send({
        title: `${ctx.prefix} NR-35 scope`,
        evaluationMethod: "Prova prática",
      });
    expect(catalogItem.status).toBe(201);

    // A: NA desde a criação, com evaluationMethod herdado do catálogo.
    const empA = await createEmployee(ctx, { name: `${ctx.prefix} Scope A` });
    const trainingA = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${empA.id}/trainings`,
      )
      .set(authHeader(ctx))
      .send({
        catalogItemId: catalogItem.body.id,
        status: "nao_aplicavel",
        notApplicableReason: "Colaborador não exerce a atividade",
      });
    expect(trainingA.status).toBe(201);
    expect(trainingA.body.status).toBe("nao_aplicavel");
    expect(trainingA.body.evaluationMethod).toBe("Prova prática");

    // B (controle): pendente normal com o mesmo critério herdado — precisa
    // continuar aparecendo, para provar que o filtro exclui só o NA.
    const empB = await createEmployee(ctx, { name: `${ctx.prefix} Scope B` });
    const trainingB = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${empB.id}/trainings`,
      )
      .set(authHeader(ctx))
      .send({ catalogItemId: catalogItem.body.id });
    expect(trainingB.status).toBe(201);
    expect(trainingB.body.status).toBe("pendente");

    // C: já tinha effectivenessAssignedRole/effectivenessDueDate atribuídos
    // (via effectiveness-assignment) ANTES de ser marcado NA.
    const empC = await createEmployee(ctx, { name: `${ctx.prefix} Scope C` });
    const trainingC = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${empC.id}/trainings`,
      )
      .set(authHeader(ctx))
      .send({ title: `${ctx.prefix} NR-20 scope` });
    expect(trainingC.status).toBe(201);

    const assignment = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${empC.id}/trainings/${trainingC.body.id}/effectiveness-assignment`,
      )
      .set(authHeader(ctx))
      .send({ evaluatorRole: "gestor", dueDate: "2026-08-01" });
    expect(assignment.status).toBe(200);
    expect(assignment.body.effectivenessAssignedRole).toBe("gestor");

    const markNA = await request(app)
      .patch(
        `/api/organizations/${ctx.organizationId}/employees/${empC.id}/trainings/${trainingC.body.id}`,
      )
      .set(authHeader(ctx))
      .send({
        status: "nao_aplicavel",
        notApplicableReason: "Função foi extinta",
      });
    expect(markNA.status).toBe(200);
    expect(markNA.body.status).toBe("nao_aplicavel");
    // O PATCH não limpa a atribuição — o campo continua preenchido no banco,
    // exatamente o caso que o brief pede para cobrir.
    expect(markNA.body.effectivenessAssignedRole).toBe("gestor");

    const board = await request(app)
      .get(
        `/api/organizations/${ctx.organizationId}/employees/trainings?scope=needs_evaluation&pageSize=50`,
      )
      .set(authHeader(ctx));
    expect(board.status).toBe(200);

    const ids = board.body.data.map((t: { id: number }) => t.id);
    expect(ids).not.toContain(trainingA.body.id);
    expect(ids).not.toContain(trainingC.body.id);
    expect(ids).toContain(trainingB.body.id);

    // pagination.total é o COUNT com as mesmas condições da listagem (scope
    // incluso, sem boardColumn) — é onde o vazamento pré-fix aparecia: A e C
    // matavam alguma das 5 condições do OR e entravam no total mesmo NA.
    expect(board.body.pagination.total).toBe(1);
    // Contagens do board (mesmo conjunto filtrado pelo scope): só B conta.
    expect(board.body.stats.boardCounts.pendentes).toBe(1);
    expect(board.body.stats.boardCounts.emAvaliacao).toBe(0);
    expect(board.body.stats.boardCounts.concluidas).toBe(0);
  });
});

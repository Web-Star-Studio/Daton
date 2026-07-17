import request from "supertest";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db, employeeTrainingsTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("training-catalog routes", () => {
  it("cria, lista, busca, edita e deleta um item do catálogo", async () => {
    const context = await createTestContext({ seed: "training-catalog" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({
        title: `Cat ${context.prefix}`,
        category: "Capacitação",
        modality: "Presencial",
        norm: "ISO 39001 §7.2",
        workloadHours: 8,
        validityMonths: 12,
        isMandatory: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeDefined();
    expect(created.body.title).toBe(`Cat ${context.prefix}`);
    expect(created.body.isMandatory).toBe(true);

    const listed = await request(app).get(base).set(authHeader(context));
    expect(listed.status).toBe(200);
    expect(
      listed.body.data.some((i: { id: number }) => i.id === created.body.id),
    ).toBe(true);
    expect(listed.body.pagination.total).toBeGreaterThanOrEqual(1);

    const fetched = await request(app)
      .get(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);

    const patched = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ status: "inativo" });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe("inativo");

    const removed = await request(app)
      .delete(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);

    const missing = await request(app)
      .get(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(missing.status).toBe(404);
  });

  it("filtra por status e busca por título", async () => {
    const context = await createTestContext({ seed: "training-catalog-filter" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    await request(app).post(base).set(authHeader(context)).send({
      title: `Ativo ${context.prefix}`,
      status: "ativo",
    });
    await request(app).post(base).set(authHeader(context)).send({
      title: `Rascunho ${context.prefix}`,
      status: "rascunho",
    });

    const onlyActive = await request(app)
      .get(`${base}?status=ativo`)
      .set(authHeader(context));
    expect(onlyActive.status).toBe(200);
    expect(
      onlyActive.body.data.every((i: { status: string }) => i.status === "ativo"),
    ).toBe(true);

    const searched = await request(app)
      .get(`${base}?search=Rascunho`)
      .set(authHeader(context));
    expect(searched.status).toBe(200);
    expect(
      searched.body.data.some((i: { title: string }) =>
        i.title.includes("Rascunho"),
      ),
    ).toBe(true);
  });

  it("bloqueia exclusão de item vinculado a uma turma (preserva histórico)", async () => {
    const context = await createTestContext({ seed: "catalog-del-guard" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const item = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `Vinculado ${context.prefix}` });
    const itemId = item.body.id as number;

    await request(app)
      .post(`/api/organizations/${context.organizationId}/training-classes`)
      .set(authHeader(context))
      .send({ catalogItemId: itemId, startDate: "2026-06-15" });

    // exclusão bloqueada enquanto houver turma vinculada
    const blocked = await request(app)
      .delete(`${base}/${itemId}`)
      .set(authHeader(context));
    expect(blocked.status).toBe(409);

    // item sem vínculos ainda pode ser excluído
    const free = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `Livre ${context.prefix}` });
    const freeDel = await request(app)
      .delete(`${base}/${free.body.id}`)
      .set(authHeader(context));
    expect(freeDel.status).toBe(204);
  });

  // Titles are NOT unique (real data has "FICHA DE INSPEÇÃO DE FROTA" twice, etc.).
  // Paginating with OFFSET over a title-only ORDER BY lets ties shift across page
  // boundaries between separate requests, so fetching all pages could return a row
  // twice and skip another — silently hiding trainings again. A stable secondary
  // order (id) must make paging deterministic: the union of all pages equals the
  // full set, exactly once.
  it("paginates deterministically when titles repeat across a page boundary", async () => {
    const context = await createTestContext({ seed: "training-catalog-dupes" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    // 25 items across 5 titles, 5 copies each. A page size of 3 (not a divisor of
    // the 5-item run) forces page boundaries to land INSIDE a run of equal titles —
    // e.g. page 1 gets 3 of the "DUP 0" copies and page 2 the other 2 — which is
    // exactly where an unstable tie order would drop or repeat a row.
    const total = 25;
    for (let i = 0; i < total; i++) {
      await request(app)
        .post(base)
        .set(authHeader(context))
        .send({ title: `DUP ${i % 5}` });
    }

    const seen = new Set<number>();
    const pageSize = 3;
    const totalPages = Math.ceil(total / pageSize);
    for (let page = 1; page <= totalPages; page++) {
      const res = await request(app)
        .get(base)
        .query({ pageSize, page })
        .set(authHeader(context));
      expect(res.status).toBe(200);
      for (const item of res.body.data as Array<{ id: number }>) {
        expect(seen.has(item.id)).toBe(false); // no duplicate across pages
        seen.add(item.id);
      }
    }
    expect(seen.size).toBe(total); // nothing skipped
  });

  it("preserva carga horária fracionada (numeric, não integer)", async () => {
    const context = await createTestContext({ seed: "training-catalog-frac" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const res = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `${context.prefix} Treino curto`, workloadHours: 0.33 });

    expect(res.status).toBe(201);
    expect(res.body.workloadHours).toBe(0.33);

    const get = await request(app)
      .get(`${base}/${res.body.id}`)
      .set(authHeader(context));
    expect(get.body.workloadHours).toBe(0.33);
  });
});

// Se o treinamento não existe mais, "cargo X deve fazer Y" deixa de fazer
// sentido: excluir o item deve levar a obrigatoriedade e as pendências ainda
// não realizadas junto — mas preservar o registro de quem já concluiu
// (histórico), só desvinculando o catalog_item_id (ON DELETE SET NULL).
describe("DELETE /training-catalog/:itemId — exclusão em cascata", () => {
  it("sem cascade, recusa com 409 e informa as contagens de dependências", async () => {
    const context = await createTestContext({ seed: "catalog-cascade-409" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const item = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `Com obrigatoriedade ${context.prefix}` });
    const itemId = item.body.id as number;

    const position = await createPosition(context, { name: "Operador" });
    await request(app)
      .post(`/api/organizations/${context.organizationId}/training-requirements`)
      .set(authHeader(context))
      .send({
        positionId: position.id,
        catalogItemId: itemId,
        deadlineType: "rh",
      });

    const blocked = await request(app)
      .delete(`${base}/${itemId}`)
      .set(authHeader(context));

    expect(blocked.status).toBe(409);
    expect(blocked.body.dependencies).toEqual({
      obrigatoriedades: 1,
      turmas: 0,
      pat: 0,
      pendencias: 0,
      concluidos: 0,
    });
  });

  it("sem cascade e sem dependências, exclui direto (204)", async () => {
    const context = await createTestContext({ seed: "catalog-cascade-free" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const item = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `Sem vínculo ${context.prefix}` });
    const itemId = item.body.id as number;

    const removed = await request(app)
      .delete(`${base}/${itemId}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);

    const missing = await request(app)
      .get(`${base}/${itemId}`)
      .set(authHeader(context));
    expect(missing.status).toBe(404);
  });

  it("com cascade=true, apaga o item + obrigatoriedade + pendência, mas preserva o concluído (histórico)", async () => {
    const context = await createTestContext({ seed: "catalog-cascade-true" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const item = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `Cascata ${context.prefix}` });
    const itemId = item.body.id as number;

    const position = await createPosition(context, { name: "Motorista" });
    const requirement = await request(app)
      .post(`/api/organizations/${context.organizationId}/training-requirements`)
      .set(authHeader(context))
      .send({
        positionId: position.id,
        catalogItemId: itemId,
        deadlineType: "rh",
      });
    const requirementId = requirement.body.id as number;

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
    });

    const [pendingTraining] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `Cascata ${context.prefix}`,
        status: "pendente",
        catalogItemId: itemId,
        requirementId,
      })
      .returning();

    const [doneTraining] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `Cascata ${context.prefix}`,
        status: "concluido",
        completionDate: "2026-01-10",
        catalogItemId: itemId,
        requirementId,
      })
      .returning();

    const removed = await request(app)
      .delete(`${base}/${itemId}`)
      .query({ cascade: "true" })
      .set(authHeader(context));
    expect(removed.status).toBe(204);

    // item some
    const missing = await request(app)
      .get(`${base}/${itemId}`)
      .set(authHeader(context));
    expect(missing.status).toBe(404);

    // obrigatoriedade some (cascade FK do banco)
    const reqCheck = await request(app)
      .get(`/api/organizations/${context.organizationId}/training-requirements`)
      .set(authHeader(context));
    expect(
      reqCheck.body.data.some((r: { id: number }) => r.id === requirementId),
    ).toBe(false);

    // pendência some
    const [pendingAfter] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.id, pendingTraining.id));
    expect(pendingAfter).toBeUndefined();

    // concluído permanece, só perde o vínculo com o catálogo (histórico preservado)
    const [doneAfter] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.id, doneTraining.id));
    expect(doneAfter).toBeDefined();
    expect(doneAfter.status).toBe("concluido");
    expect(doneAfter.catalogItemId).toBeNull();
  });

  it("cascade não apaga employee_trainings concluídos de OUTRO item do catálogo", async () => {
    const context = await createTestContext({ seed: "catalog-cascade-scope" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const itemA = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `Item A ${context.prefix}` });
    const itemB = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ title: `Item B ${context.prefix}` });

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
    });

    // pendência no item A (será removida pela cascata do item A)
    const [pendingA] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `Item A ${context.prefix}`,
        status: "pendente",
        catalogItemId: itemA.body.id,
      })
      .returning();

    // concluído no item B (não deve ser tocado pela exclusão do item A)
    const [doneB] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `Item B ${context.prefix}`,
        status: "concluido",
        completionDate: "2026-01-10",
        catalogItemId: itemB.body.id,
      })
      .returning();

    const removed = await request(app)
      .delete(`${base}/${itemA.body.id}`)
      .query({ cascade: "true" })
      .set(authHeader(context));
    expect(removed.status).toBe(204);

    const [pendingAAfter] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.id, pendingA.id));
    expect(pendingAAfter).toBeUndefined();

    const [doneBAfter] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.id, doneB.id));
    expect(doneBAfter).toBeDefined();
    expect(doneBAfter.catalogItemId).toBe(itemB.body.id);

    // item B continua existindo (só o A foi excluído)
    const itemBCheck = await request(app)
      .get(`${base}/${itemB.body.id}`)
      .set(authHeader(context));
    expect(itemBCheck.status).toBe(200);
  });

  it("respeita o escopo por organização: não apaga item de outra org", async () => {
    const contextA = await createTestContext({ seed: "catalog-cascade-org-a" });
    contexts.push(contextA);
    const contextB = await createTestContext({ seed: "catalog-cascade-org-b" });
    contexts.push(contextB);

    const item = await request(app)
      .post(`/api/organizations/${contextA.organizationId}/training-catalog`)
      .set(authHeader(contextA))
      .send({ title: `Org A ${contextA.prefix}` });
    const itemId = item.body.id as number;

    // A org A tem uma pendência e um concluído ligados a esse item. A cascata da
    // org B NÃO pode tocar em nenhum deles (guard de tenant antes das mutações).
    const employeeA = await createEmployee(contextA, {
      name: `Colab A ${contextA.prefix}`,
    });
    const [pendingA] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employeeA.id,
        title: `Org A ${contextA.prefix}`,
        status: "pendente",
        catalogItemId: itemId,
      })
      .returning();
    const [doneA] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employeeA.id,
        title: `Org A ${contextA.prefix}`,
        status: "concluido",
        completionDate: "2026-01-10",
        catalogItemId: itemId,
      })
      .returning();

    // usuário da org B tenta excluir usando a própria org no path — o item não
    // pertence a ela, então a query com organizationId=orgB não encontra nada.
    const attempt = await request(app)
      .delete(
        `/api/organizations/${contextB.organizationId}/training-catalog/${itemId}`,
      )
      .query({ cascade: "true" })
      .set(authHeader(contextB));
    expect(attempt.status).toBe(404);

    // item continua intacto na org A
    const stillThere = await request(app)
      .get(`/api/organizations/${contextA.organizationId}/training-catalog/${itemId}`)
      .set(authHeader(contextA));
    expect(stillThere.status).toBe(200);

    // e — o ponto central — os employee_trainings da org A ficam INTACTOS:
    // a pendência não foi apagada e o concluído não foi desvinculado.
    const [pendingAfter] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.id, pendingA.id));
    expect(pendingAfter).toBeDefined();
    expect(pendingAfter.catalogItemId).toBe(itemId);
    const [doneAfter] = await db
      .select()
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.id, doneA.id));
    expect(doneAfter.catalogItemId).toBe(itemId);
  });
});

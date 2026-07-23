import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, notificationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function createCatalogItem(ctx: TestOrgContext, title: string) {
  const res = await request(app)
    .post(`/api/organizations/${ctx.organizationId}/training-catalog`)
    .set(authHeader(ctx))
    .send({ title });
  return res.body.id as number;
}

/** Data a N dias de hoje (YYYY-MM-DD). Turma "a vencer em breve" só cai na
 *  lista/contadores de pendências se o início estiver dentro da janela padrão
 *  (7 dias); mais longe que isso é "upcoming" — só calendário. */
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

describe("responsável pela turma — lado do responsável", () => {
  it("turma agendada aparece nas Pendências do responsável (scope=mine)", async () => {
    const ctx = await createTestContext({ seed: "tcr-pend", role: "org_admin" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(ctx, `Treino ${ctx.prefix}`);
    const poa = await createUnit(ctx, `POA ${ctx.prefix}`);
    // O responsável precisa de login próprio para consultar as SUAS pendências.
    const resp = await createTestUser(ctx, { role: "operator", suffix: "resp" });

    const startDate = daysFromNow(3); // dentro da janela → conta como pendência
    await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({
        catalogItemId,
        code: "T-PEND",
        startDate,
        status: "agendada",
        responsibleUserId: resp.id,
        units: [{ unitId: poa.id }],
      })
      .expect(201);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias`)
      .set({ Authorization: `Bearer ${resp.token}` });
    expect(res.status).toBe(200);
    const mine = res.body.items.filter(
      (i: { source: string }) => i.source === "training_class_responsible",
    );
    expect(mine.length).toBe(1);
    expect(mine[0].title).toContain("T-PEND");
    expect(mine[0].dueDate).toBe(startDate);
    expect(res.body.counts.bySource.training_class_responsible).toBe(1);
  });

  it("turma já realizada NÃO gera pendência para o responsável", async () => {
    const ctx = await createTestContext({ seed: "tcr-done", role: "org_admin" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(ctx, `Treino ${ctx.prefix}`);
    const poa = await createUnit(ctx, `POA ${ctx.prefix}`);
    const resp = await createTestUser(ctx, { role: "operator", suffix: "resp" });

    const created = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({
        catalogItemId,
        startDate: daysFromNow(3),
        status: "agendada",
        responsibleUserId: resp.id,
        units: [{ unitId: poa.id }],
      });
    await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(ctx))
      .send({ status: "realizada" })
      .expect(200);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias`)
      .set({ Authorization: `Bearer ${resp.token}` });
    const mine = res.body.items.filter(
      (i: { source: string }) => i.source === "training_class_responsible",
    );
    expect(mine.length).toBe(0);
  });

  it("filtro responsibleUserId lista só as turmas em que ele é responsável", async () => {
    const ctx = await createTestContext({ seed: "tcr-filter", role: "org_admin" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(ctx, `Treino ${ctx.prefix}`);
    const poa = await createUnit(ctx, `POA ${ctx.prefix}`);
    const resp = await createTestUser(ctx, { role: "operator", suffix: "resp" });

    const minha = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({
        catalogItemId,
        startDate: "2026-09-01",
        responsibleUserId: resp.id,
        units: [{ unitId: poa.id }],
      });
    await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({ catalogItemId, startDate: "2026-09-02", units: [{ unitId: poa.id }] })
      .expect(201);

    const filtered = await request(app)
      .get(`${base}?responsibleUserId=${resp.id}`)
      .set(authHeader(ctx));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.map((c: { id: number }) => c.id)).toEqual([
      minha.body.id,
    ]);
  });

  it("vincular responsável gera notificação in-app para ele (e não para quem criou)", async () => {
    const ctx = await createTestContext({ seed: "tcr-notif", role: "org_admin" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(ctx, `Treino ${ctx.prefix}`);
    const poa = await createUnit(ctx, `POA ${ctx.prefix}`);
    const resp = await createTestUser(ctx, { role: "operator", suffix: "resp" });

    await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({
        catalogItemId,
        code: "T-NOTIF",
        startDate: "2026-09-01",
        responsibleUserId: resp.id,
        units: [{ unitId: poa.id }],
      })
      .expect(201);

    // A notificação é best-effort/async (void) — pequena espera antes de checar.
    await new Promise((r) => setTimeout(r, 300));

    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, ctx.organizationId),
          eq(notificationsTable.userId, resp.id),
          eq(notificationsTable.type, "training_class_responsible_assigned"),
        ),
      );
    expect(notifs.length).toBe(1);
    expect(notifs[0].title).toContain("T-NOTIF");

    // Quem criou (admin) não recebe aviso.
    const actorNotifs = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, ctx.organizationId),
          eq(notificationsTable.userId, ctx.userId),
          eq(notificationsTable.type, "training_class_responsible_assigned"),
        ),
      );
    expect(actorNotifs.length).toBe(0);
  });

  it("PATCH troca o responsável (notifica o novo) e null limpa", async () => {
    const ctx = await createTestContext({ seed: "tcr-patch", role: "org_admin" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(ctx, `Treino ${ctx.prefix}`);
    const poa = await createUnit(ctx, `POA ${ctx.prefix}`);
    const resp1 = await createTestUser(ctx, { role: "operator", suffix: "r1" });
    const resp2 = await createTestUser(ctx, { role: "operator", suffix: "r2" });

    const created = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({
        catalogItemId,
        code: "T-PATCH",
        startDate: "2026-09-01",
        responsibleUserId: resp1.id,
        units: [{ unitId: poa.id }],
      });
    const classId = created.body.id as number;

    // Troca para resp2 → notifica resp2.
    const changed = await request(app)
      .patch(`${base}/${classId}`)
      .set(authHeader(ctx))
      .send({ responsibleUserId: resp2.id });
    expect(changed.status).toBe(200);
    expect(changed.body.responsibleUserId).toBe(resp2.id);
    await new Promise((r) => setTimeout(r, 300));
    const notifsR2 = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, resp2.id),
          eq(notificationsTable.type, "training_class_responsible_assigned"),
        ),
      );
    expect(notifsR2.length).toBe(1);

    // null limpa o responsável.
    const cleared = await request(app)
      .patch(`${base}/${classId}`)
      .set(authHeader(ctx))
      .send({ responsibleUserId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.responsibleUserId).toBeNull();
    expect(cleared.body.responsibleUserName).toBeNull();
  });

  it("re-salvar a turma sem mudar o responsável NÃO gera notificação repetida", async () => {
    const ctx = await createTestContext({ seed: "tcr-renotif", role: "org_admin" });
    contexts.push(ctx);
    const base = `/api/organizations/${ctx.organizationId}/training-classes`;
    const catalogItemId = await createCatalogItem(ctx, `Treino ${ctx.prefix}`);
    const poa = await createUnit(ctx, `POA ${ctx.prefix}`);
    const resp = await createTestUser(ctx, { role: "operator", suffix: "resp" });

    const created = await request(app)
      .post(base)
      .set(authHeader(ctx))
      .send({
        catalogItemId,
        startDate: "2026-09-01",
        responsibleUserId: resp.id,
        units: [{ unitId: poa.id }],
      });
    await new Promise((r) => setTimeout(r, 200));

    // PATCH que mantém o mesmo responsável.
    await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(ctx))
      .send({ code: "T-EDIT", responsibleUserId: resp.id })
      .expect(200);
    await new Promise((r) => setTimeout(r, 200));

    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, resp.id),
          eq(notificationsTable.type, "training_class_responsible_assigned"),
        ),
      );
    expect(notifs.length).toBe(1);
  });
});

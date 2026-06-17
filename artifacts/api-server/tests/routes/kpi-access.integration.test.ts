import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, kpiIndicatorsTable, usersTable } from "@workspace/db";
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
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

afterEach(async () => {
  const cs = contexts.splice(0);
  // kpi_indicators.organization_id FK has no onDelete cascade, so cleanupTestContext
  // (which deletes the organization) would fail with a FK violation if indicators
  // still exist. Delete them first; cascade handles year_configs / monthly_values /
  // monthly_value_justifications / indicator_rollups automatically.
  for (const c of cs) {
    await db
      .delete(kpiIndicatorsTable)
      .where(eq(kpiIndicatorsTable.organizationId, c.organizationId));
  }
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

async function insertIndicator(
  orgId: number,
  opts: {
    name: string;
    unitId?: number | null;
    responsibleUserId?: number | null;
    rollupStrategy?: string | null;
    unit?: string | null;
  },
) {
  const [row] = await db
    .insert(kpiIndicatorsTable)
    .values({
      organizationId: orgId,
      name: opts.name,
      measurement: "med",
      formulaExpression: "",
      formulaVariables: [],
      unit: opts.unit ?? null,
      unitId: opts.unitId ?? null,
      responsibleUserId: opts.responsibleUserId ?? null,
      direction: "up",
      periodicity: "monthly",
      norms: [],
      rollupStrategy: opts.rollupStrategy ?? null,
    })
    .returning({ id: kpiIndicatorsTable.id });
  return row.id;
}

describe("KPI access control (integration)", () => {
  it("operador vê e opera só os seus; não toca nos de outros", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-op", modules: ["kpi"] });
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const op = await createTestUser(ctx, { role: "operator", modules: ["kpi"], suffix: "op" });

    const x = await insertIndicator(ctx.organizationId, { name: "X", unitId: filialA.id, responsibleUserId: op.id });
    const y = await insertIndicator(ctx.organizationId, { name: "Y", unitId: filialA.id, responsibleUserId: ctx.userId });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(bearer(op.token));
    expect(list.status).toBe(200);
    expect(list.body.map((i: { id: number }) => i.id).sort()).toEqual([x]);

    const okOwn = await request(app)
      .put(`/api/organizations/${ctx.organizationId}/kpi/indicators/${x}/years/2026/values`)
      .set(bearer(op.token))
      .send({ values: [{ month: 1, value: 10, inputs: {} }] });
    expect(okOwn.status).toBe(200);

    const denied = await request(app)
      .put(`/api/organizations/${ctx.organizationId}/kpi/indicators/${y}/years/2026/values`)
      .set(bearer(op.token))
      .send({ values: [{ month: 1, value: 10, inputs: {} }] });
    expect(denied.status).toBe(403);
  });

  it("gerente vê a própria filial + corporativos, não vê outra filial; não exclui corporativo", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-mgr", modules: ["kpi"] });
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const filialB = await createUnit(ctx, `B ${ctx.prefix}`);
    const mgr = await createTestUser(ctx, { role: "manager", modules: ["kpi"], suffix: "mgr" });
    await db.update(usersTable).set({ unitId: filialA.id }).where(eq(usersTable.id, mgr.id));

    const a = await insertIndicator(ctx.organizationId, { name: "A1", unitId: filialA.id });
    const b = await insertIndicator(ctx.organizationId, { name: "B1", unitId: filialB.id });
    const corp = await insertIndicator(ctx.organizationId, { name: "Corp", unit: "Corporativo", unitId: null, rollupStrategy: "average" });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(bearer(mgr.token));
    expect(list.status).toBe(200);
    const ids = list.body.map((i: { id: number }) => i.id).sort();
    expect(ids).toContain(a);
    expect(ids).toContain(corp);
    expect(ids).not.toContain(b);

    const delCorp = await request(app)
      .delete(`/api/organizations/${ctx.organizationId}/kpi/indicators/${corp}`)
      .set(bearer(mgr.token));
    expect(delCorp.status).toBe(403);

    const delOwn = await request(app)
      .delete(`/api/organizations/${ctx.organizationId}/kpi/indicators/${a}`)
      .set(bearer(mgr.token));
    expect(delOwn.status).toBe(204);
  });

  it("analista vê só os seus e não escreve", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-an", modules: ["kpi"] });
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const an = await createTestUser(ctx, { role: "analyst", modules: ["kpi"], suffix: "an" });
    const mine = await insertIndicator(ctx.organizationId, { name: "M", unitId: filialA.id, responsibleUserId: an.id });
    const other = await insertIndicator(ctx.organizationId, { name: "O", unitId: filialA.id, responsibleUserId: ctx.userId });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(bearer(an.token));
    expect(list.body.map((i: { id: number }) => i.id).sort()).toEqual([mine]);

    const write = await request(app)
      .put(`/api/organizations/${ctx.organizationId}/kpi/indicators/${mine}/years/2026/values`)
      .set(bearer(an.token))
      .send({ values: [{ month: 1, value: 1, inputs: {} }] });
    expect(write.status).toBe(403); // analyst é bloqueado por requireWriteAccess
    expect(other).toBeGreaterThan(0);
  });

  it("admin vê tudo", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-adm" }); // org_admin
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const filialB = await createUnit(ctx, `B ${ctx.prefix}`);
    const a = await insertIndicator(ctx.organizationId, { name: "A1", unitId: filialA.id });
    const b = await insertIndicator(ctx.organizationId, { name: "B1", unitId: filialB.id });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(authHeader(ctx));
    const ids = list.body.map((i: { id: number }) => i.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });
});

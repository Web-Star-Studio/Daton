import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { actionPlansTable, db, notificationsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { setPlanCoResponsibles } from "../../../src/services/action-plans/responsibles";
import { runActionPlanEscalationPass } from "../../../src/services/action-plans/escalation";

// O e-mail é best-effort e depende do Resend; aqui só interessam as notificações in-app.
vi.mock("../../../src/lib/resend", () => ({
  getResendClient: async () => ({
    client: { emails: { send: async () => ({ id: "stub" }) } },
    fromEmail: "test@daton.example",
  }),
}));

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedOverduePlan(ctx: TestOrgContext, pontoFocal: number | null): Promise<number> {
  const vencido = new Date();
  vencido.setDate(vencido.getDate() - 3);
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Ação vencida",
      status: "open",
      dueDate: vencido,
      responsibleUserId: pontoFocal,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("escalonamento com co-responsáveis", () => {
  it("cobra o ponto focal E os co-responsáveis; rodar duas vezes no mesmo dia não duplica", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-co", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const planId = await seedOverduePlan(ctx, ctx.userId);
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id, bruno.id]);

    const primeira = await runActionPlanEscalationPass(ctx.organizationId);
    expect(primeira.scanned).toBe(1); // UM plano, não três pares
    expect(primeira.alertsCreated).toBe(3); // ponto focal + 2 co-responsáveis

    const notifs = await db
      .select({ userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, ctx.organizationId),
          eq(notificationsTable.relatedEntityId, planId),
          eq(notificationsTable.type, "action_plan_overdue"),
        ),
      );
    expect(notifs.map((n) => n.userId).sort((a, b) => a - b)).toEqual(
      [ctx.userId, ana.id, bruno.id].sort((a, b) => a - b),
    );

    const segunda = await runActionPlanEscalationPass(ctx.organizationId);
    expect(segunda.alertsCreated).toBe(0);
  });

  it("cobra o co-responsável mesmo quando o plano não tem ponto focal", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-nofocal", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedOverduePlan(ctx, null);
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id]);

    const result = await runActionPlanEscalationPass(ctx.organizationId);
    expect(result.scanned).toBe(1);
    expect(result.alertsCreated).toBe(1);
  });

  it("ignora plano sem ninguém a cobrar", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-orfa", role: "org_admin" });
    contexts.push(ctx);
    await seedOverduePlan(ctx, null);

    const result = await runActionPlanEscalationPass(ctx.organizationId);
    expect(result.scanned).toBe(0);
    expect(result.alertsCreated).toBe(0);
  });
});

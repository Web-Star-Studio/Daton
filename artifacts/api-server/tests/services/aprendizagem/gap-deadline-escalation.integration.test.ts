import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import {
  db,
  employeeGapDeadlinesTable,
  employeesTable,
  notificationsTable,
} from "@workspace/db";
import app from "../../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { runGapDeadlineEscalationPass } from "../../../src/services/aprendizagem/gap-deadline-escalation";

// O e-mail é best-effort e depende do Resend; aqui só interessam as
// notificações in-app (mesmo padrão de escalation-co-responsaveis.integration.test.ts).
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

async function setDeadline(
  context: TestOrgContext,
  employeeId: number,
  body: Record<string, unknown>,
) {
  const res = await request(app)
    .post(
      `/api/organizations/${context.organizationId}/employees/${employeeId}/gaps/deadline`,
    )
    .set(authHeader(context))
    .send(body);
  expect(res.status).toBe(200);
  return res.body;
}

async function backdateDeadline(deadlineRowFilter: {
  employeeId: number;
  requirementType: string;
  requirementKey: string;
}) {
  await db
    .update(employeeGapDeadlinesTable)
    .set({ dueDate: "2020-01-01" })
    .where(
      and(
        eq(employeeGapDeadlinesTable.employeeId, deadlineRowFilter.employeeId),
        eq(
          employeeGapDeadlinesTable.requirementType,
          deadlineRowFilter.requirementType,
        ),
        eq(
          employeeGapDeadlinesTable.requirementKey,
          deadlineRowFilter.requirementKey,
        ),
      ),
    );
}

describe("runGapDeadlineEscalationPass", () => {
  it("escolaridade vencida e ainda em gap: notifica o org_admin; rodar duas vezes no mesmo dia não duplica", async () => {
    const context = await createTestContext({
      seed: "gap-esc-edu",
      role: "org_admin",
    });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Auxiliar de Pessoal ${context.prefix}`,
      education: "Ensino Médio Completo",
    });
    const employee = await createEmployee(context, {
      name: `Ana ${context.prefix}`,
      position: position.name,
      education: "Fundamental Incompleto",
    });
    await setDeadline(context, employee.id, {
      requirementType: "education",
      dueDate: "2026-01-01",
    });
    await backdateDeadline({
      employeeId: employee.id,
      requirementType: "education",
      requirementKey: "education",
    });

    const first = await runGapDeadlineEscalationPass(context.organizationId);
    expect(first.scanned).toBe(1);
    expect(first.alertsCreated).toBe(1);
    expect(first.emailsSent).toBe(1);

    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, context.organizationId),
          eq(notificationsTable.relatedEntityId, employee.id),
          eq(notificationsTable.type, "employee_gap_overdue"),
        ),
      );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(context.userId);
    expect(notifs[0].title).toContain(employee.name);
    expect(notifs[0].description).toContain("Escolaridade");

    const second = await runGapDeadlineEscalationPass(context.organizationId);
    expect(second.alertsCreated).toBe(0);
  });

  it("colaborador com gap de escolaridade E de competência: UMA notificação rolada, não duas", async () => {
    const context = await createTestContext({
      seed: "gap-esc-rollup",
      role: "org_admin",
    });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
      education: "Superior Completo",
    });
    const competencyName = `Auditoria ${context.prefix}`;
    const req = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({ competencyName, competencyType: "conhecimento", requiredLevel: 3 });
    expect(req.status).toBe(201);

    const employee = await createEmployee(context, {
      name: `Bruno ${context.prefix}`,
      position: position.name,
      education: "Médio Completo",
    });
    // Atestado abaixo do requerido -> status "gap" de verdade (não
    // "nao_classificado" — evidence é texto obrigatório desde #200).
    const evidence = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competency-requirement-evidence`,
      )
      .set(authHeader(context))
      .send({
        competencyName,
        competencyType: "conhecimento",
        requiredLevel: 3,
        acquiredLevel: 1,
        evidence: "Certificado parcial",
      });
    expect(evidence.status).toBe(201);

    await setDeadline(context, employee.id, {
      requirementType: "education",
      dueDate: "2026-01-01",
    });
    await setDeadline(context, employee.id, {
      requirementType: "competency",
      competencyName,
      competencyType: "conhecimento",
      dueDate: "2026-01-02",
    });
    await backdateDeadline({
      employeeId: employee.id,
      requirementType: "education",
      requirementKey: "education",
    });
    await backdateDeadline({
      employeeId: employee.id,
      requirementType: "competency",
      requirementKey: `${competencyName.trim().toLocaleLowerCase("pt-BR")}::conhecimento`,
    });

    const result = await runGapDeadlineEscalationPass(context.organizationId);
    expect(result.scanned).toBe(2); // 2 requisitos vencidos...
    expect(result.alertsCreated).toBe(1); // ...mas 1 notificação só

    const notifs = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.relatedEntityId, employee.id),
          eq(notificationsTable.type, "employee_gap_overdue"),
        ),
      );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].description).toContain("Escolaridade");
    expect(notifs[0].description).toContain(competencyName);
  });

  it("gap já foi atendido mas ninguém abriu a ficha (resolvedAt ainda null): a escalação self-heala e NÃO notifica", async () => {
    const context = await createTestContext({
      seed: "gap-esc-self-heal",
      role: "org_admin",
    });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
      education: "Médio Completo",
    });
    const employee = await createEmployee(context, {
      name: `Carla ${context.prefix}`,
      position: position.name,
      education: "Fundamental Incompleto",
    });
    await setDeadline(context, employee.id, {
      requirementType: "education",
      dueDate: "2026-01-01",
    });
    await backdateDeadline({
      employeeId: employee.id,
      requirementType: "education",
      requirementKey: "education",
    });

    // Colaboradora passa a atender, mas NINGUÉM chamou GET .../employees/:id
    // depois disso — resolvedAt continua null no banco.
    await db
      .update(employeesTable)
      .set({ education: "Médio Completo" })
      .where(eq(employeesTable.id, employee.id));

    const result = await runGapDeadlineEscalationPass(context.organizationId);
    expect(result.alertsCreated).toBe(0);

    const [row] = await db
      .select()
      .from(employeeGapDeadlinesTable)
      .where(eq(employeeGapDeadlinesTable.employeeId, employee.id));
    expect(row.resolvedAt).not.toBeNull();
  });

  it("cargo renomeado (match por nome quebrado): não notifica e NÃO resolve o prazo por engano", async () => {
    const context = await createTestContext({
      seed: "gap-esc-rename",
      role: "org_admin",
    });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Auxiliar Antigo ${context.prefix}`,
      education: "Ensino Médio Completo",
    });
    const employee = await createEmployee(context, {
      name: `Diego ${context.prefix}`,
      position: position.name,
      education: "Fundamental Incompleto",
    });
    await setDeadline(context, employee.id, {
      requirementType: "education",
      dueDate: "2026-01-01",
    });
    await backdateDeadline({
      employeeId: employee.id,
      requirementType: "education",
      requirementKey: "education",
    });

    const rename = await request(app)
      .patch(`/api/organizations/${context.organizationId}/positions/${position.id}`)
      .set(authHeader(context))
      .send({ name: `Auxiliar Renomeado ${context.prefix}` });
    expect(rename.status).toBe(200);

    const result = await runGapDeadlineEscalationPass(context.organizationId);
    expect(result.alertsCreated).toBe(0);

    const [row] = await db
      .select()
      .from(employeeGapDeadlinesTable)
      .where(eq(employeeGapDeadlinesTable.employeeId, employee.id));
    expect(row.resolvedAt).toBeNull();
    expect(row.dueDate).toBe("2020-01-01");
  });

  it("dois org_admin na organização: os dois recebem notificação", async () => {
    const context = await createTestContext({
      seed: "gap-esc-two-admins",
      role: "org_admin",
    });
    contexts.push(context);
    const secondAdmin = await createTestUser(context, {
      suffix: "admin2",
      role: "org_admin",
    });

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
      education: "Superior Completo",
    });
    const employee = await createEmployee(context, {
      name: `Elis ${context.prefix}`,
      position: position.name,
      education: "Médio Completo",
    });
    await setDeadline(context, employee.id, {
      requirementType: "education",
      dueDate: "2026-01-01",
    });
    await backdateDeadline({
      employeeId: employee.id,
      requirementType: "education",
      requirementKey: "education",
    });

    const result = await runGapDeadlineEscalationPass(context.organizationId);
    expect(result.alertsCreated).toBe(2);

    const notifs = await db
      .select({ userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.relatedEntityId, employee.id),
          eq(notificationsTable.type, "employee_gap_overdue"),
        ),
      );
    expect(notifs.map((n) => n.userId).sort((a, b) => a - b)).toEqual(
      [context.userId, secondAdmin.id].sort((a, b) => a - b),
    );
  });

  it("prazo dentro do prazo (não vencido) não é escalado", async () => {
    const context = await createTestContext({
      seed: "gap-esc-not-due",
      role: "org_admin",
    });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
      education: "Superior Completo",
    });
    const employee = await createEmployee(context, {
      name: `Fabio ${context.prefix}`,
      position: position.name,
      education: "Médio Completo",
    });
    await setDeadline(context, employee.id, {
      requirementType: "education",
      dueDate: "2099-01-01",
    });

    const result = await runGapDeadlineEscalationPass(context.organizationId);
    expect(result.scanned).toBe(0);
    expect(result.alertsCreated).toBe(0);
  });
});

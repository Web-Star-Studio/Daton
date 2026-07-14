import { afterEach, describe, expect, it } from "vitest";
import { db, roadSafetyFactorsTable } from "@workspace/db";
import { roadSafetyDiagnosisPendenciaProvider } from "../../../src/services/pendencias/providers/road-safety-diagnosis";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function insertFactor(
  context: TestOrgContext,
  values: {
    code: string;
    diagnosisPeriodicity: string | null;
    responsibleUserId: number | null;
  },
) {
  const [row] = await db
    .insert(roadSafetyFactorsTable)
    .values({
      organizationId: context.organizationId,
      code: values.code,
      type: "intermediate",
      name: `FATOR ${values.code}`,
      periodicity: "monthly",
      diagnosisPeriodicity: values.diagnosisPeriodicity,
      responsibleUserId: values.responsibleUserId,
      // criado há muito tempo: sem diagnóstico, já venceu
      createdAt: new Date(2024, 0, 10),
    })
    .returning();
  return row;
}

describe("Pendências: diagnóstico de fator de desempenho", () => {
  it("cobra o responsável quando o diagnóstico está vencido", async () => {
    const context = await createTestContext({ seed: "pend-diag-overdue" });
    contexts.push(context);
    const factor = await insertFactor(context, {
      code: "FD01",
      diagnosisPeriodicity: "annual",
      responsibleUserId: context.userId,
    });

    const pendencias = await roadSafetyDiagnosisPendenciaProvider.listPending({
      orgId: context.organizationId,
      responsibleUserIds: [context.userId],
      now: new Date(2026, 6, 14),
      dueSoonDays: 7,
    });

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0].id).toBe(`road_safety_diagnosis:${factor.id}`);
    expect(pendencias[0].urgency).toBe("overdue");
    expect(pendencias[0].responsibleUserId).toBe(context.userId);
    expect(pendencias[0].title).toContain("FD01");
    expect(pendencias[0].dueDate).toBe("2025-01-10");
  });

  it("ignora fator sem periodicidade de diagnóstico", async () => {
    const context = await createTestContext({ seed: "pend-diag-noperiod" });
    contexts.push(context);
    await insertFactor(context, {
      code: "FD02",
      diagnosisPeriodicity: null,
      responsibleUserId: context.userId,
    });

    const pendencias = await roadSafetyDiagnosisPendenciaProvider.listPending({
      orgId: context.organizationId,
      responsibleUserIds: [context.userId],
      now: new Date(2026, 6, 14),
      dueSoonDays: 7,
    });

    expect(pendencias).toHaveLength(0);
  });

  it("ignora fator sem responsável (não há a quem cobrar)", async () => {
    const context = await createTestContext({ seed: "pend-diag-noresp" });
    contexts.push(context);
    await insertFactor(context, {
      code: "FD03",
      diagnosisPeriodicity: "annual",
      responsibleUserId: null,
    });

    const pendencias = await roadSafetyDiagnosisPendenciaProvider.listPending({
      orgId: context.organizationId,
      responsibleUserIds: [context.userId],
      now: new Date(2026, 6, 14),
      dueSoonDays: 7,
    });

    expect(pendencias).toHaveLength(0);
  });
});

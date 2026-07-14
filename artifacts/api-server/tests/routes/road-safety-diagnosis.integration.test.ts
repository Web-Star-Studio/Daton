import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function createFactor(
  context: TestOrgContext,
  body: Record<string, unknown> = {},
): Promise<number> {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
    .set(authHeader(context))
    .send({ type: "intermediate", name: `Fator ${context.prefix}`, ...body });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("Road safety: diagnóstico do fator", () => {
  it("carimba o autor do servidor e ignora autor enviado no corpo", async () => {
    const context = await createTestContext({ seed: "rs-diag-author" });
    contexts.push(context);
    const factorId = await createFactor(context);

    const res = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`,
      )
      .set(authHeader(context))
      .send({
        content: "Frota com idade média de 6,2 anos.",
        referenceDate: "2026-07-14",
        diagnosedByUserId: 99999, // deve ser ignorado
      });

    expect(res.status).toBe(201);
    expect(res.body.diagnosedByUserId).toBe(context.userId);
    expect(res.body.content).toBe("Frota com idade média de 6,2 anos.");
    expect(res.body.referenceDate).toBe("2026-07-14");
  });

  it("devolve o histórico do mais recente para o mais antigo, com o nome do autor", async () => {
    const context = await createTestContext({ seed: "rs-diag-hist" });
    contexts.push(context);
    const factorId = await createFactor(context);
    const url = `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`;

    for (const [content, referenceDate] of [
      ["Diagnóstico antigo", "2025-01-10"],
      ["Diagnóstico recente", "2026-07-01"],
    ]) {
      const created = await request(app)
        .post(url)
        .set(authHeader(context))
        .send({ content, referenceDate });
      expect(created.status).toBe(201);
    }

    const res = await request(app).get(url).set(authHeader(context));
    expect(res.status).toBe(200);
    expect(res.body.map((d: { content: string }) => d.content)).toEqual([
      "Diagnóstico recente",
      "Diagnóstico antigo",
    ]);
    expect(res.body[0].diagnosedByUserName).toBeTruthy();
  });

  it("deriva currentDiagnosis, lastDiagnosis e o vencimento do histórico", async () => {
    const context = await createTestContext({ seed: "rs-diag-derive" });
    contexts.push(context);
    const factorId = await createFactor(context, {
      diagnosisPeriodicity: "annual",
    });

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`,
      )
      .set(authHeader(context))
      .send({ content: "Estado atual do fator", referenceDate: "2026-01-31" });

    const res = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`,
      )
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body.currentDiagnosis).toBe("Estado atual do fator");
    expect(res.body.lastDiagnosis.content).toBe("Estado atual do fator");
    expect(res.body.lastDiagnosis.referenceDate).toBe("2026-01-31");
    expect(res.body.nextDiagnosisDate).toBe("2027-01-31");
    expect(res.body.diagnosisStatus).toBe("ok");
  });

  it("fator sem periodicidade não vence", async () => {
    const context = await createTestContext({ seed: "rs-diag-none" });
    contexts.push(context);
    const factorId = await createFactor(context);

    const res = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`,
      )
      .set(authHeader(context));

    expect(res.body.nextDiagnosisDate).toBeNull();
    expect(res.body.diagnosisStatus).toBe("none");
  });

  it("cria o primeiro diagnóstico junto com o fator quando initialDiagnosis vem preenchido", async () => {
    const context = await createTestContext({ seed: "rs-diag-initial" });
    contexts.push(context);
    const factorId = await createFactor(context, {
      initialDiagnosis: "Diagnóstico inicial",
      diagnosisPeriodicity: "monthly",
    });

    const res = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`,
      )
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].content).toBe("Diagnóstico inicial");
    expect(res.body[0].diagnosedByUserId).toBe(context.userId);
  });

  it("PATCH do fator não escreve mais no diagnóstico", async () => {
    const context = await createTestContext({ seed: "rs-diag-readonly" });
    contexts.push(context);
    const factorId = await createFactor(context, {
      initialDiagnosis: "Original",
    });

    const patch = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`,
      )
      .set(authHeader(context))
      .send({
        currentDiagnosis: "Tentativa de sobrescrita",
        analysis: "nova análise",
      });

    expect(patch.status).toBe(200);
    expect(patch.body.currentDiagnosis).toBe("Original");
    expect(patch.body.analysis).toBe("nova análise");
  });

  it("fator de outra organização devolve 404", async () => {
    const a = await createTestContext({ seed: "rs-diag-org-a" });
    const b = await createTestContext({ seed: "rs-diag-org-b" });
    contexts.push(a, b);
    const factorId = await createFactor(a);

    const res = await request(app)
      .get(
        `/api/organizations/${b.organizationId}/road-safety/factors/${factorId}/diagnoses`,
      )
      .set(authHeader(b));

    expect(res.status).toBe(404);
  });
});

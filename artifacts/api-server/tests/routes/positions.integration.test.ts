import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, positionsTable, regulatoryNormsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createPosition,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

async function createNorm(orgId: number, label: string) {
  const [norm] = await db
    .insert(regulatoryNormsTable)
    .values({ organizationId: orgId, label })
    .returning();
  return norm;
}

describe("positions routes", () => {
  it("creates, updates and bulk deletes positions", async () => {
    const context = await createTestContext({ seed: "positions-crud" });
    contexts.push(context);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/positions`)
      .set(authHeader(context))
      .send({
        name: `Analista ${context.prefix}`,
        description: "Cargo inicial",
        requirements: "ISO 9001",
      });

    expect(created.status).toBe(201);
    expect(created.body.name).toContain("Analista");

    const updated = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/positions/${created.body.id}`,
      )
      .set(authHeader(context))
      .send({
        description: "Cargo atualizado",
        level: "senior",
      });

    expect(updated.status).toBe(200);
    expect(updated.body.level).toBe("senior");

    const second = await createPosition(context, {
      name: `Supervisor ${context.prefix}`,
    });

    const bulkDelete = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/positions/bulk-delete`,
      )
      .set(authHeader(context))
      .send({
        ids: [created.body.id, second.id],
      });

    expect(bulkDelete.status).toBe(200);
    expect(bulkDelete.body.deleted).toBe(2);
  });

  it("supports import conflict strategies and normalizes requirements", async () => {
    const context = await createTestContext({ seed: "positions-import" });
    contexts.push(context);
    await createPosition(context, {
      name: "Coordenador de SGQ",
      requirements: "Base antiga",
    });

    const skipped = await request(app)
      .post(`/api/organizations/${context.organizationId}/positions/import`)
      .set(authHeader(context))
      .send({
        conflictStrategy: "skip",
        positions: [
          {
            name: "Coordenador de SGQ",
            requirements: "ISO 9001; Auditoria interna",
          },
          {
            name: "Inspetor de Recebimento",
            requirements: "Inspeção; Rastreabilidade",
          },
        ],
      });

    expect(skipped.status).toBe(201);
    expect(skipped.body).toMatchObject({
      created: 1,
      skipped: 1,
      updated: 0,
      errors: 0,
    });

    const updated = await request(app)
      .post(`/api/organizations/${context.organizationId}/positions/import`)
      .set(authHeader(context))
      .send({
        conflictStrategy: "update",
        positions: [
          {
            name: "Coordenador de SGQ",
            requirements: "ISO 9001; Auditoria interna\nGestão de fornecedores",
          },
        ],
      });

    expect(updated.status).toBe(201);
    expect(updated.body.updated).toBe(1);

    const [position] = await db
      .select({ requirements: positionsTable.requirements })
      .from(positionsTable)
      .where(eq(positionsTable.name, "Coordenador de SGQ"));

    expect(position?.requirements).toContain("ISO 9001");
    expect(position?.requirements).toContain("\n");
    expect(position?.requirements).not.toContain(";");
  });

  it("requires the positions module for non-admin users", async () => {
    const context = await createTestContext({
      seed: "positions-module-access",
      role: "analyst",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/positions`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });

  it("persists area/principalNormId and returns competencyCount in the list", async () => {
    const context = await createTestContext({ seed: "positions-area" });
    contexts.push(context);
    const norm = await createNorm(context.organizationId, "ISO 9001:2015 §7.2");
    const base = `/api/organizations/${context.organizationId}/positions`;

    const created = await request(app)
      .post(base)
      .set(authHeader(context))
      .send({ name: `Motorista ${context.prefix}`, area: "Operações", principalNormId: norm.id });
    expect(created.status).toBe(201);
    expect(created.body.area).toBe("Operações");
    expect(created.body.principalNormId).toBe(norm.id);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    const row = list.body.find((p: { id: number }) => p.id === created.body.id);
    expect(row.area).toBe("Operações");
    expect(row.principalNormId).toBe(norm.id);
    expect(row.competencyCount).toBe(0);
  });

  it("rejects a norm from another organization (400)", async () => {
    const context = await createTestContext({ seed: "positions-norm-own" });
    const other = await createTestContext({ seed: "positions-norm-foreign" });
    contexts.push(context, other);
    const foreignNorm = await createNorm(other.organizationId, "ISO 14001");

    const res = await request(app)
      .post(`/api/organizations/${context.organizationId}/positions`)
      .set(authHeader(context))
      .send({ name: `Ajudante ${context.prefix}`, principalNormId: foreignNorm.id });
    expect(res.status).toBe(400);
  });
});

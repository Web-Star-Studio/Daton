import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  trainingCatalogTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
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
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("Effectiveness review — elo com múltiplas competências (achado de revisão)", () => {
  /**
   * Um item do catálogo pode comprovar VÁRIAS competências
   * (training_catalog.target_competencies). O resolvedor de conformidade já lê a
   * lista inteira. Mas o atestado DURÁVEL criado ao marcar um treino como eficaz
   * usava só a coluna singular (target_competency_name), que espelha a 1ª
   * competência da lista — a 2ª nunca ganhava atestado durável.
   *
   * Consequência real: uma habilitação com validade que comprova 2 competências,
   * ao VENCER, deixa de ser derivada pelo resolvedor (compose-on-read); só a 1ª
   * competência tem atestado durável em employee_competencies, então a 2ª
   * regride para gap e a 1ª não.
   *
   * Este teste é FALSIFICÁVEL: com o código antigo (só a coluna singular), só
   * "Direção defensiva" (1ª da lista) ganha registro durável — "Segurança
   * viária" (2ª) fica de fora.
   */
  it("marcar treino de habilitação como eficaz cria atestado durável para AS DUAS competências", async () => {
    const ctx = await createTestContext({ seed: "eff-multi-comp" });
    contexts.push(ctx);

    // Cargo exige as duas competências que o item do catálogo comprova.
    const position = await createPosition(ctx, {
      name: `Motorista Habilitado ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values([
      {
        positionId: position.id,
        competencyName: "Direção defensiva",
        competencyType: "habilidade",
        requiredLevel: 1,
        sortOrder: 1,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
      {
        positionId: position.id,
        competencyName: "Segurança viária",
        competencyType: "habilidade",
        requiredLevel: 1,
        sortOrder: 2,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
    ]);

    // Item de catálogo tipo "habilitacao" (validade obrigatória) que comprova
    // as DUAS competências. A coluna singular (mirror) só carrega a 1ª.
    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `MOPP ${ctx.prefix}`,
        evidenceType: "habilitacao",
        targetCompetencies: [
          { name: "Direção defensiva", type: "habilidade", level: 2 },
          { name: "Segurança viária", type: "habilidade", level: 3 },
        ],
        targetCompetencyName: "Direção defensiva",
        targetCompetencyType: "habilidade",
        targetCompetencyLevel: 2,
      })
      .returning();

    const employee = await createEmployee(ctx, {
      name: `João Habilitado ${ctx.prefix}`,
      position: `Motorista Habilitado ${ctx.prefix}`,
    });

    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `MOPP ${ctx.prefix}`,
        status: "concluido",
        completionDate: "2026-01-10",
        expirationDate: "2028-01-10",
        catalogItemId: catalogItem.id,
        targetCompetencyName: catalogItem.targetCompetencyName,
        targetCompetencyType: catalogItem.targetCompetencyType,
        targetCompetencyLevel: catalogItem.targetCompetencyLevel,
      })
      .returning();

    const res = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`,
      )
      .set(authHeader(ctx))
      .send({
        evaluationDate: "2026-01-15",
        isEffective: true,
        score: 9,
      });

    expect(res.status).toBe(201);

    const rows = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, employee.id));

    const byName = new Map(rows.map((r) => [r.name, r]));

    // As DUAS competências precisam ter atestado durável — não só a 1ª da lista.
    expect(rows).toHaveLength(2);
    expect(byName.has("Direção defensiva")).toBe(true);
    expect(byName.has("Segurança viária")).toBe(true);
    expect(byName.get("Direção defensiva")?.acquiredLevel).toBe(2);
    expect(byName.get("Segurança viária")?.acquiredLevel).toBe(3);
  });

  /**
   * Comportamento singular preservado: treino avulso (sem catalogItemId) segue
   * criando o atestado durável a partir das colunas singulares do próprio
   * treino, como já acontecia antes desta mudança.
   */
  it("treino avulso (sem catalogItemId) continua usando a competência singular (fallback)", async () => {
    const ctx = await createTestContext({ seed: "eff-multi-comp-fallback" });
    contexts.push(ctx);

    const employee = await createEmployee(ctx, {
      name: `Maria Avulsa ${ctx.prefix}`,
    });

    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `Treinamento avulso ${ctx.prefix}`,
        status: "concluido",
        completionDate: "2026-01-10",
        targetCompetencyName: "Primeiros socorros",
        targetCompetencyType: "habilidade",
        targetCompetencyLevel: 4,
      })
      .returning();

    const res = await request(app)
      .post(
        `/api/organizations/${ctx.organizationId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`,
      )
      .set(authHeader(ctx))
      .send({
        evaluationDate: "2026-01-15",
        isEffective: true,
      });

    expect(res.status).toBe(201);

    const rows = await db
      .select()
      .from(employeeCompetenciesTable)
      .where(eq(employeeCompetenciesTable.employeeId, employee.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Primeiros socorros");
    expect(rows[0].acquiredLevel).toBe(4);
  });
});

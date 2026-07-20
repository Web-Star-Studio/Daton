import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  trainingCatalogTable,
} from "@workspace/db";
import { resolveEmployeeCompetencies } from "../../../src/services/aprendizagem/competency-resolver";
import {
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("resolveEmployeeCompetencies", () => {
  it("um treinamento de capacitação concluído e válido PROVA a competência", async () => {
    const ctx = await createTestContext({ seed: "resolver-prova" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Direção defensiva",
      competencyType: "habilidade",
      requiredLevel: 1,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `Direção defensiva ${ctx.prefix}`,
        evidenceType: "capacitacao",
        targetCompetencies: [
          { name: "Direção defensiva", type: "habilidade", level: 1 },
        ],
      })
      .returning();

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `Direção defensiva ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2026-01-10",
      expirationDate: "2028-01-10",
      catalogItemId: catalogItem.id,
    });

    const result = await resolveEmployeeCompetencies(db, ctx.organizationId, [
      { id: employee.id, position: `Motorista ${ctx.prefix}` },
    ]);

    const conf = result.get(employee.id);
    expect(conf?.gapStatus).toBe("ok");
    expect(conf?.requirements).toHaveLength(1);
    expect(conf?.requirements[0].status).toBe("atende");
    expect(conf?.requirements[0].source).toBe("treinamento");
    expect(conf?.requirements[0].evidence?.title).toContain(
      "Direção defensiva",
    );
  });

  it("treinamento VENCIDO não prova a competência", async () => {
    const ctx = await createTestContext({ seed: "resolver-vencido" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Direção defensiva",
      competencyType: "habilidade",
      requiredLevel: 1,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `Direção defensiva ${ctx.prefix}`,
        evidenceType: "capacitacao",
        targetCompetencies: [
          { name: "Direção defensiva", type: "habilidade", level: 1 },
        ],
      })
      .returning();

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `Direção defensiva ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2020-01-10",
      expirationDate: "2022-01-10", // vencido
      catalogItemId: catalogItem.id,
    });

    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    // O item de catálogo existe e prova esta competência → é PROVÁVEL.
    // O colaborador simplesmente não a tem mais. Isso é gap de verdade.
    expect(conf?.requirements[0].status).toBe("gap");
    expect(conf?.gapStatus).toBe("gap");
  });

  it("treinamento de CONSCIENTIZAÇÃO não prova competência nenhuma", async () => {
    const ctx = await createTestContext({ seed: "resolver-dds" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Segurança viária",
      competencyType: "habilidade",
      requiredLevel: 1,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const [dds] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `DDS ${ctx.prefix}`,
        evidenceType: "conscientizacao",
        targetCompetencies: [
          { name: "Segurança viária", type: "habilidade", level: 1 },
        ], // aponta, mas conscientização NÃO prova
      })
      .returning();

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `DDS ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2026-05-01",
      catalogItemId: dds.id,
    });

    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    // Nenhum item de capacitação prova "Segurança viária" → não é provável.
    expect(conf?.requirements[0].status).toBe("nao_classificado");
    expect(conf?.gapStatus).toBe("indeterminado");
  });

  it("sem catálogo classificado, o requisito é NAO_CLASSIFICADO — nunca gap", async () => {
    const ctx = await createTestContext({ seed: "resolver-sem-mapa" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Primeiros socorros",
      competencyType: "habilidade",
      requiredLevel: 1,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    // ESTE é o caso que o motor antigo erra: sem catálogo classificado que possa
    // provar o requisito, ele devolvia "gap" em massa — por falta de dado, não
    // por lacuna real. Agora é "nao_classificado".
    expect(conf?.requirements[0].status).toBe("nao_classificado");
    expect(conf?.gapStatus).toBe("indeterminado");
  });

  it('"nao_classificado" nunca é critical, mesmo com requiredLevel >= 4', async () => {
    const ctx = await createTestContext({ seed: "resolver-nc-nao-critical" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Primeiros socorros",
      competencyType: "habilidade",
      requiredLevel: 5, // >= 4: se a fórmula fosse aplicada cegamente, viraria critical
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    // Sem catálogo classificado e sem atestado manual → nao_classificado.
    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    // gapLevel ainda é calculado (5 - 0 = 5, >= 2), e requiredLevel (5) >= 4:
    // se `critical` reaplicasse a fórmula sem checar o status, este teste
    // falharia. "Não avaliável" nunca pode contaminar a contagem de críticos.
    expect(conf?.requirements[0].status).toBe("nao_classificado");
    expect(conf?.requirements[0].gapLevel).toBe(5);
    expect(conf?.requirements[0].critical).toBe(false);
    expect(conf?.gapStatus).toBe("indeterminado");
  });

  it("atestado manual de NÍVEL 0 conta como atestado — não vira nao_classificado", async () => {
    const ctx = await createTestContext({ seed: "resolver-manual-zero" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Primeiros socorros",
      competencyType: "habilidade",
      requiredLevel: 1,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    // Nenhum item de catálogo classificado prova "Primeiros socorros" → não é
    // provável. Mas o colaborador TEM uma linha manual, registrada com nível
    // 0 (forma natural de anotar "precisa de X, hoje tem 0"). Presença da
    // linha, não o nível, é o que conta como "há atestado manual".
    await db.insert(employeeCompetenciesTable).values({
      employeeId: employee.id,
      name: "Primeiros socorros",
      type: "habilidade",
      requiredLevel: 1,
      acquiredLevel: 0,
    });

    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    // Há atestado manual (a linha existe) → NUNCA nao_classificado, mesmo
    // com acquiredLevel 0. Com a checagem antiga (`manualLevel === 0`) este
    // teste falha (retorna nao_classificado/indeterminado).
    expect(conf?.requirements[0].status).toBe("gap");
    expect(conf?.gapStatus).toBe("gap");
  });

  it("competência atestada à mão vence a ausência de treinamento", async () => {
    const ctx = await createTestContext({ seed: "resolver-manual" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "CNH categoria E",
      competencyType: "habilidade",
      requiredLevel: 1,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    await db.insert(employeeCompetenciesTable).values({
      employeeId: employee.id,
      name: "CNH categoria E",
      type: "habilidade",
      requiredLevel: 1,
      acquiredLevel: 1,
    });

    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    expect(conf?.requirements[0].status).toBe("atende");
    expect(conf?.requirements[0].source).toBe("manual");
    expect(conf?.gapStatus).toBe("ok");
  });

  it("quando o nível manual vence o de treinamento, evidence não aponta pro treino", async () => {
    const ctx = await createTestContext({ seed: "resolver-evidence-coerente" });
    contexts.push(ctx);

    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
    });
    await db.insert(positionCompetencyRequirementsTable).values({
      positionId: position.id,
      competencyName: "Direção defensiva",
      competencyType: "habilidade",
      requiredLevel: 1,
      sortOrder: 1,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `Direção defensiva ${ctx.prefix}`,
        evidenceType: "capacitacao",
        targetCompetencies: [
          { name: "Direção defensiva", type: "habilidade", level: 1 },
        ],
      })
      .returning();

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `Direção defensiva ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2026-01-10",
      expirationDate: "2028-01-10",
      catalogItemId: catalogItem.id,
    });

    // Manual vence: nível 3 > nível 1 do treinamento.
    await db.insert(employeeCompetenciesTable).values({
      employeeId: employee.id,
      name: "Direção defensiva",
      type: "habilidade",
      requiredLevel: 1,
      acquiredLevel: 3,
    });

    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    expect(conf?.requirements[0].acquiredLevel).toBe(3);
    expect(conf?.requirements[0].source).toBe("manual");
    // Evidência precisa refletir a fonte vencedora: source "manual" nunca
    // pode carregar evidence de treinamento.
    expect(conf?.requirements[0].evidence).toBeNull();
  });

  it("um treino com DUAS competências-alvo acende AS DUAS", async () => {
    const ctx = await createTestContext({ seed: "resolver-multi-comp" });
    contexts.push(ctx);

    // Cargo exige duas competências distintas.
    const position = await createPosition(ctx, {
      name: `Motorista ${ctx.prefix}`,
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

    // Um único item de catálogo comprova AS DUAS competências.
    const [catalogItem] = await db
      .insert(trainingCatalogTable)
      .values({
        organizationId: ctx.organizationId,
        title: `Direção defensiva + segurança viária ${ctx.prefix}`,
        evidenceType: "capacitacao",
        targetCompetencies: [
          { name: "Direção defensiva", type: "habilidade", level: 1 },
          { name: "Segurança viária", type: "habilidade", level: 1 },
        ],
      })
      .returning();

    const employee = await createEmployee(ctx, {
      name: `João ${ctx.prefix}`,
      position: `Motorista ${ctx.prefix}`,
    });

    // Um único treino concluído desse item.
    await db.insert(employeeTrainingsTable).values({
      employeeId: employee.id,
      title: `Direção defensiva + segurança viária ${ctx.prefix}`,
      status: "concluido",
      completionDate: "2026-01-10",
      catalogItemId: catalogItem.id,
    });

    const conf = (
      await resolveEmployeeCompetencies(db, ctx.organizationId, [
        { id: employee.id, position: `Motorista ${ctx.prefix}` },
      ])
    ).get(employee.id);

    // As DUAS competências ficam atendidas por um único treino. Se a derivação
    // lesse só a primeira competência da lista, "Segurança viária" ficaria sem
    // prova → nao_classificado, e o colaborador cairia para "indeterminado".
    expect(conf?.gapStatus).toBe("ok");
    expect(conf?.requirements).toHaveLength(2);
    expect(conf?.requirements.every((r) => r.status === "atende")).toBe(true);
    expect(conf?.requirements.every((r) => r.source === "treinamento")).toBe(
      true,
    );
  });
});

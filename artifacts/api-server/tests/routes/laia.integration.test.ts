import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  laiaAssessmentsTable,
  laiaBranchConfigsTable,
  laiaSectorsTable,
} from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map(async (context) => {
      try {
        await cleanupTestContext(context);
      } catch {
        // The shared cleanup helper references optional tables that may be absent
        // in local integration databases; ignore teardown failures in this suite.
      }
    }),
  );
});

describe("LAIA routes", () => {
  it("lists all units in branch-configs with default status and aggregated counts", async () => {
    const context = await createTestContext({ seed: "laia-branch-configs" });
    contexts.push(context);

    const unitA = await createUnit(context, `Unidade A ${context.prefix}`);
    const unitB = await createUnit(context, `Unidade B ${context.prefix}`);

    await db.insert(laiaBranchConfigsTable).values({
      organizationId: context.organizationId,
      unitId: unitA.id,
      surveyStatus: "em_levantamento",
      createdById: context.userId,
      updatedById: context.userId,
    });

    await db.insert(laiaAssessmentsTable).values([
      {
        organizationId: context.organizationId,
        unitId: unitA.id,
        aspectCode: `LAIA-${context.prefix}-A1`,
        activityOperation: "Operação A1",
        environmentalAspect: "Aspecto A1",
        environmentalImpact: "Impacto A1",
        category: "critico",
        significance: "significant",
        createdById: context.userId,
        updatedById: context.userId,
      },
      {
        organizationId: context.organizationId,
        unitId: unitA.id,
        aspectCode: `LAIA-${context.prefix}-A2`,
        activityOperation: "Operação A2",
        environmentalAspect: "Aspecto A2",
        environmentalImpact: "Impacto A2",
        category: "moderado",
        significance: "not_significant",
        createdById: context.userId,
        updatedById: context.userId,
      },
      {
        organizationId: context.organizationId,
        unitId: unitA.id,
        aspectCode: `LAIA-${context.prefix}-A3`,
        activityOperation: "Operação A3",
        environmentalAspect: "Aspecto A3",
        environmentalImpact: "Impacto A3",
        createdById: context.userId,
        updatedById: context.userId,
      },
      {
        organizationId: context.organizationId,
        unitId: unitB.id,
        aspectCode: `LAIA-${context.prefix}-B1`,
        activityOperation: "Operação B1",
        environmentalAspect: "Aspecto B1",
        environmentalImpact: "Impacto B1",
        category: "critico",
        significance: "significant",
        createdById: context.userId,
        updatedById: context.userId,
      },
    ]);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/environmental/laia/branch-configs`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);

    const configA = response.body.find((item: { unitId: number }) => item.unitId === unitA.id);
    const configB = response.body.find((item: { unitId: number }) => item.unitId === unitB.id);

    expect(configA).toMatchObject({
      unitId: unitA.id,
      unitName: unitA.name,
      surveyStatus: "em_levantamento",
      totalAssessments: 3,
      criticalAssessments: 1,
      significantAssessments: 1,
      notSignificantAssessments: 1,
    });
    expect(configB).toMatchObject({
      unitId: unitB.id,
      unitName: unitB.name,
      surveyStatus: "nao_levantado",
      totalAssessments: 1,
      criticalAssessments: 1,
      significantAssessments: 1,
      notSignificantAssessments: 0,
    });
  });

  it("upserts the survey status for a unit", async () => {
    const context = await createTestContext({ seed: "laia-branch-status" });
    contexts.push(context);

    const unit = await createUnit(context, `Unidade Status ${context.prefix}`);

    const firstPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/environmental/laia/branch-configs`)
      .set(authHeader(context))
      .send({
        items: [
          {
            unitId: unit.id,
            surveyStatus: "levantado",
          },
        ],
      });

    expect(firstPatch.status).toBe(204);

    const secondPatch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/environmental/laia/branch-configs`)
      .set(authHeader(context))
      .send({
        items: [
          {
            unitId: unit.id,
            surveyStatus: "em_levantamento",
          },
        ],
      });

    expect(secondPatch.status).toBe(204);

    const listed = await request(app)
      .get(`/api/organizations/${context.organizationId}/environmental/laia/branch-configs`)
      .set(authHeader(context));

    expect(listed.status).toBe(200);
    expect(
      listed.body.find((item: { unitId: number }) => item.unitId === unit.id),
    ).toMatchObject({
      unitId: unit.id,
      surveyStatus: "em_levantamento",
    });
  });

  it("returns a normalized overview for a unit", async () => {
    const context = await createTestContext({ seed: "laia-unit-overview" });
    contexts.push(context);

    const unit = await createUnit(context, `Unidade Overview ${context.prefix}`);

    await db.insert(laiaBranchConfigsTable).values({
      organizationId: context.organizationId,
      unitId: unit.id,
      surveyStatus: "levantado",
      createdById: context.userId,
      updatedById: context.userId,
    });

    await db.insert(laiaAssessmentsTable).values([
      {
        organizationId: context.organizationId,
        unitId: unit.id,
        aspectCode: `LAIA-${context.prefix}-O1`,
        activityOperation: "Operação O1",
        environmentalAspect: "Aspecto O1",
        environmentalImpact: "Impacto O1",
        temporality: "Futura",
        operationalSituation: "Normal",
        incidence: "Direto",
        impactClass: "Adverso",
        createdById: context.userId,
        updatedById: context.userId,
      },
      {
        organizationId: context.organizationId,
        unitId: unit.id,
        aspectCode: `LAIA-${context.prefix}-O2`,
        activityOperation: "Operação O2",
        environmentalAspect: "Aspecto O2",
        environmentalImpact: "Impacto O2",
        temporality: " futuro ",
        operationalSituation: "emergência",
        incidence: "indireta",
        impactClass: "Benéfico",
        createdById: context.userId,
        updatedById: context.userId,
      },
      {
        organizationId: context.organizationId,
        unitId: unit.id,
        aspectCode: `LAIA-${context.prefix}-O3`,
        activityOperation: "Operação O3",
        environmentalAspect: "Aspecto O3",
        environmentalImpact: "Impacto O3",
        temporality: "desconhecida",
        incidence: "externa",
        createdById: context.userId,
        updatedById: context.userId,
      },
    ]);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/environmental/laia/units/${unit.id}/overview`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      unitId: unit.id,
      unitName: unit.name,
      surveyStatus: "levantado",
      totalAssessments: 3,
      byTemporality: {
        futura: 2,
        nao_informado: 1,
      },
      byOperationalSituation: {
        normal: 1,
        emergencia: 1,
        nao_informado: 1,
      },
      byIncidence: {
        direto: 1,
        indireto: 1,
        nao_informado: 1,
      },
      byImpactClass: {
        adverso: 1,
        benefico: 1,
        nao_informado: 1,
      },
    });
  });

  it("filters sectors by unitId", async () => {
    const context = await createTestContext({ seed: "laia-sectors-filter" });
    contexts.push(context);

    const unitA = await createUnit(context, `Unidade Setor A ${context.prefix}`);
    const unitB = await createUnit(context, `Unidade Setor B ${context.prefix}`);

    await db.insert(laiaSectorsTable).values([
      {
        organizationId: context.organizationId,
        unitId: unitA.id,
        code: `SEC-A-${context.prefix}`,
        name: "Atividade A",
        isActive: true,
        createdById: context.userId,
        updatedById: context.userId,
      },
      {
        organizationId: context.organizationId,
        unitId: unitB.id,
        code: `SEC-B-${context.prefix}`,
        name: "Atividade B",
        isActive: true,
        createdById: context.userId,
        updatedById: context.userId,
      },
      {
        organizationId: context.organizationId,
        unitId: null,
        code: `SEC-G-${context.prefix}`,
        name: "Atividade Global",
        isActive: true,
        createdById: context.userId,
        updatedById: context.userId,
      },
    ]);

    const response = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/environmental/laia/sectors?unitId=${unitA.id}`,
      )
      .set(authHeader(context));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      unitId: unitA.id,
      name: "Atividade A",
    });
  });
});

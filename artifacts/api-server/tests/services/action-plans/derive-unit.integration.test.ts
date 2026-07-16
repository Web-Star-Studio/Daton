import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  employeeTrainingsTable,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
  laiaAssessmentsTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlansTable,
  swotFactorsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cleanupTestContext, createEmployee, createTestContext, createTestUser, createUnit, type TestOrgContext,
} from "../../../../../tests/support/backend";
import { deriveActionPlanUnit } from "../../../src/services/action-plans/derive-unit";

const contexts: TestOrgContext[] = [];
afterEach(async () => { await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c))); });

describe("deriveActionPlanUnit", () => {
  it("manual: herda a filial do ponto focal", async () => {
    const ctx = await createTestContext({ seed: "derive-manual" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "POA");
    const focal = await createTestUser(ctx, { suffix: "focal", role: "operator" });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, focal.id));

    expect(await deriveActionPlanUnit(ctx.organizationId, "manual", { manualContext: "x" }, focal.id)).toBe(unit.id);
  });

  it("manual sem ponto focal: corporativo (null)", async () => {
    const ctx = await createTestContext({ seed: "derive-manual-nofocal" });
    contexts.push(ctx);
    expect(await deriveActionPlanUnit(ctx.organizationId, "manual", { manualContext: "x" }, null)).toBeNull();
  });

  it("origem swot: herda a filial do fator; fator corporativo → null", async () => {
    const ctx = await createTestContext({ seed: "derive-swot" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "SBC");
    const [comFilial] = await db.insert(swotFactorsTable).values({
      organizationId: ctx.organizationId, type: "weakness", environment: "internal", description: "d", unitId: unit.id,
    }).returning({ id: swotFactorsTable.id });
    const [corp] = await db.insert(swotFactorsTable).values({
      organizationId: ctx.organizationId, type: "threat", environment: "external", description: "d", unitId: null,
    }).returning({ id: swotFactorsTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "swot", { swotFactorId: comFilial.id }, null)).toBe(unit.id);
    expect(await deriveActionPlanUnit(ctx.organizationId, "swot", { swotFactorId: corp.id }, null)).toBeNull();
  });

  it("origem kpi (via kpiIndicatorId): herda a filial do indicador; indicador corporativo → null", async () => {
    const ctx = await createTestContext({ seed: "derive-kpi-ind" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "PIR");
    const [comFilial] = await db.insert(kpiIndicatorsTable).values({
      organizationId: ctx.organizationId, name: "Indicador filial", measurement: "Taxa", direction: "up", periodicity: "monthly", unitId: unit.id,
    }).returning({ id: kpiIndicatorsTable.id });
    const [corp] = await db.insert(kpiIndicatorsTable).values({
      organizationId: ctx.organizationId, name: "Indicador corp", measurement: "Taxa", direction: "up", periodicity: "monthly", unitId: null,
    }).returning({ id: kpiIndicatorsTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "kpi", { kpiIndicatorId: comFilial.id }, null)).toBe(unit.id);
    expect(await deriveActionPlanUnit(ctx.organizationId, "kpi", { kpiIndicatorId: corp.id }, null)).toBeNull();
  });

  it("origem kpi (via kpiMonthlyValueId): resolve o indicador via year config e herda a filial", async () => {
    const ctx = await createTestContext({ seed: "derive-kpi-mv" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "MATRIZ");
    const [indicator] = await db.insert(kpiIndicatorsTable).values({
      organizationId: ctx.organizationId, name: "Indicador filial", measurement: "Taxa", direction: "up", periodicity: "monthly", unitId: unit.id,
    }).returning({ id: kpiIndicatorsTable.id });
    const [yearConfig] = await db.insert(kpiYearConfigsTable).values({
      organizationId: ctx.organizationId, indicatorId: indicator.id, year: 2026,
    }).returning({ id: kpiYearConfigsTable.id });
    const [monthlyValue] = await db.insert(kpiMonthlyValuesTable).values({
      organizationId: ctx.organizationId, yearConfigId: yearConfig.id, month: 1,
    }).returning({ id: kpiMonthlyValuesTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "kpi", { kpiMonthlyValueId: monthlyValue.id }, null)).toBe(unit.id);
  });

  it("origem risk (strategic_plan_risk_opportunity_items): herda a filial do item; item corporativo → null", async () => {
    const ctx = await createTestContext({ seed: "derive-risk" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "SBC");
    const [plan] = await db.insert(strategicPlansTable).values({
      organizationId: ctx.organizationId, title: "Plano", createdById: ctx.userId, updatedById: ctx.userId,
    }).returning({ id: strategicPlansTable.id });
    const [comFilial] = await db.insert(strategicPlanRiskOpportunityItemsTable).values({
      organizationId: ctx.organizationId, planId: plan.id, type: "risk", sourceType: "other", title: "R1", description: "d", unitId: unit.id,
    }).returning({ id: strategicPlanRiskOpportunityItemsTable.id });
    const [corp] = await db.insert(strategicPlanRiskOpportunityItemsTable).values({
      organizationId: ctx.organizationId, planId: plan.id, type: "opportunity", sourceType: "other", title: "R2", description: "d", unitId: null,
    }).returning({ id: strategicPlanRiskOpportunityItemsTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "risk", { riskOpportunityItemId: comFilial.id }, null)).toBe(unit.id);
    expect(await deriveActionPlanUnit(ctx.organizationId, "risk", { riskOpportunityItemId: corp.id }, null)).toBeNull();
  });

  it("origem environmental (laia_assessments): herda a filial da avaliação; avaliação corporativa → null", async () => {
    const ctx = await createTestContext({ seed: "derive-laia" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "POA");
    const [comFilial] = await db.insert(laiaAssessmentsTable).values({
      organizationId: ctx.organizationId, unitId: unit.id, aspectCode: `LAIA-${ctx.prefix}-1`, activityOperation: "Operação", environmentalAspect: "Aspecto", environmentalImpact: "Impacto", createdById: ctx.userId, updatedById: ctx.userId,
    }).returning({ id: laiaAssessmentsTable.id });
    const [corp] = await db.insert(laiaAssessmentsTable).values({
      organizationId: ctx.organizationId, unitId: null, aspectCode: `LAIA-${ctx.prefix}-2`, activityOperation: "Operação", environmentalAspect: "Aspecto", environmentalImpact: "Impacto", createdById: ctx.userId, updatedById: ctx.userId,
    }).returning({ id: laiaAssessmentsTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "environmental", { laiaAssessmentId: comFilial.id }, null)).toBe(unit.id);
    expect(await deriveActionPlanUnit(ctx.organizationId, "environmental", { laiaAssessmentId: corp.id }, null)).toBeNull();
  });

  it("origem training (employee_trainings): herda a filial do colaborador via join; colaborador sem filial → null", async () => {
    const ctx = await createTestContext({ seed: "derive-training" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "PIR");
    const employeeComFilial = await createEmployee(ctx, { name: "Colaborador filial", unitId: unit.id });
    const employeeCorp = await createEmployee(ctx, { name: "Colaborador corp", unitId: null });
    const [comFilial] = await db.insert(employeeTrainingsTable).values({
      employeeId: employeeComFilial.id, title: "NR-35",
    }).returning({ id: employeeTrainingsTable.id });
    const [corp] = await db.insert(employeeTrainingsTable).values({
      employeeId: employeeCorp.id, title: "NR-35",
    }).returning({ id: employeeTrainingsTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "training", { trainingId: comFilial.id }, null)).toBe(unit.id);
    expect(await deriveActionPlanUnit(ctx.organizationId, "training", { trainingId: corp.id }, null)).toBeNull();
  });

  it("origem sem entidade de filial (nonconformity): corporativo (null)", async () => {
    const ctx = await createTestContext({ seed: "derive-nc" });
    contexts.push(ctx);
    expect(await deriveActionPlanUnit(ctx.organizationId, "nonconformity", { nonconformityId: 999999 }, null)).toBeNull();
  });
});

import { and, eq } from "drizzle-orm";
import {
  db,
  employeeTrainingsTable,
  employeesTable,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
  laiaAssessmentsTable,
  strategicPlanRiskOpportunityItemsTable,
  swotFactorsTable,
  usersTable,
  type ActionPlanSourceModule,
  type ActionPlanSourceRef,
} from "@workspace/db";

/**
 * Filial do plano, derivada na criação (e no backfill), FIXA depois.
 * - Origem com filial → a filial da entidade de origem (pode ser null = corporativo).
 * - Manual (e a família manual: improvement/corrective/norm_requirement) → a
 *   filial do ponto focal (null se não houver ponto focal).
 * - Origens org-level (nonconformity, audit_finding, road_safety, rac, incident) → null.
 * Sem fallback cruzado: origem-sem-filial NÃO cai no ponto focal (decisão da cliente).
 */
export async function deriveActionPlanUnit(
  orgId: number,
  sourceModule: ActionPlanSourceModule,
  sourceRef: ActionPlanSourceRef,
  pontoFocalUserId: number | null,
): Promise<number | null> {
  switch (sourceModule) {
    // Família manual: sem entidade de origem, herda a filial do ponto focal.
    case "manual":
    case "improvement":
    case "corrective":
    case "norm_requirement": {
      if (pontoFocalUserId == null) return null;
      const [u] = await db
        .select({ unitId: usersTable.unitId })
        .from(usersTable)
        .where(and(eq(usersTable.id, pontoFocalUserId), eq(usersTable.organizationId, orgId)));
      return u?.unitId ?? null;
    }
    case "kpi": {
      // Preferir kpiIndicatorId; senão resolver via kpiMonthlyValueId.
      if (typeof sourceRef.kpiIndicatorId === "number") {
        const [r] = await db
          .select({ unitId: kpiIndicatorsTable.unitId })
          .from(kpiIndicatorsTable)
          .where(and(eq(kpiIndicatorsTable.id, sourceRef.kpiIndicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
        return r?.unitId ?? null;
      }
      if (typeof sourceRef.kpiMonthlyValueId === "number") {
        const [r] = await db
          .select({ unitId: kpiIndicatorsTable.unitId })
          .from(kpiMonthlyValuesTable)
          .innerJoin(kpiYearConfigsTable, eq(kpiYearConfigsTable.id, kpiMonthlyValuesTable.yearConfigId))
          .innerJoin(kpiIndicatorsTable, eq(kpiIndicatorsTable.id, kpiYearConfigsTable.indicatorId))
          .where(and(eq(kpiMonthlyValuesTable.id, sourceRef.kpiMonthlyValueId), eq(kpiMonthlyValuesTable.organizationId, orgId)));
        return r?.unitId ?? null;
      }
      return null;
    }
    case "swot": {
      if (typeof sourceRef.swotFactorId !== "number") return null;
      const [r] = await db
        .select({ unitId: swotFactorsTable.unitId })
        .from(swotFactorsTable)
        .where(and(eq(swotFactorsTable.id, sourceRef.swotFactorId), eq(swotFactorsTable.organizationId, orgId)));
      return r?.unitId ?? null;
    }
    case "risk": {
      if (typeof sourceRef.riskOpportunityItemId !== "number") return null;
      // strategic_plan_risk_opportunity_items TEM organizationId (confirmado no
      // schema e usado em source-context.ts) — filtra por org como as demais origens.
      const [r] = await db
        .select({ unitId: strategicPlanRiskOpportunityItemsTable.unitId })
        .from(strategicPlanRiskOpportunityItemsTable)
        .where(and(
          eq(strategicPlanRiskOpportunityItemsTable.id, sourceRef.riskOpportunityItemId),
          eq(strategicPlanRiskOpportunityItemsTable.organizationId, orgId),
        ));
      return r?.unitId ?? null;
    }
    case "environmental": {
      if (typeof sourceRef.laiaAssessmentId !== "number") return null;
      const [r] = await db
        .select({ unitId: laiaAssessmentsTable.unitId })
        .from(laiaAssessmentsTable)
        .where(and(eq(laiaAssessmentsTable.id, sourceRef.laiaAssessmentId), eq(laiaAssessmentsTable.organizationId, orgId)));
      return r?.unitId ?? null;
    }
    case "training": {
      if (typeof sourceRef.trainingId !== "number") return null;
      // employee_trainings não tem organizationId direto — filtra pela org do
      // colaborador (mesmo padrão de source-context.ts).
      const [r] = await db
        .select({ unitId: employeesTable.unitId })
        .from(employeeTrainingsTable)
        .innerJoin(employeesTable, eq(employeesTable.id, employeeTrainingsTable.employeeId))
        .where(and(eq(employeeTrainingsTable.id, sourceRef.trainingId), eq(employeesTable.organizationId, orgId)));
      return r?.unitId ?? null;
    }
    // Org-level / sem entidade de filial → corporativo.
    case "nonconformity":
    case "audit_finding":
    case "road_safety":
    case "incident":
    case "rac":
      return null;
    default: {
      // Exaustividade: se um novo ActionPlanSourceModule for adicionado sem
      // cobertura aqui, o TS aponta o erro nesta linha (never).
      const _exhaustive: never = sourceModule;
      return _exhaustive;
    }
  }
}

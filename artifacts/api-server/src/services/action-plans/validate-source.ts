import { and, eq } from "drizzle-orm";
import {
  db,
  employeeTrainingsTable,
  employeesTable,
  internalAuditFindingsTable,
  kpiMonthlyValuesTable,
  laiaAssessmentsTable,
  nonconformitiesTable,
  roadSafetyFactorsTable,
  strategicPlanRiskOpportunityItemsTable,
  swotFactorsTable,
  type ActionPlanSourceModule,
  type ActionPlanSourceRef,
} from "@workspace/db";

/**
 * Validate that the origin reference is well-formed and points to an entity in
 * this org. Returns a PT error message (→ HTTP 400) or null when valid. Keeps
 * the route handler free of per-origin branching.
 */
export async function validateSourceRef(
  orgId: number,
  sourceModule: ActionPlanSourceModule,
  ref: ActionPlanSourceRef,
): Promise<string | null> {
  switch (sourceModule) {
    case "kpi": {
      if (typeof ref.kpiMonthlyValueId !== "number") return "sourceRef.kpiMonthlyValueId é obrigatório quando sourceModule=kpi";
      const [row] = await db.select({ id: kpiMonthlyValuesTable.id }).from(kpiMonthlyValuesTable)
        .where(and(eq(kpiMonthlyValuesTable.id, ref.kpiMonthlyValueId), eq(kpiMonthlyValuesTable.organizationId, orgId))).limit(1);
      return row ? null : "Célula KPI de origem não encontrada nesta organização";
    }
    case "swot": {
      if (typeof ref.swotFactorId !== "number") return "sourceRef.swotFactorId é obrigatório quando sourceModule=swot";
      const [row] = await db.select({ id: swotFactorsTable.id }).from(swotFactorsTable)
        .where(and(eq(swotFactorsTable.id, ref.swotFactorId), eq(swotFactorsTable.organizationId, orgId))).limit(1);
      return row ? null : "Fator SWOT de origem não encontrado nesta organização";
    }
    case "nonconformity": {
      if (typeof ref.nonconformityId !== "number") return "sourceRef.nonconformityId é obrigatório quando sourceModule=nonconformity";
      const [row] = await db.select({ id: nonconformitiesTable.id }).from(nonconformitiesTable)
        .where(and(eq(nonconformitiesTable.id, ref.nonconformityId), eq(nonconformitiesTable.organizationId, orgId))).limit(1);
      return row ? null : "Não conformidade de origem não encontrada nesta organização";
    }
    case "audit_finding": {
      if (typeof ref.auditFindingId !== "number") return "sourceRef.auditFindingId é obrigatório quando sourceModule=audit_finding";
      const [row] = await db.select({ id: internalAuditFindingsTable.id }).from(internalAuditFindingsTable)
        .where(and(eq(internalAuditFindingsTable.id, ref.auditFindingId), eq(internalAuditFindingsTable.organizationId, orgId))).limit(1);
      return row ? null : "Achado de auditoria de origem não encontrado nesta organização";
    }
    case "risk": {
      if (typeof ref.riskOpportunityItemId !== "number") return "sourceRef.riskOpportunityItemId é obrigatório quando sourceModule=risk";
      const [row] = await db.select({ id: strategicPlanRiskOpportunityItemsTable.id }).from(strategicPlanRiskOpportunityItemsTable)
        .where(and(eq(strategicPlanRiskOpportunityItemsTable.id, ref.riskOpportunityItemId), eq(strategicPlanRiskOpportunityItemsTable.organizationId, orgId))).limit(1);
      return row ? null : "Risco/oportunidade de origem não encontrado nesta organização";
    }
    case "training": {
      if (typeof ref.trainingId !== "number") return "sourceRef.trainingId é obrigatório quando sourceModule=training";
      const [row] = await db.select({ id: employeeTrainingsTable.id }).from(employeeTrainingsTable)
        .innerJoin(employeesTable, eq(employeesTable.id, employeeTrainingsTable.employeeId))
        .where(and(eq(employeeTrainingsTable.id, ref.trainingId), eq(employeesTable.organizationId, orgId))).limit(1);
      return row ? null : "Treinamento de origem não encontrado nesta organização";
    }
    case "environmental": {
      if (typeof ref.laiaAssessmentId !== "number") return "sourceRef.laiaAssessmentId é obrigatório quando sourceModule=environmental";
      const [row] = await db.select({ id: laiaAssessmentsTable.id }).from(laiaAssessmentsTable)
        .where(and(eq(laiaAssessmentsTable.id, ref.laiaAssessmentId), eq(laiaAssessmentsTable.organizationId, orgId))).limit(1);
      return row ? null : "Aspecto ambiental de origem não encontrado nesta organização";
    }
    case "road_safety": {
      if (typeof ref.roadSafetyFactorId !== "number") return "sourceRef.roadSafetyFactorId é obrigatório quando sourceModule=road_safety";
      const [row] = await db.select({ id: roadSafetyFactorsTable.id }).from(roadSafetyFactorsTable)
        .where(and(eq(roadSafetyFactorsTable.id, ref.roadSafetyFactorId), eq(roadSafetyFactorsTable.organizationId, orgId))).limit(1);
      return row ? null : "Fator de segurança viária de origem não encontrado nesta organização";
    }
    case "incident":
    case "manual":
      return null; // free-form origins, no entity to validate
    default:
      return null;
  }
}

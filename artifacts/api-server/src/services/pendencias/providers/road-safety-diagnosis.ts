import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  roadSafetyFactorDiagnosesTable,
  roadSafetyFactorsTable,
} from "@workspace/db";
import {
  diagnosisStatus,
  nextDiagnosisDate,
} from "../../road-safety/diagnosis";
import {
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

/**
 * Cobra a revisão do diagnóstico do Fator de Desempenho (ISO 39001 §6.3).
 * Fator sem periodicidade de diagnóstico não vence; fator sem responsável não
 * tem a quem cobrar — os dois casos ficam de fora.
 */
export const roadSafetyDiagnosisPendenciaProvider: PendenciaProvider = {
  source: "road_safety_diagnosis",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];

    const factors = await db
      .select({
        id: roadSafetyFactorsTable.id,
        code: roadSafetyFactorsTable.code,
        name: roadSafetyFactorsTable.name,
        createdAt: roadSafetyFactorsTable.createdAt,
        diagnosisPeriodicity: roadSafetyFactorsTable.diagnosisPeriodicity,
        responsibleUserId: roadSafetyFactorsTable.responsibleUserId,
      })
      .from(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.organizationId, ctx.orgId),
          isNotNull(roadSafetyFactorsTable.diagnosisPeriodicity),
          isNotNull(roadSafetyFactorsTable.responsibleUserId),
          inArray(
            roadSafetyFactorsTable.responsibleUserId,
            ctx.responsibleUserIds,
          ),
        ),
      );
    if (factors.length === 0) return [];

    const diagnoses = await db
      .select({
        factorId: roadSafetyFactorDiagnosesTable.factorId,
        referenceDate: roadSafetyFactorDiagnosesTable.referenceDate,
      })
      .from(roadSafetyFactorDiagnosesTable)
      .where(
        inArray(
          roadSafetyFactorDiagnosesTable.factorId,
          factors.map((f) => f.id),
        ),
      );

    /** Data do diagnóstico mais recente de cada fator (string date-only ordena lexicograficamente). */
    const latestByFactor = new Map<number, string>();
    for (const d of diagnoses) {
      const current = latestByFactor.get(d.factorId);
      if (!current || d.referenceDate > current) {
        latestByFactor.set(d.factorId, d.referenceDate);
      }
    }

    const pendencias: Pendencia[] = [];
    for (const f of factors) {
      const dueDate = nextDiagnosisDate({
        periodicity: f.diagnosisPeriodicity,
        factorCreatedAt: f.createdAt,
        lastReferenceDate: latestByFactor.get(f.id) ?? null,
      });
      const status = diagnosisStatus(dueDate, ctx.now, ctx.dueSoonDays);
      if (status !== "overdue" && status !== "due_soon") continue;

      pendencias.push({
        id: `road_safety_diagnosis:${f.id}`,
        source: "road_safety_diagnosis",
        sourceLabel: SOURCE_LABELS.road_safety_diagnosis,
        title: `Diagnóstico do ${f.code} — ${f.name}`,
        statusLabel: status === "overdue" ? "Vencido" : "A vencer",
        dueDate,
        urgency: status,
        responsibleUserId: f.responsibleUserId as number,
        link: {
          route: "/app/fatores-desempenho",
          ctaLabel: "Revisar diagnóstico",
        },
        meta: { factorId: f.id, code: f.code },
      });
    }
    return pendencias;
  },
};

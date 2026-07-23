import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassUnitsTable,
  unitsTable,
} from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

const ROUTE = "/aprendizagem/turmas";

/** Turmas que ainda pedem ação do responsável (não as já realizadas/canceladas). */
const OPEN_STATUSES = ["agendada", "em_andamento"];

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
};

/**
 * Pendência do RESPONSÁVEL POR FILIAL de uma turma: quando um usuário é definido
 * responsável por uma filial numa turma ainda aberta (agendada ou em andamento),
 * essa turma aparece nas Pendências dele para acompanhar a preparação.
 *
 * O "prazo" é a data de início da turma — é quando a responsabilidade dele
 * (turma pronta, gente inscrita) precisa estar resolvida. Uma linha por
 * (turma × filial) em que ele é responsável: se a mesma pessoa cuida de duas
 * filiais na mesma turma, ela vê as duas — são responsabilidades distintas.
 */
export const trainingClassResponsiblePendenciaProvider: PendenciaProvider = {
  source: "training_class_responsible",

  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];

    const rows = await db
      .select({
        classId: trainingClassesTable.id,
        code: trainingClassesTable.code,
        startDate: trainingClassesTable.startDate,
        status: trainingClassesTable.status,
        title: trainingCatalogTable.title,
        unitId: trainingClassUnitsTable.unitId,
        unitName: unitsTable.name,
        responsibleUserId: trainingClassUnitsTable.responsibleUserId,
      })
      .from(trainingClassUnitsTable)
      .innerJoin(
        trainingClassesTable,
        eq(trainingClassesTable.id, trainingClassUnitsTable.classId),
      )
      .innerJoin(
        trainingCatalogTable,
        eq(trainingCatalogTable.id, trainingClassesTable.catalogItemId),
      )
      .leftJoin(unitsTable, eq(unitsTable.id, trainingClassUnitsTable.unitId))
      .where(
        and(
          eq(trainingClassesTable.organizationId, ctx.orgId),
          isNotNull(trainingClassUnitsTable.responsibleUserId),
          inArray(
            trainingClassUnitsTable.responsibleUserId,
            ctx.responsibleUserIds,
          ),
          inArray(trainingClassesTable.status, OPEN_STATUSES),
        ),
      );

    return rows.map((r): Pendencia => {
      const ref = r.code ? ` — ${r.code}` : "";
      return {
        id: `training_class_responsible:${r.classId}:${r.unitId}`,
        source: "training_class_responsible",
        sourceLabel: SOURCE_LABELS.training_class_responsible,
        title: `${r.title}${ref}`,
        subtitle: r.unitName ?? undefined,
        statusLabel: STATUS_LABEL[r.status] ?? r.status,
        // Prazo = início da turma: é quando a preparação precisa estar pronta.
        dueDate: r.startDate,
        urgency: classifyUrgency(r.startDate, ctx.now, ctx.dueSoonDays),
        responsibleUserId: r.responsibleUserId!,
        link: { route: ROUTE, ctaLabel: "Abrir turma" },
        meta: {
          classId: r.classId,
          unitId: r.unitId,
        },
      };
    });
  },
};

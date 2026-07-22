/**
 * Prazo de regularização de gap (escolaridade ou competência do cargo) —
 * Fase 1 (persistência + self-healing). A Fase 2 (escalonamento diário +
 * notificação ao admin quando vencer sem o gap resolvido, mirando
 * services/action-plans/escalation.ts) ainda não existe.
 *
 * `requirementKey` identifica QUAL gap dentro do tipo: "education" (fixo,
 * um único gap de escolaridade por colaborador) ou a chave normalizada de
 * `buildCompetencyKey` (nome::tipo) para competência — mesma chave que o
 * resolvedor de competência já usa, sem precisar de FK numérica porque o
 * requisito do cargo pode ser editado/removido depois de o prazo existir.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, employeeGapDeadlinesTable } from "@workspace/db";
import { buildCompetencyKey } from "./competency-resolver";

export type GapRequirementType = "education" | "competency";

const EDUCATION_REQUIREMENT_KEY = "education";

type Db = Pick<typeof db, "select" | "insert" | "update">;

export type GapDeadlineRow = typeof employeeGapDeadlinesTable.$inferSelect;

export function buildGapRequirementKey(
  requirementType: GapRequirementType,
  competencyName?: string | null,
  competencyType?: string | null,
): string {
  if (requirementType === "education") return EDUCATION_REQUIREMENT_KEY;
  return buildCompetencyKey(competencyName, competencyType);
}

function rowMapKey(requirementType: string, requirementKey: string): string {
  return `${requirementType}::${requirementKey}`;
}

/** Todos os prazos do colaborador, indexados por `requirementType::requirementKey`. */
export async function loadGapDeadlinesForEmployee(
  database: Db,
  employeeId: number,
): Promise<Map<string, GapDeadlineRow>> {
  const rows = await database
    .select()
    .from(employeeGapDeadlinesTable)
    .where(eq(employeeGapDeadlinesTable.employeeId, employeeId));
  return new Map(
    rows.map((r) => [rowMapKey(r.requirementType, r.requirementKey), r]),
  );
}

/**
 * Compose-on-read: dado o conjunto de chaves (`requirementType::requirementKey`)
 * que estão em gap AGORA, marca `resolvedAt` em qualquer prazo aberto cuja
 * chave não está mais entre elas — cobre tanto "colaborador passou a
 * atender" quanto "requisito do cargo mudou/sumiu" (a chave nunca mais
 * aparece, o prazo se resolve sozinho em vez de ficar órfão para sempre).
 * Roda a cada GET da ficha, sem job separado.
 */
export async function resolveGapDeadlinesForEmployee(
  database: Db,
  employeeId: number,
  openGapKeys: Set<string>,
): Promise<void> {
  const openRows = await database
    .select({
      id: employeeGapDeadlinesTable.id,
      requirementType: employeeGapDeadlinesTable.requirementType,
      requirementKey: employeeGapDeadlinesTable.requirementKey,
    })
    .from(employeeGapDeadlinesTable)
    .where(
      and(
        eq(employeeGapDeadlinesTable.employeeId, employeeId),
        isNull(employeeGapDeadlinesTable.resolvedAt),
      ),
    );

  const idsToResolve = openRows
    .filter(
      (r) => !openGapKeys.has(rowMapKey(r.requirementType, r.requirementKey)),
    )
    .map((r) => r.id);

  if (idsToResolve.length === 0) return;

  await database
    .update(employeeGapDeadlinesTable)
    .set({ resolvedAt: new Date() })
    .where(inArray(employeeGapDeadlinesTable.id, idsToResolve));
}

export async function upsertGapDeadline(
  database: typeof db,
  params: {
    orgId: number;
    employeeId: number;
    requirementType: GapRequirementType;
    requirementKey: string;
    dueDate: string;
    userId: number;
  },
): Promise<GapDeadlineRow> {
  const [row] = await database
    .insert(employeeGapDeadlinesTable)
    .values({
      organizationId: params.orgId,
      employeeId: params.employeeId,
      requirementType: params.requirementType,
      requirementKey: params.requirementKey,
      dueDate: params.dueDate,
      createdById: params.userId,
      updatedById: params.userId,
    })
    .onConflictDoUpdate({
      target: [
        employeeGapDeadlinesTable.employeeId,
        employeeGapDeadlinesTable.requirementType,
        employeeGapDeadlinesTable.requirementKey,
      ],
      set: {
        dueDate: params.dueDate,
        updatedById: params.userId,
        // Reabrir a data reabre o acompanhamento: um prazo já resolvido ou
        // já notificado (Fase 2) volta a valer para a nova data.
        resolvedAt: null,
        lastNotifiedOverdueAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function clearGapDeadline(
  database: typeof db,
  params: {
    employeeId: number;
    requirementType: GapRequirementType;
    requirementKey: string;
  },
): Promise<void> {
  await database
    .delete(employeeGapDeadlinesTable)
    .where(
      and(
        eq(employeeGapDeadlinesTable.employeeId, params.employeeId),
        eq(employeeGapDeadlinesTable.requirementType, params.requirementType),
        eq(employeeGapDeadlinesTable.requirementKey, params.requirementKey),
      ),
    );
}

export interface FormattedGapDeadline {
  dueDate: string;
  resolvedAt: string | null;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export function formatGapDeadline(
  row: GapDeadlineRow | undefined,
  today: string = new Date().toISOString().slice(0, 10),
): FormattedGapDeadline | null {
  if (!row) return null;
  return {
    dueDate: row.dueDate,
    resolvedAt: row.resolvedAt
      ? row.resolvedAt instanceof Date
        ? row.resolvedAt.toISOString()
        : row.resolvedAt
      : null,
    overdue: !row.resolvedAt && row.dueDate < today,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  };
}

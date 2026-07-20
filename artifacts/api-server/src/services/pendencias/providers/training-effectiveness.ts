import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import {
  db,
  employeesTable,
  employeeTrainingsTable,
  trainingEffectivenessReviewsTable,
  unitManagersTable,
  unitsTable,
  userModulePermissionsTable,
  usersTable,
} from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";
import {
  boardEmAvaliacao,
  boardHasPendingCriteria,
  boardPendentes,
  boardStatusConcluidoVigente,
} from "../../aprendizagem/effectiveness-board";
import { dayBounds } from "./action-plans";

const ROUTE = "/aprendizagem/eficacia";

/** Papéis aceitos por `effectiveness_assigned_role` (varchar livre no banco). */
const ROLE_LABELS: Record<string, string> = {
  gestor: "gestor",
  rh: "RH",
  instrutor: "instrutor",
  colaborador: "colaborador",
};

/** Perfis que assumem a pendência quando o papel atribuído não resolve em gente. */
const ADMIN_ROLES = ["org_admin", "platform_admin"];

/** Módulo que guarda as rotas de treinamento/eficácia (routes/index.ts). */
const EMPLOYEES_MODULE = "employees";

/**
 * Como uma linha achou dono — vai no `meta` porque a resolução é indireta e,
 * quando o painel "esquece" um item, esta é a primeira coisa a olhar.
 */
type ResolvedVia = "colaborador" | "gestor" | "fallback_admin";

interface OrgDirectory {
  /** admins da org — donos de última instância. */
  adminIds: number[];
  /** employee_id → usuários vinculados (users.employee_id). */
  usersByEmployeeId: Map<number, number[]>;
  /** unit_id → usuários gestores da filial (unit_managers). */
  managersByUnitId: Map<number, number[]>;
  /**
   * Quem realmente consegue registrar a avaliação. O POST de
   * effectiveness-reviews passa por DOIS portões: `requireWriteAccess()`
   * (rejeita `analyst` com 403) e `requireModuleAccessForPaths("employees")`
   * (rejeita quem não tem o módulo). O painel /pendencias não tem nenhum dos
   * dois, então sem este conjunto o card apareceria para quem toma 403 ao
   * tentar resolvê-lo. Ver resolveOwners.
   */
  canEvaluateUserIds: Set<number>;
}

/**
 * O módulo de eficácia não guarda um usuário responsável: a atribuição grava
 * apenas um PAPEL em texto (`gestor|rh|instrutor|colaborador`). Para o painel de
 * pendências — que exige `responsibleUserId` — o papel é resolvido em pessoas na
 * leitura (compose-on-read), sem DDL nem migração:
 *
 *   colaborador → usuário vinculado ao colaborador (users.employee_id)
 *   gestor      → gestores da filial do colaborador (unit_managers)
 *   rh          → admins da organização
 *   instrutor   → admins da organização (o instrutor é texto livre em
 *                 employee_trainings.instructor, não um usuário)
 *
 * Quando a resolução específica vem vazia (filial sem gestor cadastrado,
 * colaborador sem usuário) — ou resolve apenas em analistas, que não podem
 * registrar a avaliação — o item cai para os admins em vez de sumir: uma
 * pendência sem dono é uma pendência que ninguém cobra.
 */
async function loadOrgDirectory(orgId: number): Promise<OrgDirectory> {
  const [orgUsers, managers, modulePerms] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        employeeId: usersTable.employeeId,
      })
      .from(usersTable)
      .where(eq(usersTable.organizationId, orgId)),
    db
      .select({ unitId: unitManagersTable.unitId, userId: unitManagersTable.userId })
      .from(unitManagersTable)
      .where(eq(unitManagersTable.organizationId, orgId)),
    db
      .select({ userId: userModulePermissionsTable.userId })
      .from(userModulePermissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userModulePermissionsTable.userId))
      .where(
        and(
          eq(usersTable.organizationId, orgId),
          eq(userModulePermissionsTable.module, EMPLOYEES_MODULE),
        ),
      ),
  ]);

  const withEmployeesModule = new Set(modulePerms.map((p) => p.userId));
  const adminIds: number[] = [];
  const canEvaluateUserIds = new Set<number>();
  const usersByEmployeeId = new Map<number, number[]>();
  for (const u of orgUsers) {
    const isAdmin = ADMIN_ROLES.includes(u.role);
    if (isAdmin) adminIds.push(u.id);
    // Espelha userHasModuleAccess + requireWriteAccess: admin passa direto,
    // analista nunca passa, os demais precisam do módulo `employees`.
    if (u.role !== "analyst" && (isAdmin || withEmployeesModule.has(u.id))) {
      canEvaluateUserIds.add(u.id);
    }
    if (u.employeeId == null) continue;
    const list = usersByEmployeeId.get(u.employeeId);
    if (list) list.push(u.id);
    else usersByEmployeeId.set(u.employeeId, [u.id]);
  }

  const managersByUnitId = new Map<number, number[]>();
  for (const m of managers) {
    const list = managersByUnitId.get(m.unitId);
    if (list) list.push(m.userId);
    else managersByUnitId.set(m.unitId, [m.userId]);
  }

  return { adminIds, usersByEmployeeId, managersByUnitId, canEvaluateUserIds };
}

function resolveOwners(
  row: { assignedRole: string | null; employeeId: number; unitId: number | null },
  dir: OrgDirectory,
): { owners: number[]; via: ResolvedVia } {
  // Quem não consegue avaliar é filtrado ANTES do teste de "resolveu": uma
  // filial cujo único gestor é analista (ou não tem o módulo) conta como filial
  // sem gestor e cai para os admins — senão o card ficaria visível justamente
  // para quem toma 403 ao tentar resolvê-lo.
  const evaluable = (ids: number[]) => ids.filter((id) => dir.canEvaluateUserIds.has(id));

  if (row.assignedRole === "colaborador") {
    const owners = evaluable(dir.usersByEmployeeId.get(row.employeeId) ?? []);
    if (owners.length > 0) return { owners, via: "colaborador" };
  }
  if (row.assignedRole === "gestor" && row.unitId !== null) {
    const owners = evaluable(dir.managersByUnitId.get(row.unitId) ?? []);
    if (owners.length > 0) return { owners, via: "gestor" };
  }
  return { owners: dir.adminIds, via: "fallback_admin" };
}

export const trainingEffectivenessPendenciaProvider: PendenciaProvider = {
  source: "training_effectiveness",

  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const scope = new Set(ctx.responsibleUserIds);
    const dir = await loadOrgDirectory(ctx.orgId);
    const scopeHasAdmin = dir.adminIds.some((id) => scope.has(id));

    const items: Pendencia[] = [];

    // ── Atribuídos (coluna "Em avaliação"): um item por treinamento ──────────
    const rows = await db
      .select({
        id: employeeTrainingsTable.id,
        title: employeeTrainingsTable.title,
        dueDate: employeeTrainingsTable.effectivenessDueDate,
        assignedRole: employeeTrainingsTable.effectivenessAssignedRole,
        employeeId: employeesTable.id,
        employeeName: employeesTable.name,
        unitId: employeesTable.unitId,
        unitName: unitsTable.name,
      })
      .from(employeeTrainingsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, employeeTrainingsTable.employeeId))
      .leftJoin(unitsTable, eq(unitsTable.id, employeesTable.unitId))
      .where(
        and(
          eq(employeesTable.organizationId, ctx.orgId),
          // Mesmo recorte da tela do board: eficácia só se avalia sobre
          // treinamento realizado e ainda válido.
          boardStatusConcluidoVigente,
          boardEmAvaliacao,
        ),
      );

    for (const r of rows) {
      const { owners, via } = resolveOwners(r, dir);
      const inScope = owners.filter((id) => scope.has(id));
      if (inScope.length === 0) continue;
      const roleLabel = r.assignedRole ? ROLE_LABELS[r.assignedRole] : undefined;
      items.push({
        id: `training_effectiveness:${r.id}`,
        source: "training_effectiveness",
        sourceLabel: SOURCE_LABELS.training_effectiveness,
        title: r.title,
        subtitle: r.unitName ? `${r.employeeName} · ${r.unitName}` : r.employeeName,
        statusLabel: roleLabel
          ? `Avaliação por ${roleLabel}`
          : "Avaliação de eficácia em aberto",
        dueDate: r.dueDate,
        urgency: classifyUrgency(r.dueDate, ctx.now, ctx.dueSoonDays),
        // O responsável que explica a linha estar na lista precisa estar DENTRO
        // do escopo; os demais donos vão em responsibleUserIds (rótulo "+N").
        responsibleUserId: inScope[0],
        responsibleUserIds: owners,
        link: { route: ROUTE, ctaLabel: "Avaliar" },
        meta: {
          trainingId: r.id,
          employeeId: r.employeeId,
          unitId: r.unitId,
          assignedRole: r.assignedRole,
          resolvedVia: via,
        },
      });
    }

    // ── Não atribuídos (coluna "Pendentes"): UM item agregado para os admins ──
    // Item a item inundaria o painel: todo treinamento concluído com critério de
    // eficácia entra nesta coluna até alguém definir o avaliador (na Gabardo são
    // dezenas de milhares). O agregado mantém a cobrança visível sem quebrar os
    // contadores nem a leitura da tela.
    if (scopeHasAdmin) {
      const adminsInScope = dir.adminIds.filter((id) => scope.has(id));
      const [unassigned] = await db
        .select({ total: count() })
        .from(employeeTrainingsTable)
        .innerJoin(employeesTable, eq(employeesTable.id, employeeTrainingsTable.employeeId))
        .where(
          and(
            eq(employeesTable.organizationId, ctx.orgId),
            // Sem este recorte a contagem incluía treinamento ainda NÃO
            // realizado que herdou evaluationMethod/targetCompetencyName do
            // catálogo — inflando o número e divergindo da tela do board.
            boardStatusConcluidoVigente,
            boardPendentes,
            // Mesma regra do stat `effectivenessPending`: sem critério de
            // eficácia definido não há o que avaliar.
            boardHasPendingCriteria,
          ),
        );
      const total = unassigned?.total ?? 0;
      if (total > 0) {
        items.push({
          id: "training_effectiveness:unassigned",
          source: "training_effectiveness",
          sourceLabel: SOURCE_LABELS.training_effectiveness,
          title:
            total === 1
              ? "1 treinamento aguardando atribuição de avaliador"
              : `${total} treinamentos aguardando atribuição de avaliador`,
          subtitle: "Definir quem avalia a eficácia",
          statusLabel: "Sem avaliador definido",
          dueDate: null,
          urgency: "no_due",
          responsibleUserId: adminsInScope[0],
          responsibleUserIds: adminsInScope,
          link: { route: ROUTE, ctaLabel: "Atribuir" },
          meta: { aggregate: true, unassignedCount: total },
        });
      }
    }

    return items;
  },

  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const rows = await db
      .select({
        // O id precisa do reviewId: dois avaliadores podem finalizar o MESMO
        // treinamento no mesmo dia, e chavear só por trainingId produziria duas
        // Pendencias com o mesmo id (contrato de unicidade + key do React).
        reviewId: trainingEffectivenessReviewsTable.id,
        trainingId: employeeTrainingsTable.id,
        title: employeeTrainingsTable.title,
        employeeName: employeesTable.name,
        evaluatorUserId: trainingEffectivenessReviewsTable.evaluatorUserId,
      })
      .from(trainingEffectivenessReviewsTable)
      .innerJoin(
        employeeTrainingsTable,
        eq(employeeTrainingsTable.id, trainingEffectivenessReviewsTable.trainingId),
      )
      .innerJoin(employeesTable, eq(employeesTable.id, employeeTrainingsTable.employeeId))
      .where(
        and(
          eq(employeesTable.organizationId, ctx.orgId),
          // Rascunho não é avaliação concluída — ver effectiveness-board.ts.
          eq(trainingEffectivenessReviewsTable.status, "final"),
          inArray(
            trainingEffectivenessReviewsTable.evaluatorUserId,
            ctx.responsibleUserIds,
          ),
          gte(trainingEffectivenessReviewsTable.createdAt, start),
          lt(trainingEffectivenessReviewsTable.createdAt, end),
        ),
      );

    return rows.map((r): Pendencia => ({
      id: `training_effectiveness:${r.trainingId}:review:${r.reviewId}`,
      source: "training_effectiveness",
      sourceLabel: SOURCE_LABELS.training_effectiveness,
      title: r.title,
      subtitle: r.employeeName,
      statusLabel: "Avaliada hoje",
      dueDate: `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, "0")}-${String(ctx.now.getDate()).padStart(2, "0")}`,
      urgency: "no_due",
      responsibleUserId: r.evaluatorUserId,
      link: { route: ROUTE, ctaLabel: "Ver" },
      meta: { trainingId: r.trainingId, completed: true },
    }));
  },
};

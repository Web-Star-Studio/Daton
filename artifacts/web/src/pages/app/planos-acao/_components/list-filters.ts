import type {
  ActionPlanPriority,
  ActionPlanStatus,
  ActionPlanType,
  ListActionPlansParams,
} from "@/lib/action-plans-client";

export type ActionPlanEffectivenessFilter = "effective" | "ineffective" | "pending";
export type ActionPlanDueWindow = "overdue" | "due_soon";

/** Filtros server-side da aba Lista. `search` e `mineOnly` ficam locais na tela
 * (não entram no drill-down). Campos vazios ("") = "sem filtro". */
export type ListFilters = {
  status: "" | ActionPlanStatus;
  sourceModule: string;
  responsibleUserId: string;
  actionType: "" | ActionPlanType;
  priority: "" | ActionPlanPriority;
  effectiveness: "" | ActionPlanEffectivenessFilter;
  dueWindow: "" | ActionPlanDueWindow;
};

export const EMPTY_FILTERS: ListFilters = {
  status: "",
  sourceModule: "",
  responsibleUserId: "",
  actionType: "",
  priority: "",
  effectiveness: "",
  dueWindow: "",
};

export function hasActiveFilters(f: ListFilters): boolean {
  return (
    f.status !== "" ||
    f.sourceModule !== "" ||
    f.responsibleUserId !== "" ||
    f.actionType !== "" ||
    f.priority !== "" ||
    f.effectiveness !== "" ||
    f.dueWindow !== ""
  );
}

/** Monta o query da listagem. `mineUserId` (botão "Atribuídas a mim") sobrepõe o
 * responsável escolhido. Devolve undefined quando não há nada a filtrar. */
export function buildActionPlanQuery(
  f: ListFilters,
  opts: { mineUserId?: number },
): ListActionPlansParams | undefined {
  const p: ListActionPlansParams = {};
  if (f.status) p.status = f.status;
  if (f.sourceModule) p.sourceModule = f.sourceModule as ListActionPlansParams["sourceModule"];
  if (opts.mineUserId !== undefined) p.responsibleUserId = opts.mineUserId;
  else if (f.responsibleUserId) p.responsibleUserId = Number(f.responsibleUserId);
  if (f.actionType) p.actionType = f.actionType;
  if (f.priority) p.priority = f.priority;
  if (f.effectiveness) p.effectiveness = f.effectiveness;
  if (f.dueWindow) p.dueWindow = f.dueWindow;
  return Object.keys(p).length > 0 ? p : undefined;
}

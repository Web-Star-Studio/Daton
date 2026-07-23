import { randomUUID } from "node:crypto";
import type { ActionPlanActionTask } from "@workspace/db";

/** Limite defensivo: uma ação com centenas de "passos" é erro de uso, não caso real. */
const MAX_HOW_TASKS = 200;
const MAX_HOW_TASK_TEXT = 500;

/**
 * Limpa a checklist do "Como" vinda do cliente antes de gravar: descarta itens de
 * texto vazio, corta texto e tamanho de lista a um teto, normaliza `done` para
 * booleano e garante `id` único. O zod da rota já valida o formato `{ id, text,
 * done }`; aqui é só higiene. Devolve `null` (e não `[]`) quando não sobra nada —
 * mesma convenção das outras colunas anuláveis, e evita gravar um array vazio.
 */
export function normalizeActionHowTasks(
  input: ActionPlanActionTask[] | null | undefined,
): ActionPlanActionTask[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: ActionPlanActionTask[] = [];
  for (const item of input) {
    if (out.length >= MAX_HOW_TASKS) break;
    const text =
      typeof item?.text === "string" ? item.text.trim().slice(0, MAX_HOW_TASK_TEXT) : "";
    if (!text) continue;
    // `id` estável do cliente; se vier vazio ou repetido, gera um para não colidir
    // as keys no React nem sobrescrever outro item.
    let id = typeof item?.id === "string" && item.id.trim() !== "" ? item.id : randomUUID();
    if (seen.has(id)) id = randomUUID();
    seen.add(id);
    // Sanitiza o dono do passo aqui (higiene); a rota valida em seguida que o id é
    // usuário DESTA org — como já faz com o `responsibleUserId` da ação.
    const assigneeUserId =
      typeof item?.assigneeUserId === "number" &&
      Number.isInteger(item.assigneeUserId) &&
      item.assigneeUserId > 0
        ? item.assigneeUserId
        : null;
    out.push({ id, text, done: Boolean(item?.done), assigneeUserId });
  }
  return out.length > 0 ? out : null;
}

/** Ids distintos e válidos dos donos de passo de uma checklist (para validar org
 *  e alimentar o espelho de co-responsáveis do plano). Ignora passos sem dono. */
export function collectTaskAssigneeIds(
  tasks: ActionPlanActionTask[] | null | undefined,
): number[] {
  if (!Array.isArray(tasks)) return [];
  const ids = new Set<number>();
  for (const t of tasks) {
    if (typeof t.assigneeUserId === "number" && t.assigneeUserId > 0) ids.add(t.assigneeUserId);
  }
  return [...ids];
}

/**
 * Faixa ESTREITA do dono de passo: aplica, sobre a checklist já existente, apenas
 * as marcações (`done`) dos passos DELE. Descarta todo o resto do payload — texto,
 * inclusão/remoção, reatribuição, ou marcar o passo de outro. Esse ator não conduz
 * a ação; só executa os próprios passos, e o cliente manda a lista inteira (autosave),
 * então não dá para confiar no payload. A saída ainda passa por `stampHowTasks`
 * (o carimbo de quem/quando é do servidor).
 */
export function applyTaskAssigneeDoneOnly(
  existing: ActionPlanActionTask[] | null | undefined,
  incoming: ActionPlanActionTask[] | null | undefined,
  assigneeUserId: number,
): ActionPlanActionTask[] | null {
  const base = Array.isArray(existing) ? existing : [];
  if (base.length === 0) return null;
  const incomingById = new Map<string, ActionPlanActionTask>();
  for (const t of Array.isArray(incoming) ? incoming : []) incomingById.set(t.id, t);
  return base.map((t) => {
    if (t.assigneeUserId !== assigneeUserId) return t; // não é dele → intocado
    const inc = incomingById.get(t.id);
    if (!inc) return t; // não veio no payload → intocado
    return { ...t, done: Boolean(inc.done) }; // só o `done` muda
  });
}

/**
 * Carimba QUEM/QUANDO concluiu cada passo, de forma autoritativa no servidor — o
 * cliente manda só `{ id, text, done }`; quem e quando não podem ser forjados.
 *
 * - passo que passou a `done` agora → grava `doneAt`/`doneBy*` com o ator/hora atuais;
 * - passo que JÁ estava `done` (mesmo id, ainda marcado) → preserva o carimbo antigo
 *   (não "reassina" a conclusão a cada save de outro campo);
 * - passo `done:false` → carimbo limpo (foi reaberto).
 *
 * `cleaned` deve ser a saída de `normalizeActionHowTasks` (já sem carimbos do cliente).
 */
export function stampHowTasks(
  cleaned: ActionPlanActionTask[] | null,
  existing: ActionPlanActionTask[] | null | undefined,
  actor: { userId: number | null; userName: string | null },
  nowIso: string,
): ActionPlanActionTask[] | null {
  if (!cleaned) return null;
  const prevById = new Map<string, ActionPlanActionTask>();
  for (const t of existing ?? []) prevById.set(t.id, t);
  return cleaned.map((t) => {
    // O dono do passo (`assigneeUserId`) é do cliente e sobrevive ao carimbo — só
    // quem/quando concluiu é autoritativo do servidor.
    const base = { id: t.id, text: t.text, assigneeUserId: t.assigneeUserId ?? null };
    if (!t.done) return { ...base, done: false };
    const prev = prevById.get(t.id);
    if (prev?.done && prev.doneAt) {
      return {
        ...base,
        done: true,
        doneAt: prev.doneAt,
        doneByUserId: prev.doneByUserId ?? null,
        doneByUserName: prev.doneByUserName ?? null,
      };
    }
    return {
      ...base,
      done: true,
      doneAt: nowIso,
      doneByUserId: actor.userId,
      doneByUserName: actor.userName,
    };
  });
}

/**
 * Duas checklists diferem SÓ por marcação/conclusão (mesmos passos, mesma ordem,
 * mesmo texto — só `done`/carimbo mudou)? Serve para o histórico: marcar/desmarcar
 * é execução (não vira entrada); incluir/remover/renomear/reatribuir passo é
 * replanejamento (deve virar). Compara por `id`+`text`+`assigneeUserId`; ignora
 * `done` e os carimbos de propósito.
 */
export function isHowTasksOnlyDoneToggle(
  before: ActionPlanActionTask[] | null | undefined,
  after: ActionPlanActionTask[] | null | undefined,
): boolean {
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].text !== b[i].text ||
      (a[i].assigneeUserId ?? null) !== (b[i].assigneeUserId ?? null)
    ) {
      return false;
    }
  }
  return true;
}

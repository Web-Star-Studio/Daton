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
    out.push({ id, text, done: Boolean(item?.done) });
  }
  return out.length > 0 ? out : null;
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
    if (!t.done) return { id: t.id, text: t.text, done: false };
    const prev = prevById.get(t.id);
    if (prev?.done && prev.doneAt) {
      return {
        id: t.id,
        text: t.text,
        done: true,
        doneAt: prev.doneAt,
        doneByUserId: prev.doneByUserId ?? null,
        doneByUserName: prev.doneByUserName ?? null,
      };
    }
    return {
      id: t.id,
      text: t.text,
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
 * é execução (não vira entrada); incluir/remover/renomear passo é replanejamento
 * (deve virar). Compara por `id`+`text`; ignora `done` e os carimbos de propósito.
 */
export function isHowTasksOnlyDoneToggle(
  before: ActionPlanActionTask[] | null | undefined,
  after: ActionPlanActionTask[] | null | undefined,
): boolean {
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].text !== b[i].text) return false;
  }
  return true;
}

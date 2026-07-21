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

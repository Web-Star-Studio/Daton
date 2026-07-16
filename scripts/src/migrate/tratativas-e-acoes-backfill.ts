/**
 * Backfill (Tratativas + Ações): migra os dois blocos legados do plano de ação —
 * `root_cause_whys` (a análise de causa em 5 porquês) e `plan_5w2h` (o "o que
 * fazer") — para o modelo novo: `analyses` (tratativa estruturada, união
 * discriminada por `key`) e `action_plan_actions` (uma linha por ação,
 * rastreável por responsável e prazo).
 *
 * Três fases, cada uma idempotente:
 *
 *  1) Semente: `ensureAnalysisMethods` (reaproveitada do api-server, não
 *     reescrita aqui) garante as 8 tratativas em TODA organização — sem isso a
 *     organização não teria o catálogo pra exibir/escolher "5 Porquês" no
 *     plano já migrado.
 *  2) Tratativas: plano com `root_cause_whys` preenchido (array não vazio) E
 *     `analyses` ainda vazio ganha `analyses = [{ key: "five_whys", data: {
 *     whys } }]`. `root_cause` (a CONCLUSÃO da análise) é campo à parte e não
 *     é tocado.
 *  3) Ações: plano com `plan_5w2h` preenchido (algum campo não-vazio) E SEM
 *     nenhuma linha em `action_plan_actions` ganha uma ação — a antiga era
 *     sempre 1:1 com o plano. `who` (texto livre) tenta casar (case-
 *     insensitive) com o nome de um usuário da organização; sem match, o
 *     responsável cai no `responsibleUserId` do PLANO e o texto original é
 *     preservado em `notes`. Mesma lógica para `when` (tenta virar data; sem
 *     parse, cai no `dueDate` do plano e o texto vai para `notes`). NADA do
 *     que a empresa escreveu é descartado — só reorganizado.
 *
 * Nem `plan_5w2h` nem `root_cause_whys` são apagados (ficam como rede de
 * rollback, para um follow-up).
 *
 * Uso:
 *   pnpm --filter @workspace/scripts exec tsx --env-file ../.env \
 *     ./src/migrate/tratativas-e-acoes-backfill.ts [--org=2]
 *
 * SEM --org: todas as organizações. Idempotente — rodar de novo não duplica
 * ação nem sobrescreve `analyses`/ação já existentes (inclusive se editados à
 * mão entre uma rodada e outra).
 *
 * ⚠️ NÃO rodar contra produção a partir desta task — ver docs/superpowers/plans/
 * ddl-2026-07-14-tratativas-e-acoes.sql para o DDL correspondente e o processo
 * manual de aplicação.
 */
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import type {
  ActionPlan5W2H,
  ActionPlanAnalysis,
  ActionPlanStatus,
} from "@workspace/db";
import { ensureAnalysisMethods } from "../../../artifacts/api-server/src/services/action-plans/analysis-methods";

// ─── Fase 1: semente do catálogo de tratativas ──────────────────────────────

async function fetchAllOrgIds(): Promise<number[]> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM organizations ORDER BY id`,
  );
  return rows.map((r) => r.id);
}

export async function seedAnalysisMethods(orgIds: number[]): Promise<void> {
  for (const orgId of orgIds) {
    await ensureAnalysisMethods(orgId);
  }
}

// ─── Fase 2: tratativas (root_cause_whys → analyses.five_whys) ──────────────

export interface TratativasResult {
  /** Planos com `root_cause_whys` não vazio e `analyses` vazio (antes de gravar). */
  candidates: number;
  /** Quantos de fato foram gravados (a guarda de idempotência pode reduzir
   *  isto a menos que `candidates` numa segunda rodada — nesse ponto já é 0). */
  migrated: number;
}

export async function backfillTratativas(
  orgIds: number[],
): Promise<TratativasResult> {
  const { rows } = await pool.query<{ id: number; root_cause_whys: unknown }>(
    `SELECT id, root_cause_whys FROM action_plans
      WHERE organization_id = ANY($1::int[])
        AND root_cause_whys IS NOT NULL
        AND analyses IS NULL`,
    [orgIds],
  );

  let candidates = 0;
  let migrated = 0;
  for (const row of rows) {
    // `root_cause_whys` já chega parseado (jsonb) do driver. Não filtramos nem
    // "limpamos" o conteúdo — fidelidade é o ponto: só decidimos se há algo a
    // migrar (array não vazio).
    const whys = row.root_cause_whys;
    if (!Array.isArray(whys) || whys.length === 0) continue;
    candidates++;

    const analyses: ActionPlanAnalysis[] = [
      { key: "five_whys", data: { whys } },
    ];
    // Guarda de idempotência: só grava se `analyses` AINDA está NULL — cobre
    // tanto rodar o script duas vezes quanto uma edição manual feita entre elas.
    const result = await pool.query(
      `UPDATE action_plans SET analyses = $1::jsonb WHERE id = $2 AND analyses IS NULL`,
      [JSON.stringify(analyses), row.id],
    );
    if ((result.rowCount ?? 0) > 0) migrated++;
  }

  return { candidates, migrated };
}

// ─── Fase 3: ações (plan_5w2h → 1 linha em action_plan_actions) ─────────────

interface PlanRow {
  id: number;
  organization_id: number;
  title: string;
  plan_5w2h: ActionPlan5W2H | null;
  status: ActionPlanStatus;
  responsible_user_id: number | null;
  due_date: Date | null;
  corrective_action_completed_at: Date | null;
  closed_at: Date | null;
  created_by_user_id: number | null;
}

export interface AcoesResult {
  /** Planos com `plan_5w2h` não vazio e sem nenhuma ação (antes de gravar). */
  candidates: number;
  migrated: number;
  /** `who` que não casou com nenhum usuário da org — preservado em `notes`. */
  whoUnresolved: number;
  /** `when` que não deu pra interpretar como data — preservado em `notes`. */
  whenUnparseable: number;
}

/** `plan_5w2h` "vazio" = nenhum dos 7 campos tem conteúdo. Um objeto `{}` (ou
 *  só espaços) não gera ação — não há o que migrar. */
function plan5w2hIsEmpty(p: ActionPlan5W2H | null | undefined): boolean {
  if (!p) return true;
  return !(
    p.what?.trim() ||
    p.why?.trim() ||
    p.where?.trim() ||
    p.who?.trim() ||
    p.when?.trim() ||
    p.how?.trim() ||
    p.howMuch?.trim()
  );
}

/**
 * Tenta interpretar o "Quando" (texto livre legado) como data. Só resolve
 * formatos inequívocos — ISO (aaaa-mm-dd) e dd/mm/aaaa. Qualquer outra coisa
 * (ex.: "Julho/26", "próxima reunião") não é resolvida: quem chama cai no
 * prazo do PLANO e preserva o texto original em `notes` — nada é descartado,
 * só não convertido.
 */
export function parseWhenDate(when: string): Date | null {
  const trimmed = when.trim();
  if (!trimmed) return null;

  const br = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    return valid ? date : null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export async function backfillAcoes(orgIds: number[]): Promise<AcoesResult> {
  const { rows } = await pool.query<PlanRow>(
    `SELECT p.id, p.organization_id, p.title, p.plan_5w2h, p.status, p.responsible_user_id,
            p.due_date, p.corrective_action_completed_at, p.closed_at, p.created_by_user_id
       FROM action_plans p
      WHERE p.organization_id = ANY($1::int[])
        AND p.plan_5w2h IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM action_plan_actions a WHERE a.action_plan_id = p.id)`,
    [orgIds],
  );

  // Mapa nome(lower)->id por organização, montado sob demanda e reusado entre
  // planos da mesma org — evita 1 SELECT de usuários por plano.
  const usersByOrg = new Map<number, Map<string, number>>();
  async function usersMapFor(orgId: number): Promise<Map<string, number>> {
    const cached = usersByOrg.get(orgId);
    if (cached) return cached;
    const { rows: userRows } = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE organization_id = $1 ORDER BY id`,
      [orgId],
    );
    const map = new Map<string, number>();
    for (const u of userRows) {
      const key = u.name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, u.id); // nome duplicado: o primeiro cadastrado ganha
    }
    usersByOrg.set(orgId, map);
    return map;
  }

  let candidates = 0;
  let migrated = 0;
  let whoUnresolved = 0;
  let whenUnparseable = 0;

  for (const row of rows) {
    const p = row.plan_5w2h;
    if (plan5w2hIsEmpty(p)) continue;
    candidates++;

    const notesParts: string[] = [];

    // ─── Quem ──────────────────────────────────────────────────────────────
    let responsibleUserId = row.responsible_user_id;
    const who = p?.who?.trim();
    if (who) {
      const map = await usersMapFor(row.organization_id);
      const matchedId = map.get(who.toLowerCase());
      if (matchedId != null) {
        responsibleUserId = matchedId;
      } else {
        whoUnresolved++;
        notesParts.push(`Quem (registro anterior): "${who}"`);
      }
    }

    // ─── Quando ────────────────────────────────────────────────────────────
    let dueDate = row.due_date;
    const when = p?.when?.trim();
    if (when) {
      const parsed = parseWhenDate(when);
      if (parsed) {
        dueDate = parsed;
      } else {
        whenUnparseable++;
        notesParts.push(`Quando (registro anterior): "${when}"`);
      }
    }

    // ─── Demais campos: verbatim ─────────────────────────────────────────
    const what = p?.what?.trim() || row.title;
    const status: ActionPlanStatus =
      row.status === "completed" || row.status === "cancelled"
        ? "completed"
        : "open";
    const completedAt =
      status === "completed"
        ? (row.corrective_action_completed_at ?? row.closed_at ?? new Date())
        : null;
    const notes = notesParts.length > 0 ? notesParts.join(" · ") : null;

    // INSERT ... SELECT ... WHERE NOT EXISTS: guarda de idempotência (não só
    // a checada no SELECT acima) — cobre uma segunda execução do script.
    const result = await pool.query(
      `INSERT INTO action_plan_actions
         (organization_id, action_plan_id, what, why, where_at, how, how_much,
          responsible_user_id, due_date, status, completed_at, notes, sort_order, created_by_user_id)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13
        WHERE NOT EXISTS (SELECT 1 FROM action_plan_actions WHERE action_plan_id = $2)
       RETURNING id`,
      [
        row.organization_id,
        row.id,
        what,
        p?.why ?? null,
        p?.where ?? null,
        p?.how ?? null,
        p?.howMuch ?? null,
        responsibleUserId,
        dueDate,
        status,
        completedAt,
        notes,
        row.created_by_user_id,
      ],
    );
    if ((result.rowCount ?? 0) > 0) migrated++;
  }

  return { candidates, migrated, whoUnresolved, whenUnparseable };
}

// ─── Orquestração ────────────────────────────────────────────────────────────

export interface BackfillReport {
  orgIds: number[];
  tratativas: TratativasResult;
  acoes: AcoesResult;
}

export async function runTratativasEAcoesBackfill(
  options: { orgIds?: number[] } = {},
): Promise<BackfillReport> {
  const orgIds = options.orgIds ?? (await fetchAllOrgIds());
  await seedAnalysisMethods(orgIds);
  const tratativas = await backfillTratativas(orgIds);
  const acoes = await backfillAcoes(orgIds);
  return { orgIds, tratativas, acoes };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseOrgArg(): number[] | undefined {
  const arg = process.argv.find((a) => a.startsWith("--org="));
  if (!arg) return undefined;
  const id = Number(arg.slice("--org=".length));
  if (!Number.isInteger(id)) throw new Error(`--org inválido: ${arg}`);
  return [id];
}

async function main(): Promise<void> {
  const orgIds = parseOrgArg();
  console.log("=== Backfill Tratativas + Ações ===");
  console.log(
    orgIds
      ? `Escopo: organização ${orgIds[0]}`
      : "Escopo: todas as organizações",
  );

  const report = await runTratativasEAcoesBackfill({ orgIds });

  console.log("");
  console.log(
    `Organizações semeadas (catálogo de tratativas): ${report.orgIds.length}`,
  );
  console.log(
    `Tratativas migradas (root_cause_whys → analyses.five_whys): ${report.tratativas.migrated} ` +
      `(candidatos: ${report.tratativas.candidates})`,
  );
  console.log(
    `Ações migradas (plan_5w2h → action_plan_actions): ${report.acoes.migrated} ` +
      `(candidatos: ${report.acoes.candidates})`,
  );
  console.log(
    `  "quem" não resolvido por nome (caiu no responsável do plano): ${report.acoes.whoUnresolved}`,
  );
  console.log(
    `  "quando" não parseável (caiu no prazo do plano): ${report.acoes.whenUnparseable}`,
  );
}

// Só roda main() quando o arquivo é o entrypoint (`tsx .../tratativas-e-acoes-backfill.ts`),
// nunca quando importado (os testes importam as funções acima diretamente).
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then(() => pool.end())
    .catch((error) => {
      console.error(error);
      pool.end();
      process.exit(1);
    });
}

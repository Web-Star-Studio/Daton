/**
 * Backfill: popula `responsible_user_id` em kpi_indicators a partir do texto
 * `responsible`, via match difuso por tokens contra users.name.
 *
 * Modo dry-run por padrão. Use `--apply` para efetivar.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts backfill-kpi-responsible-user-id <orgId>
 *   pnpm --filter @workspace/scripts backfill-kpi-responsible-user-id <orgId> --apply
 */
import { db, pool, kpiIndicatorsTable, usersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

const rawOrgId = process.argv[2];
const apply = process.argv.includes("--apply");
if (!rawOrgId || isNaN(Number(rawOrgId))) {
  console.error("Usage: backfill-kpi-responsible-user-id <orgId> [--apply]");
  process.exit(1);
}
const ORG_ID = Number(rawOrgId);

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
function normalize(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS, "").trim().toLowerCase();
}
const STOPWORDS = new Set(["da", "de", "do", "dos", "das", "e", "di", "du"]);
function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}
function isFuzzyMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared === a.size && shared === b.size) return true;
  if (shared >= 2) return true;
  return false;
}

async function main() {
  console.log(`Org ID: ${ORG_ID}`);
  console.log(`Mode:   ${apply ? "APPLY" : "DRY-RUN"}\n`);

  const users = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.organizationId, ORG_ID));
  const userTokens = users.map((u) => ({ user: u, tokens: tokenize(u.name) }));
  console.log(`Usuários cadastrados: ${users.length}`);

  // Só popular onde ainda não temos responsibleUserId
  const indicators = await db
    .select({
      id: kpiIndicatorsTable.id,
      responsible: kpiIndicatorsTable.responsible,
    })
    .from(kpiIndicatorsTable)
    .where(
      and(
        eq(kpiIndicatorsTable.organizationId, ORG_ID),
        isNotNull(kpiIndicatorsTable.responsible),
        isNull(kpiIndicatorsTable.responsibleUserId),
      ),
    );
  console.log(`Indicadores com responsible mas sem responsibleUserId: ${indicators.length}\n`);

  const updates: { id: number; resp: string; userId: number; userName: string }[] = [];
  const noMatch: { id: number; resp: string }[] = [];

  for (const ind of indicators) {
    const current = (ind.responsible ?? "").trim();
    if (!current) continue;
    const respTokens = tokenize(current);
    const match = userTokens.find((u) => isFuzzyMatch(respTokens, u.tokens));
    if (match) {
      updates.push({ id: ind.id, resp: current, userId: match.user.id, userName: match.user.name });
    } else {
      noMatch.push({ id: ind.id, resp: current });
    }
  }

  console.log(`Vai associar ${updates.length} indicador(es) a um user:`);
  const distinct = new Map<string, { userName: string; count: number }>();
  for (const u of updates) {
    const v = distinct.get(u.resp);
    if (v) v.count++;
    else distinct.set(u.resp, { userName: u.userName, count: 1 });
  }
  for (const [resp, { userName, count }] of distinct.entries()) {
    console.log(`  ${count}x  "${resp}"   →   userId of "${userName}"`);
  }
  console.log();

  if (noMatch.length > 0) {
    console.log(`${noMatch.length} indicador(es) sem match (ficam com responsibleUserId = null):`);
    const distinctNoMatch = new Map<string, number>();
    for (const n of noMatch) {
      distinctNoMatch.set(n.resp, (distinctNoMatch.get(n.resp) ?? 0) + 1);
    }
    for (const [resp, count] of distinctNoMatch.entries()) {
      console.log(`  ${count}x  "${resp}"`);
    }
    console.log();
  }

  if (!apply) {
    console.log("Para aplicar, rode novamente com --apply");
    await pool.end();
    return;
  }

  console.log("Aplicando UPDATE...");
  let updated = 0;
  for (const u of updates) {
    await db
      .update(kpiIndicatorsTable)
      .set({ responsibleUserId: u.userId })
      .where(eq(kpiIndicatorsTable.id, u.id));
    updated++;
  }
  console.log(`OK — ${updated} indicador(es) atualizado(s).`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});

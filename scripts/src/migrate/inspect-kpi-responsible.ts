/**
 * Inspect: lista todos os valores distintos de `responsible` em indicadores KPI
 * e mostra com qual usuário (se algum) cada um faz match.
 *
 * Útil pra decidir se vale normalizar (rewriting `responsible` pro nome canônico do usuário).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts inspect-kpi-responsible <orgId>
 */
import { db, pool, kpiIndicatorsTable, usersTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";

const rawOrgId = process.argv[2];
if (!rawOrgId || isNaN(Number(rawOrgId))) {
  console.error("Usage: inspect-kpi-responsible <orgId>");
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
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.organizationId, ORG_ID));

  const userTokens = users.map((u) => ({ user: u, tokens: tokenize(u.name) }));

  const rows = await db
    .select({
      responsible: kpiIndicatorsTable.responsible,
    })
    .from(kpiIndicatorsTable)
    .where(
      and(
        eq(kpiIndicatorsTable.organizationId, ORG_ID),
        isNotNull(kpiIndicatorsTable.responsible),
      ),
    );

  const distinct = new Map<string, number>();
  for (const r of rows) {
    const v = (r.responsible ?? "").trim();
    if (!v) continue;
    distinct.set(v, (distinct.get(v) ?? 0) + 1);
  }

  console.log(`Total: ${rows.length} indicadores com responsible, ${distinct.size} valores distintos\n`);

  const matches: { resp: string; count: number; userName: string }[] = [];
  const noMatches: { resp: string; count: number }[] = [];
  for (const [resp, count] of distinct.entries()) {
    const respTokens = tokenize(resp);
    const match = userTokens.find((u) => isFuzzyMatch(respTokens, u.tokens));
    if (match) {
      matches.push({ resp, count, userName: match.user.name });
    } else {
      noMatches.push({ resp, count });
    }
  }

  matches.sort((a, b) => b.count - a.count);
  noMatches.sort((a, b) => b.count - a.count);

  console.log("=== COM MATCH (kept) ===");
  for (const m of matches) {
    const flag = m.resp === m.userName ? "OK " : "≠  ";
    console.log(`  ${m.count}x  ${flag}"${m.resp}"   →   "${m.userName}"`);
  }
  console.log();

  if (noMatches.length > 0) {
    console.log("=== SEM MATCH (would be nullified) ===");
    for (const n of noMatches) {
      console.log(`  ${n.count}x  "${n.resp}"`);
    }
    console.log();
  }

  const toNormalize = matches.filter((m) => m.resp !== m.userName);
  if (toNormalize.length > 0) {
    console.log(`>> ${toNormalize.length} valor(es) bate com usuário mas usa formato diferente.`);
    console.log(`>> Considere rodar normalize para padronizar pro nome do usuário.`);
  } else {
    console.log(">> Todos os matches já estão no formato canônico.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});

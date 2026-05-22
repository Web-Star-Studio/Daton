/**
 * Importa os Fatores de Desempenho da Gabardo a partir da planilha
 * FPLAN 005 (aba "Fatores de Desempenho") para a tabela road_safety_factors.
 *
 * NÃO destrutivo: aborta o --apply se a organização já tiver FDs.
 * Dry-run por padrão; grava só com --apply.
 *
 * Uso:
 *   import-road-safety-gabardo <orgId>           → dry-run (mostra o plano)
 *   import-road-safety-gabardo <orgId> --apply   → importa de verdade
 */
import { createRequire } from "module";
import { db, organizationsTable, roadSafetyFactorsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";

// xlsx é dependência transitiva — resolvida pelo caminho explícito do store.
const require = createRequire(import.meta.url);
const XLSX = require(
  "/home/jp/daton/Daton/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx",
);
const FILE =
  "/home/jp/daton/Daton/FPLAN 005 - Lev e Análise dos Fatores de Desempenho rev05 14-10-25 (1).xlsx";

// ─── Normalização / mapeamento ───────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
function clean(s: unknown): string | null {
  const v = String(s ?? "").trim().replace(/\s+/g, " ");
  return v ? v : null;
}

function mapType(v: unknown): "exposure" | "intermediate" | "final" {
  const n = norm(v);
  if (n.startsWith("exposic")) return "exposure";
  if (n.startsWith("final")) return "final";
  return "intermediate";
}

function mapOrigin(v: unknown): string {
  const n = norm(v);
  if (n.includes("emerg")) return "emergency_response";
  if (n.includes("humano") && n.includes("veiculo")) return "human_vehicle";
  if (n.includes("via") && n.includes("humano")) return "road_human";
  if (n.includes("veiculo")) return "vehicle";
  if (n.includes("humano")) return "human";
  if (n.includes("via")) return "road";
  return "human";
}

function mapMonitoringForm(v: unknown): string {
  const n = norm(v);
  if (n.includes("indicador")) return "indicator";
  if (n.includes("auditoria")) return "internal_audit";
  if (!n || n === "nao ha") return "other";
  return "report";
}

function mapPeriodicity(
  v: unknown,
): "monthly" | "quarterly" | "semiannual" | "annual" {
  const n = norm(v);
  if (n.includes("trimestr")) return "quarterly";
  if (n.includes("semestr")) return "semiannual";
  if (n.includes("anual") || n === "ano") return "annual";
  return "monthly";
}

function clampGut(v: unknown): number {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

/**
 * Código do FD a partir do ITEM da planilha — preserva a numeração real do
 * documento controlado ("FD1" → "FD01", "FD27" → "FD27"). NÃO renumera.
 */
function planilhaCode(item: unknown): string {
  const m = /(\d+)/.exec(String(item ?? ""));
  return `FD${(m ? m[1] : "0").padStart(2, "0")}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const recode = args.includes("--recode");
  const orgId = Number(args.find((a) => !a.startsWith("--")));
  if (!Number.isInteger(orgId)) throw new Error("Informe o org id.");

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (!org) throw new Error(`Organização ${orgId} não encontrada`);

  const [{ existing }] = await db
    .select({ existing: sql<number>`count(*)` })
    .from(roadSafetyFactorsTable)
    .where(eq(roadSafetyFactorsTable.organizationId, orgId));

  const wb = XLSX.readFile(FILE);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(
    wb.Sheets["Fatores de Desempenho"],
    { header: 1, defval: null, raw: false },
  );
  const dataRows = rows
    .slice(7)
    .filter((r) => r && r[0] && String(r[0]).trim());

  const factors = dataRows.map((r, i) => {
    const forma = clean(r[5]);
    const detalhe = clean(r[6]);
    const monitoringDetail =
      [forma, detalhe]
        .filter((x, idx, arr) => x && arr.indexOf(x) === idx)
        .join(" — ") || null;
    return {
      sheetCode: clean(r[0]),
      values: {
        organizationId: orgId,
        code: planilhaCode(r[0]),
        type: mapType(r[1]),
        origin: mapOrigin(r[2]),
        normItem: null,
        isAdditional: false,
        name: clean(r[3]) ?? `Fator ${i + 1}`,
        analysis: clean(r[4]),
        currentDiagnosis: clean(r[8]),
        monitoringForm: mapMonitoringForm(r[5]),
        periodicity: mapPeriodicity(r[7]),
        measureUnit: clean(r[7]),
        goal: null as string | null,
        responsibleUserId: null as number | null,
        monitoringDetail,
        gutGravity: clampGut(r[9]),
        gutUrgency: clampGut(r[10]),
        gutTendency: clampGut(r[11]),
        existingControls: clean(r[14]),
        controlStatus: "scheduled",
        reviewDeadline: null as string | null,
        actionPlanRef: norm(r[16]) === "n/a" ? null : clean(r[16]),
      },
    };
  });

  // ─── Modo recodificação: atualiza os códigos dos FDs já importados ─────────
  if (recode) {
    const current = await db
      .select()
      .from(roadSafetyFactorsTable)
      .where(eq(roadSafetyFactorsTable.organizationId, orgId))
      .orderBy(asc(roadSafetyFactorsTable.id));
    console.log(
      `Org: ${org.name} (id=${orgId}) · recodificação · ${apply ? "MODO: APLICAR" : "MODO: dry-run"}`,
    );
    if (current.length !== factors.length) {
      console.log(
        `\n⚠ ${current.length} FDs no sistema vs ${factors.length} na planilha — abortado (precisam bater).`,
      );
      process.exit(1);
    }
    // Ordem de cadastro (id) = ordem da planilha — o import inseriu em ordem.
    const changes = current.map((e, i) => ({
      id: e.id,
      from: e.code,
      to: factors[i].values.code,
      name: e.name,
    }));
    console.log("");
    for (const c of changes) {
      console.log(
        `  ${c.from} → ${c.to}${c.from === c.to ? "  (sem mudança)" : ""}   ${c.name}`,
      );
    }
    if (!apply) {
      console.log(
        "\n*** DRY-RUN — nada gravado. Rode com --recode --apply para aplicar. ***",
      );
      process.exit(0);
    }
    let changed = 0;
    for (const c of changes) {
      if (c.from === c.to) continue;
      await db
        .update(roadSafetyFactorsTable)
        .set({ code: c.to })
        .where(eq(roadSafetyFactorsTable.id, c.id));
      changed += 1;
    }
    console.log(`\n✓ Recodificados: ${changed} fatores.`);
    process.exit(0);
  }

  console.log(`Org: ${org.name} (id=${orgId})`);
  console.log(
    `Planilha FPLAN 005: ${factors.length} fatores · FDs já no sistema: ${existing} · ${apply ? "MODO: APLICAR" : "MODO: dry-run"}\n`,
  );
  for (const f of factors) {
    const v = f.values;
    const gut = v.gutGravity * v.gutUrgency * v.gutTendency;
    console.log(
      `${v.code} (planilha ${f.sheetCode})  ${v.type} · ${v.origin}  GUT ${v.gutGravity}×${v.gutUrgency}×${v.gutTendency}=${gut}`,
    );
    console.log(`   ${v.name}`);
  }

  if (Number(existing) > 0) {
    console.log(
      `\n⚠ A org ${orgId} já tem ${existing} fatores de desempenho — import abortado para não duplicar.`,
    );
    process.exit(1);
  }

  if (!apply) {
    console.log(
      "\n*** DRY-RUN — nada foi gravado. Rode de novo com --apply para importar. ***",
    );
    process.exit(0);
  }

  let n = 0;
  for (const f of factors) {
    await db.insert(roadSafetyFactorsTable).values(f.values);
    n += 1;
  }
  console.log(`\n✓ Importados: ${n} fatores de desempenho.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

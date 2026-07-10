/**
 * Backfill (Catálogo de Normas): traz organizações existentes para o novo
 * catálogo por-org de normas (`regulatory_norms`).
 *
 *  1) Seed: garante as 4 normas padrão em toda organização (idempotente).
 *  2) KPI: converte `kpi_indicators.norms` de códigos legados (strings, ex.
 *     "9001") para ids do catálogo (números). Indicadores já migrados (array
 *     de números) são ignorados.
 *  3) Obrigatoriedade: para `training_requirements` com `norm` (texto legado)
 *     preenchido e `norm_ids` ainda vazio, garante uma entrada no catálogo
 *     para aquele label exato e preenche `norm_ids`.
 *
 * Não-destrutivo: só INSERT ... ON CONFLICT DO NOTHING e UPDATE (nunca
 * DELETE); a coluna legada `norm`/os códigos antigos não são apagados.
 *
 * SEM --commit: dry-run — calcula e imprime contagens, não grava nada.
 * COM --commit: aplica de verdade, em uma transação por organização
 * (BEGIN/COMMIT; ROLLBACK e segue para a próxima org em caso de erro).
 *
 * Uso:
 *   pnpm --filter @workspace/scripts backfill-norms-catalog             → dry-run
 *   pnpm --filter @workspace/scripts backfill-norms-catalog --commit    → aplica
 */
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

// Constantes self-contained: a fonte de verdade é
// artifacts/api-server/src/services/norms/defaults.ts (não importamos daqui
// pra não acoplar scripts/ ao build de api-server).
const DEFAULT_NORM_LABELS = [
  "ISO 9001 · cl. 9.1",
  "ISO 14001 · cl. 9.1",
  "ISO 39001 · cl. 9.1",
  "PR 2030",
];

const KPI_CODE_TO_LABEL: Record<string, string> = {
  "9001": "ISO 9001 · cl. 9.1",
  "14001": "ISO 14001 · cl. 9.1",
  "39001": "ISO 39001 · cl. 9.1",
};

const COMMIT = process.argv.includes("--commit");

type OrgRow = { id: number };
type NormRow = { id: number; label: string };
type KpiRow = { id: number; norms: unknown };
type ReqRow = { id: number; norm: string | null; norm_ids: unknown };

/** true quando `norms` já é (e só é) um array de números — nada a fazer. */
function isAlreadyNumeric(norms: unknown): boolean {
  return Array.isArray(norms) && norms.every((v) => typeof v === "number");
}

function mapFromRows(rows: NormRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.label.toLowerCase(), r.id);
  return map;
}

interface OrgPlan {
  orgId: number;
  newDefaultLabels: number;
  kpiToRemap: number;
  obligationsToFill: number;
  newCustomLabels: number;
}

/** Dry-run: só lê e calcula — nenhuma query de escrita é executada aqui. */
async function planOrg(orgId: number): Promise<OrgPlan> {
  const { rows: existingNorms } = await pool.query<NormRow>(
    `SELECT id, label FROM regulatory_norms WHERE organization_id = $1`,
    [orgId],
  );
  const map = mapFromRows(existingNorms);

  const newDefaultLabels = DEFAULT_NORM_LABELS.filter(
    (label) => !map.has(label.toLowerCase()),
  ).length;
  // Simula os defaults como já presentes (id placeholder) só para as contagens
  // abaixo refletirem o estado pós-seed — nenhuma escrita acontece em dry-run.
  for (const label of DEFAULT_NORM_LABELS) {
    if (!map.has(label.toLowerCase())) map.set(label.toLowerCase(), -1);
  }

  const { rows: kpiRows } = await pool.query<KpiRow>(
    `SELECT id, norms FROM kpi_indicators WHERE organization_id = $1`,
    [orgId],
  );
  const kpiToRemap = kpiRows.filter((r) => !isAlreadyNumeric(r.norms)).length;

  const { rows: reqRows } = await pool.query<ReqRow>(
    `SELECT id, norm, norm_ids FROM training_requirements WHERE organization_id = $1`,
    [orgId],
  );
  let obligationsToFill = 0;
  let newCustomLabels = 0;
  const seenNewLabels = new Set<string>();
  for (const r of reqRows) {
    const norm = r.norm?.trim();
    const hasNormIds = Array.isArray(r.norm_ids) && r.norm_ids.length > 0;
    if (!norm || hasNormIds) continue;
    obligationsToFill++;
    const key = norm.toLowerCase();
    if (!map.has(key) && !seenNewLabels.has(key)) {
      seenNewLabels.add(key);
      newCustomLabels++;
    }
  }

  return {
    orgId,
    newDefaultLabels,
    kpiToRemap,
    obligationsToFill,
    newCustomLabels,
  };
}

interface OrgApplyResult {
  kpiUpdated: number;
  obligationsUpdated: number;
  newLabelsCreated: number;
}

/** --commit: aplica de fato, dentro da transação já aberta pelo chamador. */
async function applyOrg(
  client: PoolClient,
  orgId: number,
): Promise<OrgApplyResult> {
  // 1) Seed dos 4 labels padrão (idempotente).
  for (let i = 0; i < DEFAULT_NORM_LABELS.length; i++) {
    await client.query(
      `INSERT INTO regulatory_norms (organization_id, label, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [orgId, DEFAULT_NORM_LABELS[i], i],
    );
  }

  // 2) Mapa label(lower) -> id, já com os defaults garantidos.
  const { rows: normRows } = await client.query<NormRow>(
    `SELECT id, label FROM regulatory_norms WHERE organization_id = $1`,
    [orgId],
  );
  const map = mapFromRows(normRows);
  const { rows: sortRows } = await client.query<{ max: number | null }>(
    `SELECT MAX(sort_order) AS max FROM regulatory_norms WHERE organization_id = $1`,
    [orgId],
  );
  let nextSortOrder = (sortRows[0]?.max ?? -1) + 1;

  // 3) KPI: códigos legados (string) -> ids do catálogo.
  const { rows: kpiRows } = await client.query<KpiRow>(
    `SELECT id, norms FROM kpi_indicators WHERE organization_id = $1`,
    [orgId],
  );
  let kpiUpdated = 0;
  for (const row of kpiRows) {
    if (isAlreadyNumeric(row.norms)) continue; // já migrado — idempotente
    const codes = Array.isArray(row.norms) ? row.norms : [];
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const code of codes) {
      // Array mista (já parcialmente migrada): preserva ids numéricos que já
      // apontam pro catálogo em vez de descartá-los.
      if (typeof code === "number") {
        if (!seen.has(code)) {
          seen.add(code);
          ids.push(code);
        }
        continue;
      }
      const label =
        typeof code === "string" ? KPI_CODE_TO_LABEL[code] : undefined;
      if (!label) continue; // código desconhecido: descarta
      const id = map.get(label.toLowerCase());
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    await client.query(
      `UPDATE kpi_indicators SET norms = $1::jsonb WHERE id = $2`,
      [JSON.stringify(ids), row.id],
    );
    kpiUpdated++;
  }

  // 4) Obrigatoriedade: `norm` (texto legado) -> `norm_ids`.
  const { rows: reqRows } = await client.query<ReqRow>(
    `SELECT id, norm, norm_ids FROM training_requirements WHERE organization_id = $1`,
    [orgId],
  );
  let obligationsUpdated = 0;
  let newLabelsCreated = 0;
  for (const row of reqRows) {
    const norm = row.norm?.trim();
    const hasNormIds = Array.isArray(row.norm_ids) && row.norm_ids.length > 0;
    if (!norm || hasNormIds) continue;

    const key = norm.toLowerCase();
    let normId = map.get(key);
    if (normId == null) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO regulatory_norms (organization_id, label, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [orgId, norm, nextSortOrder],
      );
      if (inserted.rows.length > 0) {
        normId = inserted.rows[0].id;
        nextSortOrder++;
        newLabelsCreated++;
      } else {
        // Corrida com outra entrada de label equivalente já criada antes.
        const existing = await client.query<{ id: number }>(
          `SELECT id FROM regulatory_norms WHERE organization_id = $1 AND lower(label) = lower($2)`,
          [orgId, norm],
        );
        normId = existing.rows[0]?.id;
      }
      if (normId == null) {
        throw new Error(
          `Não foi possível resolver/criar a norma "${norm}" (org ${orgId})`,
        );
      }
      map.set(key, normId);
    }

    await client.query(
      `UPDATE training_requirements SET norm_ids = $1::jsonb WHERE id = $2`,
      [JSON.stringify([normId]), row.id],
    );
    obligationsUpdated++;
  }

  return { kpiUpdated, obligationsUpdated, newLabelsCreated };
}

async function main(): Promise<void> {
  const { rows: orgs } = await pool.query<OrgRow>(
    `SELECT id FROM organizations ORDER BY id`,
  );

  console.log(`=== Backfill Catálogo de Normas ===`);
  console.log(`Organizações: ${orgs.length}`);
  console.log(
    COMMIT ? "Modo: --commit (aplicando)" : "Modo: dry-run (nada será gravado)",
  );
  console.log("");

  let totalNewDefaultLabels = 0;
  let totalKpi = 0;
  let totalObligations = 0;
  let totalNewCustomLabels = 0;
  let failures = 0;

  for (const { id: orgId } of orgs) {
    if (!COMMIT) {
      const plan = await planOrg(orgId);
      totalNewDefaultLabels += plan.newDefaultLabels;
      totalKpi += plan.kpiToRemap;
      totalObligations += plan.obligationsToFill;
      totalNewCustomLabels += plan.newCustomLabels;
      if (
        plan.newDefaultLabels ||
        plan.kpiToRemap ||
        plan.obligationsToFill ||
        plan.newCustomLabels
      ) {
        console.log(
          `Org ${orgId}: normas padrão a criar=${plan.newDefaultLabels} · ` +
            `KPI a remapear=${plan.kpiToRemap} · obrigatoriedades a preencher=${plan.obligationsToFill} · ` +
            `labels novos (não-padrão) a criar=${plan.newCustomLabels}`,
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await applyOrg(client, orgId);
      await client.query("COMMIT");
      totalKpi += result.kpiUpdated;
      totalObligations += result.obligationsUpdated;
      totalNewCustomLabels += result.newLabelsCreated;
      if (
        result.kpiUpdated ||
        result.obligationsUpdated ||
        result.newLabelsCreated
      ) {
        console.log(
          `Org ${orgId}: KPI remapeados=${result.kpiUpdated} · ` +
            `obrigatoriedades preenchidas=${result.obligationsUpdated} · ` +
            `labels novos criados=${result.newLabelsCreated}`,
        );
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      failures++;
      console.error(`Org ${orgId}: falhou, revertido (ROLLBACK). Erro:`, err);
    } finally {
      client.release();
    }
  }

  console.log("");
  console.log("=== Totais ===");
  console.log(`Organizações processadas: ${orgs.length}`);
  if (COMMIT) {
    console.log(`KPI indicadores remapeados: ${totalKpi}`);
    console.log(`Obrigatoriedades preenchidas: ${totalObligations}`);
    console.log(
      `Labels de norma novos (não-padrão) criados: ${totalNewCustomLabels}`,
    );
  } else {
    console.log(
      `Labels padrão ainda ausentes (seriam seedados): ${totalNewDefaultLabels}`,
    );
    console.log(`KPI indicadores que SERIAM remapeados: ${totalKpi}`);
    console.log(`Obrigatoriedades que SERIAM preenchidas: ${totalObligations}`);
    console.log(
      `Labels de norma novos (não-padrão) que SERIAM criados: ${totalNewCustomLabels}`,
    );
    console.log(
      "\n*** DRY-RUN — nada foi gravado. Rode novamente com --commit para aplicar. ***",
    );
  }

  if (failures > 0) {
    console.error(
      `\n${failures} organização(ões) falharam e foram revertidas.`,
    );
    process.exitCode = 1;
  }
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    pool.end();
    process.exit(1);
  });

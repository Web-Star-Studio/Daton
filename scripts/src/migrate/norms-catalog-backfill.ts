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
 *  4) Catálogo de treinamentos: para `training_catalog` com `norm` (texto
 *     legado) preenchido e `norm_ids` vazio, resolve o label via alias
 *     (ISO 9001 §7.2 → ISO 9001 · cl. 9.1, PR2030 → PR 2030, …) e, quando não
 *     há equivalente (NR (MTE), ABNT ISO 10015, Procedimento interno, texto
 *     livre), CRIA a norma no catálogo — nada é perdido — e preenche `norm_ids`.
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
import {
  DEFAULT_NORM_LABELS,
  KPI_CODE_TO_LABEL,
  canonicalTrainingNormLabel,
} from "./norm-catalog";

const COMMIT = process.argv.includes("--commit");

type OrgRow = { id: number };
type NormRow = { id: number; label: string };
type KpiRow = { id: number; norms: unknown };
type ReqRow = { id: number; norm: string | null; norm_ids: unknown };
type CatalogRow = { id: number; norm: string | null; norm_ids: unknown };

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
  catalogToFill: number;
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

  const { rows: catalogRows } = await pool.query<CatalogRow>(
    `SELECT id, norm, norm_ids FROM training_catalog WHERE organization_id = $1`,
    [orgId],
  );
  let catalogToFill = 0;
  for (const r of catalogRows) {
    const norm = r.norm?.trim();
    const hasNormIds = Array.isArray(r.norm_ids) && r.norm_ids.length > 0;
    if (!norm || hasNormIds) continue;
    catalogToFill++;
    // Alias resolve para o label canônico; senão o próprio texto será criado.
    const key = canonicalTrainingNormLabel(norm).toLowerCase();
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
    catalogToFill,
    newCustomLabels,
  };
}

interface OrgApplyResult {
  kpiUpdated: number;
  kpiSkipped: number;
  obligationsUpdated: number;
  obligationsSkipped: number;
  catalogUpdated: number;
  catalogSkipped: number;
  newLabelsCreated: number;
  unknownCodes: string[];
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
  let kpiSkipped = 0;
  const unknownCodes: string[] = [];
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
      if (!label) {
        // código desconhecido: descarta, mas registra pro operador revisar.
        if (typeof code === "string") unknownCodes.push(code);
        continue;
      }
      const id = map.get(label.toLowerCase());
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    // Guarda de concorrência otimista: só grava se `norms` ainda é o mesmo
    // valor lido no início da transação — evita sobrescrever uma escrita
    // concorrente do app (READ COMMITTED não impede isso sozinho).
    const result = await client.query(
      `UPDATE kpi_indicators SET norms = $1::jsonb WHERE id = $2 AND norms = $3::jsonb`,
      [JSON.stringify(ids), row.id, JSON.stringify(row.norms)],
    );
    if ((result.rowCount ?? 0) > 0) {
      kpiUpdated++;
    } else {
      kpiSkipped++;
    }
  }

  // 4) Obrigatoriedade: `norm` (texto legado) -> `norm_ids`.
  const { rows: reqRows } = await client.query<ReqRow>(
    `SELECT id, norm, norm_ids FROM training_requirements WHERE organization_id = $1`,
    [orgId],
  );
  let obligationsUpdated = 0;
  let obligationsSkipped = 0;
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

    // Mesma guarda de concorrência otimista do bloco KPI acima.
    const result = await client.query(
      `UPDATE training_requirements SET norm_ids = $1::jsonb WHERE id = $2 AND norm_ids = $3::jsonb`,
      [JSON.stringify([normId]), row.id, JSON.stringify(row.norm_ids)],
    );
    if ((result.rowCount ?? 0) > 0) {
      obligationsUpdated++;
    } else {
      obligationsSkipped++;
    }
  }

  // 5) Catálogo de treinamentos: `norm` (texto legado) -> `norm_ids`.
  // Resolve via alias para os labels canônicos; cria a norma quando não há
  // equivalente (preserva NR (MTE), ABNT ISO 10015, Procedimento interno, …).
  const { rows: catalogRows } = await client.query<CatalogRow>(
    `SELECT id, norm, norm_ids FROM training_catalog WHERE organization_id = $1`,
    [orgId],
  );
  let catalogUpdated = 0;
  let catalogSkipped = 0;
  for (const row of catalogRows) {
    const raw = row.norm?.trim();
    const hasNormIds = Array.isArray(row.norm_ids) && row.norm_ids.length > 0;
    if (!raw || hasNormIds) continue;

    const label = canonicalTrainingNormLabel(raw);
    const key = label.toLowerCase();
    let normId = map.get(key);
    if (normId == null) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO regulatory_norms (organization_id, label, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [orgId, label, nextSortOrder],
      );
      if (inserted.rows.length > 0) {
        normId = inserted.rows[0].id;
        nextSortOrder++;
        newLabelsCreated++;
      } else {
        const existing = await client.query<{ id: number }>(
          `SELECT id FROM regulatory_norms WHERE organization_id = $1 AND lower(label) = lower($2)`,
          [orgId, label],
        );
        normId = existing.rows[0]?.id;
      }
      if (normId == null) {
        throw new Error(
          `Não foi possível resolver/criar a norma "${label}" (org ${orgId})`,
        );
      }
      map.set(key, normId);
    }

    const result = await client.query(
      `UPDATE training_catalog SET norm_ids = $1::jsonb WHERE id = $2 AND norm_ids = $3::jsonb`,
      [JSON.stringify([normId]), row.id, JSON.stringify(row.norm_ids)],
    );
    if ((result.rowCount ?? 0) > 0) {
      catalogUpdated++;
    } else {
      catalogSkipped++;
    }
  }

  return {
    kpiUpdated,
    kpiSkipped,
    obligationsUpdated,
    obligationsSkipped,
    catalogUpdated,
    catalogSkipped,
    newLabelsCreated,
    unknownCodes,
  };
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
  let totalKpiSkipped = 0;
  let totalObligations = 0;
  let totalObligationsSkipped = 0;
  let totalCatalog = 0;
  let totalCatalogSkipped = 0;
  let totalNewCustomLabels = 0;
  let failures = 0;
  const allUnknownCodes = new Set<string>();

  for (const { id: orgId } of orgs) {
    if (!COMMIT) {
      const plan = await planOrg(orgId);
      totalNewDefaultLabels += plan.newDefaultLabels;
      totalKpi += plan.kpiToRemap;
      totalObligations += plan.obligationsToFill;
      totalCatalog += plan.catalogToFill;
      totalNewCustomLabels += plan.newCustomLabels;
      if (
        plan.newDefaultLabels ||
        plan.kpiToRemap ||
        plan.obligationsToFill ||
        plan.catalogToFill ||
        plan.newCustomLabels
      ) {
        console.log(
          `Org ${orgId}: normas padrão a criar=${plan.newDefaultLabels} · ` +
            `KPI a remapear=${plan.kpiToRemap} · obrigatoriedades a preencher=${plan.obligationsToFill} · ` +
            `catálogo a preencher=${plan.catalogToFill} · ` +
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
      totalKpiSkipped += result.kpiSkipped;
      totalObligations += result.obligationsUpdated;
      totalObligationsSkipped += result.obligationsSkipped;
      totalCatalog += result.catalogUpdated;
      totalCatalogSkipped += result.catalogSkipped;
      totalNewCustomLabels += result.newLabelsCreated;
      for (const code of result.unknownCodes) allUnknownCodes.add(code);
      if (
        result.kpiUpdated ||
        result.obligationsUpdated ||
        result.catalogUpdated ||
        result.newLabelsCreated ||
        result.kpiSkipped ||
        result.obligationsSkipped ||
        result.catalogSkipped
      ) {
        console.log(
          `Org ${orgId}: KPI remapeados=${result.kpiUpdated} (skip=${result.kpiSkipped}) · ` +
            `obrigatoriedades preenchidas=${result.obligationsUpdated} (skip=${result.obligationsSkipped}) · ` +
            `catálogo preenchido=${result.catalogUpdated} (skip=${result.catalogSkipped}) · ` +
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
    if (totalKpiSkipped > 0) {
      console.log(
        `KPI indicadores pulados (escrita concorrente detectada): ${totalKpiSkipped}`,
      );
    }
    console.log(`Obrigatoriedades preenchidas: ${totalObligations}`);
    if (totalObligationsSkipped > 0) {
      console.log(
        `Obrigatoriedades puladas (escrita concorrente detectada): ${totalObligationsSkipped}`,
      );
    }
    console.log(
      `Itens do catálogo de treinamentos preenchidos: ${totalCatalog}`,
    );
    if (totalCatalogSkipped > 0) {
      console.log(
        `Itens do catálogo pulados (escrita concorrente detectada): ${totalCatalogSkipped}`,
      );
    }
    console.log(
      `Labels de norma novos (não-padrão) criados: ${totalNewCustomLabels}`,
    );
    if (allUnknownCodes.size > 0) {
      console.warn(
        `Códigos desconhecidos ignorados: ${[...allUnknownCodes].join(", ")}`,
      );
    }
  } else {
    console.log(
      `Labels padrão ainda ausentes (seriam seedados): ${totalNewDefaultLabels}`,
    );
    console.log(`KPI indicadores que SERIAM remapeados: ${totalKpi}`);
    console.log(`Obrigatoriedades que SERIAM preenchidas: ${totalObligations}`);
    console.log(
      `Itens do catálogo de treinamentos que SERIAM preenchidos: ${totalCatalog}`,
    );
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

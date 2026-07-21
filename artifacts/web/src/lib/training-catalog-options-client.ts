import {
  useListTrainingCatalogOptions,
  getListTrainingCatalogOptionsQueryKey,
  type TrainingCatalogOption,
} from "@workspace/api-client-react";

export type { TrainingCatalogOption };

export type TrainingCatalogOptionKind =
  | "category"
  | "modality"
  | "evidence_type"
  | "development_nature"
  | "knowledge_area";

/** Kinds que são listas de rótulo simples (sem semântica), com seletor por texto. */
export type LabelKind =
  | "category"
  | "modality"
  | "development_nature"
  | "knowledge_area";

/**
 * Catálogo completo de opções do catálogo de treinamentos (as três listas,
 * ativas + inativas), em uma única requisição. Espelha `useAllNorms`.
 */
export function useAllTrainingCatalogOptions(orgId: number) {
  return useListTrainingCatalogOptions(orgId, undefined, {
    query: {
      enabled: !!orgId,
      queryKey: getListTrainingCatalogOptionsQueryKey(orgId),
    },
  });
}

/** Filtra as opções de um kind, na ordem do catálogo (sortOrder, label). */
export function optionsOfKind(
  all: TrainingCatalogOption[],
  kind: TrainingCatalogOptionKind,
): TrainingCatalogOption[] {
  return all.filter((o) => o.kind === kind);
}

/** Rótulos ativos de um kind de rótulo (categoria/modalidade/natureza/área). */
export function activeLabelsOfKind(
  all: TrainingCatalogOption[],
  kind: LabelKind,
): string[] {
  return optionsOfKind(all, kind)
    .filter((o) => o.active)
    .map((o) => o.label);
}

/**
 * Opções do seletor de rótulo (categoria/modalidade): os ativos MAIS quaisquer
 * `extras` que precisam continuar visíveis mesmo desativados — o valor já
 * selecionado no form ou rótulos legados presentes nos itens. Dedup
 * case-insensitive, preservando a ordem do catálogo primeiro. Espelha o
 * `checkboxNorms`/`pickerMethodOptions`: desativar não pode sumir com o que já
 * está em uso na tela.
 */
export function mergeLabelOptions(
  activeLabels: string[],
  extras: (string | null | undefined)[],
): string[] {
  const seen = new Set(activeLabels.map((l) => l.toLowerCase()));
  const out = [...activeLabels];
  for (const raw of extras) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Tipos de evidência ativos, para o seletor de novos itens. */
export function activeEvidenceTypes(
  all: TrainingCatalogOption[],
): TrainingCatalogOption[] {
  return optionsOfKind(all, "evidence_type").filter((o) => o.active);
}

/**
 * Mapa code → option para tipos de evidência. Inclui INATIVOS de propósito: um
 * item já classificado com um tipo depois desativado ainda precisa resolver seu
 * rótulo e sua semântica (`provesCompetency`) — mesma razão do `buildNormLabelMap`.
 */
export function evidenceTypeByCode(
  all: TrainingCatalogOption[],
): Map<string, TrainingCatalogOption> {
  const m = new Map<string, TrainingCatalogOption>();
  for (const o of optionsOfKind(all, "evidence_type")) {
    if (o.code) m.set(o.code, o);
  }
  return m;
}

/** Um item comprova competência? Resolve pelo tipo de evidência do catálogo. */
export function evidenceCodeProves(
  byCode: Map<string, TrainingCatalogOption>,
  code: string | null | undefined,
): boolean {
  if (!code) return false;
  return byCode.get(code)?.provesCompetency ?? false;
}

/** Vocabulário legado que comprova (fallback quando o catálogo de evidência
 *  está vazio — janela DDL→backfill). Espelha o backend. */
const LEGACY_PROVING_EVIDENCE_CODES = ["capacitacao", "habilitacao"];

/**
 * Um item comprova competência, com o MESMO fallback legado do backend: se a org
 * ainda não tem NENHUM tipo de evidência no catálogo (janela deploy→backfill),
 * `capacitacao`/`habilitacao` continuam comprovando — senão os itens já
 * classificados perderiam o vínculo na UI. Com catálogo populado, ele manda.
 */
export function evidenceProves(
  all: TrainingCatalogOption[],
  code: string | null | undefined,
): boolean {
  if (!code) return false;
  const evidence = optionsOfKind(all, "evidence_type");
  if (evidence.length === 0)
    return LEGACY_PROVING_EVIDENCE_CODES.includes(code);
  return evidence.some((o) => o.code === code && o.provesCompetency);
}

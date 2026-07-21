import { db, trainingCatalogOptionsTable } from "@workspace/db";

/** As categorias que eram fixas em código, na mesma ordem em que apareciam. */
export const DEFAULT_TRAINING_CATEGORIES = [
  "Integração",
  "Reciclagem",
  "Capacitação",
  "Certificação",
  "Reunião",
];

/** As modalidades que eram fixas em código, na mesma ordem em que apareciam. */
export const DEFAULT_TRAINING_MODALITIES = [
  "Presencial",
  "EAD",
  "Híbrido",
  "Externo",
];

/**
 * Os 3 tipos de evidência que eram fixos em código. O `code` reusa exatamente o
 * valor legado gravado em `training_catalog.evidence_type` — assim os itens já
 * classificados seguem válidos sem migração de linha. As flags preservam a
 * semântica embutida (capacitação/habilitação provam; habilitação tem validade).
 */
export const DEFAULT_TRAINING_EVIDENCE_TYPES: {
  label: string;
  code: string;
  provesCompetency: boolean;
  requiresValidity: boolean;
}[] = [
  {
    label: "Capacitação",
    code: "capacitacao",
    provesCompetency: true,
    requiresValidity: false,
  },
  {
    label: "Habilitação",
    code: "habilitacao",
    provesCompetency: true,
    requiresValidity: true,
  },
  {
    label: "Conscientização",
    code: "conscientizacao",
    provesCompetency: false,
    requiresValidity: false,
  },
];

/**
 * Insere as sementes das três listas na org (idempotente por índice único).
 * Usado no register e no backfill. `onConflictDoNothing` não sobrescreve o que
 * o cliente já editou (rótulo/ordem/flags).
 */
export async function ensureDefaultTrainingCatalogOptions(
  orgId: number,
): Promise<void> {
  for (let i = 0; i < DEFAULT_TRAINING_CATEGORIES.length; i++) {
    await db
      .insert(trainingCatalogOptionsTable)
      .values({
        organizationId: orgId,
        kind: "category",
        label: DEFAULT_TRAINING_CATEGORIES[i],
        sortOrder: i,
      })
      .onConflictDoNothing();
  }

  for (let i = 0; i < DEFAULT_TRAINING_MODALITIES.length; i++) {
    await db
      .insert(trainingCatalogOptionsTable)
      .values({
        organizationId: orgId,
        kind: "modality",
        label: DEFAULT_TRAINING_MODALITIES[i],
        sortOrder: i,
      })
      .onConflictDoNothing();
  }

  for (let i = 0; i < DEFAULT_TRAINING_EVIDENCE_TYPES.length; i++) {
    const t = DEFAULT_TRAINING_EVIDENCE_TYPES[i];
    await db
      .insert(trainingCatalogOptionsTable)
      .values({
        organizationId: orgId,
        kind: "evidence_type",
        label: t.label,
        code: t.code,
        sortOrder: i,
        provesCompetency: t.provesCompetency,
        requiresValidity: t.requiresValidity,
      })
      .onConflictDoNothing();
  }
}

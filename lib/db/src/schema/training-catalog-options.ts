import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Catálogo gerenciável, por organização, das listas de opções do catálogo de
 * treinamentos: **Categoria**, **Modalidade** e **Tipo de evidência**. Substitui
 * as listas que eram fixas em código (`CATEGORIES`/`MODALITIES` e os `<option>`
 * de tipo de evidência), espelhando o padrão de `effectiveness_methods` e
 * `regulatory_norms`. Uma única tabela com discriminador `kind`.
 *
 * `training_catalog.category`/`modality` continuam TEXTO (sem FK): o catálogo só
 * governa as opções ofertadas no seletor (union catálogo ∪ usados ∪ padrão). O
 * `training_catalog.evidence_type` continua TEXTO guardando o **código** (`code`)
 * — as linhas existentes (`capacitacao`/`habilitacao`/`conscientizacao`) seguem
 * válidas porque as sementes reusam exatamente esses códigos.
 *
 * Colunas semânticas (`code`, `provesCompetency`, `requiresValidity`) só têm
 * significado para `kind = 'evidence_type'`; ficam no default (null/false) para
 * categoria e modalidade. `provesCompetency` é o que o resolvedor de competência
 * consulta (por org) no lugar do antigo array fixo `PROVING_EVIDENCE_TYPES`.
 */
export const TRAINING_CATALOG_OPTION_KINDS = [
  "category",
  "modality",
  "evidence_type",
  "development_nature",
  "knowledge_area",
] as const;
export type TrainingCatalogOptionKind =
  (typeof TRAINING_CATALOG_OPTION_KINDS)[number];

export const trainingCatalogOptionsTable = pgTable(
  "training_catalog_options",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    // 'category' | 'modality' | 'evidence_type'
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    // Código estável (máquina) — só usado por evidence_type: as linhas de treino
    // gravam este código em `training_catalog.evidence_type`. Renomear o rótulo
    // NÃO muda o código, então os treinos já gravados continuam apontando certo.
    // Null para categoria/modalidade (que casam por rótulo).
    code: text("code"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    // Semântica de tipo de evidência (irrelevante p/ categoria/modalidade):
    // um item de catálogo com evidence_type cujo option tem proves_competency=true
    // COMPROVA a competência-alvo quando concluído e válido.
    provesCompetency: boolean("proves_competency").notNull().default(false),
    // Sinaliza que este tipo exige validade (ex.: habilitação — CNH, MOPP).
    // Usado como dica na ficha do treinamento; não é regra rígida.
    requiresValidity: boolean("requires_validity").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Rótulo único por (org, kind) — case-insensitive.
    uniqueIndex("training_catalog_option_org_kind_lower_label_unique").on(
      table.organizationId,
      table.kind,
      sql`lower(${table.label})`,
    ),
    // Código único por (org, kind) quando presente (evidence_type). Garante que
    // um treino nunca aponte para um código ambíguo.
    uniqueIndex("training_catalog_option_org_kind_code_unique")
      .on(table.organizationId, table.kind, table.code)
      .where(sql`${table.code} is not null`),
  ],
);

export const insertTrainingCatalogOptionSchema = createInsertSchema(
  trainingCatalogOptionsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingCatalogOption = z.infer<
  typeof insertTrainingCatalogOptionSchema
>;
export type TrainingCatalogOption =
  typeof trainingCatalogOptionsTable.$inferSelect;

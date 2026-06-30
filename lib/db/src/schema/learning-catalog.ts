import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable } from "./organizations";
import { positionsTable } from "./departments";

/**
 * Catálogo de treinamentos (definições reutilizáveis) — ISO 10015.
 * Org-level. Um item do catálogo é o "template"; ao lançar um treino para um
 * colaborador a partir dele, os campos são copiados (snapshot) para
 * employee_trainings e o vínculo fica em employee_trainings.catalog_item_id.
 */
export const trainingCatalogTable = pgTable("training_catalog", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category"),
  modality: text("modality"),
  norm: text("norm"),
  clause: text("clause"),
  workloadHours: integer("workload_hours"),
  validityMonths: integer("validity_months"),
  isMandatory: boolean("is_mandatory").notNull().default(false),
  status: text("status").notNull().default("ativo"),
  targetCompetencyName: text("target_competency_name"),
  targetCompetencyType: text("target_competency_type"),
  targetCompetencyLevel: integer("target_competency_level"),
  defaultInstructor: text("default_instructor"),
  objective: text("objective"),
  programContent: text("program_content"),
  evaluationMethod: text("evaluation_method"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Banco de competências (catálogo gerenciável por organização).
 * Mesmo padrão do catálogo de perspectivas SWOT: nome é fonte de unicidade
 * case-insensitive; o texto-livre em employee_competencies.name e
 * position_competency_requirements.competency_name coexiste e é propagado em
 * rename. competencyType segue o modelo C-H-A (conhecimento/habilidade/atitude).
 */
export const competencyCatalogTable = pgTable(
  "competency_catalog",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    competencyType: text("competency_type"),
    category: text("category"),
    norm: text("norm"),
    isMandatory: boolean("is_mandatory").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("competency_catalog_org_lower_name_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
  ],
);

export type TrainingCatalogItem = typeof trainingCatalogTable.$inferSelect;
export type CompetencyCatalogItem = typeof competencyCatalogTable.$inferSelect;

/**
 * Obrigatoriedades (SP2): regra que torna um item do catálogo obrigatório para
 * um cargo. Alimenta o motor de auto-vínculo (applyTrainingRequirements) na
 * admissão e na mudança de cargo. Escopo geral (todas filiais) ou por filial.
 */
export const trainingRequirementsTable = pgTable("training_requirements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  positionId: integer("position_id")
    .notNull()
    .references(() => positionsTable.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .references(() => trainingCatalogTable.id, { onDelete: "cascade" }),
  deadlineType: text("deadline_type").notNull().default("rh"),
  deadlineDays: integer("deadline_days"),
  scope: text("scope").notNull().default("geral"),
  filialUnitIds: jsonb("filial_unit_ids")
    .notNull()
    .default(sql`'[]'::jsonb`)
    .$type<number[]>(),
  recurrence: text("recurrence").notNull().default("nao_repete"),
  isCritical: boolean("is_critical").notNull().default(false),
  norm: text("norm"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type TrainingRequirement = typeof trainingRequirementsTable.$inferSelect;

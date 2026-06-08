import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { usersTable } from "./users";

// SWOT factor type (rótulos PT-BR aplicados no cliente).
export type SwotFactorType = "strength" | "weakness" | "opportunity" | "threat";
export type SwotEnvironment = "internal" | "external";

/**
 * Fonte do objetivo estratégico vinculado a um fator (polimórfico, extensível).
 * `swot` = objetivo próprio do módulo SWOT; `kpi` = objetivo do módulo
 * Indicadores. Novas fontes podem ser adicionadas sem mudança de schema.
 */
export type SwotObjectiveSource = "swot" | "kpi";

export const swotFactorTypeEnum = pgEnum("swot_factor_type", [
  "strength",
  "weakness",
  "opportunity",
  "threat",
]);
export const swotEnvironmentEnum = pgEnum("swot_environment", ["internal", "external"]);

/**
 * Objetivos estratégicos do SWOT — próprios do módulo (separados do KPI) e
 * corporativos (nível organização). Os fatores referenciam um objetivo.
 */
export const swotObjectivesTable = pgTable("swot_objectives", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  code: varchar("code", { length: 20 }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Fator SWOT. Corporativo por padrão (`unitId` nulo); pode ser atribuído a uma
 * filial específica. Resultado (performance × relevância) e a decisão são
 * derivados em runtime — não persistidos — por função pura compartilhada.
 */
export const swotFactorsTable = pgTable(
  "swot_factors",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    // null = Corporativo; preserva o fator como corporativo se a filial for removida.
    unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    type: swotFactorTypeEnum("type").notNull(),
    environment: swotEnvironmentEnum("environment").notNull(),
    perspective: text("perspective"),
    // Performance e Relevância na escala FPLAN 1–4.
    performance: integer("performance").notNull().default(3),
    relevance: integer("relevance").notNull().default(3),
    /**
     * @deprecated substituído por objectiveSource + objectiveSourceId.
     * Mantido (sem uso) durante a transição para não dropar coluna em produção;
     * será removido em cleanup futuro.
     */
    objectiveId: integer("objective_id").references(() => swotObjectivesTable.id, { onDelete: "set null" }),
    // Vínculo polimórfico ao objetivo: fonte ("swot" | "kpi" | futuras) + id na fonte.
    objectiveSource: varchar("objective_source", { length: 20 }),
    objectiveSourceId: integer("objective_source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("swot_factors_org_unit_idx").on(table.organizationId, table.unitId),
  ],
);

export const insertSwotObjectiveSchema = createInsertSchema(swotObjectivesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSwotObjective = z.infer<typeof insertSwotObjectiveSchema>;
export type SwotObjective = typeof swotObjectivesTable.$inferSelect;

export const insertSwotFactorSchema = createInsertSchema(swotFactorsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSwotFactor = z.infer<typeof insertSwotFactorSchema>;
export type SwotFactor = typeof swotFactorsTable.$inferSelect;

/**
 * Catálogo de perspectivas SWOT por organização — a lista gerenciável que a
 * empresa pode ampliar (ex.: Qualidade, Ambiental, ESG...). A perspectiva
 * escolhida continua sendo persistida como texto em `swot_factors.perspective`
 * (sem FK), preservando os fatores já cadastrados; esta tabela apenas governa
 * quais nomes ficam disponíveis para seleção. Unicidade **case-insensitive** por
 * (organização, lower(nome)) — índice funcional que impede duplicatas por casing
 * ("Qualidade" vs "qualidade") e dá suporte ao create idempotente (ON CONFLICT).
 */
export const swotPerspectivesTable = pgTable(
  "swot_perspectives",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("swot_perspective_org_lower_name_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const insertSwotPerspectiveSchema = createInsertSchema(swotPerspectivesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSwotPerspective = z.infer<typeof insertSwotPerspectiveSchema>;
export type SwotPerspective = typeof swotPerspectivesTable.$inferSelect;

/**
 * Metodologia SWOT por tipo — configurável por empresa. Para cada tipo (exceto
 * Força, sempre positiva), o valor é o resultado a partir do qual se exige ação:
 * `resultado ≥ valor` ⇒ "requer plano de ação"; abaixo ⇒ "dentro da tolerância"
 * (conforme). Escala de resultado 1–16 (performance × relevância). Padrão = 8 para
 * os três tipos — baseline da rev 17 do formulário de planejamento da Gabardo
 * (1ª versão de referência) e valor inicial para novas organizações.
 */
export type SwotTolerances = {
  weakness: number;
  opportunity: number;
  threat: number;
};

/**
 * Metodologia SWOT da organização (uma por org). Aponta para a versão ativa;
 * o histórico de versões fica em `swotMethodologyVersionsTable` (auditável).
 * Espelha o padrão versionado da metodologia LAIA.
 */
export const swotMethodologiesTable = pgTable("swot_methodologies", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  activeVersionId: integer("active_version_id"),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  updatedById: integer("updated_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  // Uma metodologia por organização — impede parents duplicados em saves concorrentes.
  unique("swot_methodologies_organization_id_unique").on(table.organizationId),
]);

/**
 * Versão imutável da metodologia SWOT. Cada alteração das tolerâncias cria uma
 * nova versão (`versionNumber` incremental por metodologia), preservando o
 * histórico. A coluna `score_thresholds` (mantida por compatibilidade) guarda o
 * objeto de tolerâncias por tipo.
 */
export const swotMethodologyVersionsTable = pgTable(
  "swot_methodology_versions",
  {
    id: serial("id").primaryKey(),
    methodologyId: integer("methodology_id")
      .notNull()
      .references(() => swotMethodologiesTable.id, { onDelete: "cascade" }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    tolerances: jsonb("score_thresholds").$type<SwotTolerances>().notNull(),
    notes: text("notes"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("swot_methodology_version_unique").on(table.methodologyId, table.versionNumber),
  ],
);

export type SwotMethodology = typeof swotMethodologiesTable.$inferSelect;
export type SwotMethodologyVersion = typeof swotMethodologyVersionsTable.$inferSelect;

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

// ─── Domain enums — ISO 39001 · item 6.3 (Fatores de Desempenho da SV) ───────

/** Tipo do fator de desempenho. */
export type RoadSafetyFactorType = "exposure" | "intermediate" | "final";
export const ROAD_SAFETY_FACTOR_TYPES: RoadSafetyFactorType[] = [
  "exposure",
  "intermediate",
  "final",
];

/** Origem do fator (humano, veículo, via ou combinação). */
export type RoadSafetyFactorOrigin =
  | "human"
  | "vehicle"
  | "road"
  | "human_vehicle";
export const ROAD_SAFETY_FACTOR_ORIGINS: RoadSafetyFactorOrigin[] = [
  "human",
  "vehicle",
  "road",
  "human_vehicle",
];

/** Forma de monitoramento do fator. */
export type RoadSafetyMonitoringForm =
  | "indicator"
  | "report"
  | "internal_audit"
  | "other";
export const ROAD_SAFETY_MONITORING_FORMS: RoadSafetyMonitoringForm[] = [
  "indicator",
  "report",
  "internal_audit",
  "other",
];

/** Periodicidade de monitoramento. */
export type RoadSafetyPeriodicity =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";
export const ROAD_SAFETY_PERIODICITIES: RoadSafetyPeriodicity[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];

/** Status do controle / ação associada ao fator. */
export type RoadSafetyControlStatus =
  | "scheduled"
  | "regularized"
  | "non_conforming"
  | "overdue"
  | "in_progress";
export const ROAD_SAFETY_CONTROL_STATUSES: RoadSafetyControlStatus[] = [
  "scheduled",
  "regularized",
  "non_conforming",
  "overdue",
  "in_progress",
];

/** Itens normativos da ISO 39001 §6.3 que um FD pode atender. */
export const ROAD_SAFETY_NORM_ITEMS = [
  "6.3a",
  "6.3b",
  "6.3c.1",
  "6.3c.2",
  "6.3c.3",
  "6.3c.4",
  "6.3c.5",
  "6.3c.6",
  "6.3c.7",
  "6.3c.8",
  "6.3c.9",
  "6.3c.10",
] as const;
export type RoadSafetyNormItem = (typeof ROAD_SAFETY_NORM_ITEMS)[number];

// ─── Tables ──────────────────────────────────────────────────────────────────

/** Fator de Desempenho da Segurança Viária (ISO 39001 · 6.3). */
export const roadSafetyFactorsTable = pgTable(
  "road_safety_factors",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    /** Código sequencial por organização — FD01, FD02, … */
    code: varchar("code", { length: 20 }).notNull(),
    // Bloco A — Identificação
    type: varchar("type", { length: 20 }).notNull(),
    origin: varchar("origin", { length: 20 }),
    normItem: varchar("norm_item", { length: 20 }),
    isAdditional: boolean("is_additional").notNull().default(false),
    name: text("name").notNull(),
    analysis: text("analysis"),
    // Bloco B — Monitoramento
    monitoringForm: varchar("monitoring_form", { length: 30 }),
    periodicity: varchar("periodicity", { length: 20 }).notNull().default("monthly"),
    measureUnit: varchar("measure_unit", { length: 30 }),
    goal: numeric("goal", { precision: 15, scale: 4 }),
    responsibleUserId: integer("responsible_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    monitoringDetail: text("monitoring_detail"),
    // Bloco D — Análise GUT (cada eixo 1–5; relevância = G × U × T)
    gutGravity: integer("gut_gravity").notNull().default(1),
    gutUrgency: integer("gut_urgency").notNull().default(1),
    gutTendency: integer("gut_tendency").notNull().default(1),
    // Bloco E — Controles e ações
    existingControls: text("existing_controls"),
    controlStatus: varchar("control_status", { length: 20 })
      .notNull()
      .default("scheduled"),
    reviewDeadline: date("review_deadline"),
    actionPlanRef: varchar("action_plan_ref", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("road_safety_factors_org_idx").on(table.organizationId)],
);

/**
 * Lançamento de indicador de um FD — append-only. Correções geram um novo
 * registro; nenhum lançamento existente é editado.
 */
export const roadSafetyFactorMeasurementsTable = pgTable(
  "road_safety_factor_measurements",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    factorId: integer("factor_id")
      .notNull()
      .references(() => roadSafetyFactorsTable.id, { onDelete: "cascade" }),
    value: numeric("value", { precision: 15, scale: 4 }).notNull(),
    referenceDate: date("reference_date").notNull(),
    note: text("note"),
    createdByUserId: integer("created_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("road_safety_measurements_factor_idx").on(
      table.factorId,
      table.referenceDate,
    ),
  ],
);

// ─── Insert schemas + inferred types ─────────────────────────────────────────

export const insertRoadSafetyFactorSchema = createInsertSchema(
  roadSafetyFactorsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoadSafetyFactor = z.infer<typeof insertRoadSafetyFactorSchema>;
export type RoadSafetyFactor = typeof roadSafetyFactorsTable.$inferSelect;

export const insertRoadSafetyFactorMeasurementSchema = createInsertSchema(
  roadSafetyFactorMeasurementsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoadSafetyFactorMeasurement = z.infer<
  typeof insertRoadSafetyFactorMeasurementSchema
>;
export type RoadSafetyFactorMeasurement =
  typeof roadSafetyFactorMeasurementsTable.$inferSelect;

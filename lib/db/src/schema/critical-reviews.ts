import {
  date,
  index,
  integer,
  jsonb,
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

// ─── Domain ──────────────────────────────────────────────────────────────────

/** Periodicidade da análise crítica. */
export type CriticalReviewPeriodKind = "quarterly" | "semiannual" | "annual";
export const CRITICAL_REVIEW_PERIOD_KINDS: CriticalReviewPeriodKind[] = [
  "quarterly",
  "semiannual",
  "annual",
];

export type CriticalReviewStatus = "draft" | "completed";
export const CRITICAL_REVIEW_STATUSES: CriticalReviewStatus[] = [
  "draft",
  "completed",
];

/**
 * Análise Crítica pela Direção — ISO 9001/14001/39001 · §9.3.
 *
 * Registro periódico (trimestral/semestral/anual) que consolida as entradas
 * (§9.3.2) e as saídas/decisões (§9.3.3) da reunião de análise crítica. Os
 * tópicos de cada bloco são armazenados como mapa tópico → texto.
 */
export const criticalReviewsTable = pgTable(
  "critical_reviews",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    periodKind: varchar("period_kind", { length: 20 }).notNull(),
    year: integer("year").notNull(),
    /** 1–4 (trimestre), 1–2 (semestre) ou 1 (anual). */
    periodNumber: integer("period_number").notNull().default(1),
    reviewDate: date("review_date"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    participants: text("participants"),
    /** Entradas da análise crítica (§9.3.2) — tópico → texto de análise. */
    inputs: jsonb("inputs").$type<Record<string, string>>().notNull().default({}),
    /** Saídas / decisões da análise crítica (§9.3.3) — tópico → texto. */
    outputs: jsonb("outputs").$type<Record<string, string>>().notNull().default({}),
    createdByUserId: integer("created_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("critical_reviews_org_idx").on(table.organizationId)],
);

// ─── Insert schema + inferred types ──────────────────────────────────────────

export const insertCriticalReviewSchema = createInsertSchema(
  criticalReviewsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCriticalReview = z.infer<typeof insertCriticalReviewSchema>;
export type CriticalReview = typeof criticalReviewsTable.$inferSelect;

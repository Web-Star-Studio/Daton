import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const legislationsTable = pgTable("legislations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  number: text("number"),
  description: text("description"),
  tipoNorma: text("tipo_norma"),
  emissor: text("emissor"),
  level: text("level").notNull().default("federal"),
  status: text("status").notNull().default("vigente"),
  uf: text("uf"),
  municipality: text("municipality"),
  macrotema: text("macrotema"),
  subtema: text("subtema"),
  applicability: text("applicability"),
  publicationDate: date("publication_date"),
  sourceUrl: text("source_url"),
  applicableArticles: text("applicable_articles"),
  reviewFrequencyDays: integer("review_frequency_days"),
  observations: text("observations"),
  generalObservations: text("general_observations"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLegislationSchema = createInsertSchema(legislationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLegislation = z.infer<typeof insertLegislationSchema>;
export type Legislation = typeof legislationsTable.$inferSelect;

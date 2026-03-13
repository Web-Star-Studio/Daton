import { pgTable, text, serial, timestamp, integer, jsonb, unique, boolean } from "drizzle-orm/pg-core";
import { unitsTable } from "./units";
import { organizationsTable } from "./organizations";

export const questionnaireThemesTable = pgTable("questionnaire_themes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionnaireQuestionsTable = pgTable("questionnaire_questions", {
  id: serial("id").primaryKey(),
  themeId: integer("theme_id").notNull().references(() => questionnaireThemesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  questionNumber: text("question_number").notNull(),
  text: text("text").notNull(),
  type: text("type").notNull().default("single_select"),
  options: jsonb("options").$type<string[]>(),
  conditionalOn: text("conditional_on"),
  conditionalValue: text("conditional_value"),
  tags: jsonb("tags").$type<Record<string, string[]>>(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const unitQuestionnaireResponsesTable = pgTable("unit_questionnaire_responses", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => questionnaireQuestionsTable.id, { onDelete: "cascade" }),
  answer: jsonb("answer").$type<string | string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("unit_question_response_unique").on(table.unitId, table.questionId),
]);

export const unitComplianceTagsTable = pgTable("unit_compliance_tags", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  sourceQuestionId: integer("source_question_id").references(() => questionnaireQuestionsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("unit_tag_unique").on(table.unitId, table.tag),
]);

export type QuestionnaireTheme = typeof questionnaireThemesTable.$inferSelect;
export type QuestionnaireQuestion = typeof questionnaireQuestionsTable.$inferSelect;
export type UnitQuestionnaireResponse = typeof unitQuestionnaireResponsesTable.$inferSelect;
export type UnitComplianceTag = typeof unitComplianceTagsTable.$inferSelect;

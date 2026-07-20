import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  date,
  jsonb,
  unique,
  boolean,
  varchar,
  index,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { positionsTable } from "./departments";
import { usersTable } from "./users";

export type EmployeeRecordAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

/**
 * Notas por critério da avaliação de eficácia (escala 1–5, Kirkpatrick).
 * `behavior` = L3 (comportamento), `result` = L4 (resultado), `transfer` =
 * transferência para a equipe. A média dos três define eficaz (≥ 3).
 */
export type TrainingEffectivenessCriteria = {
  behavior: number;
  result: number;
  transfer: number;
};

export type PositionCompetencyMatrixSnapshotItem = {
  id: number;
  competencyName: string;
  competencyType: string;
  requiredLevel: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  name: text("name").notNull(),
  cpf: text("cpf"),
  email: text("email"),
  phone: text("phone"),
  birthDate: date("birth_date"),
  gender: text("gender"),
  education: text("education"),
  position: text("position"),
  department: text("department"),
  contractType: text("contract_type").notNull().default("clt"),
  admissionDate: date("admission_date"),
  terminationDate: date("termination_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Histórico de mudança de cargo do colaborador (Fase 6). Cada troca registra
// cargo anterior/novo, quem alterou e quantos treinamentos foram vinculados/
// aproveitados pelo recálculo automático de obrigatoriedades.
export const employeePositionChangesTable = pgTable(
  "employee_position_changes",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    previousPosition: text("previous_position"),
    newPosition: text("new_position"),
    changedByUserId: integer("changed_by_user_id").references(
      () => usersTable.id,
    ),
    trainingsGenerated: integer("trainings_generated").notNull().default(0),
    trainingsReused: integer("trainings_reused").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("epc_employee_idx").on(table.employeeId),
    // Consulta do Cronograma: filtra por org e ordena por data desc.
    index("epc_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const employeeProfileItemsTable = pgTable("employee_profile_items", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const employeeProfileItemAttachmentsTable = pgTable(
  "employee_profile_item_attachments",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => employeeProfileItemsTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: text("content_type").notNull(),
    objectPath: text("object_path").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const employeeCompetenciesTable = pgTable("employee_competencies", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("formacao"),
  requiredLevel: integer("required_level").notNull().default(1),
  acquiredLevel: integer("acquired_level").notNull().default(0),
  evidence: text("evidence"),
  attachments: jsonb("attachments")
    .$type<EmployeeRecordAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const employeeTrainingsTable = pgTable(
  "employee_trainings",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    objective: text("objective"),
    institution: text("institution"),
    // Instrutor do treinamento: nome (texto). Pode ser um funcionário escolhido
    // da lista OU um palestrante externo digitado livremente.
    instructor: text("instructor"),
    targetCompetencyName: text("target_competency_name"),
    targetCompetencyType: text("target_competency_type"),
    targetCompetencyLevel: integer("target_competency_level"),
    evaluationMethod: text("evaluation_method"),
    renewalMonths: integer("renewal_months"),
    workloadHours: numeric("workload_hours", {
      precision: 6,
      scale: 2,
      mode: "number",
    }),
    completionDate: date("completion_date"),
    expirationDate: date("expiration_date"),
    status: text("status").notNull().default("pendente"),
    /** Motivo obrigatório quando status = 'nao_aplicavel'. Nullable: registros
     *  históricos e os demais status não têm motivo. */
    notApplicableReason: text("not_applicable_reason"),
    attachments: jsonb("attachments")
      .$type<EmployeeRecordAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    legacyV1Id: text("legacy_v1_id").unique(),
    // Vínculo leve com o catálogo de treinamentos (training_catalog.id). Integer
    // simples no schema p/ evitar ciclo de import; a FK real entra por DDL
    // (employee_trainings_catalog_item_fk, ON DELETE SET NULL).
    catalogItemId: integer("catalog_item_id"),
    // SP2: prazo do pendente gerado por obrigatoriedade, e a regra de origem.
    // requirementId é integer simples no schema (FK real via DDL p/ evitar ciclo).
    dueDate: date("due_date"),
    requirementId: integer("requirement_id"),
    // SP6/B: workflow de eficácia — prazo e papel do avaliador atribuído.
    effectivenessDueDate: date("effectiveness_due_date"),
    effectivenessAssignedRole: varchar("effectiveness_assigned_role", {
      length: 20,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // SP6/B board: filtro por papel do avaliador
    index("et_effectiveness_role_idx").on(table.effectivenessAssignedRole),
    // SP6/B board: filtro por ano de conclusão
    index("et_completion_date_idx").on(table.completionDate),
  ],
);

export const trainingEffectivenessReviewsTable = pgTable(
  "training_effectiveness_reviews",
  {
    id: serial("id").primaryKey(),
    trainingId: integer("training_id")
      .notNull()
      .references(() => employeeTrainingsTable.id, { onDelete: "cascade" }),
    evaluatorUserId: integer("evaluator_user_id")
      .notNull()
      .references(() => usersTable.id),
    evaluationDate: date("evaluation_date").notNull(),
    // numeric, não integer: a média Kirkpatrick de 3 critérios é decimal por
    // natureza (3,67 → 7,3 na escala 0–10). Em integer o Postgres arredondava
    // em silêncio e a tela exibia um número que o banco não guardava.
    score: numeric("score", { precision: 4, scale: 2, mode: "number" }),
    isEffective: boolean("is_effective"),
    resultLevel: integer("result_level"),
    comments: text("comments"),
    // SP6/B: papel do avaliador na eficácia (gestor|rh|instrutor|colaborador).
    evaluatorRole: varchar("evaluator_role", { length: 20 }),
    // Wizard de eficácia: 'draft' = preenchimento em andamento (rascunho do
    // avaliador, NÃO conta como avaliação concluída em nenhuma coluna do board);
    // 'final' = avaliação registrada. Default 'final' para que todas as linhas
    // legadas — que só existiam quando finalizadas — continuem valendo.
    status: varchar("status", { length: 10 }).notNull().default("final"),
    // Notas por critério Kirkpatrick ({behavior,result,transfer}: 1–5). Antes só
    // a média derivada era persistida, então reabrir uma avaliação não conseguia
    // mostrar qual critério recebeu qual nota — e o rascunho não teria o que
    // reidratar.
    criteria: jsonb("criteria").$type<TrainingEffectivenessCriteria | null>(),
    attachments: jsonb("attachments")
      .$type<EmployeeRecordAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    legacyV1Id: text("legacy_v1_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // SP6/B board: cobre EXISTS(training_id=…) + latest-review (ORDER BY evaluation_date DESC, created_at DESC LIMIT 1)
    index("ter_training_id_date_idx").on(
      table.trainingId,
      table.evaluationDate,
      table.createdAt,
    ),
    // Rascunho é sempre buscado/substituído por (treino, avaliador, status).
    index("ter_draft_lookup_idx").on(
      table.trainingId,
      table.evaluatorUserId,
      table.status,
    ),
  ],
);

export const employeeAwarenessTable = pgTable("employee_awareness_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  description: text("description"),
  date: date("date").notNull(),
  policyDocumentId: integer("policy_document_id"),
  documentId: integer("document_id"),
  processId: integer("process_id"),
  objectiveId: integer("objective_id"),
  verificationMethod: text("verification_method"),
  result: text("result"),
  attachments: jsonb("attachments")
    .$type<EmployeeRecordAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const positionCompetencyRequirementsTable = pgTable(
  "position_competency_requirements",
  {
    id: serial("id").primaryKey(),
    positionId: integer("position_id")
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    competencyName: text("competency_name").notNull(),
    competencyType: text("competency_type").notNull().default("habilidade"),
    requiredLevel: integer("required_level").notNull().default(1),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    updatedById: integer("updated_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("position_competency_requirement_unique").on(
      table.positionId,
      table.competencyName,
      table.competencyType,
    ),
  ],
);

export const positionCompetencyMatrixRevisionsTable = pgTable(
  "position_competency_matrix_revisions",
  {
    id: serial("id").primaryKey(),
    positionId: integer("position_id")
      .notNull()
      .references(() => positionsTable.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    snapshot: jsonb("snapshot")
      .$type<PositionCompetencyMatrixSnapshotItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("position_competency_matrix_revision_unique").on(
      table.positionId,
      table.revisionNumber,
    ),
  ],
);

export const employeeUnitsTable = pgTable("employee_units", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id")
    .notNull()
    .references(() => unitsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
export type EmployeeProfileItem = typeof employeeProfileItemsTable.$inferSelect;
export type EmployeeProfileItemAttachment =
  typeof employeeProfileItemAttachmentsTable.$inferSelect;

export const insertCompetencySchema = createInsertSchema(
  employeeCompetenciesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompetency = z.infer<typeof insertCompetencySchema>;
export type EmployeeCompetency = typeof employeeCompetenciesTable.$inferSelect;

export const insertTrainingSchema = createInsertSchema(
  employeeTrainingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTraining = z.infer<typeof insertTrainingSchema>;
export type EmployeeTraining = typeof employeeTrainingsTable.$inferSelect;

export const insertTrainingEffectivenessReviewSchema = createInsertSchema(
  trainingEffectivenessReviewsTable,
).omit({ id: true, createdAt: true });
export type InsertTrainingEffectivenessReview = z.infer<
  typeof insertTrainingEffectivenessReviewSchema
>;
export type TrainingEffectivenessReview =
  typeof trainingEffectivenessReviewsTable.$inferSelect;

export const insertAwarenessSchema = createInsertSchema(
  employeeAwarenessTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAwareness = z.infer<typeof insertAwarenessSchema>;
export type EmployeeAwareness = typeof employeeAwarenessTable.$inferSelect;

export const insertPositionCompetencyRequirementSchema = createInsertSchema(
  positionCompetencyRequirementsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPositionCompetencyRequirement = z.infer<
  typeof insertPositionCompetencyRequirementSchema
>;
export type PositionCompetencyRequirement =
  typeof positionCompetencyRequirementsTable.$inferSelect;

export type PositionCompetencyMatrixRevision =
  typeof positionCompetencyMatrixRevisionsTable.$inferSelect;

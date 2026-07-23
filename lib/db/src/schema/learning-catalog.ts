import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  date,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable } from "./organizations";
import { positionsTable } from "./departments";
import { unitsTable } from "./units";
import { employeesTable, type EmployeeRecordAttachment } from "./employees";
import { usersTable } from "./users";

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
  // `category` = "Tipo de treinamento" na UI (rótulo renomeado; a coluna e o
  // kind do catálogo continuam `category` para não migrar dados).
  category: text("category"),
  modality: text("modality"),
  // Classificações adicionais, texto livre governado pelo catálogo gerenciável
  // (training_catalog_options, kinds development_nature/knowledge_area). Sobem
  // sem opções — o cliente cadastra em Configurações → Sistema → Treinamentos.
  developmentNature: text("development_nature"),
  knowledgeArea: text("knowledge_area"),
  // `norm`/`clause` são legado (texto livre / lista hardcoded). A norma passou a
  // referenciar o catálogo gerenciável (regulatory_norms) por id, multi-seleção,
  // mesmo modelo de training_requirements. Colunas mantidas p/ migração — não dropar.
  norm: text("norm"),
  clause: text("clause"),
  normIds: jsonb("norm_ids")
    .notNull()
    .default(sql`'[]'::jsonb`)
    .$type<number[]>(),
  workloadHours: numeric("workload_hours", {
    precision: 6,
    scale: 2,
    mode: "number",
  }),
  validityMonths: integer("validity_months"),
  isMandatory: boolean("is_mandatory").notNull().default(false),
  status: text("status").notNull().default("ativo"),
  /**
   * O que este item do catálogo COMPROVA quando concluído e válido:
   *
   *   'capacitacao'     → prova a competência-alvo
   *   'habilitacao'     → prova a competência-alvo; validade é obrigatória (CNH, MOPP)
   *   'conscientizacao' → NÃO prova competência (DDS, reunião matinal) — ISO 9001 §7.3
   *   null              → não classificado; não prova nem desprova nada
   *
   * `null` é o estado inicial de todos os itens e é um estado válido e permanente
   * para a cauda longa (itens com pouquíssimo uso). Um requisito que só poderia
   * ser provado por itens não classificados fica "nao_classificado", NUNCA "gap".
   */
  evidenceType: text("evidence_type"),
  targetCompetencyName: text("target_competency_name"),
  targetCompetencyType: text("target_competency_type"),
  targetCompetencyLevel: integer("target_competency_level"),
  // Um treino pode comprovar VÁRIAS competências (ISO 10015). Lista canônica de
  // {name, type, level}. As colunas target_competency_* singulares ficam como
  // legado (espelham o 1º item p/ quem ainda lê singular). Segue o padrão de
  // norm_ids (#160): jsonb array, notNull default [].
  targetCompetencies: jsonb("target_competencies")
    .$type<{ name: string; type: string; level: number }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
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
export const trainingRequirementsTable = pgTable(
  "training_requirements",
  {
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
    norm: text("norm"), // legado — não usado após a migração; será removido depois
    normIds: jsonb("norm_ids")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<number[]>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Evita obrigatoriedades duplicadas para o mesmo cargo+treinamento+escopo.
    // Mantém `scope` na chave para uma regra 'geral' coexistir com uma 'filial'.
    uniqueIndex("training_requirement_unique").on(
      table.organizationId,
      table.positionId,
      table.catalogItemId,
      table.scope,
    ),
  ],
);

export type TrainingRequirement = typeof trainingRequirementsTable.$inferSelect;

/**
 * Turmas (SP3): instância agendada de um item do catálogo, com participantes,
 * presença/notas e evidências. Concluir uma turma grava o employee_training de
 * cada participante presente e aprovado (serviço completeTrainingClass).
 */
export const trainingClassesTable = pgTable("training_classes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .references(() => trainingCatalogTable.id, { onDelete: "cascade" }),
  code: text("code"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  // LEGADO/derivado: a turma passou a abranger N filiais (training_class_units).
  // Esta coluna é mantida como espelho da PRIMEIRA filial vinculada — escrita
  // sempre pelo mesmo helper que grava os vínculos (replaceClassUnits), nunca
  // isoladamente, para não divergir da lista. Leia `units`, não este campo.
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  location: text("location"),
  instructor: text("instructor"),
  modality: text("modality"),
  workloadHours: numeric("workload_hours", {
    precision: 6,
    scale: 2,
    mode: "number",
  }),
  capacity: integer("capacity"),
  minScore: integer("min_score"),
  // Responsável pela turma (opcional). Decisão da cliente (2026-07-23): quando o
  // treinamento envolve várias filiais é online, com UM instrutor e UM
  // responsável pela turma inteira — não um por filial. FK para `users`
  // (responsável precisa de login para receber notificação/e-mail).
  responsibleUserId: integer("responsible_user_id").references(
    () => usersTable.id,
    { onDelete: "set null" },
  ),
  status: text("status").notNull().default("agendada"),
  notes: text("notes"),
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

/**
 * Filiais de uma turma (N:N turma ↔ filial). Uma mesma turma pode atender
 * várias filiais (treino online/corporativo).
 *
 * `responsibleUserId` (por filial) está DORMENTE: a cliente decidiu
 * (2026-07-23) que o responsável é da TURMA inteira, não por filial — ver
 * `trainingClassesTable.responsibleUserId`. A coluna é mantida (não dropada)
 * para reversibilidade caso um dia queiram cobrança local por unidade; a
 * aplicação não a lê nem escreve.
 */
export const trainingClassUnitsTable = pgTable(
  "training_class_units",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => trainingClassesTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    // DORMENTE — ver comentário do bloco. Não usar; o responsável é da turma.
    responsibleUserId: integer("responsible_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("training_class_unit_uq").on(table.classId, table.unitId),
    index("training_class_units_unit_idx").on(table.unitId),
  ],
);

export const trainingClassParticipantsTable = pgTable(
  "training_class_participants",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => trainingClassesTable.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    attendance: text("attendance"),
    // numeric: a nota de turma admite meio ponto (8,5). Ver employees.ts / score.
    score: numeric("score", { precision: 4, scale: 2, mode: "number" }),
    result: text("result"),
    // FK real para employee_trainings via DDL (set null) — evita ciclo de import.
    employeeTrainingId: integer("employee_training_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("training_class_participant_unique").on(
      table.classId,
      table.employeeId,
    ),
  ],
);

export type TrainingClass = typeof trainingClassesTable.$inferSelect;
export type TrainingClassUnit = typeof trainingClassUnitsTable.$inferSelect;
export type TrainingClassParticipant =
  typeof trainingClassParticipantsTable.$inferSelect;

/**
 * Programa Anual de Treinamento — PAT (SP4): itens planejados por ano/filial.
 * Cada item pode ser cumprido por uma turma (classId). Status manual no SP4.
 */
export const annualTrainingProgramTable = pgTable("annual_training_program", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .references(() => trainingCatalogTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  plannedMonth: integer("planned_month"),
  modality: text("modality"),
  plannedQuantity: integer("planned_quantity"),
  responsible: text("responsible"),
  status: text("status").notNull().default("planejada"),
  notes: text("notes"),
  // turma que cumpre o item; FK real via DDL (set null), padrão do repo.
  classId: integer("class_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AnnualTrainingProgramItem =
  typeof annualTrainingProgramTable.$inferSelect;

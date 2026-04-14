CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status_operacional" text DEFAULT 'ativa',
	"trade_name" text,
	"legal_identifier" text,
	"opening_date" text,
	"tax_regime" text,
	"primary_cnae" text,
	"state_registration" text,
	"municipal_registration" text,
	"onboarding_status" text DEFAULT 'completed' NOT NULL,
	"onboarding_data" jsonb,
	"onboarding_completed_at" timestamp with time zone,
	"auth_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_module_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"module" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_module_unique" UNIQUE("user_id","module")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"organization_id" integer NOT NULL,
	"role" text DEFAULT 'analyst' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"type" text DEFAULT 'filial' NOT NULL,
	"cnpj" text,
	"status" text DEFAULT 'ativa' NOT NULL,
	"cep" text,
	"address" text,
	"street_number" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"country" text DEFAULT 'Brasil',
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legislations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"number" text,
	"description" text,
	"tipo_norma" text,
	"emissor" text,
	"level" text DEFAULT 'federal' NOT NULL,
	"status" text DEFAULT 'vigente' NOT NULL,
	"uf" text,
	"municipality" text,
	"macrotema" text,
	"subtema" text,
	"applicability" text,
	"publication_date" date,
	"source_url" text,
	"applicable_articles" text,
	"review_frequency_days" integer,
	"observations" text,
	"general_observations" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_legislations" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"legislation_id" integer NOT NULL,
	"compliance_status" text DEFAULT 'nao_avaliado' NOT NULL,
	"notes" text,
	"evidence_url" text,
	"evaluated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_legislation_unique" UNIQUE("unit_id","legislation_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_legislation_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" integer NOT NULL,
	"code" text NOT NULL,
	"question_number" text NOT NULL,
	"text" text NOT NULL,
	"type" text DEFAULT 'single_select' NOT NULL,
	"options" jsonb,
	"conditional_on" text,
	"conditional_value" text,
	"tags" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_questions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_themes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "unit_compliance_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"tag" text NOT NULL,
	"source_question_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_tag_unique" UNIQUE("unit_id","tag")
);
--> statement-breakpoint
CREATE TABLE "unit_questionnaire_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"answer" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_question_response_unique" UNIQUE("unit_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "employee_awareness_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"topic" text NOT NULL,
	"description" text,
	"date" date NOT NULL,
	"policy_document_id" integer,
	"document_id" integer,
	"process_id" integer,
	"objective_id" integer,
	"verification_method" text,
	"result" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_competencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'formacao' NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"acquired_level" integer DEFAULT 0 NOT NULL,
	"evidence" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_profile_item_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_profile_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_trainings" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"objective" text,
	"institution" text,
	"target_competency_name" text,
	"target_competency_type" text,
	"target_competency_level" integer,
	"evaluation_method" text,
	"renewal_months" integer,
	"workload_hours" integer,
	"completion_date" date,
	"expiration_date" date,
	"status" text DEFAULT 'pendente' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer,
	"name" text NOT NULL,
	"cpf" text,
	"email" text,
	"phone" text,
	"position" text,
	"department" text,
	"contract_type" text DEFAULT 'clt' NOT NULL,
	"admission_date" date,
	"termination_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_competency_matrix_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_competency_matrix_revision_unique" UNIQUE("position_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "position_competency_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer NOT NULL,
	"competency_name" text NOT NULL,
	"competency_type" text DEFAULT 'habilidade' NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_competency_requirement_unique" UNIQUE("position_id","competency_name","competency_type")
);
--> statement-breakpoint
CREATE TABLE "training_effectiveness_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_id" integer NOT NULL,
	"evaluator_user_id" integer NOT NULL,
	"evaluation_date" date NOT NULL,
	"score" integer,
	"is_effective" boolean,
	"result_level" integer,
	"comments" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"education" text,
	"experience" text,
	"requirements" text,
	"responsibilities" text,
	"level" text,
	"min_salary" integer,
	"max_salary" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_unit_unique" UNIQUE("department_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "document_approvers" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"comment" text,
	"approval_cycle" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"uploaded_by_id" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_critical_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"analysis_cycle" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_critical_analysis_document_user_cycle_unique" UNIQUE("document_id","user_id","analysis_cycle")
);
--> statement-breakpoint
CREATE TABLE "document_critical_reviewers" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_critical_reviewers_document_user_unique" UNIQUE("document_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "document_elaborators" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_recipient_group_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_recipient_group_links_document_group_unique" UNIQUE("document_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "document_recipient_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_recipient_group_members_group_user_unique" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "document_recipient_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_recipient_user_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_recipient_user_links_document_user_unique" UNIQUE("document_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "document_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"received_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"referenced_document_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"change_description" text NOT NULL,
	"changed_by_id" integer NOT NULL,
	"changed_fields" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'manual' NOT NULL,
	"source_entity_type" text,
	"source_entity_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"pending_version_description" text,
	"normative_requirements" text[] DEFAULT '{}'::text[] NOT NULL,
	"validity_date" date,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_contact_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_contact_group_members_group_contact_unique" UNIQUE("group_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "organization_contact_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_user_id" integer,
	"source_employee_id" integer,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"organization_name" text,
	"classification_type" text DEFAULT 'other' NOT NULL,
	"classification_description" text,
	"notes" text,
	"created_by_id" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_contacts_org_source_user_unique" UNIQUE("organization_id","source_user_id"),
	CONSTRAINT "organization_contacts_org_source_employee_unique" UNIQUE("organization_id","source_employee_id")
);
--> statement-breakpoint
CREATE TABLE "corrective_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"nonconformity_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"responsible_user_id" integer,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"execution_notes" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_audit_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"audit_id" integer NOT NULL,
	"label" text NOT NULL,
	"requirement_ref" text,
	"result" text DEFAULT 'not_evaluated' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_audit_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"audit_id" integer NOT NULL,
	"process_id" integer,
	"requirement_ref" text,
	"classification" text NOT NULL,
	"description" text NOT NULL,
	"responsible_user_id" integer,
	"due_date" date,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"corrective_action_id" integer,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"criteria" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"auditor_user_id" integer,
	"origin_type" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_asset_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"knowledge_asset_id" integer NOT NULL,
	"process_id" integer,
	"position_id" integer,
	"document_id" integer,
	"risk_opportunity_item_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"loss_risk_level" text DEFAULT 'medium' NOT NULL,
	"retention_method" text,
	"succession_plan" text,
	"evidence_attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_valid_until" date,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_review_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"input_type" text NOT NULL,
	"summary" text NOT NULL,
	"document_id" integer,
	"audit_id" integer,
	"nonconformity_id" integer,
	"strategic_plan_id" integer,
	"process_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_review_outputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"output_type" text NOT NULL,
	"description" text NOT NULL,
	"responsible_user_id" integer,
	"due_date" date,
	"process_id" integer,
	"nonconformity_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"review_date" date NOT NULL,
	"chair_user_id" integer,
	"minutes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonconformities" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"origin_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"classification" text,
	"root_cause" text,
	"responsible_user_id" integer,
	"process_id" integer,
	"document_id" integer,
	"risk_opportunity_item_id" integer,
	"audit_finding_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"effectiveness_result" text,
	"effectiveness_comment" text,
	"effectiveness_checked_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sgq_communication_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"system_domain" text DEFAULT 'sgq' NOT NULL,
	"context_type" text DEFAULT 'document' NOT NULL,
	"context_id" integer,
	"document_id" integer,
	"channel" text NOT NULL,
	"audience" text NOT NULL,
	"periodicity" text NOT NULL,
	"requires_acknowledgment" boolean DEFAULT false NOT NULL,
	"notes" text,
	"last_distributed_at" timestamp with time zone,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sgq_process_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"process_id" integer NOT NULL,
	"related_process_id" integer NOT NULL,
	"direction" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sgq_process_interaction_unique" UNIQUE("process_id","related_process_id","direction")
);
--> statement-breakpoint
CREATE TABLE "sgq_process_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"process_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"change_summary" text,
	"approved_by_id" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sgq_process_revision_number_unique" UNIQUE("process_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "sgq_processes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"owner_user_id" integer,
	"inputs" text[] DEFAULT '{}' NOT NULL,
	"outputs" text[] DEFAULT '{}' NOT NULL,
	"criteria" text,
	"indicators" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_revision_number" integer DEFAULT 1 NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sgq_process_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "laia_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer,
	"sector_id" integer,
	"methodology_version_id" integer,
	"aspect_code" text NOT NULL,
	"mode" text DEFAULT 'quick' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"activity_operation" text NOT NULL,
	"environmental_aspect" text NOT NULL,
	"environmental_impact" text NOT NULL,
	"temporality" text,
	"operational_situation" text,
	"incidence" text,
	"impact_class" text,
	"scope" text,
	"severity" text,
	"consequence_score" integer,
	"frequency_probability" text,
	"frequency_probability_score" integer,
	"total_score" integer,
	"category" text,
	"significance" text,
	"significance_reason" text,
	"has_legal_requirements" boolean DEFAULT false NOT NULL,
	"has_stakeholder_demand" boolean DEFAULT false NOT NULL,
	"has_strategic_option" boolean DEFAULT false NOT NULL,
	"normal_condition" boolean DEFAULT true NOT NULL,
	"abnormal_condition" boolean DEFAULT false NOT NULL,
	"startup_shutdown" boolean DEFAULT false NOT NULL,
	"emergency_scenario" text,
	"change_context" text,
	"lifecycle_stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"control_level" text DEFAULT 'direct_control' NOT NULL,
	"influence_level" text,
	"outsourced_process" text,
	"supplier_reference" text,
	"control_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"existing_controls" text,
	"control_required" text,
	"control_responsible_user_id" integer,
	"control_due_at" timestamp with time zone,
	"communication_required" boolean DEFAULT false NOT NULL,
	"communication_notes" text,
	"review_frequency_days" integer,
	"next_review_at" timestamp with time zone,
	"review_reminder_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_reminder_sent_at" timestamp with time zone,
	"notes" text,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "laia_assessment_org_code_unique" UNIQUE("organization_id","aspect_code")
);
--> statement-breakpoint
CREATE TABLE "laia_branch_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"survey_status" text DEFAULT 'nao_levantado' NOT NULL,
	"created_by_id" integer,
	"updated_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "laia_branch_config_org_unit_unique" UNIQUE("organization_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "laia_import_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer,
	"workbook_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laia_methodologies" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text DEFAULT 'Metodologia LAIA' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"active_version_id" integer,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laia_methodology_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"methodology_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"consequence_matrix" jsonb NOT NULL,
	"frequency_probability_matrix" jsonb NOT NULL,
	"score_thresholds" jsonb NOT NULL,
	"moderate_significance_rule" text NOT NULL,
	"document_content" jsonb,
	"notes" text,
	"published_at" timestamp with time zone,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "laia_methodology_version_unique" UNIQUE("methodology_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "laia_monitoring_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"assessment_id" integer NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"method" text NOT NULL,
	"indicator" text,
	"frequency" text NOT NULL,
	"delay_criteria" text,
	"responsible_user_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"next_due_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"reminder_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laia_monitoring_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"result" text DEFAULT 'informational' NOT NULL,
	"measured_value" text,
	"notes" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laia_requirement_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"type" text NOT NULL,
	"legislation_id" integer,
	"title" text NOT NULL,
	"requirement_reference" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laia_revision_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"revision_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"field_name" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laia_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"assessment_id" integer,
	"title" text,
	"description" text,
	"revision_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb,
	"created_by_id" integer NOT NULL,
	"finalized_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "laia_sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer,
	"department_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer,
	"updated_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "laia_sector_org_unit_code_unique" UNIQUE("organization_id","unit_id","code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"related_entity_type" text,
	"related_entity_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"organization_id" integer NOT NULL,
	"invited_by" integer NOT NULL,
	"role" text DEFAULT 'analyst' NOT NULL,
	"modules" text[] DEFAULT '{}'::text[] NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_action_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"action_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_plan_action_unit_unique" UNIQUE("action_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"swot_item_id" integer,
	"objective_id" integer,
	"risk_opportunity_item_id" integer,
	"responsible_user_id" integer,
	"secondary_responsible_user_id" integer,
	"due_date" timestamp with time zone,
	"rescheduled_due_date" timestamp with time zone,
	"reschedule_reason" text,
	"completed_at" timestamp with time zone,
	"completion_notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_interested_parties" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"name" text NOT NULL,
	"expected_requirements" text,
	"role_in_company" text,
	"role_summary" text,
	"relevant_to_management_system" boolean,
	"legal_requirement_applicable" boolean,
	"monitoring_method" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_objectives" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"code" text NOT NULL,
	"system_domain" text,
	"description" text NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_reviewers" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"review_cycle" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"read_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_plan_reviewer_cycle_unique" UNIQUE("plan_id","user_id","review_cycle")
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"review_cycle" integer DEFAULT 1 NOT NULL,
	"revision_number" integer NOT NULL,
	"revision_date" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"change_summary" text,
	"approved_by_id" integer NOT NULL,
	"evidence_document_id" integer,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_risk_opportunity_effectiveness_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"risk_opportunity_item_id" integer NOT NULL,
	"reviewed_by_id" integer NOT NULL,
	"result" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_risk_opportunity_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_reference" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"owner_user_id" integer,
	"co_owner_user_id" integer,
	"unit_id" integer,
	"objective_id" integer,
	"swot_item_id" integer,
	"likelihood" integer,
	"impact" integer,
	"score" integer,
	"response_strategy" text,
	"next_review_at" timestamp with time zone,
	"status" text DEFAULT 'identified' NOT NULL,
	"existing_controls" text,
	"expected_effect" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_plan_swot_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"domain" text NOT NULL,
	"matrix_label" text,
	"swot_type" text NOT NULL,
	"environment" text NOT NULL,
	"perspective" text,
	"description" text NOT NULL,
	"performance" integer,
	"relevance" integer,
	"result" integer,
	"treatment_decision" text,
	"linked_objective_code" text,
	"linked_objective_label" text,
	"imported_action_reference" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"standards" text[] DEFAULT '{"ISO 9001:2015"}' NOT NULL,
	"executive_summary" text,
	"review_frequency_months" integer DEFAULT 12 NOT NULL,
	"next_review_at" timestamp with time zone,
	"review_reason" text,
	"climate_change_relevant" boolean,
	"climate_change_justification" text,
	"technical_scope" text,
	"geographic_scope" text,
	"policy" text,
	"mission" text,
	"vision" text,
	"values" text,
	"strategic_conclusion" text,
	"methodology_notes" text,
	"legacy_methodology" text,
	"legacy_indicators_notes" text,
	"legacy_revision_history" jsonb,
	"reminder_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewer_ids" integer[] DEFAULT '{}' NOT NULL,
	"active_revision_number" integer DEFAULT 0 NOT NULL,
	"imported_workbook_name" text,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_knowledge_article_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_markdown" text NOT NULL,
	"checksum" text NOT NULL,
	"published_by_id" integer NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_knowledge_article_revision_unique" UNIQUE("article_id","version")
);
--> statement-breakpoint
CREATE TABLE "product_knowledge_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"body_markdown" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"checksum" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"openai_file_id" text,
	"last_indexed_at" timestamp with time zone,
	"last_index_status" text DEFAULT 'not_indexed' NOT NULL,
	"last_index_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_knowledge_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "supplier_catalog_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"offering_type" text DEFAULT 'service' NOT NULL,
	"unit_of_measure" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_catalog_item_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "supplier_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_category_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "supplier_document_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"category_id" integer,
	"type_id" integer,
	"name" text NOT NULL,
	"description" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_document_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"reviewed_by_id" integer,
	"compliance_percentage" integer NOT NULL,
	"threshold" integer DEFAULT 80 NOT NULL,
	"result" text NOT NULL,
	"next_review_date" date,
	"criteria_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_document_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"requirement_id" integer NOT NULL,
	"submission_status" text DEFAULT 'pending' NOT NULL,
	"adequacy_status" text DEFAULT 'under_review' NOT NULL,
	"requested_reviewer_id" integer,
	"reviewed_by_id" integer,
	"reviewed_at" timestamp with time zone,
	"review_comment" text,
	"validity_date" date,
	"exemption_reason" text,
	"rejection_reason" text,
	"observations" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_document_submission_unique" UNIQUE("supplier_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"performance_review_id" integer,
	"receipt_check_id" integer,
	"failure_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_import_previews" (
	"preview_id" text PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"kind" text NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_offerings" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"catalog_item_id" integer,
	"name" text NOT NULL,
	"offering_type" text DEFAULT 'service' NOT NULL,
	"unit_of_measure" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_approved_scope" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_offering_supplier_catalog_unique" UNIQUE("supplier_id","catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_performance_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"offering_id" integer,
	"evaluated_by_id" integer,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"quality_score" integer NOT NULL,
	"delivery_score" integer NOT NULL,
	"communication_score" integer NOT NULL,
	"compliance_score" integer NOT NULL,
	"price_score" integer,
	"final_score" integer NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"conclusion" text NOT NULL,
	"observations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_qualification_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"reviewed_by_id" integer,
	"decision" text NOT NULL,
	"valid_until" date,
	"notes" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_offerings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_receipt_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"offering_id" integer,
	"unit_id" integer,
	"checked_by_id" integer,
	"authorized_by_id" integer,
	"receipt_date" date NOT NULL,
	"description" text NOT NULL,
	"reference_number" text,
	"quantity" text,
	"total_value" integer,
	"outcome" text NOT NULL,
	"acceptance_criteria" text NOT NULL,
	"notes" text,
	"non_conformity_status" text DEFAULT 'not_required' NOT NULL,
	"non_conformity_summary" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_requirement_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"communicated_by_id" integer,
	"status" text DEFAULT 'linked' NOT NULL,
	"notes" text,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_requirement_communication_unique" UNIQUE("supplier_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_requirement_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"category_id" integer,
	"type_id" integer,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" text NOT NULL,
	"change_summary" text,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_type_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_type_link_unique" UNIQUE("supplier_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"category_id" integer,
	"parent_type_id" integer,
	"name" text NOT NULL,
	"description" text,
	"document_threshold" integer DEFAULT 80 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_type_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "supplier_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_unit_unique" UNIQUE("supplier_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"category_id" integer,
	"person_type" text DEFAULT 'pj' NOT NULL,
	"legal_identifier" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"responsible_name" text,
	"state_registration" text,
	"municipal_registration" text,
	"rg" text,
	"email" text,
	"phone" text,
	"website" text,
	"postal_code" text,
	"street" text,
	"street_number" text,
	"complement" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"criticality" text DEFAULT 'medium' NOT NULL,
	"notes" text,
	"document_compliance_percentage" integer,
	"document_review_status" text,
	"document_review_next_date" date,
	"last_qualified_at" timestamp with time zone,
	"qualified_until" date,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_org_identifier_unique" UNIQUE("organization_id","legal_identifier")
);
--> statement-breakpoint
CREATE TABLE "kpi_indicators" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"measurement" text NOT NULL,
	"unit" varchar(200),
	"responsible" varchar(200),
	"measure_unit" varchar(50),
	"direction" varchar(4) NOT NULL,
	"periodicity" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_monthly_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"year_config_id" integer NOT NULL,
	"month" integer NOT NULL,
	"value" numeric(15, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_monthly_value_config_month_unique" UNIQUE("year_config_id","month")
);
--> statement-breakpoint
CREATE TABLE "kpi_objectives" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"code" varchar(20),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_year_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"indicator_id" integer NOT NULL,
	"objective_id" integer,
	"year" integer NOT NULL,
	"seq" integer,
	"goal" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_year_config_indicator_year_unique" UNIQUE("organization_id","indicator_id","year")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "asset_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_documents_asset_document_unique" UNIQUE("asset_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "asset_maintenance_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"record_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_maintenance_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'preventiva' NOT NULL,
	"periodicity" text DEFAULT 'mensal' NOT NULL,
	"checklist_items" text[] DEFAULT '{}'::text[] NOT NULL,
	"responsible_id" integer,
	"next_due_at" date,
	"original_next_due_at" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_maintenance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"executed_by_id" integer,
	"status" text DEFAULT 'concluida' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer,
	"name" text NOT NULL,
	"asset_type" text NOT NULL,
	"criticality" text DEFAULT 'media' NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"location" text,
	"impacted_process" text,
	"responsible_id" integer,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_resource_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"calibration_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_resource_calibrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"calibrated_at" date NOT NULL,
	"calibrated_by_id" integer,
	"certificate_number" text,
	"result" text DEFAULT 'apto' NOT NULL,
	"next_due_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer,
	"name" text NOT NULL,
	"identifier" text,
	"resource_type" text DEFAULT 'instrumento' NOT NULL,
	"responsible_id" integer,
	"valid_until" date,
	"status" text DEFAULT 'ativo' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_environment_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"verification_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_environment_controls" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"unit_id" integer,
	"factor_type" text DEFAULT 'fisico' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"responsible_id" integer,
	"frequency" text DEFAULT 'mensal' NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_environment_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"control_id" integer NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verified_by_id" integer,
	"result" text DEFAULT 'adequado' NOT NULL,
	"notes" text,
	"action_taken" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_project_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"change_description" text NOT NULL,
	"reason" text NOT NULL,
	"impact_description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" integer,
	"decided_at" timestamp with time zone,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_project_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_project_outputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"output_type" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_project_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"review_type" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"responsible_employee_id" integer,
	"occurred_at" timestamp with time zone,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_project_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"responsible_employee_id" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"evidence_note" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"applicability_decision_id" integer,
	"project_code" text,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"objective" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"responsible_employee_id" integer,
	"planned_start_date" date,
	"planned_end_date" date,
	"actual_end_date" date,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "development_project_org_title_unique" UNIQUE("organization_id","title")
);
--> statement-breakpoint
CREATE TABLE "requirement_applicability_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"requirement_code" text DEFAULT '8.3' NOT NULL,
	"is_applicable" boolean NOT NULL,
	"scope_summary" text,
	"justification" text NOT NULL,
	"responsible_employee_id" integer,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"approved_by_id" integer,
	"approved_at" timestamp with time zone,
	"valid_from" date,
	"valid_until" date,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_module_permissions" ADD CONSTRAINT "user_module_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legislations" ADD CONSTRAINT "legislations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_legislations" ADD CONSTRAINT "unit_legislations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_legislations" ADD CONSTRAINT "unit_legislations_legislation_id_legislations_id_fk" FOREIGN KEY ("legislation_id") REFERENCES "public"."legislations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_attachments" ADD CONSTRAINT "evidence_attachments_unit_legislation_id_unit_legislations_id_fk" FOREIGN KEY ("unit_legislation_id") REFERENCES "public"."unit_legislations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_theme_id_questionnaire_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."questionnaire_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_compliance_tags" ADD CONSTRAINT "unit_compliance_tags_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_compliance_tags" ADD CONSTRAINT "unit_compliance_tags_source_question_id_questionnaire_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."questionnaire_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_questionnaire_responses" ADD CONSTRAINT "unit_questionnaire_responses_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_questionnaire_responses" ADD CONSTRAINT "unit_questionnaire_responses_question_id_questionnaire_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questionnaire_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_awareness_records" ADD CONSTRAINT "employee_awareness_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_competencies" ADD CONSTRAINT "employee_competencies_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profile_item_attachments" ADD CONSTRAINT "employee_profile_item_attachments_item_id_employee_profile_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."employee_profile_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profile_items" ADD CONSTRAINT "employee_profile_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_units" ADD CONSTRAINT "employee_units_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_units" ADD CONSTRAINT "employee_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_competency_matrix_revisions" ADD CONSTRAINT "position_competency_matrix_revisions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_competency_matrix_revisions" ADD CONSTRAINT "position_competency_matrix_revisions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_competency_requirements" ADD CONSTRAINT "position_competency_requirements_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_competency_requirements" ADD CONSTRAINT "position_competency_requirements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_competency_requirements" ADD CONSTRAINT "position_competency_requirements_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_effectiveness_reviews" ADD CONSTRAINT "training_effectiveness_reviews_training_id_employee_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."employee_trainings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_effectiveness_reviews" ADD CONSTRAINT "training_effectiveness_reviews_evaluator_user_id_users_id_fk" FOREIGN KEY ("evaluator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_units" ADD CONSTRAINT "department_units_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_units" ADD CONSTRAINT "department_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approvers" ADD CONSTRAINT "document_approvers_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approvers" ADD CONSTRAINT "document_approvers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_critical_analysis" ADD CONSTRAINT "document_critical_analysis_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_critical_analysis" ADD CONSTRAINT "document_critical_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_critical_analysis" ADD CONSTRAINT "document_critical_analysis_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_critical_reviewers" ADD CONSTRAINT "document_critical_reviewers_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_critical_reviewers" ADD CONSTRAINT "document_critical_reviewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_elaborators" ADD CONSTRAINT "document_elaborators_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_elaborators" ADD CONSTRAINT "document_elaborators_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_group_links" ADD CONSTRAINT "document_recipient_group_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_group_links" ADD CONSTRAINT "document_recipient_group_links_group_id_organization_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."organization_contact_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_group_members" ADD CONSTRAINT "document_recipient_group_members_group_id_document_recipient_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."document_recipient_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_group_members" ADD CONSTRAINT "document_recipient_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_groups" ADD CONSTRAINT "document_recipient_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_groups" ADD CONSTRAINT "document_recipient_groups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_user_links" ADD CONSTRAINT "document_recipient_user_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipient_user_links" ADD CONSTRAINT "document_recipient_user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipients" ADD CONSTRAINT "document_recipients_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_recipients" ADD CONSTRAINT "document_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_references" ADD CONSTRAINT "document_references_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_references" ADD CONSTRAINT "document_references_referenced_document_id_documents_id_fk" FOREIGN KEY ("referenced_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_units" ADD CONSTRAINT "document_units_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contact_group_members" ADD CONSTRAINT "organization_contact_group_members_group_id_organization_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."organization_contact_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contact_group_members" ADD CONSTRAINT "organization_contact_group_members_contact_id_organization_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."organization_contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contact_groups" ADD CONSTRAINT "organization_contact_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contact_groups" ADD CONSTRAINT "organization_contact_groups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_source_employee_id_employees_id_fk" FOREIGN KEY ("source_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_nonconformity_id_nonconformities_id_fk" FOREIGN KEY ("nonconformity_id") REFERENCES "public"."nonconformities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_checklist_items" ADD CONSTRAINT "internal_audit_checklist_items_audit_id_internal_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."internal_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_findings" ADD CONSTRAINT "internal_audit_findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_findings" ADD CONSTRAINT "internal_audit_findings_audit_id_internal_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."internal_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_findings" ADD CONSTRAINT "internal_audit_findings_process_id_sgq_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_findings" ADD CONSTRAINT "internal_audit_findings_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_findings" ADD CONSTRAINT "internal_audit_findings_corrective_action_id_corrective_actions_id_fk" FOREIGN KEY ("corrective_action_id") REFERENCES "public"."corrective_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_findings" ADD CONSTRAINT "internal_audit_findings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audit_findings" ADD CONSTRAINT "internal_audit_findings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_auditor_user_id_users_id_fk" FOREIGN KEY ("auditor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_knowledge_asset_id_knowledge_assets_id_fk" FOREIGN KEY ("knowledge_asset_id") REFERENCES "public"."knowledge_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_process_id_sgq_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_asset_links" ADD CONSTRAINT "knowledge_asset_links_risk_opportunity_item_id_strategic_plan_risk_opportunity_items_id_fk" FOREIGN KEY ("risk_opportunity_item_id") REFERENCES "public"."strategic_plan_risk_opportunity_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD CONSTRAINT "knowledge_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD CONSTRAINT "knowledge_assets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_assets" ADD CONSTRAINT "knowledge_assets_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_inputs" ADD CONSTRAINT "management_review_inputs_review_id_management_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."management_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_inputs" ADD CONSTRAINT "management_review_inputs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_inputs" ADD CONSTRAINT "management_review_inputs_audit_id_internal_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."internal_audits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_inputs" ADD CONSTRAINT "management_review_inputs_nonconformity_id_nonconformities_id_fk" FOREIGN KEY ("nonconformity_id") REFERENCES "public"."nonconformities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_inputs" ADD CONSTRAINT "management_review_inputs_strategic_plan_id_strategic_plans_id_fk" FOREIGN KEY ("strategic_plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_inputs" ADD CONSTRAINT "management_review_inputs_process_id_sgq_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_outputs" ADD CONSTRAINT "management_review_outputs_review_id_management_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."management_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_outputs" ADD CONSTRAINT "management_review_outputs_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_outputs" ADD CONSTRAINT "management_review_outputs_process_id_sgq_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_review_outputs" ADD CONSTRAINT "management_review_outputs_nonconformity_id_nonconformities_id_fk" FOREIGN KEY ("nonconformity_id") REFERENCES "public"."nonconformities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD CONSTRAINT "management_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD CONSTRAINT "management_reviews_chair_user_id_users_id_fk" FOREIGN KEY ("chair_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD CONSTRAINT "management_reviews_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD CONSTRAINT "management_reviews_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_process_id_sgq_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_risk_opportunity_item_id_strategic_plan_risk_opportunity_items_id_fk" FOREIGN KEY ("risk_opportunity_item_id") REFERENCES "public"."strategic_plan_risk_opportunity_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_audit_finding_id_internal_audit_findings_id_fk" FOREIGN KEY ("audit_finding_id") REFERENCES "public"."internal_audit_findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_communication_plans" ADD CONSTRAINT "sgq_communication_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_communication_plans" ADD CONSTRAINT "sgq_communication_plans_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_communication_plans" ADD CONSTRAINT "sgq_communication_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_communication_plans" ADD CONSTRAINT "sgq_communication_plans_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_process_interactions" ADD CONSTRAINT "sgq_process_interactions_process_id_sgq_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_process_interactions" ADD CONSTRAINT "sgq_process_interactions_related_process_id_sgq_processes_id_fk" FOREIGN KEY ("related_process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_process_revisions" ADD CONSTRAINT "sgq_process_revisions_process_id_sgq_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."sgq_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_process_revisions" ADD CONSTRAINT "sgq_process_revisions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_processes" ADD CONSTRAINT "sgq_processes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_processes" ADD CONSTRAINT "sgq_processes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_processes" ADD CONSTRAINT "sgq_processes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sgq_processes" ADD CONSTRAINT "sgq_processes_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_assessments" ADD CONSTRAINT "laia_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_assessments" ADD CONSTRAINT "laia_assessments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_assessments" ADD CONSTRAINT "laia_assessments_sector_id_laia_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."laia_sectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_assessments" ADD CONSTRAINT "laia_assessments_methodology_version_id_laia_methodology_versions_id_fk" FOREIGN KEY ("methodology_version_id") REFERENCES "public"."laia_methodology_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_assessments" ADD CONSTRAINT "laia_assessments_control_responsible_user_id_users_id_fk" FOREIGN KEY ("control_responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_assessments" ADD CONSTRAINT "laia_assessments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_assessments" ADD CONSTRAINT "laia_assessments_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_branch_configs" ADD CONSTRAINT "laia_branch_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_branch_configs" ADD CONSTRAINT "laia_branch_configs_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_branch_configs" ADD CONSTRAINT "laia_branch_configs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_branch_configs" ADD CONSTRAINT "laia_branch_configs_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_import_jobs" ADD CONSTRAINT "laia_import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_import_jobs" ADD CONSTRAINT "laia_import_jobs_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_import_jobs" ADD CONSTRAINT "laia_import_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_methodologies" ADD CONSTRAINT "laia_methodologies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_methodologies" ADD CONSTRAINT "laia_methodologies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_methodologies" ADD CONSTRAINT "laia_methodologies_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_methodology_versions" ADD CONSTRAINT "laia_methodology_versions_methodology_id_laia_methodologies_id_fk" FOREIGN KEY ("methodology_id") REFERENCES "public"."laia_methodologies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_methodology_versions" ADD CONSTRAINT "laia_methodology_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_methodology_versions" ADD CONSTRAINT "laia_methodology_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_plans" ADD CONSTRAINT "laia_monitoring_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_plans" ADD CONSTRAINT "laia_monitoring_plans_assessment_id_laia_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."laia_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_plans" ADD CONSTRAINT "laia_monitoring_plans_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_plans" ADD CONSTRAINT "laia_monitoring_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_plans" ADD CONSTRAINT "laia_monitoring_plans_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_records" ADD CONSTRAINT "laia_monitoring_records_plan_id_laia_monitoring_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."laia_monitoring_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_records" ADD CONSTRAINT "laia_monitoring_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_monitoring_records" ADD CONSTRAINT "laia_monitoring_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_requirement_links" ADD CONSTRAINT "laia_requirement_links_assessment_id_laia_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."laia_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_requirement_links" ADD CONSTRAINT "laia_requirement_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_requirement_links" ADD CONSTRAINT "laia_requirement_links_legislation_id_legislations_id_fk" FOREIGN KEY ("legislation_id") REFERENCES "public"."legislations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_revision_changes" ADD CONSTRAINT "laia_revision_changes_revision_id_laia_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."laia_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_revisions" ADD CONSTRAINT "laia_revisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_revisions" ADD CONSTRAINT "laia_revisions_assessment_id_laia_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."laia_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_revisions" ADD CONSTRAINT "laia_revisions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_revisions" ADD CONSTRAINT "laia_revisions_finalized_by_id_users_id_fk" FOREIGN KEY ("finalized_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_sectors" ADD CONSTRAINT "laia_sectors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_sectors" ADD CONSTRAINT "laia_sectors_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_sectors" ADD CONSTRAINT "laia_sectors_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_sectors" ADD CONSTRAINT "laia_sectors_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laia_sectors" ADD CONSTRAINT "laia_sectors_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_action_units" ADD CONSTRAINT "strategic_plan_action_units_action_id_strategic_plan_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."strategic_plan_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_action_units" ADD CONSTRAINT "strategic_plan_action_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_actions" ADD CONSTRAINT "strategic_plan_actions_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_actions" ADD CONSTRAINT "strategic_plan_actions_swot_item_id_strategic_plan_swot_items_id_fk" FOREIGN KEY ("swot_item_id") REFERENCES "public"."strategic_plan_swot_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_actions" ADD CONSTRAINT "strategic_plan_actions_objective_id_strategic_plan_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."strategic_plan_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_actions" ADD CONSTRAINT "strategic_plan_actions_risk_opportunity_item_id_strategic_plan_risk_opportunity_items_id_fk" FOREIGN KEY ("risk_opportunity_item_id") REFERENCES "public"."strategic_plan_risk_opportunity_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_actions" ADD CONSTRAINT "strategic_plan_actions_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_actions" ADD CONSTRAINT "strategic_plan_actions_secondary_responsible_user_id_users_id_fk" FOREIGN KEY ("secondary_responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_interested_parties" ADD CONSTRAINT "strategic_plan_interested_parties_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_objectives" ADD CONSTRAINT "strategic_plan_objectives_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_reviewers" ADD CONSTRAINT "strategic_plan_reviewers_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_reviewers" ADD CONSTRAINT "strategic_plan_reviewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_revisions" ADD CONSTRAINT "strategic_plan_revisions_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_revisions" ADD CONSTRAINT "strategic_plan_revisions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_revisions" ADD CONSTRAINT "strategic_plan_revisions_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_effectiveness_reviews" ADD CONSTRAINT "strategic_plan_risk_opportunity_effectiveness_reviews_risk_opportunity_item_id_strategic_plan_risk_opportunity_items_id_fk" FOREIGN KEY ("risk_opportunity_item_id") REFERENCES "public"."strategic_plan_risk_opportunity_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_effectiveness_reviews" ADD CONSTRAINT "strategic_plan_risk_opportunity_effectiveness_reviews_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_items" ADD CONSTRAINT "strategic_plan_risk_opportunity_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_items" ADD CONSTRAINT "strategic_plan_risk_opportunity_items_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_items" ADD CONSTRAINT "strategic_plan_risk_opportunity_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_items" ADD CONSTRAINT "strategic_plan_risk_opportunity_items_co_owner_user_id_users_id_fk" FOREIGN KEY ("co_owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_items" ADD CONSTRAINT "strategic_plan_risk_opportunity_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_items" ADD CONSTRAINT "strategic_plan_risk_opportunity_items_objective_id_strategic_plan_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."strategic_plan_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_risk_opportunity_items" ADD CONSTRAINT "strategic_plan_risk_opportunity_items_swot_item_id_strategic_plan_swot_items_id_fk" FOREIGN KEY ("swot_item_id") REFERENCES "public"."strategic_plan_swot_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plan_swot_items" ADD CONSTRAINT "strategic_plan_swot_items_plan_id_strategic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."strategic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_article_revisions" ADD CONSTRAINT "product_knowledge_article_revisions_article_id_product_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."product_knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_article_revisions" ADD CONSTRAINT "product_knowledge_article_revisions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_articles" ADD CONSTRAINT "product_knowledge_articles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_articles" ADD CONSTRAINT "product_knowledge_articles_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_catalog_items" ADD CONSTRAINT "supplier_catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_requirements" ADD CONSTRAINT "supplier_document_requirements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_requirements" ADD CONSTRAINT "supplier_document_requirements_category_id_supplier_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."supplier_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_requirements" ADD CONSTRAINT "supplier_document_requirements_type_id_supplier_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."supplier_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_reviews" ADD CONSTRAINT "supplier_document_reviews_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_reviews" ADD CONSTRAINT "supplier_document_reviews_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_submissions" ADD CONSTRAINT "supplier_document_submissions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_submissions" ADD CONSTRAINT "supplier_document_submissions_requirement_id_supplier_document_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."supplier_document_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_submissions" ADD CONSTRAINT "supplier_document_submissions_requested_reviewer_id_users_id_fk" FOREIGN KEY ("requested_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_submissions" ADD CONSTRAINT "supplier_document_submissions_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_document_submissions" ADD CONSTRAINT "supplier_document_submissions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_failures" ADD CONSTRAINT "supplier_failures_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_failures" ADD CONSTRAINT "supplier_failures_performance_review_id_supplier_performance_reviews_id_fk" FOREIGN KEY ("performance_review_id") REFERENCES "public"."supplier_performance_reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_failures" ADD CONSTRAINT "supplier_failures_receipt_check_id_supplier_receipt_checks_id_fk" FOREIGN KEY ("receipt_check_id") REFERENCES "public"."supplier_receipt_checks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_failures" ADD CONSTRAINT "supplier_failures_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_import_previews" ADD CONSTRAINT "supplier_import_previews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_offerings" ADD CONSTRAINT "supplier_offerings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_offerings" ADD CONSTRAINT "supplier_offerings_catalog_item_id_supplier_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."supplier_catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_performance_reviews" ADD CONSTRAINT "supplier_performance_reviews_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_performance_reviews" ADD CONSTRAINT "supplier_performance_reviews_offering_id_supplier_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."supplier_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_performance_reviews" ADD CONSTRAINT "supplier_performance_reviews_evaluated_by_id_users_id_fk" FOREIGN KEY ("evaluated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_qualification_reviews" ADD CONSTRAINT "supplier_qualification_reviews_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_qualification_reviews" ADD CONSTRAINT "supplier_qualification_reviews_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_checks" ADD CONSTRAINT "supplier_receipt_checks_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_checks" ADD CONSTRAINT "supplier_receipt_checks_offering_id_supplier_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."supplier_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_checks" ADD CONSTRAINT "supplier_receipt_checks_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_checks" ADD CONSTRAINT "supplier_receipt_checks_checked_by_id_users_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_checks" ADD CONSTRAINT "supplier_receipt_checks_authorized_by_id_users_id_fk" FOREIGN KEY ("authorized_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requirement_communications" ADD CONSTRAINT "supplier_requirement_communications_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requirement_communications" ADD CONSTRAINT "supplier_requirement_communications_template_id_supplier_requirement_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."supplier_requirement_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requirement_communications" ADD CONSTRAINT "supplier_requirement_communications_communicated_by_id_users_id_fk" FOREIGN KEY ("communicated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requirement_templates" ADD CONSTRAINT "supplier_requirement_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requirement_templates" ADD CONSTRAINT "supplier_requirement_templates_category_id_supplier_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."supplier_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requirement_templates" ADD CONSTRAINT "supplier_requirement_templates_type_id_supplier_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."supplier_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_requirement_templates" ADD CONSTRAINT "supplier_requirement_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_type_links" ADD CONSTRAINT "supplier_type_links_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_type_links" ADD CONSTRAINT "supplier_type_links_type_id_supplier_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."supplier_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_types" ADD CONSTRAINT "supplier_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_types" ADD CONSTRAINT "supplier_types_category_id_supplier_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."supplier_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_types" ADD CONSTRAINT "supplier_types_parent_type_id_supplier_types_id_fk" FOREIGN KEY ("parent_type_id") REFERENCES "public"."supplier_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_units" ADD CONSTRAINT "supplier_units_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_units" ADD CONSTRAINT "supplier_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_category_id_supplier_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."supplier_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_indicators" ADD CONSTRAINT "kpi_indicators_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_monthly_values" ADD CONSTRAINT "kpi_monthly_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_monthly_values" ADD CONSTRAINT "kpi_monthly_values_year_config_id_kpi_year_configs_id_fk" FOREIGN KEY ("year_config_id") REFERENCES "public"."kpi_year_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_objectives" ADD CONSTRAINT "kpi_objectives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_year_configs" ADD CONSTRAINT "kpi_year_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_year_configs" ADD CONSTRAINT "kpi_year_configs_indicator_id_kpi_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."kpi_indicators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_year_configs" ADD CONSTRAINT "kpi_year_configs_objective_id_kpi_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."kpi_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_attachments" ADD CONSTRAINT "asset_maintenance_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_attachments" ADD CONSTRAINT "asset_maintenance_attachments_record_id_asset_maintenance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."asset_maintenance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_plans" ADD CONSTRAINT "asset_maintenance_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_plans" ADD CONSTRAINT "asset_maintenance_plans_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_plans" ADD CONSTRAINT "asset_maintenance_plans_responsible_id_employees_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_plan_id_asset_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."asset_maintenance_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_maintenance_records" ADD CONSTRAINT "asset_maintenance_records_executed_by_id_employees_id_fk" FOREIGN KEY ("executed_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_responsible_id_employees_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resource_attachments" ADD CONSTRAINT "measurement_resource_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resource_attachments" ADD CONSTRAINT "measurement_resource_attachments_calibration_id_measurement_resource_calibrations_id_fk" FOREIGN KEY ("calibration_id") REFERENCES "public"."measurement_resource_calibrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resource_calibrations" ADD CONSTRAINT "measurement_resource_calibrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resource_calibrations" ADD CONSTRAINT "measurement_resource_calibrations_resource_id_measurement_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."measurement_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resource_calibrations" ADD CONSTRAINT "measurement_resource_calibrations_calibrated_by_id_employees_id_fk" FOREIGN KEY ("calibrated_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resources" ADD CONSTRAINT "measurement_resources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resources" ADD CONSTRAINT "measurement_resources_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_resources" ADD CONSTRAINT "measurement_resources_responsible_id_employees_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_attachments" ADD CONSTRAINT "work_environment_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_attachments" ADD CONSTRAINT "work_environment_attachments_verification_id_work_environment_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."work_environment_verifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_controls" ADD CONSTRAINT "work_environment_controls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_controls" ADD CONSTRAINT "work_environment_controls_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_controls" ADD CONSTRAINT "work_environment_controls_responsible_id_employees_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_verifications" ADD CONSTRAINT "work_environment_verifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_verifications" ADD CONSTRAINT "work_environment_verifications_control_id_work_environment_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."work_environment_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_environment_verifications" ADD CONSTRAINT "work_environment_verifications_verified_by_id_employees_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_changes" ADD CONSTRAINT "development_project_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_changes" ADD CONSTRAINT "development_project_changes_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_changes" ADD CONSTRAINT "development_project_changes_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_changes" ADD CONSTRAINT "development_project_changes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_changes" ADD CONSTRAINT "development_project_changes_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_inputs" ADD CONSTRAINT "development_project_inputs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_inputs" ADD CONSTRAINT "development_project_inputs_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_outputs" ADD CONSTRAINT "development_project_outputs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_outputs" ADD CONSTRAINT "development_project_outputs_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_reviews" ADD CONSTRAINT "development_project_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_reviews" ADD CONSTRAINT "development_project_reviews_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_reviews" ADD CONSTRAINT "development_project_reviews_responsible_employee_id_employees_id_fk" FOREIGN KEY ("responsible_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_reviews" ADD CONSTRAINT "development_project_reviews_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_stages" ADD CONSTRAINT "development_project_stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_stages" ADD CONSTRAINT "development_project_stages_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_stages" ADD CONSTRAINT "development_project_stages_responsible_employee_id_employees_id_fk" FOREIGN KEY ("responsible_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_applicability_decision_id_requirement_applicability_decisions_id_fk" FOREIGN KEY ("applicability_decision_id") REFERENCES "public"."requirement_applicability_decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_responsible_employee_id_employees_id_fk" FOREIGN KEY ("responsible_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability_decisions" ADD CONSTRAINT "requirement_applicability_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability_decisions" ADD CONSTRAINT "requirement_applicability_decisions_responsible_employee_id_employees_id_fk" FOREIGN KEY ("responsible_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability_decisions" ADD CONSTRAINT "requirement_applicability_decisions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability_decisions" ADD CONSTRAINT "requirement_applicability_decisions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability_decisions" ADD CONSTRAINT "requirement_applicability_decisions_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
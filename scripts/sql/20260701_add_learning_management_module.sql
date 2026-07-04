-- Gestão de Aprendizagem (LMS) — módulo novo
--
-- DDL cirúrgico para o Neon de produção (o repo NÃO usa `drizzle push` em prod).
-- Cria as 6 tabelas do módulo, as 3 novas colunas em employee_trainings, os
-- índices únicos, as FKs cirúrgicas (padrão "coluna integer no schema + FK via
-- DDL", com ON DELETE SET NULL para preservar histórico) e índices de perf.
--
-- Idempotente onde a sintaxe permite (IF NOT EXISTS / guardas DO $$). As
-- CONSTRAINTs de PK/FK das 6 tabelas assumem tabelas recém-criadas (deploy
-- único). Seguro rodar uma vez num banco sem o módulo.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Novas colunas em employee_trainings (histórico de treinamento existente)
-- ---------------------------------------------------------------------------
ALTER TABLE public.employee_trainings ADD COLUMN IF NOT EXISTS catalog_item_id integer;
ALTER TABLE public.employee_trainings ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.employee_trainings ADD COLUMN IF NOT EXISTS requirement_id integer;

-- ---------------------------------------------------------------------------
-- 2) Tabelas do módulo + sequências + PKs + FKs internas + índices únicos
--    (extraído fielmente do schema aplicado; ver lib/db/src/schema/learning-catalog.ts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.annual_training_program (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    year integer NOT NULL,
    catalog_item_id integer NOT NULL,
    unit_id integer,
    planned_month integer,
    modality text,
    planned_quantity integer,
    responsible text,
    status text DEFAULT 'planejada'::text NOT NULL,
    notes text,
    class_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.annual_training_program_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.annual_training_program_id_seq OWNED BY public.annual_training_program.id;

CREATE TABLE IF NOT EXISTS public.competency_catalog (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    name text NOT NULL,
    competency_type text,
    category text,
    norm text,
    is_mandatory boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.competency_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.competency_catalog_id_seq OWNED BY public.competency_catalog.id;

CREATE TABLE IF NOT EXISTS public.training_catalog (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    title text NOT NULL,
    category text,
    modality text,
    norm text,
    clause text,
    workload_hours integer,
    validity_months integer,
    is_mandatory boolean DEFAULT false NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    target_competency_name text,
    target_competency_type text,
    target_competency_level integer,
    default_instructor text,
    objective text,
    program_content text,
    evaluation_method text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.training_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.training_catalog_id_seq OWNED BY public.training_catalog.id;

CREATE TABLE IF NOT EXISTS public.training_class_participants (
    id integer NOT NULL,
    class_id integer NOT NULL,
    employee_id integer NOT NULL,
    attendance text,
    score integer,
    result text,
    employee_training_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.training_class_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.training_class_participants_id_seq OWNED BY public.training_class_participants.id;

CREATE TABLE IF NOT EXISTS public.training_classes (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    catalog_item_id integer NOT NULL,
    code text,
    start_date date NOT NULL,
    end_date date,
    unit_id integer,
    location text,
    instructor text,
    modality text,
    workload_hours integer,
    capacity integer,
    min_score integer,
    status text DEFAULT 'agendada'::text NOT NULL,
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.training_classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.training_classes_id_seq OWNED BY public.training_classes.id;

CREATE TABLE IF NOT EXISTS public.training_requirements (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    position_id integer NOT NULL,
    catalog_item_id integer NOT NULL,
    deadline_type text DEFAULT 'rh'::text NOT NULL,
    deadline_days integer,
    scope text DEFAULT 'geral'::text NOT NULL,
    filial_unit_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    recurrence text DEFAULT 'nao_repete'::text NOT NULL,
    is_critical boolean DEFAULT false NOT NULL,
    norm text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.training_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.training_requirements_id_seq OWNED BY public.training_requirements.id;

ALTER TABLE ONLY public.annual_training_program ALTER COLUMN id SET DEFAULT nextval('public.annual_training_program_id_seq'::regclass);

ALTER TABLE ONLY public.competency_catalog ALTER COLUMN id SET DEFAULT nextval('public.competency_catalog_id_seq'::regclass);

ALTER TABLE ONLY public.training_catalog ALTER COLUMN id SET DEFAULT nextval('public.training_catalog_id_seq'::regclass);

ALTER TABLE ONLY public.training_class_participants ALTER COLUMN id SET DEFAULT nextval('public.training_class_participants_id_seq'::regclass);

ALTER TABLE ONLY public.training_classes ALTER COLUMN id SET DEFAULT nextval('public.training_classes_id_seq'::regclass);

ALTER TABLE ONLY public.training_requirements ALTER COLUMN id SET DEFAULT nextval('public.training_requirements_id_seq'::regclass);

ALTER TABLE ONLY public.annual_training_program
    ADD CONSTRAINT annual_training_program_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.competency_catalog
    ADD CONSTRAINT competency_catalog_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.training_catalog
    ADD CONSTRAINT training_catalog_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.training_class_participants
    ADD CONSTRAINT training_class_participants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.training_classes
    ADD CONSTRAINT training_classes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS competency_catalog_org_lower_name_unique ON public.competency_catalog USING btree (organization_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS training_class_participant_unique ON public.training_class_participants USING btree (class_id, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS training_requirement_unique ON public.training_requirements USING btree (organization_id, position_id, catalog_item_id, scope);

ALTER TABLE ONLY public.annual_training_program
    ADD CONSTRAINT annual_training_program_catalog_item_id_training_catalog_id_fk FOREIGN KEY (catalog_item_id) REFERENCES public.training_catalog(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.annual_training_program
    ADD CONSTRAINT annual_training_program_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.annual_training_program
    ADD CONSTRAINT annual_training_program_unit_id_units_id_fk FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.annual_training_program
    ADD CONSTRAINT atp_class_fk FOREIGN KEY (class_id) REFERENCES public.training_classes(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.competency_catalog
    ADD CONSTRAINT competency_catalog_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_catalog
    ADD CONSTRAINT training_catalog_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_class_participants
    ADD CONSTRAINT training_class_participants_class_id_training_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.training_classes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_class_participants
    ADD CONSTRAINT training_class_participants_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_classes
    ADD CONSTRAINT training_classes_catalog_item_id_training_catalog_id_fk FOREIGN KEY (catalog_item_id) REFERENCES public.training_catalog(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_classes
    ADD CONSTRAINT training_classes_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_classes
    ADD CONSTRAINT training_classes_unit_id_units_id_fk FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_catalog_item_id_training_catalog_id_fk FOREIGN KEY (catalog_item_id) REFERENCES public.training_catalog(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_position_id_positions_id_fk FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 3) FKs cirúrgicas SET NULL (não ficam no schema Drizzle p/ evitar ciclo de
--    import). Preservam histórico: apagar o alvo apenas desvincula.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_trainings_catalog_item_fk') THEN
    ALTER TABLE public.employee_trainings
      ADD CONSTRAINT employee_trainings_catalog_item_fk
      FOREIGN KEY (catalog_item_id) REFERENCES public.training_catalog(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_trainings_requirement_fk') THEN
    ALTER TABLE public.employee_trainings
      ADD CONSTRAINT employee_trainings_requirement_fk
      FOREIGN KEY (requirement_id) REFERENCES public.training_requirements(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_class_participants_employee_training_fk') THEN
    ALTER TABLE public.training_class_participants
      ADD CONSTRAINT training_class_participants_employee_training_fk
      FOREIGN KEY (employee_training_id) REFERENCES public.employee_trainings(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Índices de performance (colunas de filtro/junção quentes; FKs não são
--    indexadas automaticamente no Postgres)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS training_catalog_org_idx ON public.training_catalog (organization_id);
CREATE INDEX IF NOT EXISTS competency_catalog_org_idx ON public.competency_catalog (organization_id);
CREATE INDEX IF NOT EXISTS training_requirements_org_position_idx ON public.training_requirements (organization_id, position_id);
CREATE INDEX IF NOT EXISTS training_classes_org_status_idx ON public.training_classes (organization_id, status);
CREATE INDEX IF NOT EXISTS annual_training_program_org_year_idx ON public.annual_training_program (organization_id, year);
CREATE INDEX IF NOT EXISTS employee_trainings_emp_catalog_status_idx ON public.employee_trainings (employee_id, catalog_item_id, status);

-- ---------------------------------------------------------------------------
-- SP6/B: indicadores de treinamento (fonte computada) + tolerância configurável
-- ---------------------------------------------------------------------------
ALTER TABLE public.kpi_indicators ADD COLUMN IF NOT EXISTS computed_source varchar(32);
ALTER TABLE public.kpi_indicators ADD COLUMN IF NOT EXISTS computed_metric varchar(64);
ALTER TABLE public.kpi_year_configs ADD COLUMN IF NOT EXISTS tolerance numeric(20,8);

-- ---------------------------------------------------------------------------
-- Colaboradores+Eficácia (2026-07-03): workflow de eficácia (prazo/papel)
-- ---------------------------------------------------------------------------
ALTER TABLE public.employee_trainings ADD COLUMN IF NOT EXISTS effectiveness_due_date date;
ALTER TABLE public.employee_trainings ADD COLUMN IF NOT EXISTS effectiveness_assigned_role varchar(20);
ALTER TABLE public.training_effectiveness_reviews ADD COLUMN IF NOT EXISTS evaluator_role varchar(20);

-- ---------------------------------------------------------------------------
-- Índice único parcial: impede duplicação de indicador LMS por org+métrica
-- (cobre ativações concorrentes; reflete o uniqueIndex no schema Drizzle)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS kpi_indicators_lms_metric_unique
  ON public.kpi_indicators (organization_id, computed_source, computed_metric)
  WHERE computed_source IS NOT NULL;

COMMIT;

-- Verificação
-- SELECT tablename FROM pg_tables WHERE schemaname='public'
--   AND tablename IN ('training_catalog','competency_catalog','training_requirements',
--                     'training_classes','training_class_participants','annual_training_program');
-- SELECT conname FROM pg_constraint WHERE conname LIKE '%employee_training%fk%'
--    OR conname IN ('employee_trainings_catalog_item_fk','employee_trainings_requirement_fk');

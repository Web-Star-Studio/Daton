-- ============================================================================
-- Migration v1 (Supabase) → v2 (Drizzle/Postgres) — etapa 1: staging
-- ============================================================================
-- Cria schema isolado _migration com tabelas espelho do v1 + tabelas auxiliares
-- de mapeamento. Idempotente (IF NOT EXISTS em tudo).
--
-- Como popular: pg_dump --data-only --table=public.laia_* do v1, ou COPY via
-- Supabase Studio, ou INSERT manual via MCP. Todas as tabelas v1_* aceitam
-- exatamente o shape do v1 (sem transformação).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS _migration;

-- ---------- Espelhos do schema v1 (Supabase) ---------------------------------

CREATE TABLE IF NOT EXISTS _migration.v1_companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS _migration.v1_branches (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  state TEXT,
  city TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS _migration.v1_profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS _migration.v1_laia_sectors (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  branch_id UUID,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS _migration.v1_laia_branch_config (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  branch_id UUID NOT NULL UNIQUE,
  survey_status TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS _migration.v1_laia_assessments (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  branch_id UUID,
  sector_id UUID,
  responsible_user_id UUID,
  aspect_code TEXT NOT NULL,
  activity_operation TEXT NOT NULL,
  environmental_aspect TEXT NOT NULL,
  environmental_impact TEXT NOT NULL,
  temporality TEXT NOT NULL,
  operational_situation TEXT NOT NULL,
  incidence TEXT NOT NULL,
  impact_class TEXT NOT NULL,
  scope TEXT NOT NULL,
  severity TEXT NOT NULL,
  consequence_score INTEGER NOT NULL,
  frequency_probability TEXT NOT NULL,
  freq_prob_score INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  category TEXT NOT NULL,
  significance TEXT NOT NULL,
  has_legal_requirements BOOLEAN,
  has_stakeholder_demand BOOLEAN,
  has_strategic_options BOOLEAN,
  has_lifecycle_control BOOLEAN,
  control_types TEXT[],
  existing_controls TEXT,
  lifecycle_stages TEXT[],
  legislation_reference TEXT,
  legislation_reference_url TEXT,
  legislation_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_actions TEXT,
  is_vigente BOOLEAN DEFAULT TRUE,
  status TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS _migration.v1_laia_revisions (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  revision_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  is_legacy BOOLEAN DEFAULT FALSE,
  created_by UUID,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS _migration.v1_laia_revision_changes (
  id UUID PRIMARY KEY,
  revision_id UUID NOT NULL,
  branch_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ
);

-- ---------- Tabelas auxiliares de mapeamento ---------------------------------

-- Mapeamento UUID v1 ↔ serial int v2 (preservar rastreabilidade).
-- entity ∈ ('organization','unit','sector','assessment','revision','revision_change','user')
CREATE TABLE IF NOT EXISTS _migration.id_map (
  entity TEXT NOT NULL,
  v1_uuid UUID NOT NULL,
  v2_id INTEGER NOT NULL,
  organization_id INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity, v1_uuid)
);

CREATE INDEX IF NOT EXISTS id_map_v2_idx ON _migration.id_map (entity, v2_id);

-- Diagnóstico: rows v1 que não puderam ser migradas e por quê
CREATE TABLE IF NOT EXISTS _migration.skipped (
  entity TEXT NOT NULL,
  v1_uuid UUID NOT NULL,
  reason TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity, v1_uuid, reason)
);

-- Config: org default + user fallback (preenche antes de rodar 02-transform)
CREATE TABLE IF NOT EXISTS _migration.config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Defaults (sobrescreva via UPSERT antes de rodar a migração)
INSERT INTO _migration.config (key, value) VALUES
  ('default_organization_id', '3'),                 -- Transportes Gabardo
  ('fallback_user_id', '53'),                       -- joaopedrobatista010@gmail.com
  ('handle_soft_deleted', 'archive_with_null_purged_at'),  -- ou 'skip' ou 'archive_with_1h_purge'
  ('output_actions_destination', 'notes_with_prefix')      -- ou 'discard'
ON CONFLICT (key) DO NOTHING;

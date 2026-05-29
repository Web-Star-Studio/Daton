-- ============================================================================
-- Migration v1 → v2 — etapa 2: TRANSFORM + LOAD
-- ============================================================================
-- Pré-requisitos:
--   • Schema _migration criado (etapa 01)
--   • Tabelas _migration.v1_* populadas com dados v1
--   • _migration.config tem default_organization_id + fallback_user_id corretos
--
-- Idempotente: pode rodar várias vezes. Usa _migration.id_map pra detectar já-migrados.
-- Transacional: tudo dentro de uma única transação (BEGIN/COMMIT no final).
-- Rollback: se algo falha, ROLLBACK desfaz; ou rode `02-rollback.sql` pra limpar.
-- ============================================================================

BEGIN;

-- ---------- 0) Config helpers ------------------------------------------------

-- Normaliza string para match sem acentos / case / espaços (Neon não tem unaccent).
CREATE OR REPLACE FUNCTION _migration.normalize(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $func$
  SELECT TRIM(LOWER(translate(
    COALESCE($1, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiioooooouuuuc'
  )))
$func$;

DO $$
DECLARE
  org_id INT;
  user_id INT;
BEGIN
  SELECT value::int INTO org_id FROM _migration.config WHERE key='default_organization_id';
  SELECT value::int INTO user_id FROM _migration.config WHERE key='fallback_user_id';
  IF org_id IS NULL OR user_id IS NULL THEN
    RAISE EXCEPTION 'config default_organization_id ou fallback_user_id ausente';
  END IF;
  PERFORM set_config('migration.org_id', org_id::text, true);
  PERFORM set_config('migration.user_id', user_id::text, true);
END $$;

-- ---------- 1) User mapping (profiles v1 → users v2 por email) ---------------

INSERT INTO _migration.id_map (entity, v1_uuid, v2_id, organization_id, notes)
SELECT
  'user',
  p.id,
  u.id,
  current_setting('migration.org_id')::int,
  'matched by email'
FROM _migration.v1_profiles p
JOIN public.users u ON LOWER(u.email) = LOWER(p.email)
WHERE p.email IS NOT NULL AND p.email <> ''
ON CONFLICT (entity, v1_uuid) DO NOTHING;

-- Profiles que não bateram: registrar como skipped
INSERT INTO _migration.skipped (entity, v1_uuid, reason, payload)
SELECT 'user', p.id, 'no matching email in v2.users', to_jsonb(p)
FROM _migration.v1_profiles p
WHERE NOT EXISTS (SELECT 1 FROM _migration.id_map m WHERE m.entity='user' AND m.v1_uuid=p.id)
ON CONFLICT DO NOTHING;

-- ---------- 2) Unit mapping (branches v1 → units v2 por código ou nome) ------

INSERT INTO _migration.id_map (entity, v1_uuid, v2_id, organization_id, notes)
SELECT
  'unit',
  b.id,
  un.id,
  current_setting('migration.org_id')::int,
  CASE WHEN b.code IS NOT NULL AND TRIM(LOWER(un.code)) = TRIM(LOWER(b.code)) THEN 'matched by code'
       ELSE 'matched by name' END
FROM _migration.v1_branches b
JOIN public.units un
  ON un.organization_id = current_setting('migration.org_id')::int
 AND (
   -- normalize() = case-insensitive + sem acento + sem espaços (ex: CAMAÇARI ≡ CAMACARI)
   (b.code IS NOT NULL AND _migration.normalize(un.code) = _migration.normalize(b.code))
   OR (b.code IS NULL AND _migration.normalize(un.name) = _migration.normalize(b.name))
 )
ON CONFLICT (entity, v1_uuid) DO NOTHING;

INSERT INTO _migration.skipped (entity, v1_uuid, reason, payload)
SELECT 'unit', b.id, 'no matching code/name in v2.units', to_jsonb(b)
FROM _migration.v1_branches b
WHERE NOT EXISTS (SELECT 1 FROM _migration.id_map m WHERE m.entity='unit' AND m.v1_uuid=b.id)
ON CONFLICT DO NOTHING;

-- ---------- 3) Helper functions: resolve user/unit com fallback --------------

CREATE OR REPLACE FUNCTION _migration.resolve_user(v1_uuid UUID)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT v2_id FROM _migration.id_map WHERE entity='user' AND v1_uuid=$1),
    current_setting('migration.user_id', true)::int
  )
$$;

CREATE OR REPLACE FUNCTION _migration.resolve_unit(v1_uuid UUID)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT v2_id FROM _migration.id_map WHERE entity='unit' AND v1_uuid=$1
$$;

CREATE OR REPLACE FUNCTION _migration.map_status(v1_status TEXT, deleted_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN deleted_at IS NOT NULL THEN 'archived'
    WHEN v1_status = 'ativo' THEN 'active'
    WHEN v1_status = 'inativo' THEN 'archived'
    WHEN v1_status = 'em_revisao' THEN 'draft'
    ELSE 'draft'
  END
$$;

CREATE OR REPLACE FUNCTION _migration.map_significance(v1 TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN $1 = 'significativo' THEN 'significant'
    WHEN $1 = 'nao_significativo' THEN 'not_significant'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION _migration.map_revision_status(v1 TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN $1 IN ('finalizada','validada') THEN 'finalized'
    ELSE 'draft'
  END
$$;

-- ---------- 4) Migrar laia_sectors ------------------------------------------

WITH to_insert AS (
  SELECT s.*, current_setting('migration.org_id')::int AS org_id
  FROM _migration.v1_laia_sectors s
  WHERE NOT EXISTS (SELECT 1 FROM _migration.id_map m WHERE m.entity='sector' AND m.v1_uuid=s.id)
),
inserted AS (
  INSERT INTO public.laia_sectors (
    organization_id, unit_id, department_id, code, name, description, is_active,
    created_by_id, updated_by_id, created_at, updated_at
  )
  SELECT
    org_id,
    _migration.resolve_unit(branch_id),
    NULL,
    code, name, description,
    COALESCE(is_active, true),
    current_setting('migration.user_id')::int,
    current_setting('migration.user_id')::int,
    COALESCE(created_at, NOW()),
    COALESCE(updated_at, NOW())
  FROM to_insert
  ON CONFLICT (organization_id, unit_id, code) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at
  RETURNING id, code, organization_id, unit_id
)
INSERT INTO _migration.id_map (entity, v1_uuid, v2_id, organization_id, notes)
SELECT 'sector', t.id, i.id, i.organization_id, 'migrated'
FROM to_insert t
JOIN inserted i
  ON i.code = t.code
 AND i.organization_id = t.org_id
 AND (i.unit_id IS NOT DISTINCT FROM _migration.resolve_unit(t.branch_id))
ON CONFLICT (entity, v1_uuid) DO NOTHING;

-- ---------- 5) Migrar laia_branch_configs -----------------------------------

INSERT INTO public.laia_branch_configs (
  organization_id, unit_id, survey_status,
  created_by_id, updated_by_id, created_at, updated_at
)
SELECT
  current_setting('migration.org_id')::int,
  _migration.resolve_unit(bc.branch_id),
  bc.survey_status,
  current_setting('migration.user_id')::int,
  current_setting('migration.user_id')::int,
  COALESCE(bc.created_at, NOW()),
  COALESCE(bc.updated_at, NOW())
FROM _migration.v1_laia_branch_config bc
WHERE _migration.resolve_unit(bc.branch_id) IS NOT NULL
ON CONFLICT (organization_id, unit_id) DO UPDATE
  SET survey_status = EXCLUDED.survey_status,
      updated_at = EXCLUDED.updated_at;

-- ---------- 6) Migrar laia_assessments --------------------------------------

WITH to_insert AS (
  SELECT a.*, current_setting('migration.org_id')::int AS org_id
  FROM _migration.v1_laia_assessments a
  WHERE NOT EXISTS (SELECT 1 FROM _migration.id_map m WHERE m.entity='assessment' AND m.v1_uuid=a.id)
    -- Skip soft-deleted se config pedir
    AND (
      (SELECT value FROM _migration.config WHERE key='handle_soft_deleted') <> 'skip'
      OR a.deleted_at IS NULL
    )
),
inserted AS (
  INSERT INTO public.laia_assessments (
    organization_id, unit_id, sector_id, methodology_version_id,
    aspect_code, mode, status, is_vigente, archived_at, purged_at,
    activity_operation, environmental_aspect, environmental_impact,
    temporality, operational_situation, incidence, impact_class, scope, severity,
    consequence_score, frequency_probability, frequency_probability_score, total_score,
    category, significance, significance_reason,
    has_legal_requirements, has_stakeholder_demand, has_strategic_option,
    normal_condition, abnormal_condition, startup_shutdown, emergency_scenario,
    change_context, lifecycle_stages,
    control_level, influence_level, outsourced_process, supplier_reference,
    control_types, existing_controls, control_required, control_responsible_user_id,
    notes,
    created_by_id, updated_by_id, created_at, updated_at
  )
  SELECT
    org_id,
    _migration.resolve_unit(branch_id),
    (SELECT v2_id FROM _migration.id_map WHERE entity='sector' AND v1_uuid=t.sector_id),
    NULL,                                                              -- methodology_version_id (cliente escolhe pós)
    -- aspect_code precisa ser globalmente único na org. v1 numera "1.04",
    -- "2.03" etc por SETOR, e cada filial usa as mesmas numerações, então
    -- prefixamos com o code da filial (PIR-1.04, POA-1.04, SBC-1.04...).
    -- Branch sem code: fallback pro 'SEM' (raro, mas defensivo).
    COALESCE(
      (SELECT NULLIF(TRIM(b.code), '') FROM _migration.v1_branches b WHERE b.id = t.branch_id),
      'SEM'
    ) || '-' || t.aspect_code AS aspect_code,
    'complete',                                                        -- mode (v1 sempre é completa)
    _migration.map_status(t.status, t.deleted_at),
    COALESCE(t.is_vigente, true),
    t.deleted_at,                                                      -- archived_at
    NULL,                                                              -- purged_at (não auto-purgar dado migrado)
    activity_operation, environmental_aspect, environmental_impact,
    temporality, operational_situation, incidence, impact_class, scope, severity,
    consequence_score, frequency_probability, freq_prob_score, total_score,
    category,
    _migration.map_significance(significance),
    NULL,                                                              -- significance_reason
    COALESCE(t.has_legal_requirements, false),
    COALESCE(t.has_stakeholder_demand, false),
    COALESCE(t.has_strategic_options, false),                          -- v1 plural → v2 singular
    -- normal/abnormal/startup derivados de operational_situation
    (operational_situation = 'normal'),
    (operational_situation = 'anormal'),
    false,                                                             -- startup_shutdown (v1 não tem)
    CASE WHEN operational_situation = 'emergencia' THEN 'Cenário de emergência (migrado de v1)' ELSE NULL END,
    NULL,                                                              -- change_context
    COALESCE(lifecycle_stages, '{}'::text[]),
    CASE WHEN COALESCE(has_lifecycle_control, false) THEN 'direct_control' ELSE 'none' END,
    NULL, NULL, NULL,
    COALESCE(control_types, '{}'::text[]),
    existing_controls,
    NULL,                                                              -- control_required
    _migration.resolve_user(responsible_user_id),
    CASE
      WHEN (SELECT value FROM _migration.config WHERE key='output_actions_destination') = 'notes_with_prefix'
           AND output_actions IS NOT NULL AND output_actions <> ''
        THEN COALESCE(notes || E'\n\n', '') || '[saídas migradas do v1]: ' || output_actions
      ELSE notes
    END,
    _migration.resolve_user(responsible_user_id),
    _migration.resolve_user(responsible_user_id),
    COALESCE(created_at, NOW()),
    COALESCE(updated_at, NOW())
  FROM to_insert t
  ON CONFLICT (organization_id, aspect_code) DO NOTHING
  RETURNING id, aspect_code, organization_id
)
INSERT INTO _migration.id_map (entity, v1_uuid, v2_id, organization_id, notes)
SELECT 'assessment', t.id, i.id, i.organization_id, 'migrated'
FROM to_insert t
JOIN inserted i
  ON i.aspect_code = COALESCE(
       (SELECT NULLIF(TRIM(b.code), '') FROM _migration.v1_branches b WHERE b.id = t.branch_id),
       'SEM'
     ) || '-' || t.aspect_code
 AND i.organization_id = t.org_id
ON CONFLICT (entity, v1_uuid) DO NOTHING;

-- Avaliações skipped pelo ON CONFLICT
INSERT INTO _migration.skipped (entity, v1_uuid, reason, payload)
SELECT 'assessment', a.id, 'aspect_code já existe em v2', to_jsonb(a)
FROM _migration.v1_laia_assessments a
WHERE NOT EXISTS (SELECT 1 FROM _migration.id_map m WHERE m.entity='assessment' AND m.v1_uuid=a.id)
  AND EXISTS (
    SELECT 1 FROM public.laia_assessments existing
    WHERE existing.organization_id = current_setting('migration.org_id')::int
      AND existing.aspect_code = COALESCE(
        (SELECT NULLIF(TRIM(b.code), '') FROM _migration.v1_branches b WHERE b.id = a.branch_id),
        'SEM'
      ) || '-' || a.aspect_code
  )
ON CONFLICT DO NOTHING;

-- ---------- 7) Expandir legislation_references → laia_requirement_links ------

-- Forma principal: JSONB array
INSERT INTO public.laia_requirement_links (
  assessment_id, organization_id, type, legislation_id, title, requirement_reference, description, created_at
)
SELECT
  m.v2_id,
  current_setting('migration.org_id')::int,
  'legal',
  NULL,
  COALESCE(ref->>'reference', ref->>'title', '(sem referência)'),
  ref->>'reference',
  ref->>'summary',
  NOW()
FROM _migration.v1_laia_assessments a
JOIN _migration.id_map m ON m.entity='assessment' AND m.v1_uuid=a.id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(a.legislation_references) = 'array' THEN a.legislation_references
    ELSE '[]'::jsonb
  END
) AS ref
WHERE jsonb_array_length(COALESCE(a.legislation_references, '[]'::jsonb)) > 0
  AND NOT EXISTS (
    -- evita duplicar se rodar de novo: mesma assessment + mesmo title
    SELECT 1 FROM public.laia_requirement_links rl
    WHERE rl.assessment_id = m.v2_id
      AND rl.title = COALESCE(ref->>'reference', ref->>'title', '(sem referência)')
  );

-- Forma legada: legislation_reference / legislation_reference_url (text)
INSERT INTO public.laia_requirement_links (
  assessment_id, organization_id, type, legislation_id, title, requirement_reference, description, created_at
)
SELECT
  m.v2_id,
  current_setting('migration.org_id')::int,
  'other',
  NULL,
  a.legislation_reference,
  a.legislation_reference,
  a.legislation_reference_url,
  NOW()
FROM _migration.v1_laia_assessments a
JOIN _migration.id_map m ON m.entity='assessment' AND m.v1_uuid=a.id
WHERE a.legislation_reference IS NOT NULL
  AND a.legislation_reference <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.laia_requirement_links rl
    WHERE rl.assessment_id = m.v2_id AND rl.title = a.legislation_reference
  );

-- ---------- 8) Migrar laia_revisions ----------------------------------------

WITH to_insert AS (
  SELECT r.*, current_setting('migration.org_id')::int AS org_id
  FROM _migration.v1_laia_revisions r
  WHERE NOT EXISTS (SELECT 1 FROM _migration.id_map m WHERE m.entity='revision' AND m.v1_uuid=r.id)
),
inserted AS (
  INSERT INTO public.laia_revisions (
    organization_id, assessment_id, title, description,
    revision_number, status, snapshot,
    created_by_id, finalized_by_id, created_at, finalized_at
  )
  SELECT
    org_id,
    NULL,                                                              -- assessment_id (v1 não vincula)
    title, description,
    revision_number,
    _migration.map_revision_status(status),
    NULL,                                                              -- snapshot (v1 não tem por revision)
    _migration.resolve_user(created_by),
    CASE WHEN _migration.map_revision_status(status) = 'finalized'
         THEN _migration.resolve_user(validated_by)
         ELSE NULL END,
    COALESCE(created_at, NOW()),
    finalized_at
  FROM to_insert
  RETURNING id, revision_number, organization_id, created_at
)
INSERT INTO _migration.id_map (entity, v1_uuid, v2_id, organization_id, notes)
SELECT 'revision', t.id, i.id, i.organization_id, 'migrated'
FROM to_insert t
JOIN inserted i
  ON i.organization_id = t.org_id
 AND i.revision_number = t.revision_number
 AND i.created_at = COALESCE(t.created_at, i.created_at)
ON CONFLICT (entity, v1_uuid) DO NOTHING;

-- ---------- 9) Migrar laia_revision_changes ---------------------------------

INSERT INTO public.laia_revision_changes (
  revision_id, entity_type, entity_id, field_name, old_value, new_value, created_at
)
SELECT
  rmap.v2_id,
  rc.entity_type,
  -- entity_id é UUID v1; resolver via id_map; se órfão, registra mas pula
  COALESCE(
    (SELECT v2_id FROM _migration.id_map m
     WHERE m.entity = rc.entity_type AND m.v1_uuid = rc.entity_id),
    0
  ),
  COALESCE(rc.field_name, rc.change_type, 'unknown'),
  rc.old_value,
  rc.new_value,
  COALESCE(rc.changed_at, NOW())
FROM _migration.v1_laia_revision_changes rc
JOIN _migration.id_map rmap ON rmap.entity = 'revision' AND rmap.v1_uuid = rc.revision_id
WHERE EXISTS (
  SELECT 1 FROM _migration.id_map m
  WHERE m.entity = rc.entity_type AND m.v1_uuid = rc.entity_id
);

-- Revision changes órfãs (entity_id não encontrado): skipped
INSERT INTO _migration.skipped (entity, v1_uuid, reason, payload)
SELECT 'revision_change', rc.id,
       'entity_id (' || rc.entity_type || '/' || rc.entity_id || ') sem mapping em id_map',
       to_jsonb(rc)
FROM _migration.v1_laia_revision_changes rc
WHERE NOT EXISTS (
  SELECT 1 FROM _migration.id_map m
  WHERE m.entity = rc.entity_type AND m.v1_uuid = rc.entity_id
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMIT no chamador. Rode 03-validate.sql pra checar integridade.
-- ============================================================================

COMMIT;

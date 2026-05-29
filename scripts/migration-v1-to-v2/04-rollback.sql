-- ============================================================================
-- Migration v1 → v2 — ROLLBACK (limpa tudo que foi migrado nesta org)
-- ============================================================================
-- ATENÇÃO: apaga apenas dados COM mapping registrado em _migration.id_map.
-- Não toca dados nativos do v2 (criados manualmente sem id_map).
-- Roda em transação para garantir atomicidade.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  org_id INT;
BEGIN
  SELECT value::int INTO org_id FROM _migration.config WHERE key='default_organization_id';
  PERFORM set_config('migration.org_id', org_id::text, true);
END $$;

-- 1) revision_changes (filhas das revisions migradas)
DELETE FROM public.laia_revision_changes
WHERE revision_id IN (
  SELECT v2_id FROM _migration.id_map WHERE entity='revision'
);

-- 2) revisions migradas
DELETE FROM public.laia_revisions
WHERE id IN (SELECT v2_id FROM _migration.id_map WHERE entity='revision');

-- 3) requirement_links das assessments migradas
DELETE FROM public.laia_requirement_links
WHERE assessment_id IN (SELECT v2_id FROM _migration.id_map WHERE entity='assessment');

-- 4) assessments migradas
DELETE FROM public.laia_assessments
WHERE id IN (SELECT v2_id FROM _migration.id_map WHERE entity='assessment');

-- 5) branch_configs: deletar apenas as criadas pela migração (matched por org+unit_id que vem do id_map)
DELETE FROM public.laia_branch_configs bc
WHERE bc.organization_id = current_setting('migration.org_id')::int
  AND bc.unit_id IN (SELECT v2_id FROM _migration.id_map WHERE entity='unit');

-- 6) sectors migrados
DELETE FROM public.laia_sectors
WHERE id IN (SELECT v2_id FROM _migration.id_map WHERE entity='sector');

-- 7) limpar id_map e skipped (mantém staging _migration.v1_* pra poder re-rodar)
TRUNCATE _migration.id_map, _migration.skipped;

COMMIT;

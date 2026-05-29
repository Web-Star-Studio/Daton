-- ============================================================================
-- Migration v1 → v2 — etapa 3: VALIDATE
-- ============================================================================
-- Roda contagens e checks de integridade. Não modifica dados.
-- Saída pretende ser lida humanamente (ou via tool que extrai counts).
-- ============================================================================

\echo '================ COUNTS v1 (staging) ================'
SELECT 'v1_laia_sectors' AS table, COUNT(*) AS count FROM _migration.v1_laia_sectors
UNION ALL SELECT 'v1_laia_branch_config', COUNT(*) FROM _migration.v1_laia_branch_config
UNION ALL SELECT 'v1_laia_assessments', COUNT(*) FROM _migration.v1_laia_assessments
UNION ALL SELECT 'v1_laia_revisions', COUNT(*) FROM _migration.v1_laia_revisions
UNION ALL SELECT 'v1_laia_revision_changes', COUNT(*) FROM _migration.v1_laia_revision_changes
ORDER BY table;

\echo ''
\echo '================ ID MAP ================'
SELECT entity, COUNT(*) AS migrated
FROM _migration.id_map
GROUP BY entity ORDER BY entity;

\echo ''
\echo '================ SKIPPED ================'
SELECT entity, reason, COUNT(*) AS qtd
FROM _migration.skipped
GROUP BY entity, reason ORDER BY entity, qtd DESC;

\echo ''
\echo '================ COUNTS v2 (apenas org migrada) ================'
SELECT 'laia_sectors' AS table, COUNT(*) FROM public.laia_sectors WHERE organization_id = current_setting('migration.org_id', true)::int
UNION ALL SELECT 'laia_branch_configs', COUNT(*) FROM public.laia_branch_configs WHERE organization_id = current_setting('migration.org_id', true)::int
UNION ALL SELECT 'laia_assessments', COUNT(*) FROM public.laia_assessments WHERE organization_id = current_setting('migration.org_id', true)::int
UNION ALL SELECT 'laia_assessments active', COUNT(*) FROM public.laia_assessments WHERE organization_id = current_setting('migration.org_id', true)::int AND status <> 'archived'
UNION ALL SELECT 'laia_assessments archived', COUNT(*) FROM public.laia_assessments WHERE organization_id = current_setting('migration.org_id', true)::int AND status = 'archived'
UNION ALL SELECT 'laia_requirement_links', COUNT(*) FROM public.laia_requirement_links WHERE organization_id = current_setting('migration.org_id', true)::int
UNION ALL SELECT 'laia_revisions', COUNT(*) FROM public.laia_revisions WHERE organization_id = current_setting('migration.org_id', true)::int
UNION ALL SELECT 'laia_revision_changes', COUNT(*) FROM public.laia_revision_changes WHERE revision_id IN (SELECT id FROM public.laia_revisions WHERE organization_id = current_setting('migration.org_id', true)::int)
ORDER BY table;

\echo ''
\echo '================ FK INTEGRITY CHECKS ================'

\echo '-- Assessments sem sector resolvido (sector_id NULL onde v1 tinha):'
SELECT a.aspect_code, vsa.sector_id AS v1_sector_uuid
FROM _migration.v1_laia_assessments vsa
JOIN _migration.id_map ma ON ma.entity='assessment' AND ma.v1_uuid=vsa.id
JOIN public.laia_assessments a ON a.id = ma.v2_id
WHERE vsa.sector_id IS NOT NULL AND a.sector_id IS NULL
LIMIT 10;

\echo '-- Assessments sem unit resolvida:'
SELECT a.aspect_code, vsa.branch_id AS v1_branch_uuid
FROM _migration.v1_laia_assessments vsa
JOIN _migration.id_map ma ON ma.entity='assessment' AND ma.v1_uuid=vsa.id
JOIN public.laia_assessments a ON a.id = ma.v2_id
WHERE vsa.branch_id IS NOT NULL AND a.unit_id IS NULL
LIMIT 10;

\echo '-- Revision changes com entity_id=0 (órfãos):'
SELECT COUNT(*) AS revision_changes_orfas
FROM public.laia_revision_changes rc
JOIN public.laia_revisions r ON r.id = rc.revision_id
WHERE r.organization_id = current_setting('migration.org_id', true)::int
  AND rc.entity_id = 0;

\echo ''
\echo '================ DISTRIBUIÇÕES ================'

\echo '-- Por status:'
SELECT status, COUNT(*) FROM public.laia_assessments
WHERE organization_id = current_setting('migration.org_id', true)::int
GROUP BY status;

\echo '-- Por significance:'
SELECT significance, COUNT(*) FROM public.laia_assessments
WHERE organization_id = current_setting('migration.org_id', true)::int
GROUP BY significance;

\echo '-- Por category:'
SELECT category, COUNT(*) FROM public.laia_assessments
WHERE organization_id = current_setting('migration.org_id', true)::int
GROUP BY category;

\echo '-- isVigente:'
SELECT is_vigente, COUNT(*) FROM public.laia_assessments
WHERE organization_id = current_setting('migration.org_id', true)::int
GROUP BY is_vigente;

\echo '-- archives (lixeira vs intencional):'
SELECT
  archived_at IS NOT NULL AS has_archived_at,
  purged_at IS NOT NULL AS has_purged_at,
  COUNT(*)
FROM public.laia_assessments
WHERE organization_id = current_setting('migration.org_id', true)::int
  AND status = 'archived'
GROUP BY 1, 2;

\echo ''
\echo '================ FINAL ================'
\echo 'Se nenhuma linha apareceu em FK INTEGRITY, migração OK.'
\echo 'Verifique SKIPPED pra entender perdas conhecidas.'
\echo 'Compare counts v1 vs v2 (sectors+branch_configs+assessments+revisions devem bater).'

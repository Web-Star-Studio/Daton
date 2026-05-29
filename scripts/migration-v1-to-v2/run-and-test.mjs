// Driver: aplica staging schema, injeta mock data, roda transform, valida, rollback.
// Uso: node --env-file=/home/jp/daton/Daton/.env scripts/migration-v1-to-v2/run-and-test.mjs
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runFile(name) {
  const sql = readFileSync(join(__dirname, name), "utf8");
  await c.query(sql);
  console.log(`✓ ${name}`);
}

async function main() {
  await c.connect();
  console.log("Conectado em:", new URL(process.env.DATABASE_URL).host);

  // ── 1) Aplica staging schema
  await runFile("01-staging-schema.sql");

  // ── 2) Conjunto sintético: 1 branch (Pinhais PR), 1 user, 2 sectors, 3 assessments
  console.log("\n► Injetando mock data v1...");

  const TEST_TAG = "[MIGRATION_TEST]";
  // Limpa qualquer corrida anterior do mesmo teste
  await c.query("DELETE FROM _migration.v1_laia_revision_changes");
  await c.query("DELETE FROM _migration.v1_laia_revisions");
  await c.query("DELETE FROM _migration.v1_laia_assessments WHERE notes LIKE $1 OR aspect_code LIKE 'MIGTEST%'", [`${TEST_TAG}%`]);
  await c.query("DELETE FROM _migration.v1_laia_branch_config");
  await c.query("DELETE FROM _migration.v1_laia_sectors WHERE code LIKE 'MIGTEST%'");
  await c.query("DELETE FROM _migration.v1_branches WHERE name LIKE 'MIGTEST%'");
  await c.query("DELETE FROM _migration.v1_companies WHERE name LIKE 'MIGTEST%'");
  await c.query("DELETE FROM _migration.v1_profiles WHERE email LIKE 'migtest+%'");
  await c.query("TRUNCATE _migration.id_map, _migration.skipped");

  const ORG_ID = 3;            // Transportes Gabardo
  const FALLBACK_USER = 53;

  // Descobrir uma unit real em prod pra o branch v1 espelhar
  const unitRes = await c.query(
    "SELECT id, code, name FROM units WHERE organization_id = $1 ORDER BY id LIMIT 1",
    [ORG_ID],
  );
  if (unitRes.rows.length === 0) {
    throw new Error("Sem units em prod pra org 3 — adicione uma pra teste");
  }
  const realUnit = unitRes.rows[0];
  console.log("Unit real pra mirror:", realUnit);

  // Descobrir email do user 53
  const userRes = await c.query("SELECT email FROM users WHERE id = $1", [FALLBACK_USER]);
  const realUserEmail = userRes.rows[0].email;
  console.log("User real pra match:", realUserEmail);

  // Inserir company + branch + profile equivalentes
  const companyId = "11111111-1111-1111-1111-111111111111";
  const branchId  = "22222222-2222-2222-2222-222222222222";
  const profileId = "33333333-3333-3333-3333-333333333333";
  const sectorAId = "44444444-4444-4444-4444-444444444444";
  const sectorBId = "55555555-5555-5555-5555-555555555555";

  await c.query(
    "INSERT INTO _migration.v1_companies (id, name, created_at) VALUES ($1, $2, NOW())",
    [companyId, "MIGTEST Transportes Gabardo"],
  );
  await c.query(
    "INSERT INTO _migration.v1_branches (id, company_id, code, name, state, city) VALUES ($1, $2, $3, $4, 'PR', 'Pinhais')",
    [branchId, companyId, realUnit.code, "MIGTEST " + realUnit.name],
  );
  await c.query(
    "INSERT INTO _migration.v1_profiles (id, email, full_name, created_at) VALUES ($1, $2, $3, NOW())",
    [profileId, realUserEmail, "MIGTEST user"],
  );

  // 2 sectors
  await c.query(
    `INSERT INTO _migration.v1_laia_sectors (id, company_id, branch_id, code, name, description, is_active, created_at)
     VALUES
       ($1, $2, $3, 'MIGTEST-ADM', 'Administrativo (teste)', 'Setor de teste 1', true, NOW()),
       ($4, $2, $3, 'MIGTEST-OPE', 'Operacional (teste)', 'Setor de teste 2', true, NOW())`,
    [sectorAId, companyId, branchId, sectorBId],
  );

  // 3 assessments: 1 ativa, 1 soft-deleted, 1 sem responsible_user
  await c.query(
    `INSERT INTO _migration.v1_laia_assessments
       (id, company_id, branch_id, sector_id, responsible_user_id,
        aspect_code, activity_operation, environmental_aspect, environmental_impact,
        temporality, operational_situation, incidence, impact_class, scope, severity,
        consequence_score, frequency_probability, freq_prob_score, total_score,
        category, significance, has_legal_requirements, has_lifecycle_control,
        control_types, lifecycle_stages, legislation_references,
        legislation_reference, legislation_reference_url, output_actions,
        is_vigente, status, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4,
        'MIGTEST.01', 'Consumo de energia', 'Consumo de energia elétrica', 'Esgotamento de recursos energéticos',
        'atual', 'normal', 'direto', 'adverso', 'local', 'media',
        40, 'media', 20, 60,
        'moderado', 'significativo', true, true,
        ARRAY['administrativo'], ARRAY['operacao'], '[{"reference":"NR-10","summary":"Segurança em eletricidade"}]'::jsonb,
        NULL, NULL, 'Implementar monitoramento mensal',
        true, 'ativo', NOW() - interval '30 days', NOW() - interval '1 day'),

       (gen_random_uuid(), $1, $2, $3, $4,
        'MIGTEST.02', 'Descarte resíduos', 'Geração de resíduos sólidos', 'Contaminação do solo',
        'atual', 'normal', 'direto', 'adverso', 'local', 'alta',
        60, 'alta', 30, 90,
        'critico', 'significativo', true, true,
        ARRAY['operacional', 'tecnico'], ARRAY['descarte_final'], '[]'::jsonb,
        'Lei 12.305/2010', 'https://example.com/lei12305', NULL,
        true, 'ativo', NOW() - interval '60 days', NOW() - interval '5 days'),

       (gen_random_uuid(), $1, $2, $3, NULL,
        'MIGTEST.03', 'Limpeza', 'Uso de produtos químicos', 'Contaminação de água',
        'atual', 'emergencia', 'indireto', 'adverso', 'local', 'baixa',
        20, 'baixa', 10, 30,
        'desprezivel', 'nao_significativo', false, false,
        ARRAY[]::text[], ARRAY[]::text[], '[]'::jsonb,
        NULL, NULL, NULL,
        false, NULL, NOW() - interval '90 days', NOW() - interval '7 days')`,
    [companyId, branchId, sectorAId, profileId],
  );

  // Soft-delete o segundo
  await c.query(
    "UPDATE _migration.v1_laia_assessments SET deleted_at = NOW() - interval '2 days' WHERE aspect_code = 'MIGTEST.02'",
  );

  // 1 branch_config
  await c.query(
    `INSERT INTO _migration.v1_laia_branch_config (id, company_id, branch_id, survey_status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'em_levantamento', NOW(), NOW())`,
    [companyId, branchId],
  );

  // 1 revision finalizada com 2 changes
  const revisionId = "66666666-6666-6666-6666-666666666666";
  await c.query(
    `INSERT INTO _migration.v1_laia_revisions
       (id, company_id, revision_number, title, description, status, is_legacy,
        created_by, validated_by, validated_at, finalized_at, created_at, updated_at)
     VALUES ($1, $2, 1, 'Revisão inicial migrada', 'Teste de migração',
             'finalizada', false, $3, $3, NOW() - interval '1 day',
             NOW() - interval '1 day', NOW() - interval '7 days', NOW() - interval '1 day')`,
    [revisionId, companyId, profileId],
  );

  // Para os changes precisamos do v1_uuid de uma assessment migrada (vou pegar uma de cima)
  const asmtUuidRes = await c.query("SELECT id FROM _migration.v1_laia_assessments WHERE aspect_code = 'MIGTEST.01' LIMIT 1");
  const asmtUuid = asmtUuidRes.rows[0].id;

  await c.query(
    `INSERT INTO _migration.v1_laia_revision_changes
       (id, revision_id, branch_id, entity_type, entity_id, change_type, field_name, old_value, new_value, changed_by, changed_at)
     VALUES
       (gen_random_uuid(), $1, $2, 'assessment', $3, 'update', 'consequence_score', '30', '40', $4, NOW() - interval '7 days'),
       (gen_random_uuid(), $1, $2, 'assessment', $3, 'update', 'category', 'desprezivel', 'moderado', $4, NOW() - interval '7 days')`,
    [revisionId, branchId, asmtUuid, profileId],
  );

  console.log("✓ Mock injetado: 1 company, 1 branch, 1 profile, 2 sectors, 3 assessments (1 soft-deleted), 1 branch_config, 1 revision, 2 changes");

  // ── 3) Snapshot dos counts ANTES da migração
  console.log("\n► Snapshot counts v2 pré-migração...");
  const snapshot = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM laia_sectors WHERE organization_id = $1) AS sectors,
      (SELECT COUNT(*) FROM laia_branch_configs WHERE organization_id = $1) AS branch_configs,
      (SELECT COUNT(*) FROM laia_assessments WHERE organization_id = $1) AS assessments,
      (SELECT COUNT(*) FROM laia_requirement_links WHERE organization_id = $1) AS req_links,
      (SELECT COUNT(*) FROM laia_revisions WHERE organization_id = $1) AS revisions
  `, [ORG_ID]);
  console.log("Pré:", snapshot.rows[0]);

  // ── 4) Roda transform
  console.log("\n► Rodando 02-transform.sql...");
  await runFile("02-transform.sql");

  // ── 5) Validação
  console.log("\n► Validação pós-migração...");
  const idMap = await c.query("SELECT entity, COUNT(*) FROM _migration.id_map GROUP BY entity ORDER BY entity");
  console.log("id_map:");
  idMap.rows.forEach(r => console.log(`  ${r.entity}: ${r.count}`));

  const skipped = await c.query("SELECT entity, reason, COUNT(*) FROM _migration.skipped GROUP BY entity, reason ORDER BY entity, reason");
  if (skipped.rows.length > 0) {
    console.log("\nskipped:");
    skipped.rows.forEach(r => console.log(`  ${r.entity} [${r.reason}]: ${r.count}`));
  } else {
    console.log("\nskipped: (nenhum) ✓");
  }

  // Counts pós
  const post = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM laia_sectors WHERE organization_id = $1) AS sectors,
      (SELECT COUNT(*) FROM laia_branch_configs WHERE organization_id = $1) AS branch_configs,
      (SELECT COUNT(*) FROM laia_assessments WHERE organization_id = $1) AS assessments,
      (SELECT COUNT(*) FROM laia_assessments WHERE organization_id = $1 AND status='active') AS asmt_active,
      (SELECT COUNT(*) FROM laia_assessments WHERE organization_id = $1 AND status='archived') AS asmt_archived,
      (SELECT COUNT(*) FROM laia_requirement_links WHERE organization_id = $1) AS req_links,
      (SELECT COUNT(*) FROM laia_revisions WHERE organization_id = $1) AS revisions
  `, [ORG_ID]);
  console.log("\nPós:", post.rows[0]);

  console.log("\n► Delta:");
  for (const k of Object.keys(post.rows[0])) {
    const pre = snapshot.rows[0][k] ?? 0;
    const after = post.rows[0][k] ?? 0;
    const d = Number(after) - Number(pre);
    console.log(`  ${k}: ${pre} → ${after} (Δ ${d >= 0 ? '+' : ''}${d})`);
  }

  // Sample row migrada
  console.log("\n► Sample row migrada (MIGTEST.01):");
  const sample = await c.query(`
    SELECT aspect_code, status, is_vigente, control_level, normal_condition, abnormal_condition,
           significance, category, archived_at, purged_at, control_types, lifecycle_stages,
           jsonb_array_length(COALESCE((SELECT jsonb_agg(rl) FROM laia_requirement_links rl WHERE rl.assessment_id = a.id), '[]'::jsonb)) AS req_links_count
    FROM laia_assessments a
    WHERE organization_id = $1 AND aspect_code = 'MIGTEST.01'
  `, [ORG_ID]);
  console.log(sample.rows[0]);

  console.log("\n► Sample soft-deleted (MIGTEST.02):");
  const sampleDel = await c.query(`
    SELECT aspect_code, status, archived_at, purged_at
    FROM laia_assessments WHERE organization_id = $1 AND aspect_code = 'MIGTEST.02'
  `, [ORG_ID]);
  console.log(sampleDel.rows[0]);

  console.log("\n► Revisão migrada:");
  const sampleRev = await c.query(`
    SELECT r.revision_number, r.status, r.title, r.finalized_at,
           (SELECT COUNT(*) FROM laia_revision_changes WHERE revision_id = r.id) AS changes
    FROM laia_revisions r
    WHERE r.organization_id = $1 AND r.title = 'Revisão inicial migrada'
  `, [ORG_ID]);
  console.log(sampleRev.rows[0]);

  // ── 6) Rollback do teste
  console.log("\n► Rollback...");
  await runFile("04-rollback.sql");

  const rollback = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM laia_sectors WHERE organization_id = $1) AS sectors,
      (SELECT COUNT(*) FROM laia_branch_configs WHERE organization_id = $1) AS branch_configs,
      (SELECT COUNT(*) FROM laia_assessments WHERE organization_id = $1) AS assessments,
      (SELECT COUNT(*) FROM laia_requirement_links WHERE organization_id = $1) AS req_links,
      (SELECT COUNT(*) FROM laia_revisions WHERE organization_id = $1) AS revisions
  `, [ORG_ID]);
  console.log("\nPós-rollback:", rollback.rows[0]);
  console.log("Pré:        ", snapshot.rows[0]);

  const allBack = Object.keys(rollback.rows[0]).every(k =>
    String(rollback.rows[0][k]) === String(snapshot.rows[0][k])
  );
  console.log(allBack ? "\n✅ ROLLBACK COMPLETO — counts voltaram aos valores pré-migração" : "\n⚠️ ROLLBACK INCOMPLETO — investigar");

  // Limpa o mock data do staging tbm
  await c.query("DELETE FROM _migration.v1_laia_revision_changes");
  await c.query("DELETE FROM _migration.v1_laia_revisions");
  await c.query("DELETE FROM _migration.v1_laia_assessments WHERE aspect_code LIKE 'MIGTEST%'");
  await c.query("DELETE FROM _migration.v1_laia_branch_config");
  await c.query("DELETE FROM _migration.v1_laia_sectors WHERE code LIKE 'MIGTEST%'");
  await c.query("DELETE FROM _migration.v1_branches WHERE name LIKE 'MIGTEST%'");
  await c.query("DELETE FROM _migration.v1_companies WHERE name LIKE 'MIGTEST%'");
  await c.query("DELETE FROM _migration.v1_profiles WHERE email = $1", [realUserEmail]);

  await c.end();
  console.log("\n✓ Done.");
}

main().catch(async (err) => {
  console.error("✗ ERRO:", err.message);
  console.error(err.stack);
  try { await c.end(); } catch {}
  process.exit(1);
});

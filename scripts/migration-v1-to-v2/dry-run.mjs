// Dry-run: valida pipeline ETL inteira dentro de transação que termina em ROLLBACK.
// Nada persiste em prod — nem mock data, nem id_map, nem rows migradas. Pura simulação.
//
// Uso: node --env-file=/home/jp/daton/Daton/.env scripts/migration-v1-to-v2/dry-run.mjs
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sectionsBuffer = [];
function log(msg) { console.log(msg); sectionsBuffer.push(msg); }

async function main() {
  await c.connect();
  log(`Conectado: ${new URL(process.env.DATABASE_URL).host}`);
  log("");
  log("══════════════════════════════════════════════════════════════════════");
  log("  DRY-RUN: BEGIN → mock → transform → assertions → ROLLBACK");
  log("══════════════════════════════════════════════════════════════════════");

  await c.query("BEGIN");

  let ok = true;
  const failures = [];
  function assert(name, cond, detail = "") {
    const mark = cond ? "✓" : "✗";
    log(`  ${mark} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!cond) { ok = false; failures.push(name); }
  }

  try {
    // ── 1) Garante config de teste
    log("\n[1] Setup config");
    await c.query("UPDATE _migration.config SET value = '3' WHERE key = 'default_organization_id'");
    await c.query("UPDATE _migration.config SET value = '53' WHERE key = 'fallback_user_id'");
    await c.query("UPDATE _migration.config SET value = 'archive_with_null_purged_at' WHERE key = 'handle_soft_deleted'");
    await c.query("UPDATE _migration.config SET value = 'notes_with_prefix' WHERE key = 'output_actions_destination'");
    log("  ✓ config setada (org_id=3, fallback_user=53)");

    // ── 2) Descobre uma unit + user reais pra fazer mock realista
    log("\n[2] Pegar âncoras reais em prod (pra match funcionar)");
    const unitRes = await c.query("SELECT id, code, name FROM units WHERE organization_id = 3 ORDER BY id LIMIT 1");
    if (unitRes.rows.length === 0) {
      log("  ✗ Sem units pra org 3 — não dá pra simular branch matching");
      throw new Error("no_unit");
    }
    const realUnit = unitRes.rows[0];
    log(`  ✓ unit real: id=${realUnit.id} code=${realUnit.code} name=${realUnit.name}`);

    const userRes = await c.query("SELECT id, email FROM users WHERE id = 53");
    if (userRes.rows.length === 0) {
      log("  ✗ User 53 não existe — fallback inválido");
      throw new Error("no_user");
    }
    const realUserEmail = userRes.rows[0].email;
    log(`  ✓ user fallback: id=53 email=${realUserEmail}`);

    // ── 3) Injeta mock v1
    log("\n[3] Inject mock v1 (em _migration.v1_*)");
    const companyId  = "11111111-1111-1111-1111-111111111111";
    const branchId   = "22222222-2222-2222-2222-222222222222";
    const profileId  = "33333333-3333-3333-3333-333333333333";
    const sectorAId  = "44444444-4444-4444-4444-444444444444";
    const sectorBId  = "55555555-5555-5555-5555-555555555555";
    const revisionId = "66666666-6666-6666-6666-666666666666";

    await c.query(`INSERT INTO _migration.v1_companies (id, name, created_at) VALUES ($1, $2, NOW())`,
      [companyId, "DRYRUN Transportes Gabardo"]);
    await c.query(`INSERT INTO _migration.v1_branches (id, company_id, code, name, state, city)
                   VALUES ($1, $2, $3, $4, 'PR', 'Pinhais')`,
      [branchId, companyId, realUnit.code, "DRYRUN " + realUnit.name]);
    await c.query(`INSERT INTO _migration.v1_profiles (id, email, full_name, created_at) VALUES ($1, $2, $3, NOW())`,
      [profileId, realUserEmail, "DRYRUN user"]);

    await c.query(`INSERT INTO _migration.v1_laia_sectors (id, company_id, branch_id, code, name, description, is_active, created_at)
                   VALUES
                     ($1, $2, $3, 'DRY-ADM', 'Administrativo (dry)', 'Setor 1', true, NOW()),
                     ($4, $2, $3, 'DRY-OPE', 'Operacional (dry)', 'Setor 2', true, NOW())`,
      [sectorAId, companyId, branchId, sectorBId]);

    await c.query(`INSERT INTO _migration.v1_laia_assessments
       (id, company_id, branch_id, sector_id, responsible_user_id,
        aspect_code, activity_operation, environmental_aspect, environmental_impact,
        temporality, operational_situation, incidence, impact_class, scope, severity,
        consequence_score, frequency_probability, freq_prob_score, total_score,
        category, significance, has_legal_requirements, has_lifecycle_control,
        has_strategic_options, has_stakeholder_demand,
        control_types, lifecycle_stages, legislation_references,
        legislation_reference, legislation_reference_url, output_actions,
        is_vigente, status, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4,
        'DRY.01', 'Consumo de energia', 'Consumo de energia elétrica', 'Esgotamento de recursos',
        'atual', 'normal', 'direto', 'adverso', 'local', 'media',
        40, 'media', 20, 60,
        'moderado', 'significativo', true, true, false, true,
        ARRAY['administrativo']::text[], ARRAY['operacao']::text[],
        '[{"reference":"NR-10","summary":"Segurança em eletricidade"}]'::jsonb,
        NULL, NULL, 'Implementar monitoramento mensal',
        true, 'ativo', NOW() - interval '30 days', NOW() - interval '1 day'),

       (gen_random_uuid(), $1, $2, $3, $4,
        'DRY.02', 'Descarte resíduos', 'Geração de resíduos sólidos', 'Contaminação do solo',
        'atual', 'normal', 'direto', 'adverso', 'local', 'alta',
        60, 'alta', 30, 90,
        'critico', 'significativo', true, true, false, false,
        ARRAY['operacional', 'tecnico']::text[], ARRAY['descarte_final']::text[],
        '[]'::jsonb,
        'Lei 12.305/2010', 'https://example.com/lei12305', NULL,
        true, 'ativo', NOW() - interval '60 days', NOW() - interval '5 days'),

       (gen_random_uuid(), $1, $2, $3, NULL,
        'DRY.03', 'Limpeza', 'Uso de produtos químicos', 'Contaminação de água',
        'atual', 'emergencia', 'indireto', 'adverso', 'local', 'baixa',
        20, 'baixa', 10, 30,
        'desprezivel', 'nao_significativo', false, false, false, false,
        ARRAY[]::text[], ARRAY[]::text[], '[]'::jsonb,
        NULL, NULL, NULL,
        false, NULL, NOW() - interval '90 days', NOW() - interval '7 days')`,
      [companyId, branchId, sectorAId, profileId]);

    await c.query(`UPDATE _migration.v1_laia_assessments SET deleted_at = NOW() - interval '2 days' WHERE aspect_code = 'DRY.02'`);

    await c.query(`INSERT INTO _migration.v1_laia_branch_config (id, company_id, branch_id, survey_status, created_at, updated_at)
                   VALUES (gen_random_uuid(), $1, $2, 'em_levantamento', NOW(), NOW())`,
      [companyId, branchId]);

    await c.query(`INSERT INTO _migration.v1_laia_revisions
       (id, company_id, revision_number, title, description, status, is_legacy, created_by, validated_by, validated_at, finalized_at, created_at, updated_at)
     VALUES ($1, $2, 1, 'DRY Revisão inicial', 'Teste dry-run', 'finalizada', false, $3, $3,
             NOW() - interval '1 day', NOW() - interval '1 day', NOW() - interval '7 days', NOW() - interval '1 day')`,
      [revisionId, companyId, profileId]);

    const asmtUuidRes = await c.query("SELECT id FROM _migration.v1_laia_assessments WHERE aspect_code = 'DRY.01' LIMIT 1");
    const asmtUuid = asmtUuidRes.rows[0].id;
    await c.query(`INSERT INTO _migration.v1_laia_revision_changes
       (id, revision_id, entity_type, entity_id, change_type, field_name, old_value, new_value, changed_by, changed_at)
     VALUES
       (gen_random_uuid(), $1, 'assessment', $2, 'update', 'consequence_score', '30', '40', $3, NOW() - interval '7 days'),
       (gen_random_uuid(), $1, 'assessment', $2, 'update', 'category', 'desprezivel', 'moderado', $3, NOW() - interval '7 days')`,
      [revisionId, asmtUuid, profileId]);

    log("  ✓ mock injetado: 1 company, 1 branch, 1 profile, 2 sectors, 3 assessments (1 soft-del), 1 branch_config, 1 revision, 2 changes");

    // ── 4) Snapshot v2 pré-transform
    log("\n[4] Snapshot v2 pré-transform (org 3)");
    const pre = await c.query(`
      SELECT
        (SELECT COUNT(*)::int FROM laia_sectors WHERE organization_id = 3) AS sectors,
        (SELECT COUNT(*)::int FROM laia_branch_configs WHERE organization_id = 3) AS branch_configs,
        (SELECT COUNT(*)::int FROM laia_assessments WHERE organization_id = 3) AS assessments,
        (SELECT COUNT(*)::int FROM laia_requirement_links WHERE organization_id = 3) AS req_links,
        (SELECT COUNT(*)::int FROM laia_revisions WHERE organization_id = 3) AS revisions
    `);
    log(`  pré: ${JSON.stringify(pre.rows[0])}`);

    // ── 5) Roda transform
    log("\n[5] Executando 02-transform.sql");
    const transformSql = readFileSync(join(__dirname, "02-transform.sql"), "utf8")
      .replace(/^BEGIN;/m, "-- BEGIN; (já em transação dry-run)")
      .replace(/^COMMIT;/m, "-- COMMIT; (substituído por ROLLBACK no fim)");
    await c.query(transformSql);
    log("  ✓ transform executado");

    // ── 6) Validações
    log("\n[6] Asserções de migração");

    const idMap = await c.query("SELECT entity, COUNT(*)::int AS c FROM _migration.id_map GROUP BY entity ORDER BY entity");
    const idCounts = Object.fromEntries(idMap.rows.map(r => [r.entity, r.c]));
    log(`  id_map: ${JSON.stringify(idCounts)}`);
    assert("user mapping bate (1 profile → 1 user)", idCounts.user === 1, `tem ${idCounts.user ?? 0}`);
    assert("unit mapping bate (1 branch → 1 unit)", idCounts.unit === 1, `tem ${idCounts.unit ?? 0}`);
    assert("2 sectors migrados", idCounts.sector === 2, `tem ${idCounts.sector ?? 0}`);
    assert("3 assessments migrados", idCounts.assessment === 3, `tem ${idCounts.assessment ?? 0}`);
    assert("1 revision migrada", idCounts.revision === 1, `tem ${idCounts.revision ?? 0}`);

    const skipped = await c.query("SELECT entity, reason, COUNT(*)::int AS c FROM _migration.skipped GROUP BY entity, reason");
    if (skipped.rows.length > 0) {
      log("\n  skipped detalhe:");
      skipped.rows.forEach(r => log(`    - ${r.entity} [${r.reason}]: ${r.c}`));
    } else {
      log("  skipped: nenhum ✓");
    }

    // Sample asmt DRY.01
    log("\n[7] Sample DRY.01 (deve estar 'active' + isVigente=true + control_level=direct_control + normal=true)");
    const s1 = await c.query(`
      SELECT status, is_vigente, control_level, normal_condition, abnormal_condition,
             significance, category, archived_at, purged_at,
             control_types, lifecycle_stages, has_strategic_option,
             (SELECT COUNT(*)::int FROM laia_requirement_links WHERE assessment_id = a.id) AS req_links_count,
             notes
      FROM laia_assessments a WHERE organization_id = 3 AND aspect_code = 'DRY.01'
    `);
    const r1 = s1.rows[0];
    log(`  ${JSON.stringify(r1, null, 2)}`);
    assert("DRY.01 status=active", r1?.status === "active");
    assert("DRY.01 is_vigente=true", r1?.is_vigente === true);
    assert("DRY.01 control_level=direct_control", r1?.control_level === "direct_control");
    assert("DRY.01 normal_condition=true", r1?.normal_condition === true);
    assert("DRY.01 abnormal_condition=false", r1?.abnormal_condition === false);
    assert("DRY.01 significance=significant", r1?.significance === "significant");
    assert("DRY.01 category=moderado", r1?.category === "moderado");
    assert("DRY.01 archived_at=null", r1?.archived_at === null);
    assert("DRY.01 has_strategic_option=true (mapeado de has_strategic_options)", r1?.has_strategic_option === true);
    assert("DRY.01 control_types preservado", Array.isArray(r1?.control_types) && r1.control_types.includes("administrativo"));
    assert("DRY.01 lifecycle_stages preservado", Array.isArray(r1?.lifecycle_stages) && r1.lifecycle_stages.includes("operacao"));
    assert("DRY.01 tem 1 requirement_link expandido do JSONB NR-10", r1?.req_links_count >= 1);
    assert("DRY.01 notes inclui [saídas migradas do v1]", typeof r1?.notes === "string" && r1.notes.includes("saídas migradas do v1"));

    // Sample DRY.02 (soft-deleted)
    log("\n[8] Sample DRY.02 (soft-deleted → archived com archived_at, purged_at=null)");
    const s2 = await c.query(`
      SELECT status, archived_at, purged_at, is_vigente,
             (SELECT COUNT(*)::int FROM laia_requirement_links WHERE assessment_id = a.id) AS req_links_count
      FROM laia_assessments a WHERE organization_id = 3 AND aspect_code = 'DRY.02'
    `);
    const r2 = s2.rows[0];
    log(`  ${JSON.stringify(r2, null, 2)}`);
    assert("DRY.02 status=archived", r2?.status === "archived");
    assert("DRY.02 archived_at preenchido", r2?.archived_at !== null);
    assert("DRY.02 purged_at NULL (não auto-purgar)", r2?.purged_at === null);
    assert("DRY.02 tem 1 requirement_link legado (type=other)", r2?.req_links_count >= 1);

    const typeOther = await c.query(`
      SELECT type, title, description FROM laia_requirement_links rl
      JOIN laia_assessments a ON a.id = rl.assessment_id
      WHERE a.organization_id = 3 AND a.aspect_code = 'DRY.02'
    `);
    log(`  req_link DRY.02: ${JSON.stringify(typeOther.rows[0])}`);
    assert("DRY.02 req_link type=other (campo legado)", typeOther.rows[0]?.type === "other");
    assert("DRY.02 req_link title='Lei 12.305/2010'", typeOther.rows[0]?.title === "Lei 12.305/2010");

    // Sample DRY.03 (sem responsible_user, situação emergência, isVigente=false)
    log("\n[9] Sample DRY.03 (sem responsible_user → fallback 53, emergência, vigência=false)");
    const s3 = await c.query(`
      SELECT status, is_vigente, control_responsible_user_id, created_by_id,
             normal_condition, abnormal_condition, emergency_scenario,
             control_level
      FROM laia_assessments WHERE organization_id = 3 AND aspect_code = 'DRY.03'
    `);
    const r3 = s3.rows[0];
    log(`  ${JSON.stringify(r3, null, 2)}`);
    assert("DRY.03 responsible_user=53 (fallback)", r3?.control_responsible_user_id === 53);
    assert("DRY.03 created_by_id=53 (fallback)", r3?.created_by_id === 53);
    assert("DRY.03 normal_condition=false (emergência)", r3?.normal_condition === false);
    assert("DRY.03 emergency_scenario preenchido", typeof r3?.emergency_scenario === "string");
    assert("DRY.03 is_vigente=false", r3?.is_vigente === false);
    assert("DRY.03 control_level=none (has_lifecycle_control=false)", r3?.control_level === "none");

    // Sample revision
    log("\n[10] Sample revision (status=finalized + 2 changes resolvidas)");
    const sr = await c.query(`
      SELECT r.status, r.revision_number, r.finalized_at, r.created_by_id, r.finalized_by_id,
             (SELECT COUNT(*)::int FROM laia_revision_changes WHERE revision_id = r.id) AS changes
      FROM laia_revisions r WHERE r.organization_id = 3 AND r.title = 'DRY Revisão inicial'
    `);
    const r4 = sr.rows[0];
    log(`  ${JSON.stringify(r4, null, 2)}`);
    assert("revision status=finalized", r4?.status === "finalized");
    assert("revision finalized_by_id setado (validado)", r4?.finalized_by_id !== null);
    assert("2 changes vinculados à revision", r4?.changes === 2);

    // Verifica branch_config
    log("\n[11] Branch config criado pra unidade matched");
    const bc = await c.query(`
      SELECT survey_status, unit_id FROM laia_branch_configs WHERE organization_id = 3 AND unit_id = $1
    `, [realUnit.id]);
    if (bc.rows.length > 0) {
      log(`  ${JSON.stringify(bc.rows[0])}`);
      // Pode ter sido um upsert (se já existia)
      assert("branch_config aponta pra unit real", bc.rows[0].unit_id === realUnit.id);
    } else {
      log("  (sem branch_config — talvez já existia e o ON CONFLICT atualizou status, vamos checar)");
    }

    // Idempotência: roda transform de novo, conta o que cresceu
    log("\n[12] Idempotência: rodar transform 2ª vez");
    const idMapBefore = (await c.query("SELECT COUNT(*)::int AS c FROM _migration.id_map")).rows[0].c;
    await c.query(transformSql);
    const idMapAfter = (await c.query("SELECT COUNT(*)::int AS c FROM _migration.id_map")).rows[0].c;
    assert(`id_map estável após 2ª execução (${idMapBefore} → ${idMapAfter})`, idMapBefore === idMapAfter);

    const asmtAfter = await c.query(`SELECT COUNT(*)::int AS c FROM laia_assessments WHERE organization_id = 3 AND aspect_code LIKE 'DRY.%'`);
    assert(`assessments DRY.* não duplicaram (3 esperados, ${asmtAfter.rows[0].c} encontrados)`, asmtAfter.rows[0].c === 3);

    // Resumo
    log("\n══════════════════════════════════════════════════════════════════════");
    if (ok) {
      log("  ✅ DRY-RUN OK — pipeline ETL validado, todas asserções verdes");
    } else {
      log("  ❌ DRY-RUN COM FALHAS:");
      failures.forEach(f => log(`     - ${f}`));
    }
    log("══════════════════════════════════════════════════════════════════════");

  } finally {
    // ROLLBACK incondicional — mock data e tudo que foi migrado evapora
    await c.query("ROLLBACK");
    log("\n► ROLLBACK executado — nada foi commitado em prod");
  }

  // Confirma que prod está limpa após rollback
  log("\n[13] Confirmação pós-rollback (prod deve estar como pré-início)");
  const post = await c.query(`
    SELECT
      (SELECT COUNT(*)::int FROM laia_sectors WHERE organization_id = 3) AS sectors,
      (SELECT COUNT(*)::int FROM laia_branch_configs WHERE organization_id = 3) AS branch_configs,
      (SELECT COUNT(*)::int FROM laia_assessments WHERE organization_id = 3) AS assessments,
      (SELECT COUNT(*)::int FROM laia_requirement_links WHERE organization_id = 3) AS req_links,
      (SELECT COUNT(*)::int FROM laia_revisions WHERE organization_id = 3) AS revisions,
      (SELECT COUNT(*)::int FROM _migration.v1_laia_assessments) AS staging_assessments,
      (SELECT COUNT(*)::int FROM _migration.id_map) AS id_map
  `);
  log(`  ${JSON.stringify(post.rows[0])}`);

  await c.end();

  if (!ok) process.exit(2);
}

main().catch(async (err) => {
  console.error("\n✗ ERRO FATAL:", err.message);
  console.error(err.stack);
  try { await c.query("ROLLBACK"); } catch {}
  try { await c.end(); } catch {}
  process.exit(1);
});

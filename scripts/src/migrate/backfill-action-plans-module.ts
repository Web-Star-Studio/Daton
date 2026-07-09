/**
 * Backfill do módulo `actionPlans` (hub "Planos de Ação").
 *
 * Até agora o hub não era um módulo de permissão: aparecia para todo usuário
 * autenticado e não podia ser configurado no diálogo "Configurar Permissões".
 * Ao registrá-lo, quem não é admin passa a precisar da permissão explícita —
 * sem este backfill, operadores/analistas/gerentes perderiam o hub no deploy.
 *
 * Regra: concede `actionPlans` a todo usuário NÃO-admin que já tenha ao menos
 * um módulo. Contas propositalmente sem nenhum módulo continuam sem nenhum, e
 * platform_admin/org_admin ignoram a tabela de módulos (acesso total).
 *
 * Idempotente (ON CONFLICT DO NOTHING). SEM --commit: dry-run.
 *   pnpm --filter @workspace/scripts exec tsx --env-file ../.env \
 *     ./src/migrate/backfill-action-plans-module.ts [--org=2] [--commit]
 */
import { pool } from "@workspace/db";

const COMMIT = process.argv.includes("--commit");
const orgArg = process.argv.find((a) => a.startsWith("--org="));
const ORG_ID = orgArg ? Number(orgArg.slice("--org=".length)) : null;

const MODULE = "actionPlans";
const ADMIN_ROLES = ["platform_admin", "org_admin"];

async function main() {
  if (orgArg && !Number.isInteger(ORG_ID)) {
    throw new Error(`--org inválido: ${orgArg}`);
  }

  const { rows: targets } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.organization_id
       FROM users u
      WHERE NOT (u.role = ANY($1::text[]))
        AND ($2::int IS NULL OR u.organization_id = $2::int)
        AND EXISTS (SELECT 1 FROM user_module_permissions p WHERE p.user_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM user_module_permissions p
           WHERE p.user_id = u.id AND p.module = $3
        )
      ORDER BY u.organization_id, u.id`,
    [ADMIN_ROLES, ORG_ID, MODULE],
  );

  const scope = ORG_ID === null ? "todas as organizações" : `organização ${ORG_ID}`;
  console.log(`Escopo: ${scope}`);
  console.log(`Usuários não-admin, com ≥1 módulo e sem "${MODULE}": ${targets.length}`);
  for (const u of targets) {
    console.log(`  org ${u.organization_id} · #${u.id} ${u.name} <${u.email}> [${u.role}]`);
  }

  if (targets.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  if (!COMMIT) {
    console.log("\nDRY-RUN: nada gravado. Rode novamente com --commit para aplicar.");
    return;
  }

  const { rowCount } = await pool.query(
    `INSERT INTO user_module_permissions (user_id, module)
     SELECT id, $1 FROM unnest($2::int[]) AS id
     ON CONFLICT (user_id, module) DO NOTHING`,
    [MODULE, targets.map((u) => u.id)],
  );
  console.log(`\nConcedido "${MODULE}" a ${rowCount} usuário(s).`);
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    pool.end();
    process.exit(1);
  });

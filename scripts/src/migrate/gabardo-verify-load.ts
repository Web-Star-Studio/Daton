/** READ-ONLY: verificação pós-carga Gabardo (org 2). */
import { pool } from "@workspace/db";

async function main() {
  const ORG = 2;
  const q = (s: string, p: unknown[] = []) => pool.query(s, p);

  const total = (await q(`SELECT count(*)::int n FROM employees WHERE organization_id=$1`, [ORG])).rows[0].n;
  const terc = (await q(`SELECT count(*)::int n FROM employees WHERE organization_id=$1 AND contract_type='terceirizado'`, [ORG])).rows[0].n;
  const withBirth = (await q(`SELECT count(*)::int n FROM employees WHERE organization_id=$1 AND birth_date IS NOT NULL`, [ORG])).rows[0].n;
  const withGender = (await q(`SELECT count(*)::int n FROM employees WHERE organization_id=$1 AND gender IS NOT NULL`, [ORG])).rows[0].n;
  const withEdu = (await q(`SELECT count(*)::int n FROM employees WHERE organization_id=$1 AND education IS NOT NULL`, [ORG])).rows[0].n;
  console.log(`Total org ${ORG}: ${total}`);
  console.log(`contract_type=terceirizado: ${terc}`);
  console.log(`com birth_date: ${withBirth} | com gender: ${withGender} | com education: ${withEdu}`);

  const units = (await q(
    `SELECT u.id, u.name, u.code, count(e.id)::int vinc
     FROM units u LEFT JOIN employees e ON e.unit_id=u.id AND e.organization_id=$1
     WHERE u.organization_id=$1 AND u.name IN ('MOTORISTA TERCEIRO','INTEGRADO GABARDO')
     GROUP BY u.id,u.name,u.code ORDER BY u.name`,
    [ORG],
  )).rows;
  console.log("\nPseudo-filiais:");
  for (const u of units) console.log(`  [${u.id}] ${u.name} (${u.code}) -> ${u.vinc} vinculados`);

  const cargos = (await q(`SELECT count(*)::int n FROM positions WHERE organization_id=$1`, [ORG])).rows[0].n;
  const pdi = (await q(`SELECT count(*)::int n FROM departments WHERE organization_id=$1 AND name='PDI'`, [ORG])).rows[0].n;
  console.log(`\nCargos no catálogo: ${cargos} | departamento PDI existe: ${pdi === 1}`);

  const sample = (await q(
    `SELECT name, cpf, birth_date, gender, education, contract_type, unit_id
     FROM employees WHERE organization_id=$1 AND gender IS NOT NULL
     ORDER BY id DESC LIMIT 4`,
    [ORG],
  )).rows;
  console.log("\nAmostra (recém-inseridos):");
  for (const s of sample)
    console.log(`  ${s.name} | ${s.cpf} | nasc=${s.birth_date} | ${s.gender} | ${s.education} | ${s.contract_type} | unit=${s.unit_id}`);
}

main().then(() => pool.end()).catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });

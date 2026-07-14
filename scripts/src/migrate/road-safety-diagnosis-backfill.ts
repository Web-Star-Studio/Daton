/**
 * Backfill: o texto livre de `road_safety_factors.current_diagnosis` vira o
 * primeiro registro do histórico de diagnósticos.
 *
 * Idempotente: só cria registro para fator que tem texto E ainda não tem
 * nenhum diagnóstico no histórico. Rodar duas vezes não duplica.
 *
 * Autor = NULL (o autor original nunca foi registrado — não inventamos um).
 * Data de referência = updated_at do fator: a melhor aproximação disponível de
 * quando aquele texto foi gravado.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts exec tsx src/migrate/road-safety-diagnosis-backfill.ts           # dry-run
 *   pnpm --filter @workspace/scripts exec tsx src/migrate/road-safety-diagnosis-backfill.ts --apply   # grava
 */
import { sql } from "drizzle-orm";
import {
  db,
  roadSafetyFactorDiagnosesTable,
  roadSafetyFactorsTable,
} from "@workspace/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const factors = await db
    .select({
      id: roadSafetyFactorsTable.id,
      organizationId: roadSafetyFactorsTable.organizationId,
      code: roadSafetyFactorsTable.code,
      currentDiagnosis: roadSafetyFactorsTable.currentDiagnosis,
      updatedAt: roadSafetyFactorsTable.updatedAt,
    })
    .from(roadSafetyFactorsTable)
    .where(
      sql`${roadSafetyFactorsTable.currentDiagnosis} IS NOT NULL
          AND btrim(${roadSafetyFactorsTable.currentDiagnosis}) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM road_safety_factor_diagnoses d
            WHERE d.factor_id = ${roadSafetyFactorsTable.id}
          )`,
    );

  console.log(`Fatores a backfillar: ${factors.length}`);
  for (const f of factors) {
    const referenceDate = f.updatedAt.toISOString().slice(0, 10);
    console.log(`  ${f.code} (org ${f.organizationId}) → ${referenceDate}`);
    if (!APPLY) continue;
    await db.insert(roadSafetyFactorDiagnosesTable).values({
      organizationId: f.organizationId,
      factorId: f.id,
      content: f.currentDiagnosis!,
      referenceDate,
      diagnosedByUserId: null,
    });
  }

  console.log(
    APPLY
      ? `Backfill aplicado: ${factors.length} registro(s).`
      : "Dry-run — nada gravado. Use --apply para gravar.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

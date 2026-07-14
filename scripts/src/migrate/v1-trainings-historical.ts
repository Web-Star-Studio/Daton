/**
 * Migrate historical V1 trainings + efficacy reviews into V2.
 *
 * Source: data/v1-trainings-historical-gabardo.json (extracted from V1 via Supabase MCP).
 * Target org: V2 organization_id from --org-id flag (Gabardo dev = 2).
 *
 * Filter applied at extraction time:
 *   completion_date IS NOT NULL OR status <> 'Inscrito' OR has efficacy review.
 *
 * Idempotent via legacy_v1_id (UNIQUE) on both employee_trainings and
 * training_effectiveness_reviews. Re-runs skip already-migrated rows.
 *
 * Employee match: cpf (digits) > email (lowercase) > name (exact).
 * Evaluator map (Gabardo): ELIANA PANKE V1 → V2 user id=12; everyone else → fallback.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts migrate-v1-trainings-historical \
 *     --payload ./src/migrate/data/v1-trainings-historical-gabardo.json \
 *     --org-id 2 --evaluator-fallback 11 [--dry-run] [--verbose]
 */
import {
  db,
  pool,
  employeesTable,
  employeeTrainingsTable,
  trainingEffectivenessReviewsTable,
  usersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { transformTrainingStatus, formatDate } from "./transform.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

const payloadPath = flag("--payload");
const orgIdRaw = flag("--org-id");
const fallbackRaw = flag("--evaluator-fallback");

if (!payloadPath || !orgIdRaw || !fallbackRaw) {
  console.error(
    "Usage: --payload <path.json> --org-id <int> --evaluator-fallback <user_id> [--dry-run] [--verbose]",
  );
  process.exit(1);
}
const orgId = Number(orgIdRaw);
const evaluatorFallback = Number(fallbackRaw);
if (!Number.isInteger(orgId) || !Number.isInteger(evaluatorFallback)) {
  console.error("--org-id and --evaluator-fallback must be integers");
  process.exit(1);
}

interface V1Review {
  v1_id: string;
  evaluator_v1_id: string | null;
  evaluator_name_v1: string | null;
  evaluator_email_v1: string | null;
  evaluation_date: string | null;
  score: string | number | null;
  is_effective: boolean | null;
  comments: string | null;
  created_at: string | null;
}

interface V1Training {
  v1_id: string;
  v1_employee_id: string;
  employee_name: string;
  employee_cpf: string | null;
  employee_email: string | null;
  v1_program_id: string;
  title: string;
  description: string | null;
  category: string | null;
  modality: string | null;
  is_mandatory: boolean | null;
  duration_hours: string | number | null;
  valid_for_months: number | null;
  trainer: string | null;
  notes: string | null;
  score: string | number | null;
  completion_date: string | null;
  expiration_date: string | null;
  status: string | null;
  created_at: string | null;
  reviews: V1Review[];
}

interface Payload {
  company_id: string;
  company_name: string;
  extracted_at: string;
  trainings: V1Training[];
}

const cpfDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const upper = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

// V1 evaluator UUID → V2 user id (Gabardo). Decided 2026-05-07.
// - ELIANA PANKE V1 = ELIANA PANK V2 (gestorarh@) — same person, V1 typo
// - JULIANA ERLER V1 = JULIANA DENISE V2 (psicologia1@) — same person, V2 user uses middle name
//   (full name in employees: JULIANA DENISE ERLER, confirmed via psicologia1@ email match)
// - THAIS BRITO V1 = THAIS BRITO V2 (gabardopreal.fat2@) — exact match, only present in prod
// Note: dev only had ELIANA mapped (THAIS and JULIANA's V2 users were not yet seeded in dev when migrated).
const EVALUATOR_OVERRIDES: Record<string, number> = {
  "1c01d18f-d783-4743-acf3-f50a79d1dd59": 12, // ELIANA PANKE → ELIANA PANK
  "6b515a9d-f7b3-42f9-bb24-97f201eea1b7": 47, // JULIANA ERLER → JULIANA DENISE (ERLER)
  "c17c0b8d-556d-4247-97fc-d7def6b4bf3f": 32, // THAIS BRITO → THAIS BRITO
};

function buildDescription(t: V1Training): string | null {
  const parts: string[] = [];
  if (t.description?.trim()) parts.push(t.description.trim());
  const tags: string[] = [];
  if (t.category?.trim()) tags.push(`Categoria: ${t.category.trim()}`);
  if (t.modality?.trim()) tags.push(`Modalidade: ${t.modality.trim()}`);
  if (t.is_mandatory) tags.push("Obrigatório");
  if (t.score !== null && t.score !== undefined && String(t.score).trim() !== "")
    tags.push(`Nota V1: ${t.score}`);
  if (tags.length) parts.push(`[${tags.join(" | ")}]`);
  if (t.notes?.trim()) parts.push(`Notas: ${t.notes.trim()}`);
  return parts.length ? parts.join("\n\n") : null;
}

async function main() {
  console.log("=== Migrate V1 historical trainings ===");
  const raw = readFileSync(payloadPath!, "utf-8");
  const payload: Payload = JSON.parse(raw);
  console.log(
    `  Source: ${payload.company_name} (V1 ${payload.company_id}), extracted ${payload.extracted_at}`,
  );
  console.log(
    `  Trainings: ${payload.trainings.length}, reviews: ${payload.trainings.reduce(
      (a, t) => a + t.reviews.length,
      0,
    )}`,
  );
  console.log(`  Target org_id=${orgId}, evaluator fallback user_id=${evaluatorFallback}`);
  if (dryRun) console.log("  Mode: DRY RUN");

  // Sanity: target connection + org exists
  const orgEmployees = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      cpf: employeesTable.cpf,
      email: employeesTable.email,
    })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));
  console.log(`  V2 employees in org: ${orgEmployees.length}`);
  if (orgEmployees.length === 0) {
    console.error(`  ✗ No employees found in org ${orgId}. Aborting.`);
    process.exit(1);
  }

  const fallbackUser = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, evaluatorFallback))
    .limit(1);
  if (fallbackUser.length === 0) {
    console.error(`  ✗ Evaluator fallback user_id=${evaluatorFallback} not found.`);
    process.exit(1);
  }
  console.log(`  Fallback evaluator: ${fallbackUser[0].name} (id=${evaluatorFallback})`);

  // Build employee lookup
  const byCpf = new Map<string, number>();
  const byEmail = new Map<string, number>();
  const byName = new Map<string, number[]>();
  for (const e of orgEmployees) {
    const cpf = cpfDigits(e.cpf);
    if (cpf) byCpf.set(cpf, e.id);
    const em = lower(e.email);
    if (em) byEmail.set(em, e.id);
    const nm = upper(e.name);
    if (nm) {
      const arr = byName.get(nm) ?? [];
      arr.push(e.id);
      byName.set(nm, arr);
    }
  }

  function resolveEmployee(t: V1Training):
    | { id: number; via: "cpf" | "email" | "name" }
    | null {
    const cpf = cpfDigits(t.employee_cpf);
    if (cpf && byCpf.has(cpf)) return { id: byCpf.get(cpf)!, via: "cpf" };
    const em = lower(t.employee_email);
    if (em && byEmail.has(em)) return { id: byEmail.get(em)!, via: "email" };
    const nm = upper(t.employee_name);
    const matches = byName.get(nm);
    if (matches && matches.length === 1) return { id: matches[0], via: "name" };
    return null;
  }

  let trainingsInserted = 0;
  let trainingsSkippedDup = 0;
  let trainingsSkippedSemantic = 0;
  let trainingsSkippedNoEmployee = 0;
  let trainingsErrors = 0;
  let reviewsInserted = 0;
  let reviewsSkippedDup = 0;
  let reviewsErrors = 0;

  const orphanEmployees: V1Training[] = [];

  for (const t of payload.trainings) {
    const emp = resolveEmployee(t);
    if (!emp) {
      trainingsSkippedNoEmployee++;
      orphanEmployees.push(t);
      if (verbose)
        console.log(
          `  [no-emp] V1 ${t.v1_id} employee="${t.employee_name}" cpf=${t.employee_cpf}`,
        );
      continue;
    }

    // Idempotency: by legacy_v1_id
    const existingByLegacy = await db
      .select({ id: employeeTrainingsTable.id })
      .from(employeeTrainingsTable)
      .where(eq(employeeTrainingsTable.legacyV1Id, t.v1_id))
      .limit(1);

    let v2TrainingId: number;
    if (existingByLegacy.length > 0) {
      trainingsSkippedDup++;
      v2TrainingId = existingByLegacy[0].id;
      if (verbose) console.log(`  [dup-legacy] V1 ${t.v1_id} → V2 ${v2TrainingId}`);
    } else {
      // Semantic dedup: same employee + same title (skip — Decision 1)
      const existingByPair = await db
        .select({ id: employeeTrainingsTable.id })
        .from(employeeTrainingsTable)
        .where(
          and(
            eq(employeeTrainingsTable.employeeId, emp.id),
            eq(employeeTrainingsTable.title, t.title),
          ),
        )
        .limit(1);

      if (existingByPair.length > 0) {
        trainingsSkippedSemantic++;
        v2TrainingId = existingByPair[0].id;
        // Backfill legacy_v1_id so future re-runs hit the legacy short-circuit
        if (!dryRun) {
          await db
            .update(employeeTrainingsTable)
            .set({ legacyV1Id: t.v1_id })
            .where(eq(employeeTrainingsTable.id, v2TrainingId));
        }
        if (verbose)
          console.log(
            `  [dup-semantic] emp=${emp.id} title="${t.title}" → V2 ${v2TrainingId} (backfilled legacy_v1_id)`,
          );
      } else {
        if (dryRun) {
          v2TrainingId = -1;
          trainingsInserted++;
          if (verbose)
            console.log(`  [DRY] insert training "${t.title}" (emp=${emp.id} via ${emp.via})`);
        } else {
          try {
            const durHours =
              t.duration_hours == null
                ? null
                : Math.round(
                    typeof t.duration_hours === "string"
                      ? Number(t.duration_hours)
                      : t.duration_hours,
                  );
            const [ins] = await db
              .insert(employeeTrainingsTable)
              .values({
                employeeId: emp.id,
                title: t.title,
                description: buildDescription(t),
                institution: t.trainer,
                workloadHours: Number.isFinite(durHours as number)
                  ? (durHours as number)
                  : null,
                renewalMonths: t.valid_for_months ?? null,
                completionDate: formatDate(t.completion_date),
                expirationDate: formatDate(t.expiration_date),
                status: transformTrainingStatus(t.status),
                legacyV1Id: t.v1_id,
                createdAt: t.created_at ? new Date(t.created_at) : undefined,
              })
              .returning({ id: employeeTrainingsTable.id });
            v2TrainingId = ins.id;
            trainingsInserted++;
            if (verbose)
              console.log(
                `  [ins] training V2 ${v2TrainingId} ← V1 ${t.v1_id} "${t.title}" (emp=${emp.id} via ${emp.via})`,
              );
          } catch (err) {
            trainingsErrors++;
            console.error(`  ERROR insert training V1 ${t.v1_id}:`, err);
            continue;
          }
        }
      }
    }

    // Reviews
    for (const r of t.reviews) {
      const existingReview = await db
        .select({ id: trainingEffectivenessReviewsTable.id })
        .from(trainingEffectivenessReviewsTable)
        .where(eq(trainingEffectivenessReviewsTable.legacyV1Id, r.v1_id))
        .limit(1);
      if (existingReview.length > 0) {
        reviewsSkippedDup++;
        if (verbose) console.log(`  [dup-review] V1 ${r.v1_id}`);
        continue;
      }

      const evaluatorOverride = r.evaluator_v1_id
        ? EVALUATOR_OVERRIDES[r.evaluator_v1_id]
        : undefined;
      const evaluatorUserId = evaluatorOverride ?? evaluatorFallback;
      const isFallback = evaluatorOverride === undefined;
      const evaluatorTag = isFallback
        ? `[Avaliador V1: ${r.evaluator_name_v1 ?? "desconhecido"}]`
        : null;
      const commentsParts = [
        evaluatorTag,
        r.comments?.trim() ? r.comments.trim() : null,
      ].filter((s): s is string => !!s);
      const finalComments = commentsParts.length ? commentsParts.join("\n\n") : null;

      // Sem Math.round: a coluna é numeric(4,2) desde fix/score-precisao-nota,
      // então arredondar aqui só descartaria precisão que o banco já guarda.
      const score =
        r.score == null
          ? null
          : typeof r.score === "string"
            ? Number(r.score)
            : r.score;

      const evalDate = formatDate(r.evaluation_date);
      if (!evalDate) {
        reviewsErrors++;
        console.error(`  ERROR review V1 ${r.v1_id}: missing evaluation_date`);
        continue;
      }

      if (dryRun || v2TrainingId === -1) {
        reviewsInserted++;
        if (verbose)
          console.log(
            `  [DRY] insert review V1 ${r.v1_id} → training V2 ${v2TrainingId} eval=${evaluatorUserId}${
              isFallback ? " (fallback)" : ""
            }`,
          );
        continue;
      }

      try {
        await db.insert(trainingEffectivenessReviewsTable).values({
          trainingId: v2TrainingId,
          evaluatorUserId,
          evaluationDate: evalDate,
          score: Number.isFinite(score as number) ? (score as number) : null,
          isEffective: r.is_effective,
          comments: finalComments,
          legacyV1Id: r.v1_id,
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        });
        reviewsInserted++;
        if (verbose)
          console.log(
            `  [ins] review V1 ${r.v1_id} → training V2 ${v2TrainingId} eval=${evaluatorUserId}${
              isFallback ? " (fallback)" : ""
            }`,
          );
      } catch (err) {
        reviewsErrors++;
        console.error(`  ERROR insert review V1 ${r.v1_id}:`, err);
      }
    }
  }

  console.log("\n--- Report ---");
  console.log(`  Trainings:  inserted=${trainingsInserted}  dup-legacy=${trainingsSkippedDup}  dup-semantic=${trainingsSkippedSemantic}  no-employee=${trainingsSkippedNoEmployee}  errors=${trainingsErrors}`);
  console.log(`  Reviews:    inserted=${reviewsInserted}  dup-legacy=${reviewsSkippedDup}  errors=${reviewsErrors}`);
  if (orphanEmployees.length > 0) {
    console.log(`\n  Orphan employees (no V2 match): ${orphanEmployees.length}`);
    const sample = orphanEmployees.slice(0, 10);
    for (const t of sample) {
      console.log(
        `    - ${t.employee_name} cpf=${t.employee_cpf ?? "—"} email=${t.employee_email ?? "—"}`,
      );
    }
    if (orphanEmployees.length > 10) console.log(`    ... and ${orphanEmployees.length - 10} more`);
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

import { and, eq, exists, isNotNull, isNull, ne, not, or, sql } from "drizzle-orm";
import {
  db,
  employeeTrainingsTable,
  trainingEffectivenessReviewsTable,
} from "@workspace/db";

// ─── Board de Eficácia — fragmentos SQL reutilizáveis ───────────────────────
// Fonte ÚNICA da regra "em que coluna do board este treinamento cai". Vivia em
// routes/employees.ts; foi extraído para cá quando o provider de pendências
// (services/pendencias/providers/training-effectiveness.ts) passou a precisar
// da mesma definição — um serviço não deve importar um arquivo de rotas.
// routes/employees.ts re-exporta daqui, então os call sites antigos seguem
// valendo e a regra continua existindo em um lugar só.

/**
 * EXISTS: o treinamento tem pelo menos uma avaliação de eficácia registrada.
 * SQL: EXISTS (SELECT 1 FROM training_effectiveness_reviews r
 *              WHERE r.training_id = employee_trainings.id)
 */
export const boardHasReviewExists = exists(
  db
    .select({ one: sql<number>`1` })
    .from(trainingEffectivenessReviewsTable)
    .where(
      and(
        eq(
          trainingEffectivenessReviewsTable.trainingId,
          employeeTrainingsTable.id,
        ),
        // Rascunho NÃO conclui a avaliação: a linha existe apenas para guardar o
        // preenchimento parcial. Sem este filtro o primeiro autosave do wizard
        // jogaria o card direto para "Concluídas".
        eq(trainingEffectivenessReviewsTable.status, "final"),
      ),
    ),
);

/**
 * EXISTS: o treinamento tem um rascunho de avaliação em aberto (preenchimento
 * iniciado e não finalizado). É o que dá sentido literal a "Em avaliação".
 */
export const boardHasDraftExists = exists(
  db
    .select({ one: sql<number>`1` })
    .from(trainingEffectivenessReviewsTable)
    .where(
      and(
        eq(
          trainingEffectivenessReviewsTable.trainingId,
          employeeTrainingsTable.id,
        ),
        eq(trainingEffectivenessReviewsTable.status, "draft"),
      ),
    ),
);

/**
 * Coluna "Concluídas": treinamentos com review registrado.
 * SQL: hasReview
 */
export const boardConcluidas = boardHasReviewExists;

/**
 * Coluna "Em Avaliação": sem review, mas com papel ou prazo de avaliação atribuídos.
 * SQL: NOT hasReview
 *      AND (effectiveness_assigned_role IS NOT NULL OR effectiveness_due_date IS NOT NULL)
 */
export const boardEmAvaliacao = and(
  not(boardHasReviewExists),
  or(
    isNotNull(employeeTrainingsTable.effectivenessAssignedRole),
    isNotNull(employeeTrainingsTable.effectivenessDueDate),
    // Rascunho sem atribuição: acontece quando a avaliação é preenchida direto
    // da coluna "Pendentes" e o avaliador fecha o wizard no meio.
    boardHasDraftExists,
  )!,
)!;

/**
 * Coluna "Pendentes": sem review e sem qualquer configuração de avaliação atribuída.
 * SQL: NOT hasReview
 *      AND effectiveness_assigned_role IS NULL
 *      AND effectiveness_due_date IS NULL
 */
export const boardPendentes = and(
  not(boardHasReviewExists),
  not(boardHasDraftExists),
  isNull(employeeTrainingsTable.effectivenessAssignedRole),
  isNull(employeeTrainingsTable.effectivenessDueDate),
)!;

/**
 * Critério de eficácia "presente" para o status `pending`: evaluationMethod OU
 * targetCompetencyName não-nulo E não-vazio. Fonte ÚNICA da regra em SQL —
 * espelha exatamente o truthy do JS `getEffectivenessStatus` (`||`, onde string
 * vazia conta como ausente), eliminando a divergência SQL×JS. Ver #115.
 */
export const boardHasPendingCriteria = or(
  and(
    isNotNull(employeeTrainingsTable.evaluationMethod),
    ne(employeeTrainingsTable.evaluationMethod, ""),
  ),
  and(
    isNotNull(employeeTrainingsTable.targetCompetencyName),
    ne(employeeTrainingsTable.targetCompetencyName, ""),
  ),
)!;

/**
 * Filtro de escopo `needs_evaluation`: inclui apenas treinamentos que têm
 * alguma configuração de avaliação de eficácia ou já possuem uma review.
 * Espelha o conjunto de estados NÃO-nulos de `getEffectivenessStatus`:
 * pending (critério presente) + in_review (papel OU **prazo** atribuído) + review.
 * SQL: (critério de pending presente — ver boardHasPendingCriteria)
 *      OR effectiveness_assigned_role IS NOT NULL
 *      OR effectiveness_due_date IS NOT NULL   -- in_review por prazo (SQL×JS, #115)
 *      OR EXISTS (review)
 */
export const boardNeedsEvaluationScope = or(
  boardHasPendingCriteria,
  isNotNull(employeeTrainingsTable.effectivenessAssignedRole),
  isNotNull(employeeTrainingsTable.effectivenessDueDate),
  boardHasReviewExists,
  boardHasDraftExists,
)!;

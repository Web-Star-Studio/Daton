import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  questionnaireThemesTable,
  questionnaireQuestionsTable,
  unitQuestionnaireResponsesTable,
  unitComplianceTagsTable,
  unitsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/compliance-tag-vocabulary", requireAuth, async (_req, res): Promise<void> => {
  const questions = await db.select({ tags: questionnaireQuestionsTable.tags }).from(questionnaireQuestionsTable);

  const tagSet = new Set<string>();
  for (const q of questions) {
    if (!q.tags) continue;
    const tagMapping = q.tags as Record<string, string[]>;
    for (const tagList of Object.values(tagMapping)) {
      for (const tag of tagList) {
        tagSet.add(tag);
      }
    }
  }

  const sorted = Array.from(tagSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
  res.json(sorted);
});

router.get("/organizations/:orgId/questionnaire/themes", requireAuth, async (req, res): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const themes = await db.select().from(questionnaireThemesTable).orderBy(questionnaireThemesTable.sortOrder);
  const questions = await db.select().from(questionnaireQuestionsTable).orderBy(questionnaireQuestionsTable.sortOrder);

  const result = themes.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    sortOrder: t.sortOrder,
    questions: questions
      .filter((q) => q.themeId === t.id)
      .map((q) => ({
        id: q.id,
        code: q.code,
        questionNumber: q.questionNumber,
        text: q.text,
        type: q.type,
        options: q.options,
        conditionalOn: q.conditionalOn,
        conditionalValue: q.conditionalValue,
        sortOrder: q.sortOrder,
      })),
  }));

  res.json(result);
});

router.get("/organizations/:orgId/units/:unitId/questionnaire/responses", requireAuth, async (req, res): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const unitId = parseInt(req.params.unitId);

  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const unit = await db.select().from(unitsTable).where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));
  if (unit.length === 0) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const responses = await db.select().from(unitQuestionnaireResponsesTable).where(eq(unitQuestionnaireResponsesTable.unitId, unitId));

  const questions = await db.select().from(questionnaireQuestionsTable);

  const result: Record<string, string | string[]> = {};
  for (const r of responses) {
    const question = questions.find((q) => q.id === r.questionId);
    if (question) {
      result[question.code] = r.answer as string | string[];
    }
  }

  res.json(result);
});

router.put("/organizations/:orgId/units/:unitId/questionnaire/responses", requireAuth, async (req, res): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const unitId = parseInt(req.params.unitId);

  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const unit = await db.select().from(unitsTable).where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));
  if (unit.length === 0) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const answers: Record<string, string | string[]> = req.body.answers || {};
  const questions = await db.select().from(questionnaireQuestionsTable);
  const questionMap = new Map(questions.map((q) => [q.code, q]));

  for (const [code, rawAnswer] of Object.entries(answers)) {
    const question = questionMap.get(code);
    if (!question) continue;

    const answer: string | string[] = Array.isArray(rawAnswer)
      ? rawAnswer.map(String)
      : String(rawAnswer);

    const hasAnswer = Array.isArray(answer) ? answer.length > 0 : answer !== "" && answer !== null && answer !== undefined;

    if (hasAnswer) {
      await db
        .insert(unitQuestionnaireResponsesTable)
        .values({
          unitId,
          questionId: question.id,
          answer,
        })
        .onConflictDoUpdate({
          target: [unitQuestionnaireResponsesTable.unitId, unitQuestionnaireResponsesTable.questionId],
          set: { answer, updatedAt: new Date() },
        });
    } else {
      await db
        .delete(unitQuestionnaireResponsesTable)
        .where(
          and(
            eq(unitQuestionnaireResponsesTable.unitId, unitId),
            eq(unitQuestionnaireResponsesTable.questionId, question.id)
          )
        );
    }
  }

  res.json({ success: true });
});

router.post("/organizations/:orgId/units/:unitId/questionnaire/submit", requireAuth, async (req, res): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const unitId = parseInt(req.params.unitId);

  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const unit = await db.select().from(unitsTable).where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));
  if (unit.length === 0) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const responses = await db.select().from(unitQuestionnaireResponsesTable).where(eq(unitQuestionnaireResponsesTable.unitId, unitId));
  const questions = await db.select().from(questionnaireQuestionsTable);
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  const tagsSet = new Map<string, number>();

  for (const response of responses) {
    const question = questionMap.get(response.questionId);
    if (!question || !question.tags) continue;

    const tagMapping = question.tags as Record<string, string[]>;
    const answerValues = Array.isArray(response.answer) ? response.answer : [response.answer];

    for (const answerVal of answerValues) {
      const matchedTags = tagMapping[answerVal as string];
      if (matchedTags) {
        for (const tag of matchedTags) {
          tagsSet.set(tag, question.id);
        }
      }
    }
  }

  await db.delete(unitComplianceTagsTable).where(eq(unitComplianceTagsTable.unitId, unitId));

  for (const [tag, questionId] of tagsSet.entries()) {
    await db.insert(unitComplianceTagsTable).values({
      unitId,
      tag,
      sourceQuestionId: questionId,
    });
  }

  const tags = Array.from(tagsSet.keys());
  res.json({ tags, count: tags.length });
});

router.get("/organizations/:orgId/units/:unitId/questionnaire/tags", requireAuth, async (req, res): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const unitId = parseInt(req.params.unitId);

  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const unit = await db.select().from(unitsTable).where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));
  if (unit.length === 0) {
    res.status(404).json({ error: "Unidade não encontrada" });
    return;
  }

  const tags = await db
    .select()
    .from(unitComplianceTagsTable)
    .where(eq(unitComplianceTagsTable.unitId, unitId));

  res.json(tags.map((t) => ({ id: t.id, tag: t.tag, sourceQuestionId: t.sourceQuestionId })));
});

export default router;

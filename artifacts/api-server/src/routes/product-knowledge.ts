import { Router, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  productKnowledgeArticlesTable,
  productKnowledgeArticleRevisionsTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  archiveProductKnowledgeArticle,
  bootstrapDefaultProductKnowledgeArticles,
  createProductKnowledgeDraft,
  getProductKnowledgeArticleDetail,
  listProductKnowledgeArticles,
  markProductKnowledgeIndexFailure,
  markProductKnowledgeIndexing,
  replacePublishedProductKnowledgeIndex,
  slugifyProductKnowledgeTitle,
  syncProductKnowledgeArticleIndex,
  updateProductKnowledgeDraft,
} from "../lib/product-knowledge";

const router = Router();

const paramsSchema = z.object({
  articleId: z.coerce.number().int().positive(),
});

const articleBodySchema = z.object({
  slug: z.string().min(1).max(80).optional().nullable(),
  title: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  summary: z.string().min(1).max(400),
  bodyMarkdown: z.string().min(1),
});

async function getArticleOr404(articleId: number, res: Response) {
  const [article] = await db
    .select()
    .from(productKnowledgeArticlesTable)
    .where(eq(productKnowledgeArticlesTable.id, articleId));

  if (!article) {
    res.status(404).json({ error: "Artigo não encontrado" });
    return null;
  }

  return article;
}

router.get("/admin/product-knowledge/articles", requireAuth, requireRole("platform_admin"), async (_req, res) => {
  res.json(await listProductKnowledgeArticles());
});

router.post("/admin/product-knowledge/bootstrap", requireAuth, requireRole("platform_admin"), async (req, res) => {
  const inserted = await bootstrapDefaultProductKnowledgeArticles(req.auth!.userId);
  res.status(201).json({
    insertedCount: inserted.length,
    articles: await listProductKnowledgeArticles(),
  });
});

router.post("/admin/product-knowledge/articles", requireAuth, requireRole("platform_admin"), async (req, res) => {
  const body = articleBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const article = await createProductKnowledgeDraft(
      {
        ...body.data,
        slug: body.data.slug || slugifyProductKnowledgeTitle(body.data.title),
      },
      req.auth!.userId,
    );
    res.status(201).json(await getProductKnowledgeArticleDetail(article.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar artigo";
    res.status(400).json({ error: message });
  }
});

router.get(
  "/admin/product-knowledge/articles/:articleId",
  requireAuth,
  requireRole("platform_admin"),
  async (req, res) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const detail = await getProductKnowledgeArticleDetail(parsed.data.articleId);
    if (!detail) {
      res.status(404).json({ error: "Artigo não encontrado" });
      return;
    }

    res.json(detail);
  },
);

router.patch(
  "/admin/product-knowledge/articles/:articleId",
  requireAuth,
  requireRole("platform_admin"),
  async (req, res) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const body = articleBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const article = await getArticleOr404(parsed.data.articleId, res);
    if (!article) return;
    if (article.status === "archived") {
      res.status(400).json({ error: "Artigos arquivados não podem ser editados" });
      return;
    }

    try {
      await updateProductKnowledgeDraft(
        article.id,
        {
          ...body.data,
          slug: body.data.slug || slugifyProductKnowledgeTitle(body.data.title),
        },
        req.auth!.userId,
      );
      res.json(await getProductKnowledgeArticleDetail(article.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao atualizar artigo";
      res.status(400).json({ error: message });
    }
  },
);

router.post(
  "/admin/product-knowledge/articles/:articleId/publish",
  requireAuth,
  requireRole("platform_admin"),
  async (req, res) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const article = await getArticleOr404(parsed.data.articleId, res);
    if (!article) return;
    if (article.status === "archived") {
      res.status(400).json({ error: "Artigos arquivados não podem ser publicados" });
      return;
    }

    const [latestRevision] = await db
      .select()
      .from(productKnowledgeArticleRevisionsTable)
      .where(eq(productKnowledgeArticleRevisionsTable.articleId, article.id))
      .orderBy(desc(productKnowledgeArticleRevisionsTable.version));

    const latestPublishedChecksum = latestRevision?.checksum;
    if (article.status === "published" && latestPublishedChecksum === article.checksum) {
      res.status(409).json({ error: "Não há alterações pendentes para publicar" });
      return;
    }

    await markProductKnowledgeIndexing(article.id);
    try {
      await replacePublishedProductKnowledgeIndex({
        article,
        version: article.version + 1,
        publishedById: req.auth!.userId,
      });
      res.json(await getProductKnowledgeArticleDetail(article.id));
    } catch (error) {
      const message = await markProductKnowledgeIndexFailure(article.id, error);
      res.status(500).json({ error: message });
    }
  },
);

router.post(
  "/admin/product-knowledge/articles/:articleId/reindex",
  requireAuth,
  requireRole("platform_admin"),
  async (req, res) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const article = await getArticleOr404(parsed.data.articleId, res);
    if (!article) return;
    if (article.status !== "published") {
      res.status(400).json({ error: "Somente artigos publicados podem ser reindexados" });
      return;
    }

    const [latestRevision] = await db
      .select()
      .from(productKnowledgeArticleRevisionsTable)
      .where(eq(productKnowledgeArticleRevisionsTable.articleId, article.id))
      .orderBy(desc(productKnowledgeArticleRevisionsTable.version));

    if (latestRevision?.checksum && latestRevision.checksum !== article.checksum) {
      res.status(409).json({
        error: "O artigo possui alterações não publicadas. Publique uma nova versão em vez de reindexar.",
      });
      return;
    }

    await markProductKnowledgeIndexing(article.id);
    try {
      const indexed = await syncProductKnowledgeArticleIndex(article, article.version);
      const previousFileId = article.openaiFileId;

      await db
        .update(productKnowledgeArticlesTable)
        .set({
          openaiFileId: indexed.openaiFileId,
          lastIndexedAt: indexed.indexedAt,
          lastIndexStatus: "indexed",
          lastIndexError: null,
          updatedAt: new Date(),
        })
        .where(eq(productKnowledgeArticlesTable.id, article.id));

      if (previousFileId && previousFileId !== indexed.openaiFileId) {
        await openai.files.delete(previousFileId).catch(() => undefined);
      }

      res.json(await getProductKnowledgeArticleDetail(article.id));
    } catch (error) {
      const message = await markProductKnowledgeIndexFailure(article.id, error);
      res.status(500).json({ error: message });
    }
  },
);

router.post(
  "/admin/product-knowledge/articles/:articleId/archive",
  requireAuth,
  requireRole("platform_admin"),
  async (req, res) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const article = await getArticleOr404(parsed.data.articleId, res);
    if (!article) return;

    await archiveProductKnowledgeArticle(article);
    res.json(await getProductKnowledgeArticleDetail(article.id));
  },
);

export default router;

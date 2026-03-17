import { createHash } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  productKnowledgeArticlesTable,
  productKnowledgeArticleRevisionsTable,
  type ProductKnowledgeArticle,
  type ProductKnowledgeArticleStatus,
} from "@workspace/db";
import { openai, type OpenAI } from "@workspace/integrations-openai-ai-server";
import { toFile } from "@workspace/integrations-openai-ai-server/to-file";

export interface ProductKnowledgeSource {
  title: string;
  slug: string;
  category: string;
  version: number;
  snippet?: string;
}

export interface ProductKnowledgeArticleListItem {
  id: number;
  slug: string;
  title: string;
  category: string;
  summary: string;
  status: ProductKnowledgeArticleStatus;
  version: number;
  publishedAt: string | null;
  lastIndexedAt: string | null;
  lastIndexStatus: string;
  lastIndexError: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductKnowledgeArticleDetail extends ProductKnowledgeArticleListItem {
  bodyMarkdown: string;
  openaiFileId: string | null;
  revisions: Array<{
    id: number;
    version: number;
    title: string;
    summary: string;
    bodyMarkdown: string;
    checksum: string;
    publishedById: number;
    publishedAt: string;
  }>;
}

export interface ProductKnowledgeDraftInput {
  slug?: string | null;
  title: string;
  category: string;
  summary: string;
  bodyMarkdown: string;
}

export const DEFAULT_PRODUCT_KNOWLEDGE_ARTICLES: ProductKnowledgeDraftInput[] = [
  {
    slug: "organizacao-e-permissoes",
    title: "Organização e permissões",
    category: "Organização",
    summary:
      "Explica usuários, papéis, módulos e como o acesso à plataforma é controlado.",
    bodyMarkdown: `# Organização e permissões

## Visão geral

O módulo de Organização concentra os dados básicos da empresa e o gerenciamento de acesso dos usuários.

## Papéis

- **Admin Organização**: administra a organização, usuários e módulos
- **Operador**: pode visualizar e editar módulos atribuídos
- **Analista**: acesso somente leitura aos módulos atribuídos
- **Platform Admin**: acesso interno com permissões ampliadas para administração global

## Módulos

Os acessos por módulo controlam a navegação e as permissões funcionais da plataforma, como Governança, Documentação, Legislações e Colaboradores.

## Boas práticas

- atribua apenas os módulos necessários
- prefira manter analistas em leitura
- revise permissões sempre que houver mudança de função`,
  },
  {
    slug: "legislacoes-e-avaliacao-por-unidade",
    title: "Legislações e avaliação por unidade",
    category: "Qualidade",
    summary:
      "Mostra como funciona o cadastro de legislações, a avaliação por unidade e o vínculo com evidências.",
    bodyMarkdown: `# Legislações e avaliação por unidade

## O que o módulo cobre

O módulo de Legislações permite cadastrar normas, filtrar por tema e avaliar conformidade por unidade.

## Fluxo típico

1. cadastrar ou revisar a legislação
2. vincular a legislação às unidades relevantes
3. registrar status de conformidade
4. anexar evidências quando necessário

## Status de conformidade

- não avaliado
- conforme
- não conforme
- parcialmente conforme

## Evidências

As evidências podem ser anexadas à avaliação da unidade para comprovar atendimento ou registrar pendências.`,
  },
  {
    slug: "documentacao-e-ciclo-de-aprovacao",
    title: "Documentação e ciclo de aprovação",
    category: "Documentação",
    summary:
      "Descreve documentos, versões, anexos, aprovação, distribuição e confirmação de leitura.",
    bodyMarkdown: `# Documentação e ciclo de aprovação

## Objetivo

O módulo de Documentação organiza documentos controlados, suas versões e o fluxo de aprovação.

## Principais recursos

- cadastro de documento
- controle de tipo e status
- anexos versionados
- elaboradores e aprovadores
- distribuição para destinatários
- confirmação de recebimento e leitura

## Fluxo resumido

1. criar documento
2. anexar versão
3. submeter para aprovação
4. aprovar ou rejeitar
5. distribuir
6. acompanhar recebimento e leitura`,
  },
  {
    slug: "colaboradores-competencias-e-treinamentos",
    title: "Colaboradores, competências e treinamentos",
    category: "Colaboradores",
    summary:
      "Resume cadastro de colaboradores, perfil, competências, treinamentos e conscientização.",
    bodyMarkdown: `# Colaboradores, competências e treinamentos

## Estrutura do módulo

O módulo de Colaboradores centraliza os dados cadastrais e o histórico de desenvolvimento das pessoas.

## Informações principais

- cadastro do colaborador
- vínculo com unidade
- itens de perfil e anexos
- competências requeridas e adquiridas
- treinamentos
- registros de conscientização

## Casos de uso

- demonstrar competência
- acompanhar vencimentos de treinamentos
- manter evidências de capacitação`,
  },
  {
    slug: "governanca-e-planejamento-estrategico",
    title: "Governança e Planejamento Estratégico",
    category: "Governança",
    summary:
      "Explica o módulo de Governança com foco no planejamento estratégico auditável e no requisito ISO 9001:2015 4.1.",
    bodyMarkdown: `# Governança e Planejamento Estratégico

## Finalidade

O módulo de Governança foi criado para manter o planejamento estratégico dentro do sistema com trilha auditável.

## Componentes principais

- contexto organizacional
- análise SWOT
- partes interessadas
- objetivos estratégicos
- ações e responsáveis
- revisões formais
- evidências documentais vinculadas

## Workflow

1. criar ou importar um plano
2. editar o conteúdo em rascunho
3. submeter para revisão
4. aprovar ou rejeitar
5. gerar revisão e evidência controlada

## Ponto importante

O plano precisa ser revisado periodicamente e pode entrar em atraso quando a próxima revisão expira.`,
  },
  {
    slug: "limites-atuais-do-daton-ai",
    title: "Limites atuais do Daton AI",
    category: "IA",
    summary:
      "Define o que o Daton AI consegue fazer hoje e o que ainda não executa automaticamente.",
    bodyMarkdown: `# Limites atuais do Daton AI

## O que ele faz na v1

- responde dúvidas sobre o uso do sistema
- consulta dados da organização quando necessário
- combina orientação do produto com leitura factual do banco

## O que ele não faz nesta fase

- não cria, edita ou aprova registros por conta própria
- não executa ações operacionais no sistema
- não substitui validações humanas em processos críticos

## Como usar melhor

- faça perguntas objetivas
- peça explicação de fluxos
- peça resumos, listas e pendências com contexto claro`,
  },
];

export function getDatonAssistantModel() {
  return process.env.OPENAI_ASSISTANT_MODEL || "gpt-5-mini-2025-08-07";
}

export function getProductKnowledgeVectorStoreId() {
  const vectorStoreId = process.env.OPENAI_PRODUCT_KB_VECTOR_STORE_ID;
  if (!vectorStoreId) {
    throw new Error("OPENAI_PRODUCT_KB_VECTOR_STORE_ID must be set");
  }
  return vectorStoreId;
}

export function isProductKnowledgeSearchEnabled() {
  return Boolean(process.env.OPENAI_PRODUCT_KB_VECTOR_STORE_ID);
}

export function slugifyProductKnowledgeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeProductKnowledgeMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

export function computeProductKnowledgeChecksum(input: {
  title: string;
  category: string;
  summary: string;
  bodyMarkdown: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title.trim(),
        category: input.category.trim(),
        summary: input.summary.trim(),
        bodyMarkdown: normalizeProductKnowledgeMarkdown(input.bodyMarkdown),
      }),
    )
    .digest("hex");
}

export function buildProductKnowledgeCanonicalContent(article: {
  slug: string;
  title: string;
  category: string;
  summary: string;
  bodyMarkdown: string;
  version: number;
}) {
  const body = normalizeProductKnowledgeMarkdown(article.bodyMarkdown);
  return [
    "---",
    `title: ${article.title}`,
    `slug: ${article.slug}`,
    `category: ${article.category}`,
    `version: ${article.version}`,
    `summary: ${article.summary}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
}

async function listLatestRevisionsMap(articleIds: number[]) {
  if (articleIds.length === 0) return new Map<number, { checksum: string }>();

  const revisions = await db
    .select()
    .from(productKnowledgeArticleRevisionsTable)
    .where(inArray(productKnowledgeArticleRevisionsTable.articleId, articleIds))
    .orderBy(
      desc(productKnowledgeArticleRevisionsTable.articleId),
      desc(productKnowledgeArticleRevisionsTable.version),
    );

  const latestByArticle = new Map<number, { checksum: string }>();
  for (const revision of revisions) {
    if (!latestByArticle.has(revision.articleId)) {
      latestByArticle.set(revision.articleId, { checksum: revision.checksum });
    }
  }
  return latestByArticle;
}

function serializeArticleListItem(
  article: ProductKnowledgeArticle,
  latestPublishedChecksum?: string,
): ProductKnowledgeArticleListItem {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    category: article.category,
    summary: article.summary,
    status: article.status,
    version: article.version,
    publishedAt: article.publishedAt?.toISOString() || null,
    lastIndexedAt: article.lastIndexedAt?.toISOString() || null,
    lastIndexStatus: article.lastIndexStatus,
    lastIndexError: article.lastIndexError || null,
    hasUnpublishedChanges:
      article.status === "published" &&
      !!latestPublishedChecksum &&
      latestPublishedChecksum !== article.checksum,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

export async function listProductKnowledgeArticles() {
  const articles = await db
    .select()
    .from(productKnowledgeArticlesTable)
    .orderBy(desc(productKnowledgeArticlesTable.updatedAt));

  const latestRevisions = await listLatestRevisionsMap(articles.map((article) => article.id));
  return articles.map((article) =>
    serializeArticleListItem(article, latestRevisions.get(article.id)?.checksum),
  );
}

export async function getProductKnowledgeArticleDetail(articleId: number) {
  const [article] = await db
    .select()
    .from(productKnowledgeArticlesTable)
    .where(eq(productKnowledgeArticlesTable.id, articleId));

  if (!article) return null;

  const revisions = await db
    .select()
    .from(productKnowledgeArticleRevisionsTable)
    .where(eq(productKnowledgeArticleRevisionsTable.articleId, articleId))
    .orderBy(desc(productKnowledgeArticleRevisionsTable.version));

  const listItem = serializeArticleListItem(article, revisions[0]?.checksum);

  return {
    ...listItem,
    bodyMarkdown: article.bodyMarkdown,
    openaiFileId: article.openaiFileId || null,
    revisions: revisions.map((revision) => ({
      id: revision.id,
      version: revision.version,
      title: revision.title,
      summary: revision.summary,
      bodyMarkdown: revision.bodyMarkdown,
      checksum: revision.checksum,
      publishedById: revision.publishedById,
      publishedAt: revision.publishedAt.toISOString(),
    })),
  } satisfies ProductKnowledgeArticleDetail;
}

export async function createProductKnowledgeDraft(
  input: ProductKnowledgeDraftInput,
  userId: number,
) {
  const slug = input.slug?.trim() || slugifyProductKnowledgeTitle(input.title);
  const checksum = computeProductKnowledgeChecksum(input);

  const [article] = await db
    .insert(productKnowledgeArticlesTable)
    .values({
      slug,
      title: input.title.trim(),
      category: input.category.trim(),
      summary: input.summary.trim(),
      bodyMarkdown: normalizeProductKnowledgeMarkdown(input.bodyMarkdown),
      status: "draft",
      version: 0,
      checksum,
      createdById: userId,
      updatedById: userId,
    })
    .returning();

  return article;
}

export async function updateProductKnowledgeDraft(
  articleId: number,
  input: ProductKnowledgeDraftInput,
  userId: number,
) {
  const slug = input.slug?.trim() || slugifyProductKnowledgeTitle(input.title);
  const checksum = computeProductKnowledgeChecksum(input);

  const [article] = await db
    .update(productKnowledgeArticlesTable)
    .set({
      slug,
      title: input.title.trim(),
      category: input.category.trim(),
      summary: input.summary.trim(),
      bodyMarkdown: normalizeProductKnowledgeMarkdown(input.bodyMarkdown),
      checksum,
      updatedById: userId,
      updatedAt: new Date(),
    })
    .where(eq(productKnowledgeArticlesTable.id, articleId))
    .returning();

  return article || null;
}

export async function markProductKnowledgeIndexing(articleId: number) {
  await db
    .update(productKnowledgeArticlesTable)
    .set({
      lastIndexStatus: "indexing",
      lastIndexError: null,
      updatedAt: new Date(),
    })
    .where(eq(productKnowledgeArticlesTable.id, articleId));
}

export async function syncProductKnowledgeArticleIndex(article: ProductKnowledgeArticle, version: number) {
  const vectorStoreId = getProductKnowledgeVectorStoreId();
  const content = buildProductKnowledgeCanonicalContent({
    slug: article.slug,
    title: article.title,
    category: article.category,
    summary: article.summary,
    bodyMarkdown: article.bodyMarkdown,
    version,
  });

  const uploadedFile = await openai.files.create({
    file: await toFile(Buffer.from(content, "utf8"), `${article.slug}-v${version}.md`),
    purpose: "user_data",
  });

  try {
    const vectorFile = await openai.vectorStores.files.createAndPoll(
      vectorStoreId,
      {
        file_id: uploadedFile.id,
        attributes: {
          title: article.title,
          slug: article.slug,
          category: article.category,
          version,
        },
      },
      {
        timeout: 60_000,
        pollIntervalMs: 1_000,
      },
    );

    if (vectorFile.status !== "completed") {
      throw new Error(
        vectorFile.last_error?.message || "Falha ao processar artigo no vector store",
      );
    }

    return {
      openaiFileId: uploadedFile.id,
      indexedAt: new Date(),
    };
  } catch (error) {
    await openai.files.delete(uploadedFile.id).catch(() => undefined);
    throw error;
  }
}

export async function replacePublishedProductKnowledgeIndex(options: {
  article: ProductKnowledgeArticle;
  version: number;
  publishedById: number;
}) {
  const { article, version, publishedById } = options;
  const indexed = await syncProductKnowledgeArticleIndex(article, version);

  const [updated] = await db.transaction(async (tx) => {
    const [nextArticle] = await tx
      .update(productKnowledgeArticlesTable)
      .set({
        status: "published",
        version,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(productKnowledgeArticlesTable.id, article.id))
      .returning();

    await tx.insert(productKnowledgeArticleRevisionsTable).values({
      articleId: article.id,
      version,
      title: article.title,
      summary: article.summary,
      bodyMarkdown: article.bodyMarkdown,
      checksum: article.checksum,
      publishedById,
      publishedAt: new Date(),
    });

    return [nextArticle];
  });

  await applyProductKnowledgeIndexedFile({
    articleId: article.id,
    previousOpenaiFileId: article.openaiFileId,
    indexed,
  });

  return updated;
}

export async function applyProductKnowledgeIndexedFile(options: {
  articleId: number;
  previousOpenaiFileId: string | null;
  indexed: {
    openaiFileId: string;
    indexedAt: Date;
  };
}) {
  const { articleId, previousOpenaiFileId, indexed } = options;

  await db
    .update(productKnowledgeArticlesTable)
    .set({
      openaiFileId: indexed.openaiFileId,
      lastIndexedAt: indexed.indexedAt,
      lastIndexStatus: "indexed",
      lastIndexError: null,
      updatedAt: new Date(),
    })
    .where(eq(productKnowledgeArticlesTable.id, articleId));

  if (previousOpenaiFileId && previousOpenaiFileId !== indexed.openaiFileId) {
    await openai.files.delete(previousOpenaiFileId).catch(() => undefined);
  }
}

export async function markProductKnowledgeIndexFailure(articleId: number, error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido ao indexar";
  await db
    .update(productKnowledgeArticlesTable)
    .set({
      lastIndexStatus: "failed",
      lastIndexError: message,
      updatedAt: new Date(),
    })
    .where(eq(productKnowledgeArticlesTable.id, articleId));
  return message;
}

export async function archiveProductKnowledgeArticle(article: ProductKnowledgeArticle) {
  if (article.openaiFileId) {
    await openai.files.delete(article.openaiFileId).catch(() => undefined);
  }

  const [updated] = await db
    .update(productKnowledgeArticlesTable)
    .set({
      status: "archived",
      openaiFileId: null,
      lastIndexedAt: null,
      lastIndexStatus: "not_indexed",
      lastIndexError: null,
      updatedAt: new Date(),
    })
    .where(eq(productKnowledgeArticlesTable.id, article.id))
    .returning();

  return updated;
}

export async function bootstrapDefaultProductKnowledgeArticles(userId: number) {
  const existing = await db
    .select({
      slug: productKnowledgeArticlesTable.slug,
    })
    .from(productKnowledgeArticlesTable)
    .where(
      inArray(
        productKnowledgeArticlesTable.slug,
        DEFAULT_PRODUCT_KNOWLEDGE_ARTICLES.map((article) => article.slug || ""),
      ),
    );

  const existingSlugs = new Set(existing.map((article) => article.slug));
  const toInsert = DEFAULT_PRODUCT_KNOWLEDGE_ARTICLES.filter(
    (article) => article.slug && !existingSlugs.has(article.slug),
  );

  if (toInsert.length === 0) return [];

  const inserted = await db
    .insert(productKnowledgeArticlesTable)
    .values(
      toInsert.map((article) => ({
        slug: article.slug!,
        title: article.title,
        category: article.category,
        summary: article.summary,
        bodyMarkdown: normalizeProductKnowledgeMarkdown(article.bodyMarkdown),
        status: "draft" as const,
        version: 0,
        checksum: computeProductKnowledgeChecksum(article),
        createdById: userId,
        updatedById: userId,
      })),
    )
    .returning();

  return inserted;
}

export function buildProductKnowledgeFileSearchTool(): OpenAI.Responses.FileSearchTool {
  return {
    type: "file_search" as const,
    vector_store_ids: [getProductKnowledgeVectorStoreId()],
    max_num_results: 5,
    ranking_options: {
      score_threshold: 0.45,
    },
  };
}

export function extractProductKnowledgeSources(response: OpenAI.Responses.Response) {
  const deduped = new Map<string, ProductKnowledgeSource>();

  for (const item of response.output) {
    if (item.type !== "file_search_call" || !item.results) continue;
    for (const result of item.results) {
      const title =
        typeof result.attributes?.title === "string"
          ? result.attributes.title
          : result.filename || "Artigo";
      const slug =
        typeof result.attributes?.slug === "string"
          ? result.attributes.slug
          : result.filename || "artigo";
      const category =
        typeof result.attributes?.category === "string"
          ? result.attributes.category
          : "Produto";
      const versionValue =
        typeof result.attributes?.version === "number"
          ? result.attributes.version
          : Number(result.attributes?.version || 0);
      const source: ProductKnowledgeSource = {
        title,
        slug,
        category,
        version: Number.isFinite(versionValue) ? versionValue : 0,
        snippet: result.text?.trim().slice(0, 280) || undefined,
      };
      deduped.set(`${slug}:${source.version}`, source);
    }
  }

  return Array.from(deduped.values());
}

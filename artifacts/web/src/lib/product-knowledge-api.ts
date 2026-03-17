import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type ProductKnowledgeArticleStatus = "draft" | "published" | "archived";
export type ProductKnowledgeIndexStatus =
  | "not_indexed"
  | "indexing"
  | "indexed"
  | "failed";

export type ProductKnowledgeSource = {
  title: string;
  slug: string;
  category: string;
  version: number;
  snippet?: string;
};

export type ProductKnowledgeArticleListItem = {
  id: number;
  slug: string;
  title: string;
  category: string;
  summary: string;
  status: ProductKnowledgeArticleStatus;
  version: number;
  publishedAt: string | null;
  lastIndexedAt: string | null;
  lastIndexStatus: ProductKnowledgeIndexStatus;
  lastIndexError: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductKnowledgeArticleDetail = ProductKnowledgeArticleListItem & {
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
};

export type ProductKnowledgeArticleBody = {
  slug?: string | null;
  title: string;
  category: string;
  summary: string;
  bodyMarkdown: string;
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || "Falha ao processar requisição");
  }

  return response.json();
}

export const productKnowledgeKeys = {
  all: ["product-knowledge"] as const,
  list: () => [...productKnowledgeKeys.all, "list"] as const,
  detail: (articleId: number) => [...productKnowledgeKeys.all, "detail", articleId] as const,
};

function assertProductKnowledgeArticleId(
  articleId: number | null | undefined,
  context: string,
): number {
  if (articleId == null) {
    throw new Error(`${context}: articleId is ${String(articleId)}`);
  }

  return articleId;
}

export function useProductKnowledgeArticles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: productKnowledgeKeys.list(),
    enabled: options?.enabled ?? true,
    queryFn: () =>
      fetchJson<ProductKnowledgeArticleListItem[]>("/api/admin/product-knowledge/articles"),
  });
}

export function useProductKnowledgeArticle(
  articleId?: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: productKnowledgeKeys.detail(articleId || 0),
    enabled: (options?.enabled ?? true) && !!articleId,
    queryFn: () =>
      fetchJson<ProductKnowledgeArticleDetail>(
        `/api/admin/product-knowledge/articles/${articleId}`,
      ),
  });
}

function useInvalidateProductKnowledge() {
  const queryClient = useQueryClient();

  return async (articleId?: number | null) => {
    await queryClient.invalidateQueries({ queryKey: productKnowledgeKeys.list() });
    if (articleId) {
      await queryClient.invalidateQueries({
        queryKey: productKnowledgeKeys.detail(articleId),
      });
    }
  };
}

export function useCreateProductKnowledgeArticle(options?: { enabled?: boolean }) {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: (body: ProductKnowledgeArticleBody) => {
      if (options?.enabled === false) {
        throw new Error("useCreateProductKnowledgeArticle: mutation disabled");
      }

      return fetchJson<ProductKnowledgeArticleDetail>("/api/admin/product-knowledge/articles", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (article) => invalidate(article.id),
  });
}

export function useUpdateProductKnowledgeArticle(
  articleId?: number | null,
  options?: { enabled?: boolean },
) {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: (body: ProductKnowledgeArticleBody) => {
      if (options?.enabled === false) {
        throw new Error("useUpdateProductKnowledgeArticle: mutation disabled");
      }

      const resolvedArticleId = assertProductKnowledgeArticleId(
        articleId,
        "useUpdateProductKnowledgeArticle",
      );

      return fetchJson<ProductKnowledgeArticleDetail>(
        `/api/admin/product-knowledge/articles/${resolvedArticleId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: (article) => invalidate(article.id),
  });
}

export function useProductKnowledgeLifecycleAction(
  action: "publish" | "reindex" | "archive",
  articleId?: number | null,
  options?: { enabled?: boolean },
) {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: () => {
      if (options?.enabled === false) {
        throw new Error(`useProductKnowledgeLifecycleAction(${action}): mutation disabled`);
      }

      const resolvedArticleId = assertProductKnowledgeArticleId(
        articleId,
        `useProductKnowledgeLifecycleAction(${action})`,
      );

      return fetchJson<ProductKnowledgeArticleDetail>(
        `/api/admin/product-knowledge/articles/${resolvedArticleId}/${action}`,
        {
          method: "POST",
        },
      );
    },
    onSuccess: (article) => invalidate(article.id),
  });
}

export function useBootstrapProductKnowledgeArticles(options?: { enabled?: boolean }) {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: () => {
      if (options?.enabled === false) {
        throw new Error("useBootstrapProductKnowledgeArticles: mutation disabled");
      }

      return fetchJson<{ insertedCount: number; articles: ProductKnowledgeArticleListItem[] }>(
        "/api/admin/product-knowledge/bootstrap",
        { method: "POST" },
      );
    },
    onSuccess: () => invalidate(),
  });
}

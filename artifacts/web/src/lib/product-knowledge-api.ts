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

export function useProductKnowledgeArticles() {
  return useQuery({
    queryKey: productKnowledgeKeys.list(),
    queryFn: () =>
      fetchJson<ProductKnowledgeArticleListItem[]>("/api/admin/product-knowledge/articles"),
  });
}

export function useProductKnowledgeArticle(articleId?: number | null) {
  return useQuery({
    queryKey: productKnowledgeKeys.detail(articleId || 0),
    enabled: !!articleId,
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

export function useCreateProductKnowledgeArticle() {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: (body: ProductKnowledgeArticleBody) =>
      fetchJson<ProductKnowledgeArticleDetail>("/api/admin/product-knowledge/articles", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (article) => invalidate(article.id),
  });
}

export function useUpdateProductKnowledgeArticle(articleId?: number | null) {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: (body: ProductKnowledgeArticleBody) =>
      fetchJson<ProductKnowledgeArticleDetail>(
        `/api/admin/product-knowledge/articles/${articleId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: (article) => invalidate(article.id),
  });
}

export function useProductKnowledgeLifecycleAction(
  action: "publish" | "reindex" | "archive",
  articleId?: number | null,
) {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: () =>
      fetchJson<ProductKnowledgeArticleDetail>(
        `/api/admin/product-knowledge/articles/${articleId}/${action}`,
        {
          method: "POST",
        },
      ),
    onSuccess: (article) => invalidate(article.id),
  });
}

export function useBootstrapProductKnowledgeArticles() {
  const invalidate = useInvalidateProductKnowledge();
  return useMutation({
    mutationFn: () =>
      fetchJson<{ insertedCount: number; articles: ProductKnowledgeArticleListItem[] }>(
        "/api/admin/product-knowledge/bootstrap",
        { method: "POST" },
      ),
    onSuccess: () => invalidate(),
  });
}

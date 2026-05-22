import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CriticalReviewPeriodKind = "quarterly" | "semiannual" | "annual";
export type CriticalReviewStatus = "draft" | "completed";

export type CriticalReview = {
  id: number;
  organizationId: number;
  periodKind: CriticalReviewPeriodKind;
  year: number;
  periodNumber: number;
  reviewDate: string | null;
  status: CriticalReviewStatus;
  participants: string | null;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  createdByUserId: number | null;
  createdByUserName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CriticalReviewBody = {
  periodKind: CriticalReviewPeriodKind;
  year: number;
  periodNumber: number;
  reviewDate?: string | null;
  status?: CriticalReviewStatus;
  participants?: string | null;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
};

// ─── Fetch wrapper ───────────────────────────────────────────────────────────

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error || "Erro ao processar operação");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const base = (orgId: number) => `/api/organizations/${orgId}/kpi/critical-reviews`;

export const criticalReviewKeys = {
  list: (orgId: number) => ["critical-reviews", orgId] as const,
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useCriticalReviews(orgId?: number) {
  return useQuery({
    queryKey: criticalReviewKeys.list(orgId ?? 0),
    enabled: !!orgId,
    queryFn: () => apiJson<CriticalReview[]>(base(orgId ?? 0)),
  });
}

function useInvalidate(orgId?: number) {
  const queryClient = useQueryClient();
  return () => {
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: criticalReviewKeys.list(orgId) });
    }
  };
}

export function useCreateCriticalReview(orgId?: number) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (body: CriticalReviewBody) =>
      apiJson<CriticalReview>(base(orgId ?? 0), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateCriticalReview(orgId?: number) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CriticalReviewBody> }) =>
      apiJson<CriticalReview>(`${base(orgId ?? 0)}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteCriticalReview(orgId?: number) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (id: number) =>
      apiJson<void>(`${base(orgId ?? 0)}/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export function maxPeriodNumber(kind: CriticalReviewPeriodKind): number {
  if (kind === "annual") return 1;
  if (kind === "semiannual") return 2;
  return 4;
}

export function periodLabel(
  kind: CriticalReviewPeriodKind,
  periodNumber: number,
): string {
  if (kind === "annual") return "Anual";
  if (kind === "semiannual") return `${periodNumber}º Semestre`;
  return `${periodNumber}º Trimestre`;
}

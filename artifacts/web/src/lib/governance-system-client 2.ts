import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CorrectiveAction,
  DocumentCommunicationPlan,
  GovernanceSystemAttachment as Attachment,
  InternalAuditChecklistItem,
  InternalAuditDetail,
  InternalAuditFinding,
  InternalAuditListItem as InternalAuditSummary,
  ManagementReviewDetail,
  ManagementReviewInput,
  ManagementReviewListItem as ManagementReviewSummary,
  ManagementReviewOutput,
  NonconformityDetail,
  NonconformityListItem as NonconformitySummary,
  PaginatedInternalAudits,
  PaginatedManagementReviews,
  PaginatedNonconformities,
  PaginatedSgqProcesses,
  SgqProcessDetail,
  SgqProcessInteraction,
  SgqProcessListItem as SgqProcessSummary,
  SgqProcessRevision,
} from "@workspace/api-client-react";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type {
  Attachment,
  CorrectiveAction,
  DocumentCommunicationPlan,
  InternalAuditChecklistItem,
  InternalAuditDetail,
  InternalAuditFinding,
  InternalAuditSummary,
  ManagementReviewDetail,
  ManagementReviewInput,
  ManagementReviewOutput,
  ManagementReviewSummary,
  NonconformityDetail,
  NonconformitySummary,
  SgqProcessDetail,
  SgqProcessInteraction,
  SgqProcessRevision,
  SgqProcessSummary,
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = "Falha na requisição";
    try {
      const payload = await response.json();
      message = payload?.error || message;
    } catch {
      // noop
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildQuery(params?: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const governanceSystemKeys = {
  processes: (orgId: number, params?: Record<string, unknown>) =>
    ["governance-system", "processes", orgId, params] as const,
  process: (orgId: number, processId: number) =>
    ["governance-system", "process", orgId, processId] as const,
  audits: (orgId: number, params?: Record<string, unknown>) =>
    ["governance-system", "audits", orgId, params] as const,
  audit: (orgId: number, auditId: number) =>
    ["governance-system", "audit", orgId, auditId] as const,
  nonconformities: (orgId: number, params?: Record<string, unknown>) =>
    ["governance-system", "nonconformities", orgId, params] as const,
  nonconformity: (orgId: number, ncId: number) =>
    ["governance-system", "nonconformity", orgId, ncId] as const,
  managementReviews: (orgId: number, params?: Record<string, unknown>) =>
    ["governance-system", "management-reviews", orgId, params] as const,
  managementReview: (orgId: number, reviewId: number) =>
    ["governance-system", "management-review", orgId, reviewId] as const,
  communicationPlans: (orgId: number, docId: number) =>
    ["documents", "communication-plans", orgId, docId] as const,
};

async function invalidateAllGovernanceSystem(queryClient: ReturnType<typeof useQueryClient>, orgId?: number) {
  if (!orgId) return;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["governance-system", "processes", orgId] }),
    queryClient.invalidateQueries({ queryKey: ["governance-system", "process", orgId] }),
    queryClient.invalidateQueries({ queryKey: ["governance-system", "audits", orgId] }),
    queryClient.invalidateQueries({ queryKey: ["governance-system", "audit", orgId] }),
    queryClient.invalidateQueries({ queryKey: ["governance-system", "nonconformities", orgId] }),
    queryClient.invalidateQueries({ queryKey: ["governance-system", "nonconformity", orgId] }),
    queryClient.invalidateQueries({ queryKey: ["governance-system", "management-reviews", orgId] }),
    queryClient.invalidateQueries({ queryKey: ["governance-system", "management-review", orgId] }),
  ]);
}

export function useSgqProcesses(
  orgId?: number,
  params?: { page?: number; pageSize?: number; status?: string; ownerUserId?: number; search?: string },
) {
  return useQuery({
    queryKey: governanceSystemKeys.processes(orgId || 0, params),
    enabled: !!orgId,
    queryFn: () =>
      apiRequest<PaginatedSgqProcesses>(
        `/api/organizations/${orgId}/governance/sgq-processes${buildQuery(params)}`,
      ),
  });
}

export function useSgqProcess(orgId?: number, processId?: number) {
  return useQuery({
    queryKey: governanceSystemKeys.process(orgId || 0, processId || 0),
    enabled: !!orgId && !!processId,
    queryFn: () =>
      apiRequest<SgqProcessDetail>(
        `/api/organizations/${orgId}/governance/sgq-processes/${processId}`,
      ),
  });
}

export function useSgqProcessMutation(orgId?: number, processId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH"; body: unknown }) =>
      apiRequest<SgqProcessDetail>(
        processId
          ? `/api/organizations/${orgId}/governance/sgq-processes/${processId}`
          : `/api/organizations/${orgId}/governance/sgq-processes`,
        {
          method: payload.method,
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useSgqProcessLifecycleMutation(
  orgId?: number,
  processId?: number,
  action?: "inactivate" | "reactivate",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<SgqProcessDetail>(
        `/api/organizations/${orgId}/governance/sgq-processes/${processId}/${action}`,
        { method: "POST" },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useInternalAudits(
  orgId?: number,
  params?: { page?: number; pageSize?: number; status?: string; auditorUserId?: number; originType?: string; search?: string },
) {
  return useQuery({
    queryKey: governanceSystemKeys.audits(orgId || 0, params),
    enabled: !!orgId,
    queryFn: () =>
      apiRequest<PaginatedInternalAudits>(
        `/api/organizations/${orgId}/governance/internal-audits${buildQuery(params)}`,
      ),
  });
}

export function useInternalAudit(orgId?: number, auditId?: number) {
  return useQuery({
    queryKey: governanceSystemKeys.audit(orgId || 0, auditId || 0),
    enabled: !!orgId && !!auditId,
    queryFn: () =>
      apiRequest<InternalAuditDetail>(
        `/api/organizations/${orgId}/governance/internal-audits/${auditId}`,
      ),
  });
}

export function useInternalAuditMutation(orgId?: number, auditId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH"; body: unknown }) =>
      apiRequest<InternalAuditDetail>(
        auditId
          ? `/api/organizations/${orgId}/governance/internal-audits/${auditId}`
          : `/api/organizations/${orgId}/governance/internal-audits`,
        {
          method: payload.method,
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useAuditChecklistSyncMutation(orgId?: number, auditId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: unknown[]) =>
      apiRequest<InternalAuditDetail>(
        `/api/organizations/${orgId}/governance/internal-audits/${auditId}/checklist-items`,
        {
          method: "PUT",
          body: JSON.stringify({ items }),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useAuditFindingMutation(orgId?: number, auditId?: number, findingId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH"; body: unknown }) =>
      apiRequest(
        findingId
          ? `/api/organizations/${orgId}/governance/internal-audits/${auditId}/findings/${findingId}`
          : `/api/organizations/${orgId}/governance/internal-audits/${auditId}/findings`,
        {
          method: payload.method,
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useNonconformities(
  orgId?: number,
  params?: { page?: number; pageSize?: number; status?: string; originType?: string; responsibleUserId?: number; search?: string },
) {
  return useQuery({
    queryKey: governanceSystemKeys.nonconformities(orgId || 0, params),
    enabled: !!orgId,
    queryFn: () =>
      apiRequest<PaginatedNonconformities>(
        `/api/organizations/${orgId}/governance/nonconformities${buildQuery(params)}`,
      ),
  });
}

export function useNonconformity(orgId?: number, ncId?: number) {
  return useQuery({
    queryKey: governanceSystemKeys.nonconformity(orgId || 0, ncId || 0),
    enabled: !!orgId && !!ncId,
    queryFn: () =>
      apiRequest<NonconformityDetail>(
        `/api/organizations/${orgId}/governance/nonconformities/${ncId}`,
      ),
  });
}

export function useNonconformityMutation(orgId?: number, ncId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH"; body: unknown }) =>
      apiRequest<NonconformityDetail>(
        ncId
          ? `/api/organizations/${orgId}/governance/nonconformities/${ncId}`
          : `/api/organizations/${orgId}/governance/nonconformities`,
        {
          method: payload.method,
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useEffectivenessReviewMutation(orgId?: number, ncId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      apiRequest<NonconformityDetail>(
        `/api/organizations/${orgId}/governance/nonconformities/${ncId}/effectiveness-review`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useCorrectiveActionMutation(orgId?: number, ncId?: number, actionId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH"; body: unknown }) =>
      apiRequest<NonconformityDetail>(
        actionId
          ? `/api/organizations/${orgId}/governance/nonconformities/${ncId}/corrective-actions/${actionId}`
          : `/api/organizations/${orgId}/governance/nonconformities/${ncId}/corrective-actions`,
        {
          method: payload.method,
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useManagementReviews(
  orgId?: number,
  params?: { page?: number; pageSize?: number; status?: string; chairUserId?: number; search?: string },
) {
  return useQuery({
    queryKey: governanceSystemKeys.managementReviews(orgId || 0, params),
    enabled: !!orgId,
    queryFn: () =>
      apiRequest<PaginatedManagementReviews>(
        `/api/organizations/${orgId}/governance/management-reviews${buildQuery(params)}`,
      ),
  });
}

export function useManagementReview(orgId?: number, reviewId?: number) {
  return useQuery({
    queryKey: governanceSystemKeys.managementReview(orgId || 0, reviewId || 0),
    enabled: !!orgId && !!reviewId,
    queryFn: () =>
      apiRequest<ManagementReviewDetail>(
        `/api/organizations/${orgId}/governance/management-reviews/${reviewId}`,
      ),
  });
}

export function useManagementReviewMutation(orgId?: number, reviewId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH"; body: unknown }) =>
      apiRequest<ManagementReviewDetail>(
        reviewId
          ? `/api/organizations/${orgId}/governance/management-reviews/${reviewId}`
          : `/api/organizations/${orgId}/governance/management-reviews`,
        {
          method: payload.method,
          body: JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useManagementReviewInputMutation(orgId?: number, reviewId?: number, inputId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH" | "DELETE"; body?: unknown }) =>
      apiRequest(
        inputId
          ? `/api/organizations/${orgId}/governance/management-reviews/${reviewId}/inputs/${inputId}`
          : `/api/organizations/${orgId}/governance/management-reviews/${reviewId}/inputs`,
        {
          method: payload.method,
          body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useManagementReviewOutputMutation(
  orgId?: number,
  reviewId?: number,
  outputId?: number,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH" | "DELETE"; body?: unknown }) =>
      apiRequest(
        outputId
          ? `/api/organizations/${orgId}/governance/management-reviews/${reviewId}/outputs/${outputId}`
          : `/api/organizations/${orgId}/governance/management-reviews/${reviewId}/outputs`,
        {
          method: payload.method,
          body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await invalidateAllGovernanceSystem(queryClient, orgId);
    },
  });
}

export function useDocumentCommunicationPlans(orgId?: number, docId?: number) {
  return useQuery({
    queryKey: governanceSystemKeys.communicationPlans(orgId || 0, docId || 0),
    enabled: !!orgId && !!docId,
    queryFn: () =>
      apiRequest<DocumentCommunicationPlan[]>(
        `/api/organizations/${orgId}/documents/${docId}/communication-plans`,
      ),
  });
}

export function useDocumentCommunicationPlanMutation(orgId?: number, docId?: number, planId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { method: "POST" | "PATCH" | "DELETE"; body?: unknown; planId?: number }) =>
      apiRequest<DocumentCommunicationPlan[] | undefined>(
        (payload.planId ?? planId)
          ? `/api/organizations/${orgId}/documents/${docId}/communication-plans/${payload.planId ?? planId}`
          : `/api/organizations/${orgId}/documents/${docId}/communication-plans`,
        {
          method: payload.method,
          body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: governanceSystemKeys.communicationPlans(orgId || 0, docId || 0),
      });
      await queryClient.invalidateQueries({ queryKey: ["getDocument", orgId, docId] });
    },
  });
}

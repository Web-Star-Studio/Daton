import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type Attachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type SgqProcessSummary = {
  id: number;
  organizationId: number;
  name: string;
  objective: string;
  ownerUserId: number | null;
  ownerName?: string | null;
  status: "active" | "inactive";
  currentRevisionNumber: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SgqProcessInteraction = {
  id?: number;
  relatedProcessId: number;
  relatedProcessName?: string | null;
  direction: "upstream" | "downstream";
  notes?: string | null;
  createdAt?: string | null;
};

export type SgqProcessRevision = {
  id: number;
  revisionNumber: number;
  changeSummary?: string | null;
  approvedById: number;
  approvedByName?: string | null;
  snapshot: unknown;
  createdAt: string | null;
};

export type SgqProcessDetail = SgqProcessSummary & {
  inputs: string[];
  outputs: string[];
  criteria?: string | null;
  indicators?: string | null;
  attachments: Attachment[];
  createdById: number;
  updatedById: number;
  interactions: SgqProcessInteraction[];
  revisions: SgqProcessRevision[];
};

export type InternalAuditSummary = {
  id: number;
  organizationId: number;
  title: string;
  scope: string;
  criteria: string;
  periodStart: string;
  periodEnd: string;
  auditorUserId?: number | null;
  auditorName?: string | null;
  originType: "internal" | "external_manual";
  status: "planned" | "in_progress" | "completed" | "canceled";
  createdAt: string | null;
  updatedAt: string | null;
};

export type InternalAuditChecklistItem = {
  id: number;
  auditId: number;
  label: string;
  requirementRef?: string | null;
  result: "conformity" | "nonconformity" | "observation" | "not_evaluated";
  notes?: string | null;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InternalAuditFinding = {
  id: number;
  processId?: number | null;
  processName?: string | null;
  requirementRef?: string | null;
  classification: "conformity" | "observation" | "nonconformity";
  description: string;
  responsibleUserId?: number | null;
  responsibleUserName?: string | null;
  dueDate?: string | null;
  attachments: Attachment[];
  correctiveActionId?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InternalAuditDetail = InternalAuditSummary & {
  attachments: Attachment[];
  checklistItems: InternalAuditChecklistItem[];
  findings: InternalAuditFinding[];
};

export type CorrectiveAction = {
  id: number;
  title: string;
  description: string;
  responsibleUserId?: number | null;
  responsibleUserName?: string | null;
  dueDate?: string | null;
  status: "pending" | "in_progress" | "done" | "canceled";
  executionNotes?: string | null;
  attachments: Attachment[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type NonconformitySummary = {
  id: number;
  organizationId: number;
  originType: "audit_finding" | "incident" | "document" | "process" | "risk" | "other";
  title: string;
  description: string;
  responsibleUserId?: number | null;
  responsibleUserName?: string | null;
  status:
    | "open"
    | "under_analysis"
    | "action_in_progress"
    | "awaiting_effectiveness"
    | "closed"
    | "canceled";
  effectivenessResult?: "effective" | "ineffective" | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type NonconformityDetail = NonconformitySummary & {
  classification?: string | null;
  rootCause?: string | null;
  processId?: number | null;
  processName?: string | null;
  documentId?: number | null;
  riskOpportunityItemId?: number | null;
  auditFindingId?: number | null;
  effectivenessComment?: string | null;
  effectivenessCheckedAt?: string | null;
  closedAt?: string | null;
  attachments: Attachment[];
  correctiveActions: CorrectiveAction[];
};

export type ManagementReviewSummary = {
  id: number;
  organizationId: number;
  title: string;
  reviewDate: string;
  chairUserId?: number | null;
  chairUserName?: string | null;
  status: "draft" | "completed" | "canceled";
  createdAt: string | null;
  updatedAt: string | null;
};

export type ManagementReviewInput = {
  id: number;
  reviewId: number;
  inputType:
    | "policy"
    | "audit_summary"
    | "nc_summary"
    | "objective_status"
    | "risk_status"
    | "process_performance"
    | "customer_feedback"
    | "other";
  summary: string;
  documentId?: number | null;
  auditId?: number | null;
  nonconformityId?: number | null;
  strategicPlanId?: number | null;
  processId?: number | null;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ManagementReviewOutput = {
  id: number;
  outputType: "decision" | "action" | "resource" | "priority";
  description: string;
  responsibleUserId?: number | null;
  responsibleUserName?: string | null;
  dueDate?: string | null;
  processId?: number | null;
  nonconformityId?: number | null;
  status: "open" | "done" | "canceled";
  createdAt: string | null;
  updatedAt: string | null;
};

export type ManagementReviewDetail = ManagementReviewSummary & {
  minutes?: string | null;
  attachments: Attachment[];
  inputs: ManagementReviewInput[];
  outputs: ManagementReviewOutput[];
};

export type DocumentCommunicationPlan = {
  id: number;
  channel: string;
  audience: string;
  periodicity: string;
  requiresAcknowledgment: boolean;
  notes?: string | null;
  lastDistributedAt?: string | null;
  createdById: number;
  createdByName?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "processes", orgId] });
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "process", orgId] });
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "audits", orgId] });
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "audit", orgId] });
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "nonconformities", orgId] });
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "nonconformity", orgId] });
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "management-reviews", orgId] });
  await queryClient.invalidateQueries({ queryKey: ["governance-system", "management-review", orgId] });
}

export function useSgqProcesses(
  orgId?: number,
  params?: { page?: number; pageSize?: number; status?: string; ownerUserId?: number; search?: string },
) {
  return useQuery({
    queryKey: governanceSystemKeys.processes(orgId || 0, params),
    enabled: !!orgId,
    queryFn: () =>
      apiRequest<PaginatedResponse<SgqProcessSummary>>(
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
      apiRequest<PaginatedResponse<InternalAuditSummary>>(
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
      apiRequest<PaginatedResponse<NonconformitySummary>>(
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
      apiRequest<PaginatedResponse<ManagementReviewSummary>>(
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

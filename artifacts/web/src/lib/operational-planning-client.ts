import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type OperationalAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type OperationalPlanSummary = {
  id: number;
  organizationId: number;
  title: string;
  planCode: string | null;
  processId: number | null;
  processName: string | null;
  unitId: number | null;
  unitName: string | null;
  responsibleId: number | null;
  responsibleName: string | null;
  serviceType: string | null;
  status: "draft" | "active" | "archived";
  currentRevisionNumber: number;
  checklistItemCount: number;
  pendingChangesCount: number;
  latestCycle: {
    id: number;
    cycleCode: string;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationalPlanDetail = {
  id: number;
  organizationId: number;
  title: string;
  planCode: string | null;
  processId: number | null;
  processName: string | null;
  unitId: number | null;
  unitName: string | null;
  responsibleId: number | null;
  responsibleName: string | null;
  serviceType: string | null;
  scope: string | null;
  sequenceDescription: string | null;
  executionCriteria: string | null;
  requiredResources: string[];
  inputs: string[];
  outputs: string[];
  esgConsiderations: string | null;
  readinessBlockingEnabled: boolean;
  status: "draft" | "active" | "archived";
  currentRevisionNumber: number;
  createdById: number;
  updatedById: number;
  createdAt: string;
  updatedAt: string;
  documents: Array<{
    id: number;
    title: string;
    status: string | null;
  }>;
  riskLinks: Array<{
    id: number;
    title: string;
    type: string;
    status: string;
    planTitle: string | null;
  }>;
  checklistItems: Array<{
    id: number;
    title: string;
    instructions: string | null;
    isCritical: boolean;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
  }>;
  revisions: Array<{
    id: number;
    revisionNumber: number;
    changeSummary: string | null;
    changedById: number;
    changedByName: string | null;
    snapshot: Record<string, unknown>;
    createdAt: string;
  }>;
  cycles: Array<{
    id: number;
    cycleCode: string;
    cycleDate: string | null;
    status: "planned" | "ready" | "in_execution" | "completed" | "blocked" | "canceled";
    evidenceSummary: string | null;
    externalReference: string | null;
    attachments: OperationalAttachment[];
    readinessSummary: {
      total: number;
      pending: number;
      criticalPending: number;
    };
    readinessExecutions: Array<{
      id: number;
      checklistItemId: number;
      checklistTitle: string;
      isCritical: boolean;
      status: "pending" | "ok" | "failed" | "waived";
      executedById: number | null;
      executedByName: string | null;
      executedAt: string | null;
      evidenceNote: string | null;
      attachments: OperationalAttachment[];
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  changes: Array<{
    id: number;
    title: string;
    cycleEvidenceId: number | null;
    reason: string;
    impactLevel: "low" | "medium" | "high" | "critical";
    impactDescription: string | null;
    mitigationAction: string | null;
    decision: "pending" | "approved" | "rejected";
    requestedById: number;
    requestedByName: string | null;
    approvedById: number | null;
    approvedByName: string | null;
    approvedAt: string | null;
    risks: Array<{
      id: number;
      title: string;
      type: string;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type OperationalPlanFilters = {
  status?: "draft" | "active" | "archived";
  unitId?: number;
  processId?: number;
  search?: string;
};

export type OperationalPlanBody = {
  title: string;
  planCode?: string | null;
  processId?: number | null;
  unitId?: number | null;
  responsibleId?: number | null;
  serviceType?: string | null;
  scope?: string | null;
  sequenceDescription?: string | null;
  executionCriteria?: string | null;
  requiredResources?: string[];
  inputs?: string[];
  outputs?: string[];
  esgConsiderations?: string | null;
  readinessBlockingEnabled?: boolean;
  status?: "draft" | "active" | "archived";
  documentIds?: number[];
  riskOpportunityItemIds?: number[];
  changeSummary?: string | null;
};

export type OperationalChecklistBody = {
  title: string;
  instructions?: string | null;
  isCritical?: boolean;
  sortOrder?: number;
  changeSummary?: string | null;
};

export type OperationalCycleBody = {
  cycleCode: string;
  cycleDate?: string | null;
  status?: "planned" | "ready" | "in_execution" | "completed" | "blocked" | "canceled";
  evidenceSummary?: string | null;
  externalReference?: string | null;
  attachments?: OperationalAttachment[];
};

export type OperationalReadinessExecutionBody = {
  status: "pending" | "ok" | "failed" | "waived";
  executedById?: number | null;
  executedAt?: string | null;
  evidenceNote?: string | null;
  attachments?: OperationalAttachment[];
};

export type OperationalChangeBody = {
  title: string;
  cycleEvidenceId?: number | null;
  reason: string;
  impactLevel?: "low" | "medium" | "high" | "critical";
  impactDescription?: string | null;
  mitigationAction?: string | null;
  decision?: "pending" | "approved" | "rejected";
  riskOpportunityItemIds?: number[];
};

function buildQuery(params?: OperationalPlanFilters) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.unitId) searchParams.set("unitId", String(params.unitId));
  if (params?.processId) searchParams.set("processId", String(params.processId));
  if (params?.search) searchParams.set("search", params.search);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

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

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const operationalPlanningKeys = {
  list: (orgId: number, filters?: OperationalPlanFilters) =>
    ["operational-plans", orgId, filters] as const,
  detail: (orgId: number, planId: number) =>
    ["operational-plan", orgId, planId] as const,
};

export async function listOperationalPlans(orgId: number, filters?: OperationalPlanFilters) {
  return apiJson<OperationalPlanSummary[]>(
    `/api/organizations/${orgId}/governance/operational-plans${buildQuery(filters)}`,
  );
}

export async function getOperationalPlan(orgId: number, planId: number) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}`,
  );
}

export async function createOperationalPlan(orgId: number, body: OperationalPlanBody) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function updateOperationalPlan(
  orgId: number,
  planId: number,
  body: Partial<OperationalPlanBody>,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function createOperationalChecklistItem(
  orgId: number,
  planId: number,
  body: OperationalChecklistBody,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/checklist-items`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function updateOperationalChecklistItem(
  orgId: number,
  planId: number,
  checklistItemId: number,
  body: Partial<OperationalChecklistBody>,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/checklist-items/${checklistItemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function deleteOperationalChecklistItem(
  orgId: number,
  planId: number,
  checklistItemId: number,
) {
  return apiJson<void>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/checklist-items/${checklistItemId}`,
    {
      method: "DELETE",
    },
  );
}

export async function createOperationalCycle(
  orgId: number,
  planId: number,
  body: OperationalCycleBody,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/cycles`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function updateOperationalCycle(
  orgId: number,
  planId: number,
  cycleId: number,
  body: Partial<OperationalCycleBody>,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/cycles/${cycleId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function updateOperationalReadinessExecution(
  orgId: number,
  planId: number,
  cycleId: number,
  checklistItemId: number,
  body: OperationalReadinessExecutionBody,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/cycles/${cycleId}/readiness-items/${checklistItemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function createOperationalChange(
  orgId: number,
  planId: number,
  body: OperationalChangeBody,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/changes`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function updateOperationalChange(
  orgId: number,
  planId: number,
  changeId: number,
  body: Partial<OperationalChangeBody>,
) {
  return apiJson<OperationalPlanDetail>(
    `/api/organizations/${orgId}/governance/operational-plans/${planId}/changes/${changeId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function useOperationalPlans(orgId?: number, filters?: OperationalPlanFilters) {
  return useQuery({
    queryKey: operationalPlanningKeys.list(orgId ?? 0, filters),
    enabled: !!orgId,
    queryFn: () => listOperationalPlans(orgId ?? 0, filters),
  });
}

export function useOperationalPlan(orgId?: number, planId?: number) {
  return useQuery({
    queryKey: operationalPlanningKeys.detail(orgId ?? 0, planId ?? 0),
    enabled: !!orgId && !!planId,
    queryFn: () => getOperationalPlan(orgId ?? 0, planId ?? 0),
  });
}

function useInvalidateOperationalPlanning(orgId?: number, planId?: number) {
  const queryClient = useQueryClient();

  return async () => {
    if (orgId) {
      await queryClient.invalidateQueries({
        queryKey: ["operational-plans", orgId],
      });
    }
    if (orgId && planId) {
      await queryClient.invalidateQueries({
        queryKey: operationalPlanningKeys.detail(orgId, planId),
      });
    }
  };
}

export function useCreateOperationalPlanMutation(orgId?: number) {
  const invalidate = useInvalidateOperationalPlanning(orgId);
  return useMutation({
    mutationFn: (body: OperationalPlanBody) =>
      createOperationalPlan(orgId ?? 0, body),
    onSuccess: invalidate,
  });
}

export function useUpdateOperationalPlanMutation(orgId?: number, planId?: number) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: Partial<OperationalPlanBody>) =>
      updateOperationalPlan(orgId ?? 0, planId ?? 0, body),
    onSuccess: invalidate,
  });
}

export function useCreateOperationalChecklistItemMutation(
  orgId?: number,
  planId?: number,
) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: OperationalChecklistBody) =>
      createOperationalChecklistItem(orgId ?? 0, planId ?? 0, body),
    onSuccess: invalidate,
  });
}

export function useUpdateOperationalChecklistItemMutation(
  orgId?: number,
  planId?: number,
  checklistItemId?: number,
) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: Partial<OperationalChecklistBody>) =>
      updateOperationalChecklistItem(
        orgId ?? 0,
        planId ?? 0,
        checklistItemId ?? 0,
        body,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteOperationalChecklistItemMutation(
  orgId?: number,
  planId?: number,
) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (checklistItemId: number) =>
      deleteOperationalChecklistItem(orgId ?? 0, planId ?? 0, checklistItemId),
    onSuccess: invalidate,
  });
}

export function useCreateOperationalCycleMutation(orgId?: number, planId?: number) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: OperationalCycleBody) =>
      createOperationalCycle(orgId ?? 0, planId ?? 0, body),
    onSuccess: invalidate,
  });
}

export function useUpdateOperationalCycleMutation(
  orgId?: number,
  planId?: number,
  cycleId?: number,
) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: Partial<OperationalCycleBody>) =>
      updateOperationalCycle(orgId ?? 0, planId ?? 0, cycleId ?? 0, body),
    onSuccess: invalidate,
  });
}

export function useUpdateOperationalReadinessExecutionMutation(
  orgId?: number,
  planId?: number,
  cycleId?: number,
  checklistItemId?: number,
) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: OperationalReadinessExecutionBody) =>
      updateOperationalReadinessExecution(
        orgId ?? 0,
        planId ?? 0,
        cycleId ?? 0,
        checklistItemId ?? 0,
        body,
      ),
    onSuccess: invalidate,
  });
}

export function useCreateOperationalChangeMutation(orgId?: number, planId?: number) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: OperationalChangeBody) =>
      createOperationalChange(orgId ?? 0, planId ?? 0, body),
    onSuccess: invalidate,
  });
}

export function useUpdateOperationalChangeMutation(
  orgId?: number,
  planId?: number,
  changeId?: number,
) {
  const invalidate = useInvalidateOperationalPlanning(orgId, planId);
  return useMutation({
    mutationFn: (body: Partial<OperationalChangeBody>) =>
      updateOperationalChange(orgId ?? 0, planId ?? 0, changeId ?? 0, body),
    onSuccess: invalidate,
  });
}

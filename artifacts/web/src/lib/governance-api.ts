import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export interface GovernancePlanSummaryMetrics {
  swotCount: number;
  actionCount: number;
  interestedPartyCount: number;
  objectiveCount: number;
  openActionCount: number;
  overdueActionCount: number;
  actionsByStatus: Record<string, number>;
}

export interface GovernanceSwotItem {
  id: number;
  domain: "sgq" | "sga" | "sgsv" | "esg" | "governance";
  matrixLabel?: string | null;
  swotType: "strength" | "weakness" | "opportunity" | "threat";
  environment: "internal" | "external";
  perspective?: string | null;
  description: string;
  performance?: number | null;
  relevance?: number | null;
  result?: number | null;
  treatmentDecision?: string | null;
  linkedObjectiveCode?: string | null;
  linkedObjectiveLabel?: string | null;
  importedActionReference?: string | null;
  notes?: string | null;
  sortOrder: number;
}

export interface GovernanceInterestedParty {
  id: number;
  name: string;
  expectedRequirements?: string | null;
  roleInCompany?: string | null;
  roleSummary?: string | null;
  relevantToManagementSystem?: boolean | null;
  legalRequirementApplicable?: boolean | null;
  monitoringMethod?: string | null;
  notes?: string | null;
  sortOrder: number;
}

export interface GovernanceObjective {
  id: number;
  code: string;
  systemDomain?: string | null;
  description: string;
  notes?: string | null;
  sortOrder: number;
}

export interface GovernanceAction {
  id: number;
  title: string;
  description?: string | null;
  swotItemId?: number | null;
  objectiveId?: number | null;
  responsibleUserId?: number | null;
  responsibleUserName?: string | null;
  dueDate?: string | null;
  status: "pending" | "in_progress" | "done" | "canceled";
  notes?: string | null;
  sortOrder: number;
  units: Array<{ id: number; name: string }>;
}

export interface GovernanceRevision {
  id: number;
  revisionNumber: number;
  revisionDate: string | null;
  reason?: string | null;
  changeSummary?: string | null;
  approvedByName?: string | null;
  evidenceDocumentId?: number | null;
}

export interface GovernancePlanDetail {
  id: number;
  organizationId: number;
  title: string;
  status: "draft" | "in_review" | "approved" | "rejected" | "overdue" | "archived";
  standards: string[];
  executiveSummary?: string | null;
  reviewFrequencyMonths: number;
  nextReviewAt?: string | null;
  reviewReason?: string | null;
  climateChangeRelevant?: boolean | null;
  climateChangeJustification?: string | null;
  technicalScope?: string | null;
  geographicScope?: string | null;
  policy?: string | null;
  mission?: string | null;
  vision?: string | null;
  values?: string | null;
  strategicConclusion?: string | null;
  methodologyNotes?: string | null;
  legacyMethodology?: string | null;
  legacyIndicatorsNotes?: string | null;
  legacyRevisionHistory?: Array<{
    date?: string | null;
    reason?: string | null;
    changedItem?: string | null;
    revision?: string | null;
    changedBy?: string | null;
  }> | null;
  importedWorkbookName?: string | null;
  activeRevisionNumber: number;
  createdAt: string | null;
  updatedAt: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  archivedAt?: string | null;
  swotItems: GovernanceSwotItem[];
  interestedParties: GovernanceInterestedParty[];
  objectives: GovernanceObjective[];
  actions: GovernanceAction[];
  revisions: GovernanceRevision[];
  metrics: GovernancePlanSummaryMetrics;
  complianceIssues: string[];
}

export interface GovernancePlanBody {
  title: string;
  standards?: string[];
  executiveSummary?: string | null;
  reviewFrequencyMonths?: number;
  nextReviewAt?: string | null;
  reviewReason?: string | null;
  climateChangeRelevant?: boolean | null;
  climateChangeJustification?: string | null;
  technicalScope?: string | null;
  geographicScope?: string | null;
  policy?: string | null;
  mission?: string | null;
  vision?: string | null;
  values?: string | null;
  strategicConclusion?: string | null;
  methodologyNotes?: string | null;
  legacyMethodology?: string | null;
  legacyIndicatorsNotes?: string | null;
  legacyRevisionHistory?: GovernancePlanDetail["legacyRevisionHistory"];
  importedWorkbookName?: string | null;
}

export interface GovernanceImportPayload {
  workbookName?: string | null;
  plan: GovernancePlanBody;
  swotItems: Array<
    Omit<GovernanceSwotItem, "id"> & {
      importKey?: string | null;
    }
  >;
  interestedParties: Array<Omit<GovernanceInterestedParty, "id">>;
  objectives: Array<
    Omit<GovernanceObjective, "id"> & {
      importKey?: string | null;
    }
  >;
  actions: Array<{
    title: string;
    description?: string | null;
    swotImportKey?: string | null;
    objectiveCode?: string | null;
    responsibleUserId?: number | null;
    dueDate?: string | null;
    status?: GovernanceAction["status"];
    notes?: string | null;
    unitIds?: number[];
    sortOrder?: number;
  }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const governanceKeys = {
  all: ["governance"] as const,
  list: (orgId: number) => ["governance", "plans", orgId] as const,
  detail: (orgId: number, planId: number) => ["governance", "plans", orgId, planId] as const,
};

export function useGovernancePlans(orgId?: number) {
  return useQuery({
    queryKey: governanceKeys.list(orgId || 0),
    enabled: !!orgId,
    queryFn: () =>
      request<GovernancePlanDetail[]>(`/api/organizations/${orgId}/governance/strategic-plans`),
  });
}

export function useGovernancePlan(orgId?: number, planId?: number) {
  return useQuery({
    queryKey: governanceKeys.detail(orgId || 0, planId || 0),
    enabled: !!orgId && !!planId,
    queryFn: () =>
      request<GovernancePlanDetail>(
        `/api/organizations/${orgId}/governance/strategic-plans/${planId}`,
      ),
  });
}

function useInvalidateGovernance(orgId?: number, planId?: number) {
  const queryClient = useQueryClient();
  return async () => {
    if (orgId) {
      await queryClient.invalidateQueries({ queryKey: governanceKeys.list(orgId) });
    }
    if (orgId && planId) {
      await queryClient.invalidateQueries({ queryKey: governanceKeys.detail(orgId, planId) });
    }
  };
}

export function useCreateGovernancePlan(orgId?: number) {
  const invalidate = useInvalidateGovernance(orgId);
  return useMutation({
    mutationFn: (body: GovernancePlanBody) =>
      request<GovernancePlanDetail>(`/api/organizations/${orgId}/governance/strategic-plans`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateGovernancePlan(orgId?: number, planId?: number) {
  const invalidate = useInvalidateGovernance(orgId, planId);
  return useMutation({
    mutationFn: (body: Partial<GovernancePlanBody>) =>
      request<GovernancePlanDetail>(
        `/api/organizations/${orgId}/governance/strategic-plans/${planId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: invalidate,
  });
}

export function useImportGovernancePlan(orgId?: number, planId?: number) {
  const invalidate = useInvalidateGovernance(orgId, planId);
  return useMutation({
    mutationFn: (body: GovernanceImportPayload) => importGovernancePlan(orgId!, planId!, body),
    onSuccess: invalidate,
  });
}

export function useGovernanceWorkflowAction(
  orgId: number | undefined,
  planId: number | undefined,
  action: "submit" | "approve" | "reject" | "reopen",
) {
  const invalidate = useInvalidateGovernance(orgId, planId);
  return useMutation({
    mutationFn: (payload?: { reviewReason?: string | null; changeSummary?: string | null }) =>
      request<GovernancePlanDetail>(
        `/api/organizations/${orgId}/governance/strategic-plans/${planId}/${action}`,
        {
          method: "POST",
          body: JSON.stringify(payload || {}),
        },
      ),
    onSuccess: invalidate,
  });
}

export function useGovernanceCrudMutation<TBody>(
  orgId: number | undefined,
  planId: number | undefined,
  resource: "swot-items" | "interested-parties" | "objectives" | "actions",
) {
  const invalidate = useInvalidateGovernance(orgId, planId);

  const createMutation = useMutation({
    mutationFn: (body: TBody) =>
      request(
        `/api/organizations/${orgId}/governance/strategic-plans/${planId}/${resource}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<TBody> }) =>
      request(
        `/api/organizations/${orgId}/governance/strategic-plans/${planId}/${resource}/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      request(
        `/api/organizations/${orgId}/governance/strategic-plans/${planId}/${resource}/${id}`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: invalidate,
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}

export async function fetchGovernanceExport(orgId: number, planId: number) {
  return request<{
    revisionId: number;
    revisionNumber: number;
    evidenceDocumentId: number;
    fileName: string;
    contentType: string;
    objectPath: string;
    uploadedAt: string;
  }>(`/api/organizations/${orgId}/governance/strategic-plans/${planId}/export`);
}

export async function importGovernancePlan(
  orgId: number,
  planId: number,
  body: GovernanceImportPayload,
) {
  return request<GovernancePlanDetail>(
    `/api/organizations/${orgId}/governance/strategic-plans/${planId}/import`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

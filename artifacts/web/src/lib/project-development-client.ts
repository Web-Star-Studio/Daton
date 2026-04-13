import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type DevelopmentAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type ApplicabilityApprovalStatus = "pending" | "approved" | "superseded";
export type DevelopmentProjectStatus =
  | "draft"
  | "active"
  | "under_review"
  | "completed"
  | "canceled";
export type DevelopmentProjectStageStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "blocked"
  | "canceled";
export type DevelopmentProjectOutputStatus = "draft" | "approved" | "released";
export type DevelopmentProjectReviewType =
  | "review"
  | "verification"
  | "validation";
export type DevelopmentProjectReviewOutcome =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_changes";
export type DevelopmentProjectChangeStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "implemented";

export type ApplicabilityDecision = {
  id: number;
  organizationId: number;
  requirementCode: string;
  isApplicable: boolean;
  scopeSummary: string | null;
  justification: string;
  responsibleEmployeeId: number | null;
  responsibleEmployeeName: string | null;
  approvalStatus: ApplicabilityApprovalStatus;
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isCurrentActive: boolean;
  createdById: number;
  createdByName: string | null;
  updatedById: number;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicabilityState = {
  workflowEnabled: boolean;
  currentDecision: ApplicabilityDecision | null;
  history: ApplicabilityDecision[];
};

export type ApplicabilityDecisionBody = {
  isApplicable: boolean;
  scopeSummary?: string | null;
  justification: string;
  responsibleEmployeeId: number;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type DevelopmentProjectSummary = {
  id: number;
  organizationId: number;
  applicabilityDecisionId: number | null;
  projectCode: string | null;
  title: string;
  scope: string;
  objective: string | null;
  status: DevelopmentProjectStatus;
  responsibleEmployeeId: number | null;
  responsibleEmployeeName: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  attachments: DevelopmentAttachment[];
  createdById: number;
  updatedById: number;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentProjectInput = {
  id: number;
  organizationId: number;
  projectId: number;
  title: string;
  description: string | null;
  source: string | null;
  attachments: DevelopmentAttachment[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentProjectStage = {
  id: number;
  organizationId: number;
  projectId: number;
  title: string;
  description: string | null;
  responsibleEmployeeId: number | null;
  responsibleEmployeeName: string | null;
  status: DevelopmentProjectStageStatus;
  dueDate: string | null;
  completedAt: string | null;
  evidenceNote: string | null;
  attachments: DevelopmentAttachment[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentProjectOutput = {
  id: number;
  organizationId: number;
  projectId: number;
  title: string;
  description: string | null;
  outputType: string;
  status: DevelopmentProjectOutputStatus;
  attachments: DevelopmentAttachment[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentProjectReview = {
  id: number;
  organizationId: number;
  projectId: number;
  reviewType: DevelopmentProjectReviewType;
  title: string;
  notes: string | null;
  outcome: DevelopmentProjectReviewOutcome;
  responsibleEmployeeId: number | null;
  responsibleEmployeeName: string | null;
  occurredAt: string | null;
  attachments: DevelopmentAttachment[];
  createdById: number;
  createdByName: string | null;
  createdAt: string;
};

export type DevelopmentProjectChange = {
  id: number;
  organizationId: number;
  projectId: number;
  title: string;
  changeDescription: string;
  reason: string;
  impactDescription: string | null;
  status: DevelopmentProjectChangeStatus;
  decidedById: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  attachments: DevelopmentAttachment[];
  createdById: number;
  updatedById: number;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentProjectDetail = DevelopmentProjectSummary & {
  createdByName: string | null;
  updatedByName: string | null;
  inputs: DevelopmentProjectInput[];
  stages: DevelopmentProjectStage[];
  outputs: DevelopmentProjectOutput[];
  reviews: DevelopmentProjectReview[];
  changes: DevelopmentProjectChange[];
};

export type DevelopmentProjectBody = {
  projectCode?: string | null;
  title: string;
  scope: string;
  objective?: string | null;
  status?: DevelopmentProjectStatus;
  responsibleEmployeeId?: number | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualEndDate?: string | null;
  attachments?: DevelopmentAttachment[];
};

export type DevelopmentProjectInputBody = {
  title: string;
  description?: string | null;
  source?: string | null;
  attachments?: DevelopmentAttachment[];
  sortOrder?: number;
};

export type DevelopmentProjectStageBody = {
  title: string;
  description?: string | null;
  responsibleEmployeeId?: number | null;
  status?: DevelopmentProjectStageStatus;
  dueDate?: string | null;
  completedAt?: string | null;
  evidenceNote?: string | null;
  attachments?: DevelopmentAttachment[];
  sortOrder?: number;
};

export type DevelopmentProjectOutputBody = {
  title: string;
  description?: string | null;
  outputType?: string;
  status?: DevelopmentProjectOutputStatus;
  attachments?: DevelopmentAttachment[];
  sortOrder?: number;
};

export type DevelopmentProjectReviewBody = {
  reviewType: DevelopmentProjectReviewType;
  title: string;
  notes?: string | null;
  outcome?: DevelopmentProjectReviewOutcome;
  responsibleEmployeeId?: number | null;
  occurredAt?: string | null;
  attachments?: DevelopmentAttachment[];
};

export type DevelopmentProjectChangeBody = {
  title: string;
  changeDescription: string;
  reason: string;
  impactDescription?: string | null;
  status?: DevelopmentProjectChangeStatus;
  attachments?: DevelopmentAttachment[];
};

type ResourceName = "inputs" | "stages" | "outputs" | "reviews" | "changes";
type ResourceBodyMap = {
  inputs: DevelopmentProjectInputBody;
  stages: DevelopmentProjectStageBody;
  outputs: DevelopmentProjectOutputBody;
  reviews: DevelopmentProjectReviewBody;
  changes: DevelopmentProjectChangeBody;
};

type ResourceResponseMap = {
  inputs: DevelopmentProjectInput;
  stages: DevelopmentProjectStage;
  outputs: DevelopmentProjectOutput;
  reviews: DevelopmentProjectReview;
  changes: DevelopmentProjectChange;
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
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
      const body = await response.json();
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // ignore parsing error
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const projectDevelopmentKeys = {
  applicability: (orgId: number) =>
    ["project-development", orgId, "applicability"] as const,
  projects: (orgId: number) =>
    ["project-development", orgId, "projects"] as const,
  projectDetail: (orgId: number, projectId: number) =>
    ["project-development", orgId, "projects", projectId] as const,
};

export function getProjectDevelopmentApplicability(orgId: number) {
  return apiJson<ApplicabilityState>(
    `/api/organizations/${orgId}/governance/project-development/applicability`,
  );
}

export function createApplicabilityDecision(
  orgId: number,
  body: ApplicabilityDecisionBody,
) {
  return apiJson<ApplicabilityDecision>(
    `/api/organizations/${orgId}/governance/project-development/applicability`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function updateApplicabilityDecision(
  orgId: number,
  decisionId: number,
  body: Partial<ApplicabilityDecisionBody>,
) {
  return apiJson<ApplicabilityDecision>(
    `/api/organizations/${orgId}/governance/project-development/applicability/${decisionId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function approveApplicabilityDecision(
  orgId: number,
  decisionId: number,
) {
  return apiJson<ApplicabilityDecision>(
    `/api/organizations/${orgId}/governance/project-development/applicability/${decisionId}/approve`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function listDevelopmentProjects(orgId: number) {
  return apiJson<DevelopmentProjectSummary[]>(
    `/api/organizations/${orgId}/governance/project-development/projects`,
  );
}

export function getDevelopmentProject(orgId: number, projectId: number) {
  return apiJson<DevelopmentProjectDetail>(
    `/api/organizations/${orgId}/governance/project-development/projects/${projectId}`,
  );
}

export function createDevelopmentProject(
  orgId: number,
  body: DevelopmentProjectBody,
) {
  return apiJson<DevelopmentProjectSummary>(
    `/api/organizations/${orgId}/governance/project-development/projects`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function updateDevelopmentProject(
  orgId: number,
  projectId: number,
  body: Partial<DevelopmentProjectBody>,
) {
  return apiJson<DevelopmentProjectSummary>(
    `/api/organizations/${orgId}/governance/project-development/projects/${projectId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

function getResourcePath(
  orgId: number,
  projectId: number,
  resource: ResourceName,
  resourceId?: number,
) {
  return `/api/organizations/${orgId}/governance/project-development/projects/${projectId}/${resource}${resourceId ? `/${resourceId}` : ""}`;
}

export function createProjectResource<T extends ResourceName>(
  orgId: number,
  projectId: number,
  resource: T,
  body: ResourceBodyMap[T],
) {
  return apiJson<ResourceResponseMap[T]>(
    getResourcePath(orgId, projectId, resource),
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function updateProjectResource<T extends ResourceName>(
  orgId: number,
  projectId: number,
  resource: T,
  resourceId: number,
  body: Partial<ResourceBodyMap[T]>,
) {
  return apiJson<ResourceResponseMap[T]>(
    getResourcePath(orgId, projectId, resource, resourceId),
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function deleteProjectResource(
  orgId: number,
  projectId: number,
  resource: ResourceName,
  resourceId: number,
) {
  return apiJson<void>(
    getResourcePath(orgId, projectId, resource, resourceId),
    {
      method: "DELETE",
    },
  );
}

async function invalidateProjectDevelopment(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: number,
  projectId?: number,
) {
  await queryClient.invalidateQueries({
    queryKey: projectDevelopmentKeys.applicability(orgId),
  });
  await queryClient.invalidateQueries({
    queryKey: projectDevelopmentKeys.projects(orgId),
  });
  if (projectId) {
    await queryClient.invalidateQueries({
      queryKey: projectDevelopmentKeys.projectDetail(orgId, projectId),
    });
  }
}

export function useProjectDevelopmentApplicability(orgId?: number) {
  return useQuery({
    enabled: !!orgId,
    queryKey: projectDevelopmentKeys.applicability(orgId ?? 0),
    queryFn: () => getProjectDevelopmentApplicability(orgId ?? 0),
  });
}

export function useApplicabilityDecisionMutation(orgId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      mode: "create" | "update" | "approve";
      decisionId?: number;
      body?: ApplicabilityDecisionBody | Partial<ApplicabilityDecisionBody>;
    }) => {
      if (!orgId) {
        throw new Error("Organização é obrigatória");
      }
      switch (payload.mode) {
        case "create":
          return createApplicabilityDecision(
            orgId,
            payload.body as ApplicabilityDecisionBody,
          );
        case "update":
          return updateApplicabilityDecision(
            orgId,
            payload.decisionId ?? 0,
            payload.body as Partial<ApplicabilityDecisionBody>,
          );
        case "approve":
          return approveApplicabilityDecision(orgId, payload.decisionId ?? 0);
      }
    },
    onSuccess: async () => {
      if (!orgId) return;
      await invalidateProjectDevelopment(queryClient, orgId);
    },
  });
}

export function useDevelopmentProjects(orgId?: number) {
  return useQuery({
    enabled: !!orgId,
    queryKey: projectDevelopmentKeys.projects(orgId ?? 0),
    queryFn: () => listDevelopmentProjects(orgId ?? 0),
  });
}

export function useDevelopmentProject(orgId?: number, projectId?: number) {
  return useQuery({
    enabled: !!orgId && !!projectId,
    queryKey: projectDevelopmentKeys.projectDetail(orgId ?? 0, projectId ?? 0),
    queryFn: () => getDevelopmentProject(orgId ?? 0, projectId ?? 0),
  });
}

export function useDevelopmentProjectMutation(
  orgId?: number,
  projectId?: number,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      mode: "create" | "update";
      body: DevelopmentProjectBody | Partial<DevelopmentProjectBody>;
    }) => {
      if (!orgId) {
        throw new Error("Organização é obrigatória");
      }
      if (payload.mode === "create") {
        return createDevelopmentProject(
          orgId,
          payload.body as DevelopmentProjectBody,
        );
      }
      if (!projectId) {
        throw new Error("Projeto é obrigatório");
      }
      return updateDevelopmentProject(
        orgId,
        projectId,
        payload.body as Partial<DevelopmentProjectBody>,
      );
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      const nextProjectId = "id" in data ? data.id : projectId;
      await invalidateProjectDevelopment(queryClient, orgId, nextProjectId);
    },
  });
}

export function useProjectResourceMutation<T extends ResourceName>(
  orgId: number | undefined,
  projectId: number | undefined,
  resource: T,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      mode: "create" | "update" | "delete";
      resourceId?: number;
      body?: ResourceBodyMap[T] | Partial<ResourceBodyMap[T]>;
    }) => {
      if (!orgId || !projectId) {
        throw new Error("Projeto é obrigatório");
      }
      if (payload.mode === "create") {
        return createProjectResource(
          orgId,
          projectId,
          resource,
          payload.body as ResourceBodyMap[T],
        );
      }
      if (payload.mode === "update") {
        return updateProjectResource(
          orgId,
          projectId,
          resource,
          payload.resourceId ?? 0,
          payload.body as Partial<ResourceBodyMap[T]>,
        );
      }
      await deleteProjectResource(
        orgId,
        projectId,
        resource,
        payload.resourceId ?? 0,
      );
      return null;
    },
    onSuccess: async () => {
      if (!orgId || !projectId) return;
      await invalidateProjectDevelopment(queryClient, orgId, projectId);
    },
  });
}

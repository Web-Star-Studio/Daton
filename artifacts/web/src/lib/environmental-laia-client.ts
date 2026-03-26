import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export interface LaiaBranchConfig {
  id: number;
  unitId: number;
  unitName: string | null;
  surveyStatus: "nao_levantado" | "em_levantamento" | "levantado";
  updatedAt: string | null;
}

export interface LaiaSector {
  id: number;
  unitId: number | null;
  departmentId: number | null;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LaiaMethodologyVersion {
  id: number;
  versionNumber: number;
  title: string;
  scoreThresholds: {
    negligibleMax: number;
    moderateMax: number;
  };
  moderateSignificanceRule: string;
  publishedAt: string | null;
  notes: string | null;
}

export interface LaiaMethodology {
  id: number;
  name: string;
  status: string;
  activeVersionId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  versions: LaiaMethodologyVersion[];
}

export interface LaiaAssessmentListItem {
  id: number;
  unitId: number | null;
  sectorId: number | null;
  aspectCode: string;
  activityOperation: string;
  environmentalAspect: string;
  environmentalImpact: string;
  status: "draft" | "active" | "archived";
  category: "desprezivel" | "moderado" | "critico" | null;
  significance: "significant" | "not_significant" | null;
  totalScore: number | null;
  operationalSituation: string | null;
  sectorName: string | null;
  unitName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LaiaRevisionChange {
  id: number;
  revisionId: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface LaiaRevision {
  id: number;
  assessmentId: number | null;
  title: string | null;
  description: string | null;
  revisionNumber: number;
  status: string;
  createdAt: string | null;
  finalizedAt: string | null;
  changes: LaiaRevisionChange[];
}

export interface LaiaDashboardSummary {
  totalAssessments: number;
  significantAssessments: number;
  criticalAssessments: number;
  withoutControlResponsible: number;
  withLegalRequirement: number;
  withMonitoringPending: number;
  byOperationalSituation: Record<string, number>;
  byLifecycleStage: Record<string, number>;
}

export interface LaiaAssessmentRequirementInput {
  type: "legal" | "other" | "stakeholder" | "strategic";
  title: string;
  legislationId?: number | null;
  requirementReference?: string | null;
  description?: string | null;
}

export interface LaiaCommunicationPlanInput {
  channel: string;
  audience: string;
  periodicity: string;
  requiresAcknowledgment?: boolean;
  notes?: string | null;
}

export interface LaiaAssessmentInput {
  unitId?: number | null;
  sectorId?: number | null;
  methodologyVersionId?: number | null;
  aspectCode?: string | null;
  mode: "quick" | "complete";
  status: "draft" | "active" | "archived";
  activityOperation: string;
  environmentalAspect: string;
  environmentalImpact: string;
  operationalSituation?: string | null;
  totalScore?: number | null;
  category?: "desprezivel" | "moderado" | "critico" | null;
  significance?: "significant" | "not_significant" | null;
  significanceReason?: string | null;
  existingControls?: string | null;
  controlRequired?: string | null;
  communicationRequired?: boolean;
  communicationNotes?: string | null;
  reviewFrequencyDays?: number | null;
  nextReviewAt?: string | null;
  normalCondition?: boolean;
  abnormalCondition?: boolean;
  startupShutdown?: boolean;
  emergencyScenario?: string | null;
  changeContext?: string | null;
  lifecycleStages?: string[];
  controlLevel?: "direct_control" | "influence" | "none";
  influenceLevel?: string | null;
  outsourcedProcess?: string | null;
  supplierReference?: string | null;
  requirements?: LaiaAssessmentRequirementInput[];
  communicationPlans?: LaiaCommunicationPlanInput[];
}

export interface LaiaMonitoringPlanInput {
  title: string;
  objective: string;
  method: string;
  frequency: string;
  indicator?: string | null;
  delayCriteria?: string | null;
  responsibleUserId?: number | null;
  status?: "draft" | "active" | "overdue" | "completed" | "canceled";
  nextDueAt?: string | null;
}

async function laiaRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const laiaKeys = {
  root: (orgId: number) => ["laia", orgId] as const,
  dashboard: (orgId: number) => ["laia", orgId, "dashboard"] as const,
  branchConfigs: (orgId: number) => ["laia", orgId, "branch-configs"] as const,
  sectors: (orgId: number) => ["laia", orgId, "sectors"] as const,
  methodology: (orgId: number) => ["laia", orgId, "methodology"] as const,
  assessments: (orgId: number) => ["laia", orgId, "assessments"] as const,
  revisions: (orgId: number) => ["laia", orgId, "revisions"] as const,
};

async function invalidateLaia(queryClient: ReturnType<typeof useQueryClient>, orgId?: number) {
  if (!orgId) return;
  await queryClient.invalidateQueries({ queryKey: laiaKeys.root(orgId) });
}

function requireOrgId(orgId?: number): number {
  if (!orgId) {
    throw new Error("orgId is required");
  }
  return orgId;
}

export function useLaiaDashboard(orgId?: number) {
  return useQuery({
    queryKey: laiaKeys.dashboard(orgId || 0),
    enabled: !!orgId,
    queryFn: () =>
      laiaRequest<LaiaDashboardSummary>(
        `/api/organizations/${orgId}/environmental/laia/dashboard`,
      ),
  });
}

export function useLaiaBranchConfigs(orgId?: number) {
  return useQuery({
    queryKey: laiaKeys.branchConfigs(orgId || 0),
    enabled: !!orgId,
    queryFn: () =>
      laiaRequest<LaiaBranchConfig[]>(
        `/api/organizations/${orgId}/environmental/laia/branch-configs`,
      ),
  });
}

export function useLaiaSectors(orgId?: number) {
  return useQuery({
    queryKey: laiaKeys.sectors(orgId || 0),
    enabled: !!orgId,
    queryFn: () =>
      laiaRequest<LaiaSector[]>(
        `/api/organizations/${orgId}/environmental/laia/sectors`,
      ),
  });
}

export function useLaiaMethodology(orgId?: number) {
  return useQuery({
    queryKey: laiaKeys.methodology(orgId || 0),
    enabled: !!orgId,
    queryFn: () =>
      laiaRequest<LaiaMethodology | null>(
        `/api/organizations/${orgId}/environmental/laia/methodology`,
      ),
  });
}

export function useLaiaAssessments(orgId?: number) {
  return useQuery({
    queryKey: laiaKeys.assessments(orgId || 0),
    enabled: !!orgId,
    queryFn: () =>
      laiaRequest<LaiaAssessmentListItem[]>(
        `/api/organizations/${orgId}/environmental/laia/assessments`,
      ),
  });
}

export function useLaiaRevisions(orgId?: number) {
  return useQuery({
    queryKey: laiaKeys.revisions(orgId || 0),
    enabled: !!orgId,
    queryFn: () =>
      laiaRequest<LaiaRevision[]>(
        `/api/organizations/${orgId}/environmental/laia/revisions`,
      ),
  });
}

export function useCreateLaiaSector(orgId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      unitId?: number | null;
      departmentId?: number | null;
      code: string;
      name: string;
      description?: string | null;
      isActive?: boolean;
    }) => {
      const safeOrgId = requireOrgId(orgId);
      return laiaRequest<LaiaSector>(
        `/api/organizations/${safeOrgId}/environmental/laia/sectors`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: async () => invalidateLaia(queryClient, orgId),
  });
}

export function usePublishLaiaMethodology(orgId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      name: string;
      title: string;
      consequenceMatrix: Record<string, unknown>;
      frequencyProbabilityMatrix: Record<string, unknown>;
      scoreThresholds: { negligibleMax: number; moderateMax: number };
      moderateSignificanceRule: string;
      notes?: string | null;
    }) => {
      const safeOrgId = requireOrgId(orgId);
      return laiaRequest<{ methodologyId: number; activeVersionId: number; versionNumber: number }>(
        `/api/organizations/${safeOrgId}/environmental/laia/methodology`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: async () => invalidateLaia(queryClient, orgId),
  });
}

export function useCreateLaiaAssessment(orgId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LaiaAssessmentInput) => {
      const safeOrgId = requireOrgId(orgId);
      return laiaRequest<{ id: number }>(
        `/api/organizations/${safeOrgId}/environmental/laia/assessments`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: async () => invalidateLaia(queryClient, orgId),
  });
}

export async function createLaiaMonitoringPlan(
  orgId: number,
  assessmentId: number,
  body: LaiaMonitoringPlanInput,
) {
  return laiaRequest(
    `/api/organizations/${orgId}/environmental/laia/assessments/${assessmentId}/monitoring-plans`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

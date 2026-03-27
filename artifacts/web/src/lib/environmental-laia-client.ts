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

export interface LaiaAssessmentListFilters {
  q?: string;
  unitId?: number;
  sectorId?: number;
  status?: "draft" | "active" | "archived";
  category?: "desprezivel" | "moderado" | "critico";
  significance?: "significant" | "not_significant";
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

export interface LaiaAssessmentRequirement {
  id: number;
  type: "legal" | "other" | "stakeholder" | "strategic";
  title: string;
  requirementReference: string | null;
  description: string | null;
  legislationId: number | null;
  legislationTitle?: string | null;
}

export interface LaiaAssessmentCommunicationPlan {
  id: number;
  channel: string;
  audience: string;
  periodicity: string;
  requiresAcknowledgment: boolean;
  notes: string | null;
  lastDistributedAt: string | null;
}

export interface LaiaMonitoringPlan {
  id: number;
  title: string;
  objective: string;
  method: string;
  indicator: string | null;
  frequency: string;
  delayCriteria: string | null;
  responsibleUserId: number | null;
  status: "draft" | "active" | "overdue" | "completed" | "canceled";
  nextDueAt: string | null;
  lastCompletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LaiaAssessmentDetail {
  id: number;
  organizationId: number;
  unitId: number | null;
  sectorId: number | null;
  methodologyVersionId: number | null;
  aspectCode: string;
  mode: "quick" | "complete";
  status: "draft" | "active" | "archived";
  activityOperation: string;
  environmentalAspect: string;
  environmentalImpact: string;
  temporality: string | null;
  operationalSituation: string | null;
  incidence: string | null;
  impactClass: string | null;
  scope: string | null;
  severity: string | null;
  consequenceScore: number | null;
  frequencyProbability: string | null;
  frequencyProbabilityScore: number | null;
  totalScore: number | null;
  category: "desprezivel" | "moderado" | "critico" | null;
  significance: "significant" | "not_significant" | null;
  significanceReason: string | null;
  hasLegalRequirements: boolean;
  hasStakeholderDemand: boolean;
  hasStrategicOption: boolean;
  normalCondition: boolean;
  abnormalCondition: boolean;
  startupShutdown: boolean;
  emergencyScenario: string | null;
  changeContext: string | null;
  lifecycleStages: string[];
  controlLevel: "direct_control" | "influence" | "none";
  influenceLevel: string | null;
  outsourcedProcess: string | null;
  supplierReference: string | null;
  controlTypes: string[];
  existingControls: string | null;
  controlRequired: string | null;
  controlResponsibleUserId: number | null;
  controlDueAt: string | null;
  communicationRequired: boolean;
  communicationNotes: string | null;
  reviewFrequencyDays: number | null;
  nextReviewAt: string | null;
  notes: string | null;
  createdById: number | null;
  updatedById: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  sectorName: string | null;
  sectorCode: string | null;
  unitName: string | null;
  requirements: LaiaAssessmentRequirement[];
  communicationPlans: LaiaAssessmentCommunicationPlan[];
  monitoringPlans: LaiaMonitoringPlan[];
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
  temporality?: string | null;
  operationalSituation?: string | null;
  incidence?: string | null;
  impactClass?: string | null;
  scope?: string | null;
  severity?: string | null;
  consequenceScore?: number | null;
  frequencyProbability?: string | null;
  frequencyProbabilityScore?: number | null;
  totalScore?: number | null;
  category?: "desprezivel" | "moderado" | "critico" | null;
  significance?: "significant" | "not_significant" | null;
  significanceReason?: string | null;
  hasLegalRequirements?: boolean;
  hasStakeholderDemand?: boolean;
  hasStrategicOption?: boolean;
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
  controlTypes?: string[];
  existingControls?: string | null;
  controlRequired?: string | null;
  controlResponsibleUserId?: number | null;
  controlDueAt?: string | null;
  communicationRequired?: boolean;
  communicationNotes?: string | null;
  reviewFrequencyDays?: number | null;
  nextReviewAt?: string | null;
  notes?: string | null;
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

async function laiaRequest<T>(path: string, init?: RequestInit): Promise<T> {
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

function buildLaiaQueryString(filters?: LaiaAssessmentListFilters) {
  const params = new URLSearchParams();

  if (filters?.q?.trim()) params.set("q", filters.q.trim());
  if (filters?.unitId) params.set("unitId", String(filters.unitId));
  if (filters?.sectorId) params.set("sectorId", String(filters.sectorId));
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.significance) params.set("significance", filters.significance);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export const laiaKeys = {
  root: (orgId: number) => ["laia", orgId] as const,
  dashboard: (orgId: number) => ["laia", orgId, "dashboard"] as const,
  branchConfigs: (orgId: number) => ["laia", orgId, "branch-configs"] as const,
  sectors: (orgId: number) => ["laia", orgId, "sectors"] as const,
  methodology: (orgId: number) => ["laia", orgId, "methodology"] as const,
  assessments: (orgId: number, filters?: LaiaAssessmentListFilters) =>
    ["laia", orgId, "assessments", filters ?? {}] as const,
  assessment: (orgId: number, assessmentId: number) =>
    ["laia", orgId, "assessment", assessmentId] as const,
  revisions: (orgId: number) => ["laia", orgId, "revisions"] as const,
};

async function invalidateLaia(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId?: number,
) {
  if (!orgId) return;
  await queryClient.invalidateQueries({ queryKey: laiaKeys.root(orgId) });
}

function requireOrgId(orgId?: number): number {
  if (!orgId) {
    throw new Error("orgId is required");
  }
  return orgId;
}

function requireAssessmentId(assessmentId?: number): number {
  if (!assessmentId) {
    throw new Error("assessmentId is required");
  }
  return assessmentId;
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

export function useLaiaAssessments(
  orgId?: number,
  filters?: LaiaAssessmentListFilters,
) {
  return useQuery({
    queryKey: laiaKeys.assessments(orgId || 0, filters),
    enabled: !!orgId,
    queryFn: () =>
      laiaRequest<LaiaAssessmentListItem[]>(
        `/api/organizations/${orgId}/environmental/laia/assessments${buildLaiaQueryString(filters)}`,
      ),
  });
}

export function useLaiaAssessment(orgId?: number, assessmentId?: number | null) {
  return useQuery({
    queryKey: laiaKeys.assessment(orgId || 0, assessmentId || 0),
    enabled: !!orgId && !!assessmentId,
    queryFn: () =>
      laiaRequest<LaiaAssessmentDetail>(
        `/api/organizations/${orgId}/environmental/laia/assessments/${assessmentId}`,
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
      return laiaRequest<{
        methodologyId: number;
        activeVersionId: number;
        versionNumber: number;
      }>(
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
      return laiaRequest<LaiaAssessmentDetail>(
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

export function useUpdateLaiaAssessment(
  orgId?: number,
  assessmentId?: number | null,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<LaiaAssessmentInput>) => {
      const safeOrgId = requireOrgId(orgId);
      const safeAssessmentId = requireAssessmentId(assessmentId ?? undefined);
      return laiaRequest<LaiaAssessmentDetail>(
        `/api/organizations/${safeOrgId}/environmental/laia/assessments/${safeAssessmentId}`,
        {
          method: "PATCH",
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
  return laiaRequest<LaiaMonitoringPlan>(
    `/api/organizations/${orgId}/environmental/laia/assessments/${assessmentId}/monitoring-plans`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

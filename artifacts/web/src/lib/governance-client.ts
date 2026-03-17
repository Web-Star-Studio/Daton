import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveStrategicPlan,
  createStrategicPlan,
  createStrategicPlanAction,
  createStrategicPlanInterestedParty,
  createStrategicPlanObjective,
  createStrategicPlanSwotItem,
  deleteStrategicPlanAction,
  deleteStrategicPlanInterestedParty,
  deleteStrategicPlanObjective,
  deleteStrategicPlanSwotItem,
  getGetStrategicPlanQueryKey,
  getListStrategicPlansQueryKey,
  getStrategicPlan,
  getStrategicPlanExport,
  importStrategicPlan,
  listStrategicPlans,
  rejectStrategicPlan,
  reopenStrategicPlan,
  submitStrategicPlan,
  updateStrategicPlan,
  updateStrategicPlanAction,
  updateStrategicPlanInterestedParty,
  updateStrategicPlanObjective,
  updateStrategicPlanSwotItem,
  type CreateStrategicPlanBody,
  type CreateStrategicPlanActionBody,
  type CreateStrategicPlanInterestedPartyBody,
  type CreateStrategicPlanObjectiveBody,
  type CreateStrategicPlanSwotItemBody,
  type ImportStrategicPlanBody,
  type StrategicPlanAction,
  type StrategicPlanDetail,
  type StrategicPlanExportResponse,
  type StrategicPlanInterestedParty,
  type StrategicPlanLegacyRevisionEntry,
  type StrategicPlanListItem,
  type StrategicPlanObjective,
  type StrategicPlanReviewBody,
  type StrategicPlanSummaryMetrics,
  type StrategicPlanSwotItem,
  type UpdateStrategicPlanActionBody,
  type UpdateStrategicPlanBody,
  type UpdateStrategicPlanInterestedPartyBody,
  type UpdateStrategicPlanObjectiveBody,
  type UpdateStrategicPlanSwotItemBody,
} from "@workspace/api-client-react";

export type GovernancePlanSummaryMetrics = StrategicPlanSummaryMetrics;
export type GovernancePlanSummary = StrategicPlanListItem;
export type GovernancePlanDetail = StrategicPlanDetail;
export type GovernancePlanBody = CreateStrategicPlanBody & {
  nextReviewAt?: string | null;
  legacyRevisionHistory?: StrategicPlanLegacyRevisionEntry[] | null;
};
export type GovernanceImportPayload = ImportStrategicPlanBody;
export type GovernanceSwotItem = StrategicPlanSwotItem;
export type GovernanceInterestedParty = StrategicPlanInterestedParty;
export type GovernanceObjective = StrategicPlanObjective;
export type GovernanceAction = StrategicPlanAction;
export type GovernanceExportResponse = StrategicPlanExportResponse;
export type GovernanceSwotBody = CreateStrategicPlanSwotItemBody;
export type GovernanceInterestedPartyBody = CreateStrategicPlanInterestedPartyBody;
export type GovernanceObjectiveBody = CreateStrategicPlanObjectiveBody;
export type GovernanceActionBody = CreateStrategicPlanActionBody;

export const governanceKeys = {
  list: (orgId: number) => getListStrategicPlansQueryKey(orgId),
  detail: (orgId: number, planId: number) => getGetStrategicPlanQueryKey(orgId, planId),
};

export function useGovernancePlans(orgId?: number) {
  return useQuery({
    queryKey: governanceKeys.list(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listStrategicPlans(orgId || 0),
  });
}

export function useGovernancePlan(orgId?: number, planId?: number) {
  return useQuery({
    queryKey: governanceKeys.detail(orgId || 0, planId || 0),
    enabled: !!orgId && !!planId,
    queryFn: () => getStrategicPlan(orgId || 0, planId || 0),
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
    mutationFn: (body: CreateStrategicPlanBody) => createStrategicPlan(orgId || 0, body),
    onSuccess: invalidate,
  });
}

export function useUpdateGovernancePlan(orgId?: number, planId?: number) {
  const invalidate = useInvalidateGovernance(orgId, planId);

  return useMutation({
    mutationFn: (body: UpdateStrategicPlanBody) =>
      updateStrategicPlan(orgId || 0, planId || 0, body),
    onSuccess: invalidate,
  });
}

export function useImportGovernancePlan(orgId?: number, planId?: number) {
  const invalidate = useInvalidateGovernance(orgId, planId);

  return useMutation({
    mutationFn: (body: ImportStrategicPlanBody) =>
      importStrategicPlan(orgId || 0, planId || 0, body),
    onSuccess: invalidate,
  });
}

export async function importGovernancePlan(
  orgId: number,
  planId: number,
  body: ImportStrategicPlanBody,
) {
  return importStrategicPlan(orgId, planId, body);
}

export function useGovernanceWorkflowAction(
  orgId: number | undefined,
  planId: number | undefined,
  action: "submit" | "approve" | "reject" | "reopen",
) {
  const invalidate = useInvalidateGovernance(orgId, planId);

  return useMutation({
    mutationFn: (payload?: StrategicPlanReviewBody) => {
      switch (action) {
        case "submit":
          return submitStrategicPlan(orgId || 0, planId || 0);
        case "approve":
          return approveStrategicPlan(orgId || 0, planId || 0, payload);
        case "reject":
          return rejectStrategicPlan(orgId || 0, planId || 0, payload);
        case "reopen":
          return reopenStrategicPlan(orgId || 0, planId || 0);
      }
    },
    onSuccess: invalidate,
  });
}

type GovernanceResourceName =
  | "swot-items"
  | "interested-parties"
  | "objectives"
  | "actions";

type GovernanceCreateBodyMap = {
  "swot-items": CreateStrategicPlanSwotItemBody;
  "interested-parties": CreateStrategicPlanInterestedPartyBody;
  objectives: CreateStrategicPlanObjectiveBody;
  actions: CreateStrategicPlanActionBody;
};

type GovernanceUpdateBodyMap = {
  "swot-items": UpdateStrategicPlanSwotItemBody;
  "interested-parties": UpdateStrategicPlanInterestedPartyBody;
  objectives: UpdateStrategicPlanObjectiveBody;
  actions: UpdateStrategicPlanActionBody;
};

export function useGovernanceCrudMutation<
  TCreateBody,
  TUpdateBody = Partial<TCreateBody>,
>(
  orgId: number | undefined,
  planId: number | undefined,
  resource: GovernanceResourceName,
) {
  const invalidate = useInvalidateGovernance(orgId, planId);

  const createMutation = useMutation<unknown, Error, TCreateBody>({
    mutationFn: (body: TCreateBody) => {
      switch (resource) {
        case "swot-items":
          return createStrategicPlanSwotItem(orgId || 0, planId || 0, body as CreateStrategicPlanSwotItemBody);
        case "interested-parties":
          return createStrategicPlanInterestedParty(orgId || 0, planId || 0, body as CreateStrategicPlanInterestedPartyBody);
        case "objectives":
          return createStrategicPlanObjective(orgId || 0, planId || 0, body as CreateStrategicPlanObjectiveBody);
        case "actions":
          return createStrategicPlanAction(orgId || 0, planId || 0, body as CreateStrategicPlanActionBody);
      }
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation<unknown, Error, { id: number; body: TUpdateBody }>({
    mutationFn: ({ id, body }: { id: number; body: TUpdateBody }) => {
      switch (resource) {
        case "swot-items":
          return updateStrategicPlanSwotItem(orgId || 0, planId || 0, id, body as UpdateStrategicPlanSwotItemBody);
        case "interested-parties":
          return updateStrategicPlanInterestedParty(orgId || 0, planId || 0, id, body as UpdateStrategicPlanInterestedPartyBody);
        case "objectives":
          return updateStrategicPlanObjective(orgId || 0, planId || 0, id, body as UpdateStrategicPlanObjectiveBody);
        case "actions":
          return updateStrategicPlanAction(orgId || 0, planId || 0, id, body as UpdateStrategicPlanActionBody);
      }
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation<unknown, Error, number>({
    mutationFn: (id: number) => {
      switch (resource) {
        case "swot-items":
          return deleteStrategicPlanSwotItem(orgId || 0, planId || 0, id);
        case "interested-parties":
          return deleteStrategicPlanInterestedParty(orgId || 0, planId || 0, id);
        case "objectives":
          return deleteStrategicPlanObjective(orgId || 0, planId || 0, id);
        case "actions":
          return deleteStrategicPlanAction(orgId || 0, planId || 0, id);
      }
    },
    onSuccess: invalidate,
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}

export async function fetchGovernanceExport(orgId: number, planId: number) {
  return getStrategicPlanExport(orgId, planId);
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetDocumentQueryKey,
  getGetInternalAuditQueryKey,
  getGetManagementReviewQueryKey,
  getGetNonconformityQueryKey,
  getGetSgqProcessQueryKey,
  getListDocumentCommunicationPlansQueryKey,
  getListInternalAuditsQueryKey,
  getListManagementReviewsQueryKey,
  getListNonconformitiesQueryKey,
  getListSgqProcessesQueryKey,
  listSgqProcesses,
  useCreateCorrectiveAction,
  useCreateDocumentCommunicationPlan,
  useCreateInternalAudit,
  useCreateInternalAuditFinding,
  useCreateManagementReview,
  useCreateManagementReviewInput,
  useCreateManagementReviewOutput,
  useCreateNonconformity,
  useCreateNonconformityEffectivenessReview,
  useCreateSgqProcess,
  useDeleteDocumentCommunicationPlan,
  useDeleteManagementReviewInput,
  useDeleteManagementReviewOutput,
  useGetInternalAudit,
  useGetManagementReview,
  useGetNonconformity,
  useGetSgqProcess,
  useInactivateSgqProcess,
  useListDocumentCommunicationPlans,
  useListInternalAudits,
  useListManagementReviews,
  useListNonconformities,
  useListSgqProcesses,
  useReactivateSgqProcess,
  useSyncInternalAuditChecklistItems,
  useUpdateCorrectiveAction,
  useUpdateDocumentCommunicationPlan,
  useUpdateInternalAudit,
  useUpdateInternalAuditFinding,
  useUpdateManagementReview,
  useUpdateManagementReviewInput,
  useUpdateManagementReviewOutput,
  useUpdateNonconformity,
  useUpdateSgqProcess,
  type CorrectiveAction,
  type CreateCorrectiveActionBody,
  type CreateInternalAuditBody,
  type CreateInternalAuditFindingBody,
  type CreateManagementReviewBody,
  type CreateManagementReviewInputBody,
  type CreateManagementReviewOutputBody,
  type CreateNonconformityBody,
  type CreateSgqProcessBody,
  type DocumentCommunicationPlan,
  type DocumentCommunicationPlanBody,
  type GovernanceSystemAttachment as Attachment,
  type InternalAuditChecklistItem,
  type InternalAuditDetail,
  type InternalAuditFinding,
  type InternalAuditListItem as InternalAuditSummary,
  type ListInternalAuditsParams,
  type ListManagementReviewsParams,
  type ListNonconformitiesParams,
  type ListSgqProcessesParams,
  type ManagementReviewDetail,
  type ManagementReviewInput,
  type ManagementReviewListItem as ManagementReviewSummary,
  type ManagementReviewOutput,
  type NonconformityDetail,
  type NonconformityListItem as NonconformitySummary,
  type PaginatedInternalAudits,
  type PaginatedManagementReviews,
  type PaginatedNonconformities,
  type PaginatedSgqProcesses,
  type SgqProcessDetail,
  type SgqProcessInteraction,
  type SgqProcessListItem as SgqProcessSummary,
  type SgqProcessRevision,
  type UpdateCorrectiveActionBody,
  type UpdateDocumentCommunicationPlanBody,
  type UpdateInternalAuditBody,
  type UpdateInternalAuditFindingBody,
  type UpdateManagementReviewBody,
  type UpdateManagementReviewInputBody,
  type UpdateManagementReviewOutputBody,
  type UpdateNonconformityBody,
  type UpdateSgqProcessBody,
} from "@workspace/api-client-react";

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

function assertNumberId(id: number | undefined, label: string) {
  if (!id) {
    throw new Error(`${label} é obrigatório para esta operação`);
  }
  return id;
}

async function invalidateGovernanceProcesses(queryClient: ReturnType<typeof useQueryClient>, orgId: number, processId?: number) {
  await queryClient.invalidateQueries({ queryKey: getListSgqProcessesQueryKey(orgId) });
  if (processId) {
    await queryClient.invalidateQueries({ queryKey: getGetSgqProcessQueryKey(orgId, processId) });
  }
}

async function invalidateGovernanceAudits(queryClient: ReturnType<typeof useQueryClient>, orgId: number, auditId?: number) {
  await queryClient.invalidateQueries({ queryKey: getListInternalAuditsQueryKey(orgId) });
  if (auditId) {
    await queryClient.invalidateQueries({ queryKey: getGetInternalAuditQueryKey(orgId, auditId) });
  }
}

async function invalidateGovernanceNonconformities(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: number,
  ncId?: number,
) {
  await queryClient.invalidateQueries({ queryKey: getListNonconformitiesQueryKey(orgId) });
  if (ncId) {
    await queryClient.invalidateQueries({ queryKey: getGetNonconformityQueryKey(orgId, ncId) });
  }
}

async function invalidateGovernanceManagementReviews(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: number,
  reviewId?: number,
) {
  await queryClient.invalidateQueries({ queryKey: getListManagementReviewsQueryKey(orgId) });
  if (reviewId) {
    await queryClient.invalidateQueries({
      queryKey: getGetManagementReviewQueryKey(orgId, reviewId),
    });
  }
}

export function useSgqProcesses(orgId?: number, params?: ListSgqProcessesParams) {
  return useListSgqProcesses(orgId ?? 0, params, {
    query: {
      enabled: !!orgId,
      queryKey: getListSgqProcessesQueryKey(orgId ?? 0, params),
    },
  });
}

export function useAllActiveSgqProcesses(orgId?: number) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["sgq-processes-options", orgId],
    queryFn: async (): Promise<SgqProcessSummary[]> => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const items: SgqProcessSummary[] = [];
      let currentPage = 1;
      let totalPages = 1;

      while (currentPage <= totalPages) {
        const response = await listSgqProcesses(validOrgId, {
          page: currentPage,
          pageSize: 100,
          status: "active",
        });
        items.push(...response.data);
        totalPages = response.pagination.totalPages;
        currentPage += 1;
      }

      return items;
    },
  });
}

export function useSgqProcess(orgId?: number, processId?: number) {
  return useGetSgqProcess(orgId ?? 0, processId ?? 0, {
    query: {
      enabled: !!orgId && !!processId,
      queryKey: getGetSgqProcessQueryKey(orgId ?? 0, processId ?? 0),
    },
  });
}

export function useSgqProcessMutation(orgId?: number, processId?: number) {
  const queryClient = useQueryClient();
  const createMutation = useCreateSgqProcess();
  const updateMutation = useUpdateSgqProcess();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH"; body: CreateSgqProcessBody | UpdateSgqProcessBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({ orgId: validOrgId, data: payload.body as CreateSgqProcessBody });
      }
      const validProcessId = assertNumberId(processId, "Processo");
      return updateMutation.mutateAsync({
        orgId: validOrgId,
        processId: validProcessId,
        data: payload.body as UpdateSgqProcessBody,
      });
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceProcesses(queryClient, orgId, data.id);
    },
  });
}

export function useSgqProcessLifecycleMutation(
  orgId?: number,
  processId?: number,
  action?: "inactivate" | "reactivate",
) {
  const queryClient = useQueryClient();
  const inactivateMutation = useInactivateSgqProcess();
  const reactivateMutation = useReactivateSgqProcess();

  return useMutation({
    mutationFn: async () => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validProcessId = assertNumberId(processId, "Processo");
      if (action === "inactivate") {
        return inactivateMutation.mutateAsync({ orgId: validOrgId, processId: validProcessId });
      }
      if (action === "reactivate") {
        return reactivateMutation.mutateAsync({ orgId: validOrgId, processId: validProcessId });
      }
      throw new Error("Ação de ciclo de vida inválida");
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceProcesses(queryClient, orgId, data.id);
    },
  });
}

export function useInternalAudits(orgId?: number, params?: ListInternalAuditsParams) {
  return useListInternalAudits(orgId ?? 0, params, {
    query: {
      enabled: !!orgId,
      queryKey: getListInternalAuditsQueryKey(orgId ?? 0, params),
    },
  });
}

export function useInternalAudit(orgId?: number, auditId?: number) {
  return useGetInternalAudit(orgId ?? 0, auditId ?? 0, {
    query: {
      enabled: !!orgId && !!auditId,
      queryKey: getGetInternalAuditQueryKey(orgId ?? 0, auditId ?? 0),
    },
  });
}

export function useInternalAuditMutation(orgId?: number, auditId?: number) {
  const queryClient = useQueryClient();
  const createMutation = useCreateInternalAudit();
  const updateMutation = useUpdateInternalAudit();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH"; body: CreateInternalAuditBody | UpdateInternalAuditBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({ orgId: validOrgId, data: payload.body as CreateInternalAuditBody });
      }
      const validAuditId = assertNumberId(auditId, "Auditoria");
      return updateMutation.mutateAsync({
        orgId: validOrgId,
        auditId: validAuditId,
        data: payload.body as UpdateInternalAuditBody,
      });
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceAudits(queryClient, orgId, data.id);
    },
  });
}

export function useAuditChecklistSyncMutation(orgId?: number, auditId?: number) {
  const queryClient = useQueryClient();
  const syncMutation = useSyncInternalAuditChecklistItems();

  return useMutation({
    mutationFn: async (items: SyncInternalAuditChecklistBody["items"]) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validAuditId = assertNumberId(auditId, "Auditoria");
      return syncMutation.mutateAsync({
        orgId: validOrgId,
        auditId: validAuditId,
        data: { items },
      });
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceAudits(queryClient, orgId, data.id);
    },
  });
}

type SyncInternalAuditChecklistBody = {
  items: Array<{
    id?: number;
    label: string;
    requirementRef?: string | null;
    result?: InternalAuditChecklistItem["result"];
    notes?: string | null;
    sortOrder?: number;
  }>;
};

export function useAuditFindingMutation(orgId?: number, auditId?: number, findingId?: number) {
  const queryClient = useQueryClient();
  const createMutation = useCreateInternalAuditFinding();
  const updateMutation = useUpdateInternalAuditFinding();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH"; body: CreateInternalAuditFindingBody | UpdateInternalAuditFindingBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validAuditId = assertNumberId(auditId, "Auditoria");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({
          orgId: validOrgId,
          auditId: validAuditId,
          data: payload.body as CreateInternalAuditFindingBody,
        });
      }
      const validFindingId = assertNumberId(findingId, "Achado");
      return updateMutation.mutateAsync({
        orgId: validOrgId,
        auditId: validAuditId,
        findingId: validFindingId,
        data: payload.body as UpdateInternalAuditFindingBody,
      });
    },
    onSuccess: async () => {
      if (!orgId || !auditId) return;
      await invalidateGovernanceAudits(queryClient, orgId, auditId);
    },
  });
}

export function useNonconformities(orgId?: number, params?: ListNonconformitiesParams) {
  return useListNonconformities(orgId ?? 0, params, {
    query: {
      enabled: !!orgId,
      queryKey: getListNonconformitiesQueryKey(orgId ?? 0, params),
    },
  });
}

export function useNonconformity(orgId?: number, ncId?: number) {
  return useGetNonconformity(orgId ?? 0, ncId ?? 0, {
    query: {
      enabled: !!orgId && !!ncId,
      queryKey: getGetNonconformityQueryKey(orgId ?? 0, ncId ?? 0),
    },
  });
}

export function useNonconformityMutation(orgId?: number, ncId?: number) {
  const queryClient = useQueryClient();
  const createMutation = useCreateNonconformity();
  const updateMutation = useUpdateNonconformity();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH"; body: CreateNonconformityBody | UpdateNonconformityBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({ orgId: validOrgId, data: payload.body as CreateNonconformityBody });
      }
      const validNcId = assertNumberId(ncId, "Não conformidade");
      return updateMutation.mutateAsync({
        orgId: validOrgId,
        ncId: validNcId,
        data: payload.body as UpdateNonconformityBody,
      });
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceNonconformities(queryClient, orgId, data.id);
    },
  });
}

export function useEffectivenessReviewMutation(orgId?: number, ncId?: number) {
  const queryClient = useQueryClient();
  const reviewMutation = useCreateNonconformityEffectivenessReview();

  return useMutation({
    mutationFn: async (data: { result: "effective" | "ineffective"; comment?: string | null }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validNcId = assertNumberId(ncId, "Não conformidade");
      return reviewMutation.mutateAsync({ orgId: validOrgId, ncId: validNcId, data });
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceNonconformities(queryClient, orgId, data.id);
    },
  });
}

export function useCorrectiveActionMutation(orgId?: number, ncId?: number, actionId?: number) {
  const queryClient = useQueryClient();
  const createMutation = useCreateCorrectiveAction();
  const updateMutation = useUpdateCorrectiveAction();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH"; body: CreateCorrectiveActionBody | UpdateCorrectiveActionBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validNcId = assertNumberId(ncId, "Não conformidade");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({
          orgId: validOrgId,
          ncId: validNcId,
          data: payload.body as CreateCorrectiveActionBody,
        });
      }
      const validActionId = assertNumberId(actionId, "Ação corretiva");
      return updateMutation.mutateAsync({
        orgId: validOrgId,
        ncId: validNcId,
        actionId: validActionId,
        data: payload.body as UpdateCorrectiveActionBody,
      });
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceNonconformities(queryClient, orgId, data.id);
    },
  });
}

export function useManagementReviews(orgId?: number, params?: ListManagementReviewsParams) {
  return useListManagementReviews(orgId ?? 0, params, {
    query: {
      enabled: !!orgId,
      queryKey: getListManagementReviewsQueryKey(orgId ?? 0, params),
    },
  });
}

export function useManagementReview(orgId?: number, reviewId?: number) {
  return useGetManagementReview(orgId ?? 0, reviewId ?? 0, {
    query: {
      enabled: !!orgId && !!reviewId,
      queryKey: getGetManagementReviewQueryKey(orgId ?? 0, reviewId ?? 0),
    },
  });
}

export function useManagementReviewMutation(orgId?: number, reviewId?: number) {
  const queryClient = useQueryClient();
  const createMutation = useCreateManagementReview();
  const updateMutation = useUpdateManagementReview();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH"; body: CreateManagementReviewBody | UpdateManagementReviewBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({
          orgId: validOrgId,
          data: payload.body as CreateManagementReviewBody,
        });
      }
      const validReviewId = assertNumberId(reviewId, "Análise crítica");
      return updateMutation.mutateAsync({
        orgId: validOrgId,
        reviewId: validReviewId,
        data: payload.body as UpdateManagementReviewBody,
      });
    },
    onSuccess: async (data) => {
      if (!orgId) return;
      await invalidateGovernanceManagementReviews(queryClient, orgId, data.id);
    },
  });
}

export function useManagementReviewInputMutation(orgId?: number, reviewId?: number, inputId?: number) {
  const queryClient = useQueryClient();
  const createMutation = useCreateManagementReviewInput();
  const updateMutation = useUpdateManagementReviewInput();
  const deleteMutation = useDeleteManagementReviewInput();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH" | "DELETE"; body?: CreateManagementReviewInputBody | UpdateManagementReviewInputBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validReviewId = assertNumberId(reviewId, "Análise crítica");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({
          orgId: validOrgId,
          reviewId: validReviewId,
          data: payload.body as CreateManagementReviewInputBody,
        });
      }
      const validInputId = assertNumberId(inputId, "Entrada");
      if (payload.method === "PATCH") {
        return updateMutation.mutateAsync({
          orgId: validOrgId,
          reviewId: validReviewId,
          inputId: validInputId,
          data: payload.body as UpdateManagementReviewInputBody,
        });
      }
      await deleteMutation.mutateAsync({
        orgId: validOrgId,
        reviewId: validReviewId,
        inputId: validInputId,
      });
      return undefined;
    },
    onSuccess: async () => {
      if (!orgId || !reviewId) return;
      await invalidateGovernanceManagementReviews(queryClient, orgId, reviewId);
    },
  });
}

export function useManagementReviewOutputMutation(
  orgId?: number,
  reviewId?: number,
  outputId?: number,
) {
  const queryClient = useQueryClient();
  const createMutation = useCreateManagementReviewOutput();
  const updateMutation = useUpdateManagementReviewOutput();
  const deleteMutation = useDeleteManagementReviewOutput();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH" | "DELETE"; body?: CreateManagementReviewOutputBody | UpdateManagementReviewOutputBody }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validReviewId = assertNumberId(reviewId, "Análise crítica");
      if (payload.method === "POST") {
        return createMutation.mutateAsync({
          orgId: validOrgId,
          reviewId: validReviewId,
          data: payload.body as CreateManagementReviewOutputBody,
        });
      }
      const validOutputId = assertNumberId(outputId, "Saída");
      if (payload.method === "PATCH") {
        return updateMutation.mutateAsync({
          orgId: validOrgId,
          reviewId: validReviewId,
          outputId: validOutputId,
          data: payload.body as UpdateManagementReviewOutputBody,
        });
      }
      await deleteMutation.mutateAsync({
        orgId: validOrgId,
        reviewId: validReviewId,
        outputId: validOutputId,
      });
      return undefined;
    },
    onSuccess: async () => {
      if (!orgId || !reviewId) return;
      await invalidateGovernanceManagementReviews(queryClient, orgId, reviewId);
    },
  });
}

export function useDocumentCommunicationPlans(orgId?: number, docId?: number) {
  return useListDocumentCommunicationPlans(orgId ?? 0, docId ?? 0, {
    query: {
      enabled: !!orgId && !!docId,
      queryKey: getListDocumentCommunicationPlansQueryKey(orgId ?? 0, docId ?? 0),
    },
  });
}

export function useDocumentCommunicationPlanMutation(
  orgId?: number,
  docId?: number,
  planId?: number,
) {
  const queryClient = useQueryClient();
  const createMutation = useCreateDocumentCommunicationPlan();
  const updateMutation = useUpdateDocumentCommunicationPlan();
  const deleteMutation = useDeleteDocumentCommunicationPlan();

  return useMutation({
    mutationFn: async (payload: { method: "POST" | "PATCH" | "DELETE"; body?: DocumentCommunicationPlanBody | UpdateDocumentCommunicationPlanBody; planId?: number }) => {
      const validOrgId = assertNumberId(orgId, "Organização");
      const validDocId = assertNumberId(docId, "Documento");
      const targetPlanId = payload.planId ?? planId;
      if (payload.method === "POST") {
        return createMutation.mutateAsync({
          orgId: validOrgId,
          docId: validDocId,
          data: payload.body as DocumentCommunicationPlanBody,
        });
      }
      const validPlanId = assertNumberId(targetPlanId, "Plano de comunicação");
      if (payload.method === "PATCH") {
        return updateMutation.mutateAsync({
          orgId: validOrgId,
          docId: validDocId,
          planId: validPlanId,
          data: payload.body as UpdateDocumentCommunicationPlanBody,
        });
      }
      await deleteMutation.mutateAsync({
        orgId: validOrgId,
        docId: validDocId,
        planId: validPlanId,
      });
      return undefined;
    },
    onSuccess: async () => {
      if (!orgId || !docId) return;
      await queryClient.invalidateQueries({
        queryKey: getListDocumentCommunicationPlansQueryKey(orgId, docId),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetDocumentQueryKey(orgId || 0, docId || 0),
      });
    },
  });
}

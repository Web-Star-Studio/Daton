import { useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useAllActiveSgqProcesses,
  useNonconformities,
  useServicePostDeliveryEventMutation,
  useServicePreservationDeliveryMutation,
  useServiceExecutionCycle,
  useServiceExecutionCycleMutation,
  useServiceExecutionCycles,
  useServiceExecutionModel,
  useServiceExecutionModelMutation,
  useServiceExecutionModels,
  useServiceNonconformingOutputMutation,
  useServiceExecutionReleaseMutation,
  useServiceSpecialValidationEventMutation,
  useServiceSpecialValidationProfileMutation,
  useServiceThirdPartyPropertyMutation,
  type Attachment,
  type NonconformitySummary,
  type ServiceExecutionCycleCheckpoint,
  type ServiceNonconformingOutput,
  type ServicePostDeliveryEvent,
  type ServicePreservationDeliveryRecord,
  type ServiceSpecialValidationProfile,
  type ServiceThirdPartyProperty,
} from "@/lib/governance-system-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ProfileItemAttachmentsField,
  type AttachmentFieldItem,
} from "@/components/employees/profile-item-form-fields";
import { toast } from "@/hooks/use-toast";
import {
  getListDocumentsQueryKey,
  getListOrganizationContactsQueryKey,
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
  useListDocuments,
  useListOrganizationContacts,
  useListUnits,
  useListUserOptions,
} from "@workspace/api-client-react";
import {
  formatFileSize,
  uploadFilesToStorage,
  validateProfileItemUploadSelection,
} from "@/lib/uploads";
import { resolveApiUrl } from "@/lib/api";

type ModelCheckpointDraft = {
  id?: number;
  kind: "checkpoint" | "preventive_control";
  label: string;
  acceptanceCriteria: string;
  guidance: string;
  isRequired: boolean;
  requiresEvidence: boolean;
  sortOrder: number;
};

type ModelFormState = {
  name: string;
  description: string;
  processId: string;
  unitId: string;
  requiresSpecialValidation: boolean;
  status: "active" | "inactive";
  documentIds: number[];
  checkpoints: ModelCheckpointDraft[];
};

type CycleFormState = {
  title: string;
  serviceOrderRef: string;
  outputIdentifier: string;
  processId: string;
  unitId: string;
  customerContactId: string;
  documentIds: number[];
};

type CycleCheckpointDraft = {
  id: number;
  label: string;
  kind: "checkpoint" | "preventive_control";
  acceptanceCriteria: string;
  guidance: string;
  isRequired: boolean;
  requiresEvidence: boolean;
  sortOrder: number;
  status: "pending" | "passed" | "failed" | "waived";
  notes: string;
  evidenceAttachments: Attachment[];
  checkedByName?: string | null;
  checkedAt?: string | null;
};

type ReleaseFormState = {
  decision: "approved" | "blocked";
  decisionNotes: string;
  blockingIssuesText: string;
  evidenceAttachments: Attachment[];
};

type NonconformingOutputFormState = {
  title: string;
  description: string;
  impact: string;
  status: "open" | "in_treatment" | "resolved" | "closed";
  disposition:
    | ""
    | "blocked"
    | "reworked"
    | "reclassified"
    | "accepted_under_concession"
    | "scrapped";
  dispositionNotes: string;
  responsibleUserId: string;
  linkedNonconformityId: string;
  evidenceAttachments: Attachment[];
};

type ThirdPartyPropertyFormState = {
  title: string;
  ownerName: string;
  description: string;
  conditionOnReceipt: string;
  handlingRequirements: string;
  status: "received" | "in_use" | "returned" | "lost_or_damaged";
  responsibleUserId: string;
  evidenceAttachments: Attachment[];
};

type PreservationDeliveryFormState = {
  preservationNotes: string;
  preservationMethod: string;
  packagingNotes: string;
  deliveryNotes: string;
  deliveryRecipient: string;
  deliveryMethod: string;
  deliveredById: string;
  preservationEvidenceAttachments: Attachment[];
  deliveryEvidenceAttachments: Attachment[];
  preservedAt: string;
  deliveredAt: string;
};

type PostDeliveryEventFormState = {
  eventType:
    | "monitoring"
    | "complaint"
    | "assistance"
    | "adjustment"
    | "feedback"
    | "other";
  title: string;
  description: string;
  status: "open" | "in_follow_up" | "closed";
  followUpNotes: string;
  responsibleUserId: string;
  evidenceAttachments: Attachment[];
  occurredAt: string;
};

type SpecialValidationProfileFormState = {
  title: string;
  criteria: string;
  method: string;
  status: "draft" | "valid" | "expired" | "suspended";
  responsibleUserId: string;
  currentValidUntil: string;
  notes: string;
};

type SpecialValidationEventFormState = {
  eventType: "initial_validation" | "revalidation";
  result: "approved" | "rejected";
  criteriaSnapshot: string;
  notes: string;
  validUntil: string;
  validatedById: string;
  evidenceAttachments: Attachment[];
};

const MAX_LIST_ITEMS = 100;

function emptyCheckpointDraft(index = 0): ModelCheckpointDraft {
  return {
    kind: "checkpoint",
    label: "",
    acceptanceCriteria: "",
    guidance: "",
    isRequired: true,
    requiresEvidence: false,
    sortOrder: index,
  };
}

function emptyModelForm(): ModelFormState {
  return {
    name: "",
    description: "",
    processId: "",
    unitId: "",
    requiresSpecialValidation: false,
    status: "active",
    documentIds: [],
    checkpoints: [emptyCheckpointDraft(0)],
  };
}

function emptyCycleForm(model?: {
  processId?: number | null;
  unitId?: number | null;
  documents?: Array<{ id: number }>;
}): CycleFormState {
  return {
    title: "",
    serviceOrderRef: "",
    outputIdentifier: "",
    processId: model?.processId ? String(model.processId) : "",
    unitId: model?.unitId ? String(model.unitId) : "",
    customerContactId: "",
    documentIds: model?.documents?.map((document) => document.id) ?? [],
  };
}

function emptyReleaseForm(): ReleaseFormState {
  return {
    decision: "approved",
    decisionNotes: "",
    blockingIssuesText: "",
    evidenceAttachments: [],
  };
}

function emptyNonconformingOutputForm(): NonconformingOutputFormState {
  return {
    title: "",
    description: "",
    impact: "",
    status: "open",
    disposition: "",
    dispositionNotes: "",
    responsibleUserId: "",
    linkedNonconformityId: "",
    evidenceAttachments: [],
  };
}

function emptyThirdPartyPropertyForm(): ThirdPartyPropertyFormState {
  return {
    title: "",
    ownerName: "",
    description: "",
    conditionOnReceipt: "",
    handlingRequirements: "",
    status: "received",
    responsibleUserId: "",
    evidenceAttachments: [],
  };
}

function emptyPreservationDeliveryForm(): PreservationDeliveryFormState {
  return {
    preservationNotes: "",
    preservationMethod: "",
    packagingNotes: "",
    deliveryNotes: "",
    deliveryRecipient: "",
    deliveryMethod: "",
    deliveredById: "",
    preservationEvidenceAttachments: [],
    deliveryEvidenceAttachments: [],
    preservedAt: "",
    deliveredAt: "",
  };
}

function emptyPostDeliveryEventForm(): PostDeliveryEventFormState {
  return {
    eventType: "other",
    title: "",
    description: "",
    status: "open",
    followUpNotes: "",
    responsibleUserId: "",
    evidenceAttachments: [],
    occurredAt: "",
  };
}

function emptySpecialValidationProfileForm(): SpecialValidationProfileFormState {
  return {
    title: "",
    criteria: "",
    method: "",
    status: "draft",
    responsibleUserId: "",
    currentValidUntil: "",
    notes: "",
  };
}

function emptySpecialValidationEventForm(
  profile?: ServiceSpecialValidationProfile | null,
): SpecialValidationEventFormState {
  return {
    eventType: profile?.events.length ? "revalidation" : "initial_validation",
    result: "approved",
    criteriaSnapshot: profile?.criteria ?? "",
    notes: "",
    validUntil: formatDateTimeLocalInput(profile?.currentValidUntil),
    validatedById: "",
    evidenceAttachments: [],
  };
}

function parseMultiSelectValues(event: React.ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.currentTarget.selectedOptions).map((option) =>
    Number(option.value),
  );
}

function mapAttachments(
  attachments: Attachment[],
  onRemove?: (objectPath: string) => void,
): AttachmentFieldItem[] {
  return attachments.map((attachment, index) => ({
    id: `${attachment.objectPath}-${index}`,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    objectPath: attachment.objectPath,
    onRemove: onRemove ? () => onRemove(attachment.objectPath) : undefined,
  }));
}

function parseBlockingIssues(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function nonconformingOutputLabel(output: ServiceNonconformingOutput) {
  return output.title.trim() || `Evento #${output.id}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Ainda não registrado";
  return new Date(value).toLocaleString("pt-BR");
}

function formatDateTimeLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function statusLabel(
  value:
    | "active"
    | "inactive"
    | "in_progress"
    | "awaiting_release"
    | "released"
    | "blocked"
    | "pending"
    | "passed"
    | "failed"
    | "waived"
    | "open"
    | "in_treatment"
    | "resolved"
    | "closed"
    | "received"
    | "in_use"
    | "returned"
    | "lost_or_damaged"
    | "in_follow_up"
    | "draft"
    | "valid"
    | "expired"
    | "suspended",
) {
  switch (value) {
    case "active":
      return "Ativo";
    case "inactive":
      return "Inativo";
    case "in_progress":
      return "Em execução";
    case "awaiting_release":
      return "Aguardando liberação";
    case "released":
      return "Liberado";
    case "blocked":
      return "Bloqueado";
    case "pending":
      return "Pendente";
    case "passed":
      return "Atendido";
    case "failed":
      return "Reprovado";
    case "waived":
      return "Dispensado";
    case "open":
      return "Aberta";
    case "in_treatment":
      return "Em tratamento";
    case "resolved":
      return "Resolvida";
    case "closed":
      return "Encerrada";
    case "received":
      return "Recebida";
    case "in_use":
      return "Em uso";
    case "returned":
      return "Devolvida";
    case "lost_or_damaged":
      return "Perdida ou danificada";
    case "in_follow_up":
      return "Em acompanhamento";
    case "draft":
      return "Rascunho";
    case "valid":
      return "Válida";
    case "expired":
      return "Expirada";
    case "suspended":
      return "Suspensa";
  }
}

function checkpointKindLabel(value: "checkpoint" | "preventive_control") {
  return value === "preventive_control" ? "Controle preventivo" : "Checkpoint";
}

function nonconformingDispositionLabel(
  value:
    | "blocked"
    | "reworked"
    | "reclassified"
    | "accepted_under_concession"
    | "scrapped",
) {
  switch (value) {
    case "blocked":
      return "Bloqueada";
    case "reworked":
      return "Retrabalhada";
    case "reclassified":
      return "Reclassificada";
    case "accepted_under_concession":
      return "Aceita sob concessão";
    case "scrapped":
      return "Descartada";
  }
}

function thirdPartyPropertyLabel(item: ServiceThirdPartyProperty) {
  return item.title.trim() || `Item #${item.id}`;
}

function postDeliveryEventLabel(item: ServicePostDeliveryEvent) {
  return item.title.trim() || `Evento #${item.id}`;
}

export default function GovernanceServiceExecutionPage() {
  usePageTitle("Execução Controlada");
  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("governance");
  const orgId = organization?.id;

  const [selectedModelId, setSelectedModelId] = useState<number | undefined>();
  const [selectedCycleId, setSelectedCycleId] = useState<number | undefined>();
  const [selectedNonconformingOutputId, setSelectedNonconformingOutputId] =
    useState<number | undefined>();
  const [selectedThirdPartyPropertyId, setSelectedThirdPartyPropertyId] =
    useState<number | undefined>();
  const [selectedPostDeliveryEventId, setSelectedPostDeliveryEventId] =
    useState<number | undefined>();
  const [cycleFilters, setCycleFilters] = useState({
    search: "",
    processId: "",
    unitId: "",
    customerContactId: "",
  });
  const [isCreatingNonconformingOutput, setIsCreatingNonconformingOutput] =
    useState(false);
  const [isCreatingThirdPartyProperty, setIsCreatingThirdPartyProperty] =
    useState(false);
  const [isCreatingPostDeliveryEvent, setIsCreatingPostDeliveryEvent] =
    useState(false);
  const [modelForm, setModelForm] = useState<ModelFormState>(emptyModelForm());
  const [cycleForm, setCycleForm] = useState<CycleFormState>(emptyCycleForm());
  const [cycleCheckpoints, setCycleCheckpoints] = useState<
    CycleCheckpointDraft[]
  >([]);
  const [releaseForm, setReleaseForm] =
    useState<ReleaseFormState>(emptyReleaseForm());
  const [nonconformingOutputForm, setNonconformingOutputForm] =
    useState<NonconformingOutputFormState>(emptyNonconformingOutputForm());
  const [thirdPartyPropertyForm, setThirdPartyPropertyForm] =
    useState<ThirdPartyPropertyFormState>(emptyThirdPartyPropertyForm());
  const [preservationDeliveryForm, setPreservationDeliveryForm] =
    useState<PreservationDeliveryFormState>(emptyPreservationDeliveryForm());
  const [postDeliveryEventForm, setPostDeliveryEventForm] =
    useState<PostDeliveryEventFormState>(emptyPostDeliveryEventForm());
  const [specialValidationProfileForm, setSpecialValidationProfileForm] =
    useState<SpecialValidationProfileFormState>(
      emptySpecialValidationProfileForm(),
    );
  const [specialValidationEventForm, setSpecialValidationEventForm] =
    useState<SpecialValidationEventFormState>(
      emptySpecialValidationEventForm(),
    );
  const [releaseUploading, setReleaseUploading] = useState(false);
  const [nonconformingOutputUploading, setNonconformingOutputUploading] =
    useState(false);
  const [thirdPartyPropertyUploading, setThirdPartyPropertyUploading] =
    useState(false);
  const [preservationUploading, setPreservationUploading] = useState(false);
  const [deliveryUploading, setDeliveryUploading] = useState(false);
  const [postDeliveryUploading, setPostDeliveryUploading] = useState(false);
  const [specialValidationEventUploading, setSpecialValidationEventUploading] =
    useState(false);
  const [uploadingCheckpointId, setUploadingCheckpointId] = useState<
    number | null
  >(null);

  const { data: modelList, isLoading: isLoadingModels } =
    useServiceExecutionModels(orgId, {
      page: 1,
      pageSize: 50,
    });
  const models = modelList?.data ?? [];
  const { data: modelDetail } = useServiceExecutionModel(
    orgId,
    selectedModelId,
  );
  const modelMutation = useServiceExecutionModelMutation(
    orgId,
    selectedModelId,
  );

  const { data: cycleList, isLoading: isLoadingCycles } =
    useServiceExecutionCycles(orgId, {
      page: 1,
      pageSize: 50,
      modelId: selectedModelId,
      search: cycleFilters.search.trim() || undefined,
      processId: cycleFilters.processId
        ? Number(cycleFilters.processId)
        : undefined,
      unitId: cycleFilters.unitId ? Number(cycleFilters.unitId) : undefined,
      customerContactId: cycleFilters.customerContactId
        ? Number(cycleFilters.customerContactId)
        : undefined,
    });
  const cycles = cycleList?.data ?? [];
  const { data: cycleDetail } = useServiceExecutionCycle(
    orgId,
    selectedCycleId,
  );
  const cycleMutation = useServiceExecutionCycleMutation(
    orgId,
    selectedCycleId,
  );
  const releaseMutation = useServiceExecutionReleaseMutation(
    orgId,
    selectedCycleId,
  );
  const nonconformingOutputMutation = useServiceNonconformingOutputMutation(
    orgId,
    selectedCycleId,
    selectedNonconformingOutputId,
  );
  const thirdPartyPropertyMutation = useServiceThirdPartyPropertyMutation(
    orgId,
    selectedCycleId,
    selectedThirdPartyPropertyId,
  );
  const preservationDeliveryMutation = useServicePreservationDeliveryMutation(
    orgId,
    selectedCycleId,
  );
  const postDeliveryEventMutation = useServicePostDeliveryEventMutation(
    orgId,
    selectedCycleId,
    selectedPostDeliveryEventId,
  );
  const specialValidationProfileMutation =
    useServiceSpecialValidationProfileMutation(orgId, selectedModelId);
  const specialValidationEventMutation =
    useServiceSpecialValidationEventMutation(
      orgId,
      selectedModelId,
      modelDetail?.specialValidationProfile?.id,
    );

  const { data: processesData } = useAllActiveSgqProcesses(orgId);
  const processes = processesData ?? [];
  const { data: units = [] } = useListUnits(orgId ?? 0, {
    query: {
      enabled: !!orgId,
      queryKey: getListUnitsQueryKey(orgId ?? 0),
    },
  });
  const { data: documents = [] } = useListDocuments(
    orgId ?? 0,
    { page: 1, pageSize: MAX_LIST_ITEMS },
    {
      query: {
        enabled: !!orgId,
        queryKey: getListDocumentsQueryKey(orgId ?? 0, {
          page: 1,
          pageSize: MAX_LIST_ITEMS,
        }),
      },
    },
  );
  const { data: contacts = [] } = useListOrganizationContacts(
    orgId ?? 0,
    { includeArchived: false },
    {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationContactsQueryKey(orgId ?? 0, {
          includeArchived: false,
        }),
      },
    },
  );
  const { data: users = [] } = useListUserOptions(
    orgId ?? 0,
    {},
    {
      query: {
        enabled: !!orgId,
        queryKey: getListUserOptionsQueryKey(orgId ?? 0),
      },
    },
  );
  const { data: nonconformityList } = useNonconformities(orgId, {
    page: 1,
    pageSize: MAX_LIST_ITEMS,
  });
  const systemicNonconformities = nonconformityList?.data ?? [];

  useEffect(() => {
    if (models.length === 0) {
      setSelectedModelId(undefined);
      setSelectedNonconformingOutputId(undefined);
      setSelectedThirdPartyPropertyId(undefined);
      setSelectedPostDeliveryEventId(undefined);
      setIsCreatingNonconformingOutput(false);
      setIsCreatingThirdPartyProperty(false);
      setIsCreatingPostDeliveryEvent(false);
      setModelForm(emptyModelForm());
      setSpecialValidationProfileForm(emptySpecialValidationProfileForm());
      setSpecialValidationEventForm(emptySpecialValidationEventForm());
      return;
    }

    if (
      !selectedModelId ||
      !models.some((model) => model.id === selectedModelId)
    ) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  useEffect(() => {
    if (!modelDetail) return;

    setModelForm({
      name: modelDetail.name,
      description: modelDetail.description ?? "",
      processId: modelDetail.processId ? String(modelDetail.processId) : "",
      unitId: modelDetail.unitId ? String(modelDetail.unitId) : "",
      requiresSpecialValidation: modelDetail.requiresSpecialValidation,
      status: modelDetail.status,
      documentIds: modelDetail.documents.map((document) => document.id),
      checkpoints: modelDetail.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        kind: checkpoint.kind,
        label: checkpoint.label,
        acceptanceCriteria: checkpoint.acceptanceCriteria ?? "",
        guidance: checkpoint.guidance ?? "",
        isRequired: checkpoint.isRequired,
        requiresEvidence: checkpoint.requiresEvidence,
        sortOrder: checkpoint.sortOrder,
      })),
    });
    setCycleForm(emptyCycleForm(modelDetail));
    setSpecialValidationProfileForm({
      title: modelDetail.specialValidationProfile?.title ?? "",
      criteria: modelDetail.specialValidationProfile?.criteria ?? "",
      method: modelDetail.specialValidationProfile?.method ?? "",
      status: modelDetail.specialValidationProfile?.status ?? "draft",
      responsibleUserId: modelDetail.specialValidationProfile?.responsibleUserId
        ? String(modelDetail.specialValidationProfile.responsibleUserId)
        : "",
      currentValidUntil: formatDateTimeLocalInput(
        modelDetail.specialValidationProfile?.currentValidUntil,
      ),
      notes: modelDetail.specialValidationProfile?.notes ?? "",
    });
    setSpecialValidationEventForm(
      emptySpecialValidationEventForm(
        modelDetail.specialValidationProfile ?? null,
      ),
    );
  }, [modelDetail]);

  useEffect(() => {
    if (!selectedModelId) {
      setSelectedCycleId(undefined);
      return;
    }

    if (cycles.length === 0) {
      setSelectedCycleId(undefined);
      setSelectedNonconformingOutputId(undefined);
      setSelectedThirdPartyPropertyId(undefined);
      setSelectedPostDeliveryEventId(undefined);
      setIsCreatingNonconformingOutput(false);
      setIsCreatingThirdPartyProperty(false);
      setIsCreatingPostDeliveryEvent(false);
      setCycleCheckpoints([]);
      setReleaseForm(emptyReleaseForm());
      setNonconformingOutputForm(emptyNonconformingOutputForm());
      setThirdPartyPropertyForm(emptyThirdPartyPropertyForm());
      setPreservationDeliveryForm(emptyPreservationDeliveryForm());
      setPostDeliveryEventForm(emptyPostDeliveryEventForm());
      return;
    }

    if (
      !selectedCycleId ||
      !cycles.some((cycle) => cycle.id === selectedCycleId)
    ) {
      setSelectedCycleId(cycles[0].id);
    }
  }, [cycles, selectedCycleId, selectedModelId]);

  useEffect(() => {
    if (!cycleDetail) return;

    setCycleForm({
      title: cycleDetail.title,
      serviceOrderRef: cycleDetail.serviceOrderRef ?? "",
      outputIdentifier: cycleDetail.outputIdentifier ?? "",
      processId: cycleDetail.processId ? String(cycleDetail.processId) : "",
      unitId: cycleDetail.unitId ? String(cycleDetail.unitId) : "",
      customerContactId: cycleDetail.customerContactId
        ? String(cycleDetail.customerContactId)
        : "",
      documentIds: cycleDetail.documents.map((document) => document.id),
    });
    setCycleCheckpoints(
      cycleDetail.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        label: checkpoint.label,
        kind: checkpoint.kind,
        acceptanceCriteria: checkpoint.acceptanceCriteria ?? "",
        guidance: checkpoint.guidance ?? "",
        isRequired: checkpoint.isRequired,
        requiresEvidence: checkpoint.requiresEvidence,
        sortOrder: checkpoint.sortOrder,
        status: checkpoint.status,
        notes: checkpoint.notes ?? "",
        evidenceAttachments: checkpoint.evidenceAttachments,
        checkedByName: checkpoint.checkedByName,
        checkedAt: checkpoint.checkedAt,
      })),
    );
    setReleaseForm({
      decision: cycleDetail.releaseRecord?.decision ?? "approved",
      decisionNotes: cycleDetail.releaseRecord?.decisionNotes ?? "",
      blockingIssuesText:
        cycleDetail.releaseRecord?.blockingIssues.join("\n") ??
        cycleDetail.pendingBlockingIssues.join("\n"),
      evidenceAttachments: cycleDetail.releaseRecord?.evidenceAttachments ?? [],
    });
    setPreservationDeliveryForm({
      preservationNotes:
        cycleDetail.preservationDeliveryRecord?.preservationNotes ?? "",
      preservationMethod:
        cycleDetail.preservationDeliveryRecord?.preservationMethod ?? "",
      packagingNotes:
        cycleDetail.preservationDeliveryRecord?.packagingNotes ?? "",
      deliveryNotes:
        cycleDetail.preservationDeliveryRecord?.deliveryNotes ?? "",
      deliveryRecipient:
        cycleDetail.preservationDeliveryRecord?.deliveryRecipient ?? "",
      deliveryMethod:
        cycleDetail.preservationDeliveryRecord?.deliveryMethod ?? "",
      deliveredById: cycleDetail.preservationDeliveryRecord?.deliveredById
        ? String(cycleDetail.preservationDeliveryRecord.deliveredById)
        : "",
      preservationEvidenceAttachments:
        cycleDetail.preservationDeliveryRecord
          ?.preservationEvidenceAttachments ?? [],
      deliveryEvidenceAttachments:
        cycleDetail.preservationDeliveryRecord?.deliveryEvidenceAttachments ??
        [],
      preservedAt: formatDateTimeLocalInput(
        cycleDetail.preservationDeliveryRecord?.preservedAt,
      ),
      deliveredAt: formatDateTimeLocalInput(
        cycleDetail.preservationDeliveryRecord?.deliveredAt,
      ),
    });
  }, [cycleDetail]);

  useEffect(() => {
    const outputs = cycleDetail?.nonconformingOutputs ?? [];
    if (outputs.length === 0) {
      setSelectedNonconformingOutputId(undefined);
      setIsCreatingNonconformingOutput(false);
      setNonconformingOutputForm(emptyNonconformingOutputForm());
      return;
    }

    if (isCreatingNonconformingOutput) {
      return;
    }

    if (
      !selectedNonconformingOutputId ||
      !outputs.some((output) => output.id === selectedNonconformingOutputId)
    ) {
      setSelectedNonconformingOutputId(outputs[0].id);
    }
  }, [
    cycleDetail?.nonconformingOutputs,
    isCreatingNonconformingOutput,
    selectedNonconformingOutputId,
  ]);

  useEffect(() => {
    const items = cycleDetail?.thirdPartyProperties ?? [];
    if (items.length === 0) {
      setSelectedThirdPartyPropertyId(undefined);
      setIsCreatingThirdPartyProperty(false);
      setThirdPartyPropertyForm(emptyThirdPartyPropertyForm());
      return;
    }

    if (isCreatingThirdPartyProperty) {
      return;
    }

    if (
      !selectedThirdPartyPropertyId ||
      !items.some((item) => item.id === selectedThirdPartyPropertyId)
    ) {
      setSelectedThirdPartyPropertyId(items[0].id);
    }
  }, [
    cycleDetail?.thirdPartyProperties,
    isCreatingThirdPartyProperty,
    selectedThirdPartyPropertyId,
  ]);

  useEffect(() => {
    const selectedProperty = cycleDetail?.thirdPartyProperties.find(
      (item) => item.id === selectedThirdPartyPropertyId,
    );

    if (!selectedProperty) {
      if (selectedThirdPartyPropertyId === undefined) {
        setThirdPartyPropertyForm(emptyThirdPartyPropertyForm());
      }
      return;
    }

    setIsCreatingThirdPartyProperty(false);
    setThirdPartyPropertyForm({
      title: selectedProperty.title,
      ownerName: selectedProperty.ownerName,
      description: selectedProperty.description ?? "",
      conditionOnReceipt: selectedProperty.conditionOnReceipt ?? "",
      handlingRequirements: selectedProperty.handlingRequirements ?? "",
      status: selectedProperty.status,
      responsibleUserId: selectedProperty.responsibleUserId
        ? String(selectedProperty.responsibleUserId)
        : "",
      evidenceAttachments: selectedProperty.evidenceAttachments,
    });
  }, [cycleDetail, selectedThirdPartyPropertyId]);

  useEffect(() => {
    const items = cycleDetail?.postDeliveryEvents ?? [];
    if (items.length === 0) {
      setSelectedPostDeliveryEventId(undefined);
      setIsCreatingPostDeliveryEvent(false);
      setPostDeliveryEventForm(emptyPostDeliveryEventForm());
      return;
    }

    if (isCreatingPostDeliveryEvent) {
      return;
    }

    if (
      !selectedPostDeliveryEventId ||
      !items.some((item) => item.id === selectedPostDeliveryEventId)
    ) {
      setSelectedPostDeliveryEventId(items[0].id);
    }
  }, [
    cycleDetail?.postDeliveryEvents,
    isCreatingPostDeliveryEvent,
    selectedPostDeliveryEventId,
  ]);

  useEffect(() => {
    const selectedEvent = cycleDetail?.postDeliveryEvents.find(
      (item) => item.id === selectedPostDeliveryEventId,
    );

    if (!selectedEvent) {
      if (selectedPostDeliveryEventId === undefined) {
        setPostDeliveryEventForm(emptyPostDeliveryEventForm());
      }
      return;
    }

    setIsCreatingPostDeliveryEvent(false);
    setPostDeliveryEventForm({
      eventType: selectedEvent.eventType,
      title: selectedEvent.title,
      description: selectedEvent.description,
      status: selectedEvent.status,
      followUpNotes: selectedEvent.followUpNotes ?? "",
      responsibleUserId: selectedEvent.responsibleUserId
        ? String(selectedEvent.responsibleUserId)
        : "",
      evidenceAttachments: selectedEvent.evidenceAttachments,
      occurredAt: formatDateTimeLocalInput(selectedEvent.occurredAt),
    });
  }, [cycleDetail, selectedPostDeliveryEventId]);

  useEffect(() => {
    const selectedOutput = cycleDetail?.nonconformingOutputs.find(
      (output) => output.id === selectedNonconformingOutputId,
    );

    if (!selectedOutput) {
      if (selectedNonconformingOutputId === undefined) {
        setNonconformingOutputForm(emptyNonconformingOutputForm());
      }
      return;
    }

    setIsCreatingNonconformingOutput(false);

    setNonconformingOutputForm({
      title: selectedOutput.title,
      description: selectedOutput.description,
      impact: selectedOutput.impact,
      status: selectedOutput.status,
      disposition: selectedOutput.disposition ?? "",
      dispositionNotes: selectedOutput.dispositionNotes ?? "",
      responsibleUserId: selectedOutput.responsibleUserId
        ? String(selectedOutput.responsibleUserId)
        : "",
      linkedNonconformityId: selectedOutput.linkedNonconformityId
        ? String(selectedOutput.linkedNonconformityId)
        : "",
      evidenceAttachments: selectedOutput.evidenceAttachments,
    });
  }, [cycleDetail, selectedNonconformingOutputId]);

  const customerOptions = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.classificationType === "customer" ||
          contact.classificationType === "other",
      ),
    [contacts],
  );

  const cycleFilterFields = selectedModelId ? (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <Input
        value={cycleFilters.search}
        onChange={(event) =>
          setCycleFilters((current) => ({
            ...current,
            search: event.target.value,
          }))
        }
        placeholder="Buscar por ciclo, cliente, processo ou unidade"
      />
      <Select
        value={cycleFilters.processId}
        onChange={(event) =>
          setCycleFilters((current) => ({
            ...current,
            processId: event.target.value,
          }))
        }
      >
        <option value="">Todos os processos</option>
        {processes.map((process) => (
          <option key={process.id} value={process.id}>
            {process.name}
          </option>
        ))}
      </Select>
      <Select
        value={cycleFilters.unitId}
        onChange={(event) =>
          setCycleFilters((current) => ({
            ...current,
            unitId: event.target.value,
          }))
        }
      >
        <option value="">Todas as unidades</option>
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name}
          </option>
        ))}
      </Select>
      <Select
        value={cycleFilters.customerContactId}
        onChange={(event) =>
          setCycleFilters((current) => ({
            ...current,
            customerContactId: event.target.value,
          }))
        }
      >
        <option value="">Todos os clientes</option>
        {customerOptions.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.name}
          </option>
        ))}
      </Select>
    </div>
  ) : null;

  const handleNewModel = () => {
    setSelectedModelId(undefined);
    setSelectedCycleId(undefined);
    setSelectedNonconformingOutputId(undefined);
    setSelectedThirdPartyPropertyId(undefined);
    setSelectedPostDeliveryEventId(undefined);
    setIsCreatingNonconformingOutput(false);
    setIsCreatingThirdPartyProperty(false);
    setIsCreatingPostDeliveryEvent(false);
    setModelForm(emptyModelForm());
    setCycleForm(emptyCycleForm());
    setCycleCheckpoints([]);
    setReleaseForm(emptyReleaseForm());
    setNonconformingOutputForm(emptyNonconformingOutputForm());
    setThirdPartyPropertyForm(emptyThirdPartyPropertyForm());
    setPreservationDeliveryForm(emptyPreservationDeliveryForm());
    setPostDeliveryEventForm(emptyPostDeliveryEventForm());
    setSpecialValidationProfileForm(emptySpecialValidationProfileForm());
    setSpecialValidationEventForm(emptySpecialValidationEventForm());
  };

  const handleSaveModel = async () => {
    if (!modelForm.name.trim()) {
      toast({ title: "Informe o nome do modelo", variant: "destructive" });
      return;
    }

    const checkpoints = modelForm.checkpoints
      .map((checkpoint, index) => ({
        ...checkpoint,
        label: checkpoint.label.trim(),
        acceptanceCriteria: checkpoint.acceptanceCriteria.trim(),
        guidance: checkpoint.guidance.trim(),
        sortOrder: index,
      }))
      .filter((checkpoint) => checkpoint.label);

    if (checkpoints.length === 0) {
      toast({
        title: "Adicione pelo menos um checkpoint",
        variant: "destructive",
      });
      return;
    }

    try {
      const payload = {
        name: modelForm.name.trim(),
        description: modelForm.description.trim() || null,
        processId: modelForm.processId ? Number(modelForm.processId) : null,
        unitId: modelForm.unitId ? Number(modelForm.unitId) : null,
        requiresSpecialValidation: modelForm.requiresSpecialValidation,
        status: modelForm.status,
        documentIds: modelForm.documentIds,
        checkpoints: checkpoints.map((checkpoint) => ({
          kind: checkpoint.kind,
          label: checkpoint.label,
          acceptanceCriteria: checkpoint.acceptanceCriteria || null,
          guidance: checkpoint.guidance || null,
          isRequired: checkpoint.isRequired,
          requiresEvidence: checkpoint.requiresEvidence,
          sortOrder: checkpoint.sortOrder,
        })),
      };

      const saved = await modelMutation.mutateAsync({
        method: selectedModelId ? "PATCH" : "POST",
        body: payload,
      });
      setSelectedModelId(saved.id);
      toast({
        title: selectedModelId ? "Modelo atualizado" : "Modelo criado",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar o modelo",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleNewCycle = () => {
    if (!modelDetail) {
      toast({
        title: "Selecione um modelo para abrir um ciclo",
        variant: "destructive",
      });
      return;
    }

    setSelectedCycleId(undefined);
    setSelectedNonconformingOutputId(undefined);
    setSelectedThirdPartyPropertyId(undefined);
    setSelectedPostDeliveryEventId(undefined);
    setIsCreatingNonconformingOutput(false);
    setIsCreatingThirdPartyProperty(false);
    setIsCreatingPostDeliveryEvent(false);
    setCycleForm(emptyCycleForm(modelDetail));
    setCycleCheckpoints([]);
    setReleaseForm(emptyReleaseForm());
    setNonconformingOutputForm(emptyNonconformingOutputForm());
    setThirdPartyPropertyForm(emptyThirdPartyPropertyForm());
    setPreservationDeliveryForm(emptyPreservationDeliveryForm());
    setPostDeliveryEventForm(emptyPostDeliveryEventForm());
  };

  const handleCreateCycle = async () => {
    if (!selectedModelId) {
      toast({ title: "Selecione um modelo", variant: "destructive" });
      return;
    }
    if (!cycleForm.title.trim()) {
      toast({ title: "Informe o título do ciclo", variant: "destructive" });
      return;
    }

    try {
      const created = await cycleMutation.mutateAsync({
        method: "POST",
        body: {
          modelId: selectedModelId,
          title: cycleForm.title.trim(),
          serviceOrderRef: cycleForm.serviceOrderRef.trim() || null,
          outputIdentifier: cycleForm.outputIdentifier.trim() || null,
          processId: cycleForm.processId ? Number(cycleForm.processId) : null,
          unitId: cycleForm.unitId ? Number(cycleForm.unitId) : null,
          customerContactId: cycleForm.customerContactId
            ? Number(cycleForm.customerContactId)
            : null,
          documentIds: cycleForm.documentIds,
        },
      });
      setSelectedCycleId(created.id);
      toast({ title: "Ciclo criado" });
    } catch (error) {
      toast({
        title: "Não foi possível criar o ciclo",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleSaveCycle = async () => {
    if (!selectedCycleId) {
      toast({
        title: "Crie ou selecione um ciclo primeiro",
        variant: "destructive",
      });
      return;
    }

    try {
      await cycleMutation.mutateAsync({
        method: "PATCH",
        body: {
          title: cycleForm.title.trim(),
          serviceOrderRef: cycleForm.serviceOrderRef.trim() || null,
          outputIdentifier: cycleForm.outputIdentifier.trim() || null,
          processId: cycleForm.processId ? Number(cycleForm.processId) : null,
          unitId: cycleForm.unitId ? Number(cycleForm.unitId) : null,
          customerContactId: cycleForm.customerContactId
            ? Number(cycleForm.customerContactId)
            : null,
          documentIds: cycleForm.documentIds,
          checkpoints: cycleCheckpoints.map((checkpoint) => ({
            id: checkpoint.id,
            status: checkpoint.status,
            notes: checkpoint.notes.trim() || null,
            evidenceAttachments: checkpoint.evidenceAttachments,
          })),
        },
      });
      toast({ title: "Ciclo atualizado" });
    } catch (error) {
      toast({
        title: "Não foi possível salvar o ciclo",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleRelease = async () => {
    if (!selectedCycleId) {
      toast({ title: "Selecione um ciclo", variant: "destructive" });
      return;
    }

    try {
      await releaseMutation.mutateAsync({
        decision: releaseForm.decision,
        decisionNotes: releaseForm.decisionNotes.trim() || null,
        blockingIssues: parseBlockingIssues(releaseForm.blockingIssuesText),
        evidenceAttachments: releaseForm.evidenceAttachments,
      });
      toast({ title: "Liberação registrada" });
    } catch (error) {
      toast({
        title: "Não foi possível registrar a liberação",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUploadCheckpointAttachments = async (
    checkpointId: number,
    files: FileList | null,
  ) => {
    const fileArray = Array.from(files ?? []);
    const checkpoint = cycleCheckpoints.find(
      (item) => item.id === checkpointId,
    );
    if (!checkpoint || fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      checkpoint.evidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setUploadingCheckpointId(checkpointId);
      const uploaded = await uploadFilesToStorage(fileArray);
      setCycleCheckpoints((current) =>
        current.map((item) =>
          item.id === checkpointId
            ? {
                ...item,
                evidenceAttachments: [...item.evidenceAttachments, ...uploaded],
              }
            : item,
        ),
      );
    } catch (error) {
      toast({
        title: "Falha ao enviar anexos do checkpoint",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploadingCheckpointId(null);
    }
  };

  const handleUploadReleaseAttachments = async (files: FileList | null) => {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      releaseForm.evidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setReleaseUploading(true);
      const uploaded = await uploadFilesToStorage(fileArray);
      setReleaseForm((current) => ({
        ...current,
        evidenceAttachments: [...current.evidenceAttachments, ...uploaded],
      }));
    } catch (error) {
      toast({
        title: "Falha ao enviar anexos da liberação",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setReleaseUploading(false);
    }
  };

  const handleNewNonconformingOutput = () => {
    if (!selectedCycleId) {
      toast({
        title: "Selecione um ciclo para registrar a saída não conforme",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingNonconformingOutput(true);
    setSelectedNonconformingOutputId(undefined);
    setNonconformingOutputForm(emptyNonconformingOutputForm());
  };

  const handleSaveNonconformingOutput = async () => {
    if (!selectedCycleId) {
      toast({ title: "Selecione um ciclo", variant: "destructive" });
      return;
    }
    if (!nonconformingOutputForm.title.trim()) {
      toast({
        title: "Informe o título da saída não conforme",
        variant: "destructive",
      });
      return;
    }
    if (!nonconformingOutputForm.description.trim()) {
      toast({
        title: "Descreva a ocorrência operacional",
        variant: "destructive",
      });
      return;
    }
    if (!nonconformingOutputForm.impact.trim()) {
      toast({
        title: "Descreva o impacto da saída não conforme",
        variant: "destructive",
      });
      return;
    }
    if (
      nonconformingOutputForm.status !== "open" &&
      !nonconformingOutputForm.disposition
    ) {
      toast({
        title: "Informe a disposição adotada",
        variant: "destructive",
      });
      return;
    }

    try {
      const saved = await nonconformingOutputMutation.mutateAsync({
        method: selectedNonconformingOutputId ? "PATCH" : "POST",
        body: {
          title: nonconformingOutputForm.title.trim(),
          description: nonconformingOutputForm.description.trim(),
          impact: nonconformingOutputForm.impact.trim(),
          status: nonconformingOutputForm.status,
          disposition: nonconformingOutputForm.disposition || null,
          dispositionNotes:
            nonconformingOutputForm.dispositionNotes.trim() || null,
          responsibleUserId: nonconformingOutputForm.responsibleUserId
            ? Number(nonconformingOutputForm.responsibleUserId)
            : null,
          linkedNonconformityId: nonconformingOutputForm.linkedNonconformityId
            ? Number(nonconformingOutputForm.linkedNonconformityId)
            : null,
          evidenceAttachments: nonconformingOutputForm.evidenceAttachments,
        },
      });
      setIsCreatingNonconformingOutput(false);
      setSelectedNonconformingOutputId(saved.id);
      toast({
        title: selectedNonconformingOutputId
          ? "Saída não conforme atualizada"
          : "Saída não conforme registrada",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar a saída não conforme",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUploadNonconformingOutputAttachments = async (
    files: FileList | null,
  ) => {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      nonconformingOutputForm.evidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setNonconformingOutputUploading(true);
      const uploaded = await uploadFilesToStorage(fileArray);
      setNonconformingOutputForm((current) => ({
        ...current,
        evidenceAttachments: [...current.evidenceAttachments, ...uploaded],
      }));
    } catch (error) {
      toast({
        title: "Falha ao enviar evidências da saída não conforme",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setNonconformingOutputUploading(false);
    }
  };

  const handleNewThirdPartyProperty = () => {
    if (!selectedCycleId) {
      toast({ title: "Selecione um ciclo", variant: "destructive" });
      return;
    }
    setIsCreatingThirdPartyProperty(true);
    setSelectedThirdPartyPropertyId(undefined);
    setThirdPartyPropertyForm(emptyThirdPartyPropertyForm());
  };

  const handleSaveThirdPartyProperty = async () => {
    if (!selectedCycleId) {
      toast({ title: "Selecione um ciclo", variant: "destructive" });
      return;
    }
    if (
      !thirdPartyPropertyForm.title.trim() ||
      !thirdPartyPropertyForm.ownerName.trim()
    ) {
      toast({
        title: "Informe o item e o proprietário",
        variant: "destructive",
      });
      return;
    }

    try {
      const saved = await thirdPartyPropertyMutation.mutateAsync({
        method: selectedThirdPartyPropertyId ? "PATCH" : "POST",
        body: {
          title: thirdPartyPropertyForm.title.trim(),
          ownerName: thirdPartyPropertyForm.ownerName.trim(),
          description: thirdPartyPropertyForm.description.trim() || null,
          conditionOnReceipt:
            thirdPartyPropertyForm.conditionOnReceipt.trim() || null,
          handlingRequirements:
            thirdPartyPropertyForm.handlingRequirements.trim() || null,
          status: thirdPartyPropertyForm.status,
          responsibleUserId: thirdPartyPropertyForm.responsibleUserId
            ? Number(thirdPartyPropertyForm.responsibleUserId)
            : null,
          evidenceAttachments: thirdPartyPropertyForm.evidenceAttachments,
        },
      });
      setIsCreatingThirdPartyProperty(false);
      setSelectedThirdPartyPropertyId(saved.id);
      toast({
        title: selectedThirdPartyPropertyId
          ? "Propriedade de terceiros atualizada"
          : "Propriedade de terceiros registrada",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar a propriedade de terceiros",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUploadThirdPartyPropertyAttachments = async (
    files: FileList | null,
  ) => {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      thirdPartyPropertyForm.evidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setThirdPartyPropertyUploading(true);
      const uploaded = await uploadFilesToStorage(fileArray);
      setThirdPartyPropertyForm((current) => ({
        ...current,
        evidenceAttachments: [...current.evidenceAttachments, ...uploaded],
      }));
    } catch (error) {
      toast({
        title: "Falha ao enviar anexos da propriedade de terceiros",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setThirdPartyPropertyUploading(false);
    }
  };

  const handleSavePreservationDelivery = async () => {
    if (!selectedCycleId) {
      toast({ title: "Selecione um ciclo", variant: "destructive" });
      return;
    }

    try {
      await preservationDeliveryMutation.mutateAsync({
        preservationNotes:
          preservationDeliveryForm.preservationNotes.trim() || null,
        preservationMethod:
          preservationDeliveryForm.preservationMethod.trim() || null,
        packagingNotes: preservationDeliveryForm.packagingNotes.trim() || null,
        deliveryNotes: preservationDeliveryForm.deliveryNotes.trim() || null,
        deliveryRecipient:
          preservationDeliveryForm.deliveryRecipient.trim() || null,
        deliveryMethod: preservationDeliveryForm.deliveryMethod.trim() || null,
        deliveredById: preservationDeliveryForm.deliveredById
          ? Number(preservationDeliveryForm.deliveredById)
          : null,
        preservationEvidenceAttachments:
          preservationDeliveryForm.preservationEvidenceAttachments,
        deliveryEvidenceAttachments:
          preservationDeliveryForm.deliveryEvidenceAttachments,
        preservedAt: preservationDeliveryForm.preservedAt
          ? new Date(preservationDeliveryForm.preservedAt).toISOString()
          : null,
        deliveredAt: preservationDeliveryForm.deliveredAt
          ? new Date(preservationDeliveryForm.deliveredAt).toISOString()
          : null,
      });
      toast({ title: "Preservação e entrega atualizadas" });
    } catch (error) {
      toast({
        title: "Não foi possível salvar preservação e entrega",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUploadPreservationAttachments = async (
    files: FileList | null,
  ) => {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      preservationDeliveryForm.preservationEvidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setPreservationUploading(true);
      const uploaded = await uploadFilesToStorage(fileArray);
      setPreservationDeliveryForm((current) => ({
        ...current,
        preservationEvidenceAttachments: [
          ...current.preservationEvidenceAttachments,
          ...uploaded,
        ],
      }));
    } catch (error) {
      toast({
        title: "Falha ao enviar evidências de preservação",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setPreservationUploading(false);
    }
  };

  const handleUploadDeliveryAttachments = async (files: FileList | null) => {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      preservationDeliveryForm.deliveryEvidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setDeliveryUploading(true);
      const uploaded = await uploadFilesToStorage(fileArray);
      setPreservationDeliveryForm((current) => ({
        ...current,
        deliveryEvidenceAttachments: [
          ...current.deliveryEvidenceAttachments,
          ...uploaded,
        ],
      }));
    } catch (error) {
      toast({
        title: "Falha ao enviar evidências de entrega",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDeliveryUploading(false);
    }
  };

  const handleNewPostDeliveryEvent = () => {
    if (!selectedCycleId) {
      toast({ title: "Selecione um ciclo", variant: "destructive" });
      return;
    }
    setIsCreatingPostDeliveryEvent(true);
    setSelectedPostDeliveryEventId(undefined);
    setPostDeliveryEventForm(emptyPostDeliveryEventForm());
  };

  const handleSavePostDeliveryEvent = async () => {
    if (!selectedCycleId) {
      toast({ title: "Selecione um ciclo", variant: "destructive" });
      return;
    }
    if (
      !postDeliveryEventForm.title.trim() ||
      !postDeliveryEventForm.description.trim()
    ) {
      toast({
        title: "Informe título e descrição do evento",
        variant: "destructive",
      });
      return;
    }

    try {
      const saved = await postDeliveryEventMutation.mutateAsync({
        method: selectedPostDeliveryEventId ? "PATCH" : "POST",
        body: {
          eventType: postDeliveryEventForm.eventType,
          title: postDeliveryEventForm.title.trim(),
          description: postDeliveryEventForm.description.trim(),
          status: postDeliveryEventForm.status,
          followUpNotes: postDeliveryEventForm.followUpNotes.trim() || null,
          responsibleUserId: postDeliveryEventForm.responsibleUserId
            ? Number(postDeliveryEventForm.responsibleUserId)
            : null,
          evidenceAttachments: postDeliveryEventForm.evidenceAttachments,
          occurredAt: postDeliveryEventForm.occurredAt
            ? new Date(postDeliveryEventForm.occurredAt).toISOString()
            : null,
        },
      });
      setIsCreatingPostDeliveryEvent(false);
      setSelectedPostDeliveryEventId(saved.id);
      toast({
        title: selectedPostDeliveryEventId
          ? "Evento de pós-serviço atualizado"
          : "Evento de pós-serviço registrado",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar o evento de pós-serviço",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUploadPostDeliveryAttachments = async (
    files: FileList | null,
  ) => {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      postDeliveryEventForm.evidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setPostDeliveryUploading(true);
      const uploaded = await uploadFilesToStorage(fileArray);
      setPostDeliveryEventForm((current) => ({
        ...current,
        evidenceAttachments: [...current.evidenceAttachments, ...uploaded],
      }));
    } catch (error) {
      toast({
        title: "Falha ao enviar evidências do pós-serviço",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setPostDeliveryUploading(false);
    }
  };

  const handleSaveSpecialValidationProfile = async () => {
    if (!selectedModelId) {
      toast({ title: "Selecione um modelo", variant: "destructive" });
      return;
    }
    if (
      !specialValidationProfileForm.title.trim() ||
      !specialValidationProfileForm.criteria.trim()
    ) {
      toast({
        title: "Informe título e critérios da validação",
        variant: "destructive",
      });
      return;
    }

    try {
      await specialValidationProfileMutation.mutateAsync({
        title: specialValidationProfileForm.title.trim(),
        criteria: specialValidationProfileForm.criteria.trim(),
        method: specialValidationProfileForm.method.trim() || null,
        status: specialValidationProfileForm.status,
        responsibleUserId: specialValidationProfileForm.responsibleUserId
          ? Number(specialValidationProfileForm.responsibleUserId)
          : null,
        currentValidUntil: specialValidationProfileForm.currentValidUntil
          ? new Date(
              specialValidationProfileForm.currentValidUntil,
            ).toISOString()
          : null,
        notes: specialValidationProfileForm.notes.trim() || null,
      });
      toast({ title: "Perfil de validação especial atualizado" });
    } catch (error) {
      toast({
        title: "Não foi possível salvar a validação especial",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleSaveSpecialValidationEvent = async () => {
    if (!selectedModelId || !modelDetail?.specialValidationProfile?.id) {
      toast({
        title: "Salve primeiro o perfil de validação especial",
        variant: "destructive",
      });
      return;
    }
    if (!specialValidationEventForm.criteriaSnapshot.trim()) {
      toast({
        title: "Informe o snapshot dos critérios",
        variant: "destructive",
      });
      return;
    }

    try {
      await specialValidationEventMutation.mutateAsync({
        eventType: specialValidationEventForm.eventType,
        result: specialValidationEventForm.result,
        criteriaSnapshot: specialValidationEventForm.criteriaSnapshot.trim(),
        notes: specialValidationEventForm.notes.trim() || null,
        validUntil: specialValidationEventForm.validUntil
          ? new Date(specialValidationEventForm.validUntil).toISOString()
          : null,
        validatedById: specialValidationEventForm.validatedById
          ? Number(specialValidationEventForm.validatedById)
          : null,
        evidenceAttachments: specialValidationEventForm.evidenceAttachments,
      });
      setSpecialValidationEventForm(
        emptySpecialValidationEventForm(
          modelDetail.specialValidationProfile ?? null,
        ),
      );
      toast({ title: "Validação/revalidação registrada" });
    } catch (error) {
      toast({
        title: "Não foi possível registrar o evento de validação",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUploadSpecialValidationEventAttachments = async (
    files: FileList | null,
  ) => {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      fileArray,
      specialValidationEventForm.evidenceAttachments.length,
    );
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    try {
      setSpecialValidationEventUploading(true);
      const uploaded = await uploadFilesToStorage(fileArray);
      setSpecialValidationEventForm((current) => ({
        ...current,
        evidenceAttachments: [...current.evidenceAttachments, ...uploaded],
      }));
    } catch (error) {
      toast({
        title: "Falha ao enviar evidências da validação especial",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSpecialValidationEventUploading(false);
    }
  };

  const pendingBlockingIssues = cycleDetail?.pendingBlockingIssues ?? [];
  const operationalOutputs = cycleDetail?.nonconformingOutputs ?? [];
  const thirdPartyProperties = cycleDetail?.thirdPartyProperties ?? [];
  const postDeliveryEvents = cycleDetail?.postDeliveryEvents ?? [];
  const specialValidationProfile =
    modelDetail?.specialValidationProfile ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Camada operacional do macro E</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Estruture modelos reutilizáveis de execução, abra ciclos auditáveis e
          formalize a liberação da saída com evidências e pendências
          impeditivas.
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Modelos</CardTitle>
              {canWrite ? (
                <Button size="sm" type="button" onClick={handleNewModel}>
                  Novo
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingModels ? (
              <p className="text-sm text-muted-foreground">
                Carregando modelos...
              </p>
            ) : models.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum modelo cadastrado ainda.
              </p>
            ) : (
              models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedModelId(model.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                    selectedModelId === model.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{model.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {model.processName ?? "Sem processo"} •{" "}
                        {model.unitName ?? "Sem unidade"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        model.status === "active" ? "default" : "secondary"
                      }
                    >
                      {statusLabel(model.status)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {model.requiredCheckpointCount}/{model.checkpointCount}{" "}
                    checkpoints obrigatórios • {model.documentCount}{" "}
                    documento(s)
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>
              {selectedModelId
                ? "Detalhes do modelo"
                : "Novo modelo de execução"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Associe o fluxo a um processo SGQ, unidade e documentos
              controlados.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Nome do modelo *</Label>
                <Input
                  className="mt-1"
                  value={modelForm.name}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  className="mt-1"
                  value={modelForm.status}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      status: event.target.value as ModelFormState["status"],
                    }))
                  }
                  disabled={!canWrite}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  className="mt-1 min-h-24"
                  value={modelForm.description}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label>Processo SGQ</Label>
                <Select
                  className="mt-1"
                  value={modelForm.processId}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      processId: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                >
                  <option value="">Sem vínculo</option>
                  {processes.map((process) => (
                    <option key={process.id} value={process.id}>
                      {process.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select
                  className="mt-1"
                  value={modelForm.unitId}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      unitId: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                >
                  <option value="">Sem vínculo</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-border px-3 py-3">
                <input
                  id="requires-special-validation"
                  type="checkbox"
                  checked={modelForm.requiresSpecialValidation}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      requiresSpecialValidation: event.target.checked,
                    }))
                  }
                  disabled={!canWrite}
                />
                <Label htmlFor="requires-special-validation" className="m-0">
                  Exige validação especial do processo quando aplicável
                </Label>
              </div>
              <div className="md:col-span-2">
                <Label>Documentos vinculados</Label>
                <select
                  multiple
                  className="mt-1 min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={modelForm.documentIds.map(String)}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      documentIds: parseMultiSelectValues(event),
                    }))
                  }
                  disabled={!canWrite}
                >
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Segure `Ctrl` ou `Cmd` para selecionar vários documentos.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Checkpoints e controles
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Inclua critérios, obrigatoriedade e exigência de evidência.
                  </p>
                </div>
                {canWrite ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setModelForm((current) => ({
                        ...current,
                        checkpoints: [
                          ...current.checkpoints,
                          emptyCheckpointDraft(current.checkpoints.length),
                        ],
                      }))
                    }
                  >
                    Adicionar checkpoint
                  </Button>
                ) : null}
              </div>

              {modelForm.checkpoints.map((checkpoint, index) => (
                <Card
                  key={checkpoint.id ?? `new-${index}`}
                  className="border-dashed"
                >
                  <CardContent className="pt-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Tipo</Label>
                        <Select
                          className="mt-1"
                          value={checkpoint.kind}
                          onChange={(event) =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        kind: event.target
                                          .value as ModelCheckpointDraft["kind"],
                                      }
                                    : item,
                              ),
                            }))
                          }
                          disabled={!canWrite}
                        >
                          <option value="checkpoint">Checkpoint</option>
                          <option value="preventive_control">
                            Controle preventivo
                          </option>
                        </Select>
                      </div>
                      <div>
                        <Label>Ordem</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          value={checkpoint.sortOrder}
                          onChange={(event) =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        sortOrder: Number(
                                          event.target.value || itemIndex,
                                        ),
                                      }
                                    : item,
                              ),
                            }))
                          }
                          disabled={!canWrite}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Nome do item *</Label>
                        <Input
                          className="mt-1"
                          value={checkpoint.label}
                          onChange={(event) =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, label: event.target.value }
                                    : item,
                              ),
                            }))
                          }
                          disabled={!canWrite}
                        />
                      </div>
                      <div>
                        <Label>Critério de aceitação</Label>
                        <Textarea
                          className="mt-1 min-h-24"
                          value={checkpoint.acceptanceCriteria}
                          onChange={(event) =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        acceptanceCriteria: event.target.value,
                                      }
                                    : item,
                              ),
                            }))
                          }
                          disabled={!canWrite}
                        />
                      </div>
                      <div>
                        <Label>Orientação</Label>
                        <Textarea
                          className="mt-1 min-h-24"
                          value={checkpoint.guidance}
                          onChange={(event) =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, guidance: event.target.value }
                                    : item,
                              ),
                            }))
                          }
                          disabled={!canWrite}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checkpoint.isRequired}
                          onChange={(event) =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        isRequired: event.target.checked,
                                      }
                                    : item,
                              ),
                            }))
                          }
                          disabled={!canWrite}
                        />
                        Item obrigatório
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checkpoint.requiresEvidence}
                          onChange={(event) =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        requiresEvidence: event.target.checked,
                                      }
                                    : item,
                              ),
                            }))
                          }
                          disabled={!canWrite}
                        />
                        Exige evidência
                      </label>
                    </div>
                    {canWrite && modelForm.checkpoints.length > 1 ? (
                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setModelForm((current) => ({
                              ...current,
                              checkpoints: current.checkpoints.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                        >
                          Remover item
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>

            {canWrite ? (
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveModel}
                  disabled={modelMutation.isPending}
                >
                  {selectedModelId ? "Salvar modelo" : "Criar modelo"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Validação especial do processo</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quando o resultado não puder ser totalmente verificado apenas ao
            final, registre critérios, vigência e revalidações diretamente no
            modelo.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Título da validação *</Label>
              <Input
                className="mt-1"
                value={specialValidationProfileForm.title}
                onChange={(event) =>
                  setSpecialValidationProfileForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                disabled={!canWrite || !selectedModelId}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                className="mt-1"
                value={specialValidationProfileForm.status}
                onChange={(event) =>
                  setSpecialValidationProfileForm((current) => ({
                    ...current,
                    status: event.target
                      .value as SpecialValidationProfileFormState["status"],
                  }))
                }
                disabled={!canWrite || !selectedModelId}
              >
                <option value="draft">Rascunho</option>
                <option value="valid">Válida</option>
                <option value="expired">Expirada</option>
                <option value="suspended">Suspensa</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Critérios *</Label>
              <Textarea
                className="mt-1 min-h-24"
                value={specialValidationProfileForm.criteria}
                onChange={(event) =>
                  setSpecialValidationProfileForm((current) => ({
                    ...current,
                    criteria: event.target.value,
                  }))
                }
                disabled={!canWrite || !selectedModelId}
              />
            </div>
            <div>
              <Label>Método / abordagem</Label>
              <Input
                className="mt-1"
                value={specialValidationProfileForm.method}
                onChange={(event) =>
                  setSpecialValidationProfileForm((current) => ({
                    ...current,
                    method: event.target.value,
                  }))
                }
                disabled={!canWrite || !selectedModelId}
              />
            </div>
            <div>
              <Label>Responsável</Label>
              <Select
                className="mt-1"
                value={specialValidationProfileForm.responsibleUserId}
                onChange={(event) =>
                  setSpecialValidationProfileForm((current) => ({
                    ...current,
                    responsibleUserId: event.target.value,
                  }))
                }
                disabled={!canWrite || !selectedModelId}
              >
                <option value="">Sem responsável definido</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Válida até</Label>
              <Input
                className="mt-1"
                type="datetime-local"
                value={specialValidationProfileForm.currentValidUntil}
                onChange={(event) =>
                  setSpecialValidationProfileForm((current) => ({
                    ...current,
                    currentValidUntil: event.target.value,
                  }))
                }
                disabled={!canWrite || !selectedModelId}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Input
                className="mt-1"
                value={specialValidationProfileForm.notes}
                onChange={(event) =>
                  setSpecialValidationProfileForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                disabled={!canWrite || !selectedModelId}
              />
            </div>
          </div>

          {canWrite ? (
            <div className="flex justify-end">
              <Button
                onClick={handleSaveSpecialValidationProfile}
                disabled={
                  specialValidationProfileMutation.isPending || !selectedModelId
                }
              >
                Salvar validação especial
              </Button>
            </div>
          ) : null}

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">
                Eventos de validação e revalidação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {specialValidationProfile?.events?.length ? (
                <div className="space-y-3">
                  {specialValidationProfile.events.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border px-4 py-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {event.eventType === "initial_validation"
                              ? "Validação inicial"
                              : "Revalidação"}
                          </p>
                          <p className="text-muted-foreground">
                            {event.validatedByName ||
                              "Responsável não identificado"}{" "}
                            • {formatDateTime(event.validatedAt)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            event.result === "approved"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {event.result === "approved"
                            ? "Aprovada"
                            : "Reprovada"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        {event.notes || event.criteriaSnapshot}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum evento de validação registrado ainda.
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Tipo de evento</Label>
                  <Select
                    className="mt-1"
                    value={specialValidationEventForm.eventType}
                    onChange={(event) =>
                      setSpecialValidationEventForm((current) => ({
                        ...current,
                        eventType: event.target
                          .value as SpecialValidationEventFormState["eventType"],
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  >
                    <option value="initial_validation">
                      Validação inicial
                    </option>
                    <option value="revalidation">Revalidação</option>
                  </Select>
                </div>
                <div>
                  <Label>Resultado</Label>
                  <Select
                    className="mt-1"
                    value={specialValidationEventForm.result}
                    onChange={(event) =>
                      setSpecialValidationEventForm((current) => ({
                        ...current,
                        result: event.target
                          .value as SpecialValidationEventFormState["result"],
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  >
                    <option value="approved">Aprovada</option>
                    <option value="rejected">Reprovada</option>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Snapshot dos critérios *</Label>
                  <Textarea
                    className="mt-1 min-h-24"
                    value={specialValidationEventForm.criteriaSnapshot}
                    onChange={(event) =>
                      setSpecialValidationEventForm((current) => ({
                        ...current,
                        criteriaSnapshot: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  />
                </div>
                <div>
                  <Label>Validade até</Label>
                  <Input
                    className="mt-1"
                    type="datetime-local"
                    value={specialValidationEventForm.validUntil}
                    onChange={(event) =>
                      setSpecialValidationEventForm((current) => ({
                        ...current,
                        validUntil: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  />
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Select
                    className="mt-1"
                    value={specialValidationEventForm.validatedById}
                    onChange={(event) =>
                      setSpecialValidationEventForm((current) => ({
                        ...current,
                        validatedById: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  >
                    <option value="">Usar usuário atual</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Observações</Label>
                  <Input
                    className="mt-1"
                    value={specialValidationEventForm.notes}
                    onChange={(event) =>
                      setSpecialValidationEventForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  />
                </div>
                <div className="md:col-span-2">
                  <ProfileItemAttachmentsField
                    attachments={mapAttachments(
                      specialValidationEventForm.evidenceAttachments,
                      canWrite
                        ? (objectPath) =>
                            setSpecialValidationEventForm((current) => ({
                              ...current,
                              evidenceAttachments:
                                current.evidenceAttachments.filter(
                                  (attachment) =>
                                    attachment.objectPath !== objectPath,
                                ),
                            }))
                        : undefined,
                    )}
                    onUpload={
                      canWrite
                        ? (files) =>
                            void handleUploadSpecialValidationEventAttachments(
                              files,
                            )
                        : undefined
                    }
                    uploading={specialValidationEventUploading}
                    disabled={!canWrite}
                    emptyText="Nenhuma evidência anexada para esta validação."
                  />
                </div>
              </div>

              {canWrite ? (
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveSpecialValidationEvent}
                    disabled={
                      specialValidationEventMutation.isPending ||
                      specialValidationEventUploading ||
                      !selectedModelId
                    }
                  >
                    Registrar evento de validação
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Ciclos</CardTitle>
              {canWrite ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={handleNewCycle}
                  disabled={!selectedModelId}
                >
                  Novo ciclo
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedModelId ? (
              <p className="text-sm text-muted-foreground">
                Selecione um modelo para visualizar ou abrir ciclos.
              </p>
            ) : cycles.length === 0 ? (
              <>
                {cycleFilterFields}
                {isLoadingCycles ? (
                  <p className="text-sm text-muted-foreground">
                    Carregando ciclos...
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum ciclo encontrado para este modelo e filtros.
                  </p>
                )}
              </>
            ) : (
              <>
                {cycleFilterFields}
                {isLoadingCycles ? (
                  <p className="text-sm text-muted-foreground">
                    Carregando ciclos...
                  </p>
                ) : (
                  cycles.map((cycle) => (
                    <button
                      key={cycle.id}
                      type="button"
                      onClick={() => setSelectedCycleId(cycle.id)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                        selectedCycleId === cycle.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{cycle.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {cycle.serviceOrderRef || "Sem ordem"} •{" "}
                            {cycle.customerName || "Sem cliente"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {cycle.processName || "Sem processo"} •{" "}
                            {cycle.unitName || "Sem unidade"}
                          </p>
                        </div>
                        <Badge
                          variant={
                            cycle.status === "released"
                              ? "default"
                              : cycle.status === "blocked"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {statusLabel(cycle.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {cycle.pendingRequiredCheckpointCount} pendente(s) •{" "}
                        {cycle.failedRequiredCheckpointCount} reprovado(s) •{" "}
                        {cycle.openNonconformingOutputCount} saída(s) NC em
                        aberto
                      </p>
                    </button>
                  ))
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedCycleId
                  ? "Ciclo selecionado"
                  : "Novo ciclo de execução"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Título do ciclo *</Label>
                  <Input
                    className="mt-1"
                    value={cycleForm.title}
                    onChange={(event) =>
                      setCycleForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  />
                </div>
                <div>
                  <Label>Ordem / referência</Label>
                  <Input
                    className="mt-1"
                    value={cycleForm.serviceOrderRef}
                    onChange={(event) =>
                      setCycleForm((current) => ({
                        ...current,
                        serviceOrderRef: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  />
                </div>
                <div>
                  <Label>Identificador da saída</Label>
                  <Input
                    className="mt-1"
                    value={cycleForm.outputIdentifier}
                    onChange={(event) =>
                      setCycleForm((current) => ({
                        ...current,
                        outputIdentifier: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  />
                </div>
                <div>
                  <Label>Cliente</Label>
                  <Select
                    className="mt-1"
                    value={cycleForm.customerContactId}
                    onChange={(event) =>
                      setCycleForm((current) => ({
                        ...current,
                        customerContactId: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  >
                    <option value="">Sem vínculo</option>
                    {customerOptions.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                        {contact.organizationName
                          ? ` • ${contact.organizationName}`
                          : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Processo SGQ</Label>
                  <Select
                    className="mt-1"
                    value={cycleForm.processId}
                    onChange={(event) =>
                      setCycleForm((current) => ({
                        ...current,
                        processId: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  >
                    <option value="">Sem vínculo</option>
                    {processes.map((process) => (
                      <option key={process.id} value={process.id}>
                        {process.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Select
                    className="mt-1"
                    value={cycleForm.unitId}
                    onChange={(event) =>
                      setCycleForm((current) => ({
                        ...current,
                        unitId: event.target.value,
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  >
                    <option value="">Sem vínculo</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Documentos aplicáveis</Label>
                  <select
                    multiple
                    className="mt-1 min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={cycleForm.documentIds.map(String)}
                    onChange={(event) =>
                      setCycleForm((current) => ({
                        ...current,
                        documentIds: parseMultiSelectValues(event),
                      }))
                    }
                    disabled={!canWrite || !selectedModelId}
                  >
                    {documents.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {canWrite ? (
                <div className="flex justify-end gap-3">
                  {!selectedCycleId ? (
                    <Button
                      onClick={handleCreateCycle}
                      disabled={cycleMutation.isPending || !selectedModelId}
                    >
                      Criar ciclo
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSaveCycle}
                      disabled={cycleMutation.isPending}
                    >
                      Salvar ciclo
                    </Button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Checkpoints do ciclo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedCycleId ? (
                <p className="text-sm text-muted-foreground">
                  Crie ou selecione um ciclo para registrar execução e
                  evidências.
                </p>
              ) : cycleCheckpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este ciclo ainda não possui checkpoints copiados do modelo.
                </p>
              ) : (
                cycleCheckpoints.map((checkpoint) => (
                  <Card key={checkpoint.id} className="border-dashed">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{checkpoint.label}</p>
                            <Badge variant="secondary">
                              {checkpointKindLabel(checkpoint.kind)}
                            </Badge>
                            {checkpoint.isRequired ? (
                              <Badge variant="outline">Obrigatório</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {checkpoint.acceptanceCriteria ||
                              "Sem critério informado"}
                          </p>
                          {checkpoint.guidance ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Orientação: {checkpoint.guidance}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={
                            checkpoint.status === "passed"
                              ? "default"
                              : checkpoint.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {statusLabel(checkpoint.status)}
                        </Badge>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                        <div>
                          <Label>Status</Label>
                          <Select
                            className="mt-1"
                            value={checkpoint.status}
                            onChange={(event) =>
                              setCycleCheckpoints((current) =>
                                current.map((item) =>
                                  item.id === checkpoint.id
                                    ? {
                                        ...item,
                                        status: event.target
                                          .value as CycleCheckpointDraft["status"],
                                      }
                                    : item,
                                ),
                              )
                            }
                            disabled={!canWrite}
                          >
                            <option value="pending">Pendente</option>
                            <option value="passed">Atendido</option>
                            <option value="failed">Reprovado</option>
                            <option value="waived">Dispensado</option>
                          </Select>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Último registro:{" "}
                            {checkpoint.checkedByName
                              ? `${checkpoint.checkedByName} • ${formatDateTime(checkpoint.checkedAt)}`
                              : "ainda não executado"}
                          </p>
                        </div>
                        <div>
                          <Label>Observações</Label>
                          <Textarea
                            className="mt-1 min-h-24"
                            value={checkpoint.notes}
                            onChange={(event) =>
                              setCycleCheckpoints((current) =>
                                current.map((item) =>
                                  item.id === checkpoint.id
                                    ? { ...item, notes: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            disabled={!canWrite}
                          />
                        </div>
                      </div>

                      <ProfileItemAttachmentsField
                        attachments={mapAttachments(
                          checkpoint.evidenceAttachments,
                          canWrite
                            ? (objectPath) =>
                                setCycleCheckpoints((current) =>
                                  current.map((item) =>
                                    item.id === checkpoint.id
                                      ? {
                                          ...item,
                                          evidenceAttachments:
                                            item.evidenceAttachments.filter(
                                              (attachment) =>
                                                attachment.objectPath !==
                                                objectPath,
                                            ),
                                        }
                                      : item,
                                  ),
                                )
                            : undefined,
                        )}
                        onUpload={
                          canWrite
                            ? (files) =>
                                void handleUploadCheckpointAttachments(
                                  checkpoint.id,
                                  files,
                                )
                            : undefined
                        }
                        uploading={uploadingCheckpointId === checkpoint.id}
                        disabled={!canWrite}
                        emptyText="Nenhuma evidência enviada para este item."
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Saídas não conformes</CardTitle>
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleNewNonconformingOutput}
                    disabled={!selectedCycleId}
                  >
                    Nova ocorrência
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Trate a ocorrência operacional dentro do ciclo, com disposição,
                responsável, evidências e vínculo opcional à NC sistêmica.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedCycleId ? (
                <p className="text-sm text-muted-foreground">
                  Selecione um ciclo para registrar e tratar saídas não
                  conformes.
                </p>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {operationalOutputs.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                        Nenhuma saída não conforme registrada neste ciclo.
                      </div>
                    ) : (
                      operationalOutputs.map((output) => (
                        <button
                          key={output.id}
                          type="button"
                          onClick={() => {
                            setIsCreatingNonconformingOutput(false);
                            setSelectedNonconformingOutputId(output.id);
                          }}
                          className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                            selectedNonconformingOutputId === output.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium">
                                {nonconformingOutputLabel(output)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {output.responsibleUserName ||
                                  "Sem responsável"}{" "}
                                • {formatDateTime(output.detectedAt)}
                              </p>
                            </div>
                            <Badge
                              variant={
                                output.status === "closed"
                                  ? "default"
                                  : output.status === "resolved"
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {statusLabel(output.status)}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {output.disposition
                              ? nonconformingDispositionLabel(
                                  output.disposition,
                                )
                              : "Disposição pendente"}
                            {" • "}
                            {output.linkedNonconformityTitle
                              ? `NC: ${output.linkedNonconformityTitle}`
                              : "Sem NC sistêmica vinculada"}
                          </p>
                        </button>
                      ))
                    )}
                  </div>

                  <Card className="border-dashed">
                    <CardContent className="pt-6 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Título da ocorrência *</Label>
                          <Input
                            className="mt-1"
                            value={nonconformingOutputForm.title}
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select
                            className="mt-1"
                            value={nonconformingOutputForm.status}
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                status: event.target
                                  .value as NonconformingOutputFormState["status"],
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="open">Aberta</option>
                            <option value="in_treatment">Em tratamento</option>
                            <option value="resolved">Resolvida</option>
                            <option value="closed">Encerrada</option>
                          </Select>
                        </div>
                        <div className="md:col-span-2">
                          <Label>Descrição *</Label>
                          <Textarea
                            className="mt-1 min-h-24"
                            value={nonconformingOutputForm.description}
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Impacto *</Label>
                          <Textarea
                            className="mt-1 min-h-20"
                            value={nonconformingOutputForm.impact}
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                impact: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                            placeholder="Descreva o impacto no cliente, entrega, requisito ou conformidade."
                          />
                        </div>
                        <div>
                          <Label>Disposição adotada</Label>
                          <Select
                            className="mt-1"
                            value={nonconformingOutputForm.disposition}
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                disposition: event.target
                                  .value as NonconformingOutputFormState["disposition"],
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="">Ainda não definida</option>
                            <option value="blocked">Bloqueada</option>
                            <option value="reworked">Retrabalhada</option>
                            <option value="reclassified">Reclassificada</option>
                            <option value="accepted_under_concession">
                              Aceita sob concessão
                            </option>
                            <option value="scrapped">Descartada</option>
                          </Select>
                        </div>
                        <div>
                          <Label>Responsável</Label>
                          <Select
                            className="mt-1"
                            value={nonconformingOutputForm.responsibleUserId}
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                responsibleUserId: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="">Sem responsável definido</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label>NC sistêmica vinculada</Label>
                          <Select
                            className="mt-1"
                            value={
                              nonconformingOutputForm.linkedNonconformityId
                            }
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                linkedNonconformityId: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="">Sem vínculo</option>
                            {systemicNonconformities.map(
                              (item: NonconformitySummary) => (
                                <option key={item.id} value={item.id}>
                                  {item.title}
                                </option>
                              ),
                            )}
                          </Select>
                        </div>
                        <div>
                          <Label>Desfecho / observações</Label>
                          <Input
                            className="mt-1"
                            value={nonconformingOutputForm.dispositionNotes}
                            onChange={(event) =>
                              setNonconformingOutputForm((current) => ({
                                ...current,
                                dispositionNotes: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <ProfileItemAttachmentsField
                            attachments={mapAttachments(
                              nonconformingOutputForm.evidenceAttachments,
                              canWrite
                                ? (objectPath) =>
                                    setNonconformingOutputForm((current) => ({
                                      ...current,
                                      evidenceAttachments:
                                        current.evidenceAttachments.filter(
                                          (attachment) =>
                                            attachment.objectPath !==
                                            objectPath,
                                        ),
                                    }))
                                : undefined,
                            )}
                            onUpload={
                              canWrite
                                ? (files) =>
                                    void handleUploadNonconformingOutputAttachments(
                                      files,
                                    )
                                : undefined
                            }
                            uploading={nonconformingOutputUploading}
                            disabled={!canWrite}
                            emptyText="Nenhuma evidência anexada para esta ocorrência."
                          />
                        </div>
                      </div>

                      {selectedNonconformingOutputId ? (
                        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                          <p className="font-medium">
                            Evento operacional #{selectedNonconformingOutputId}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Atualize a disposição e o desfecho sem perder o
                            vínculo com o ciclo.
                          </p>
                        </div>
                      ) : null}

                      {canWrite ? (
                        <div className="flex justify-end">
                          <Button
                            onClick={handleSaveNonconformingOutput}
                            disabled={
                              nonconformingOutputMutation.isPending ||
                              nonconformingOutputUploading ||
                              !selectedCycleId
                            }
                          >
                            {selectedNonconformingOutputId
                              ? "Salvar ocorrência"
                              : "Registrar ocorrência"}
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Propriedade de terceiros</CardTitle>
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleNewThirdPartyProperty}
                    disabled={!selectedCycleId}
                  >
                    Novo item
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Registre bens, materiais ou itens do cliente/terceiros ligados
                ao ciclo.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedCycleId ? (
                <p className="text-sm text-muted-foreground">
                  Selecione um ciclo para controlar propriedade de terceiros.
                </p>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {thirdPartyProperties.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                        Nenhum item registrado para este ciclo.
                      </div>
                    ) : (
                      thirdPartyProperties.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setIsCreatingThirdPartyProperty(false);
                            setSelectedThirdPartyPropertyId(item.id);
                          }}
                          className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                            selectedThirdPartyPropertyId === item.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium">
                                {thirdPartyPropertyLabel(item)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.ownerName} •{" "}
                                {item.responsibleUserName || "Sem responsável"}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {statusLabel(item.status)}
                            </Badge>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  <Card className="border-dashed">
                    <CardContent className="pt-6 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Item *</Label>
                          <Input
                            className="mt-1"
                            value={thirdPartyPropertyForm.title}
                            onChange={(event) =>
                              setThirdPartyPropertyForm((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div>
                          <Label>Proprietário *</Label>
                          <Input
                            className="mt-1"
                            value={thirdPartyPropertyForm.ownerName}
                            onChange={(event) =>
                              setThirdPartyPropertyForm((current) => ({
                                ...current,
                                ownerName: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Descrição</Label>
                          <Textarea
                            className="mt-1 min-h-24"
                            value={thirdPartyPropertyForm.description}
                            onChange={(event) =>
                              setThirdPartyPropertyForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div>
                          <Label>Condição no recebimento</Label>
                          <Input
                            className="mt-1"
                            value={thirdPartyPropertyForm.conditionOnReceipt}
                            onChange={(event) =>
                              setThirdPartyPropertyForm((current) => ({
                                ...current,
                                conditionOnReceipt: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select
                            className="mt-1"
                            value={thirdPartyPropertyForm.status}
                            onChange={(event) =>
                              setThirdPartyPropertyForm((current) => ({
                                ...current,
                                status: event.target
                                  .value as ThirdPartyPropertyFormState["status"],
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="received">Recebida</option>
                            <option value="in_use">Em uso</option>
                            <option value="returned">Devolvida</option>
                            <option value="lost_or_damaged">
                              Perdida ou danificada
                            </option>
                          </Select>
                        </div>
                        <div>
                          <Label>Cuidados de manuseio</Label>
                          <Input
                            className="mt-1"
                            value={thirdPartyPropertyForm.handlingRequirements}
                            onChange={(event) =>
                              setThirdPartyPropertyForm((current) => ({
                                ...current,
                                handlingRequirements: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div>
                          <Label>Responsável</Label>
                          <Select
                            className="mt-1"
                            value={thirdPartyPropertyForm.responsibleUserId}
                            onChange={(event) =>
                              setThirdPartyPropertyForm((current) => ({
                                ...current,
                                responsibleUserId: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="">Sem responsável definido</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="md:col-span-2">
                          <ProfileItemAttachmentsField
                            attachments={mapAttachments(
                              thirdPartyPropertyForm.evidenceAttachments,
                              canWrite
                                ? (objectPath) =>
                                    setThirdPartyPropertyForm((current) => ({
                                      ...current,
                                      evidenceAttachments:
                                        current.evidenceAttachments.filter(
                                          (attachment) =>
                                            attachment.objectPath !==
                                            objectPath,
                                        ),
                                    }))
                                : undefined,
                            )}
                            onUpload={
                              canWrite
                                ? (files) =>
                                    void handleUploadThirdPartyPropertyAttachments(
                                      files,
                                    )
                                : undefined
                            }
                            uploading={thirdPartyPropertyUploading}
                            disabled={!canWrite}
                            emptyText="Nenhuma evidência anexada para este item."
                          />
                        </div>
                      </div>

                      {canWrite ? (
                        <div className="flex justify-end">
                          <Button
                            onClick={handleSaveThirdPartyProperty}
                            disabled={
                              thirdPartyPropertyMutation.isPending ||
                              thirdPartyPropertyUploading ||
                              !selectedCycleId
                            }
                          >
                            {selectedThirdPartyPropertyId
                              ? "Salvar item"
                              : "Registrar item"}
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <CardTitle>Preservação e entrega</CardTitle>
              <p className="text-sm text-muted-foreground">
                Comprove como a saída foi preservada, acondicionada e entregue.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedCycleId ? (
                <p className="text-sm text-muted-foreground">
                  Selecione um ciclo para registrar preservação e entrega.
                </p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Método de preservação</Label>
                      <Input
                        className="mt-1"
                        value={preservationDeliveryForm.preservationMethod}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            preservationMethod: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div>
                      <Label>Data da preservação</Label>
                      <Input
                        className="mt-1"
                        type="datetime-local"
                        value={preservationDeliveryForm.preservedAt}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            preservedAt: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Notas de preservação</Label>
                      <Textarea
                        className="mt-1 min-h-24"
                        value={preservationDeliveryForm.preservationNotes}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            preservationNotes: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Acondicionamento / embalagem</Label>
                      <Textarea
                        className="mt-1 min-h-24"
                        value={preservationDeliveryForm.packagingNotes}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            packagingNotes: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div>
                      <Label>Método de entrega</Label>
                      <Input
                        className="mt-1"
                        value={preservationDeliveryForm.deliveryMethod}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            deliveryMethod: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div>
                      <Label>Destinatário</Label>
                      <Input
                        className="mt-1"
                        value={preservationDeliveryForm.deliveryRecipient}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            deliveryRecipient: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div>
                      <Label>Entregue por</Label>
                      <Select
                        className="mt-1"
                        value={preservationDeliveryForm.deliveredById}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            deliveredById: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      >
                        <option value="">Sem responsável definido</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Data da entrega</Label>
                      <Input
                        className="mt-1"
                        type="datetime-local"
                        value={preservationDeliveryForm.deliveredAt}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            deliveredAt: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Notas de entrega</Label>
                      <Textarea
                        className="mt-1 min-h-24"
                        value={preservationDeliveryForm.deliveryNotes}
                        onChange={(event) =>
                          setPreservationDeliveryForm((current) => ({
                            ...current,
                            deliveryNotes: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Evidências de preservação</Label>
                      <ProfileItemAttachmentsField
                        attachments={mapAttachments(
                          preservationDeliveryForm.preservationEvidenceAttachments,
                          canWrite
                            ? (objectPath) =>
                                setPreservationDeliveryForm((current) => ({
                                  ...current,
                                  preservationEvidenceAttachments:
                                    current.preservationEvidenceAttachments.filter(
                                      (attachment) =>
                                        attachment.objectPath !== objectPath,
                                    ),
                                }))
                            : undefined,
                        )}
                        onUpload={
                          canWrite
                            ? (files) =>
                                void handleUploadPreservationAttachments(files)
                            : undefined
                        }
                        uploading={preservationUploading}
                        disabled={!canWrite}
                        emptyText="Nenhuma evidência de preservação anexada."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Evidências de entrega</Label>
                      <ProfileItemAttachmentsField
                        attachments={mapAttachments(
                          preservationDeliveryForm.deliveryEvidenceAttachments,
                          canWrite
                            ? (objectPath) =>
                                setPreservationDeliveryForm((current) => ({
                                  ...current,
                                  deliveryEvidenceAttachments:
                                    current.deliveryEvidenceAttachments.filter(
                                      (attachment) =>
                                        attachment.objectPath !== objectPath,
                                    ),
                                }))
                            : undefined,
                        )}
                        onUpload={
                          canWrite
                            ? (files) =>
                                void handleUploadDeliveryAttachments(files)
                            : undefined
                        }
                        uploading={deliveryUploading}
                        disabled={!canWrite}
                        emptyText="Nenhuma evidência de entrega anexada."
                      />
                    </div>
                  </div>

                  {canWrite ? (
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSavePreservationDelivery}
                        disabled={
                          preservationDeliveryMutation.isPending ||
                          preservationUploading ||
                          deliveryUploading ||
                          !selectedCycleId
                        }
                      >
                        Salvar preservação e entrega
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Pós-serviço</CardTitle>
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleNewPostDeliveryEvent}
                    disabled={!selectedCycleId}
                  >
                    Novo evento
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Documente monitoramentos, ajustes, assistência ou outros eventos
                após a entrega.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedCycleId ? (
                <p className="text-sm text-muted-foreground">
                  Selecione um ciclo para registrar eventos de pós-serviço.
                </p>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {postDeliveryEvents.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                        Nenhum evento de pós-serviço registrado.
                      </div>
                    ) : (
                      postDeliveryEvents.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setIsCreatingPostDeliveryEvent(false);
                            setSelectedPostDeliveryEventId(item.id);
                          }}
                          className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                            selectedPostDeliveryEventId === item.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium">
                                {postDeliveryEventLabel(item)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(item.occurredAt)}
                              </p>
                            </div>
                            <Badge
                              variant={
                                item.status === "closed"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {statusLabel(item.status)}
                            </Badge>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  <Card className="border-dashed">
                    <CardContent className="pt-6 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Tipo</Label>
                          <Select
                            className="mt-1"
                            value={postDeliveryEventForm.eventType}
                            onChange={(event) =>
                              setPostDeliveryEventForm((current) => ({
                                ...current,
                                eventType: event.target
                                  .value as PostDeliveryEventFormState["eventType"],
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="monitoring">Monitoramento</option>
                            <option value="complaint">Reclamação</option>
                            <option value="assistance">Assistência</option>
                            <option value="adjustment">Ajuste</option>
                            <option value="feedback">Feedback</option>
                            <option value="other">Outro</option>
                          </Select>
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select
                            className="mt-1"
                            value={postDeliveryEventForm.status}
                            onChange={(event) =>
                              setPostDeliveryEventForm((current) => ({
                                ...current,
                                status: event.target
                                  .value as PostDeliveryEventFormState["status"],
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="open">Aberto</option>
                            <option value="in_follow_up">
                              Em acompanhamento
                            </option>
                            <option value="closed">Encerrado</option>
                          </Select>
                        </div>
                        <div>
                          <Label>Título *</Label>
                          <Input
                            className="mt-1"
                            value={postDeliveryEventForm.title}
                            onChange={(event) =>
                              setPostDeliveryEventForm((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div>
                          <Label>Data do evento</Label>
                          <Input
                            className="mt-1"
                            type="datetime-local"
                            value={postDeliveryEventForm.occurredAt}
                            onChange={(event) =>
                              setPostDeliveryEventForm((current) => ({
                                ...current,
                                occurredAt: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Descrição *</Label>
                          <Textarea
                            className="mt-1 min-h-24"
                            value={postDeliveryEventForm.description}
                            onChange={(event) =>
                              setPostDeliveryEventForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div>
                          <Label>Responsável</Label>
                          <Select
                            className="mt-1"
                            value={postDeliveryEventForm.responsibleUserId}
                            onChange={(event) =>
                              setPostDeliveryEventForm((current) => ({
                                ...current,
                                responsibleUserId: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          >
                            <option value="">Sem responsável definido</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label>Acompanhamento</Label>
                          <Input
                            className="mt-1"
                            value={postDeliveryEventForm.followUpNotes}
                            onChange={(event) =>
                              setPostDeliveryEventForm((current) => ({
                                ...current,
                                followUpNotes: event.target.value,
                              }))
                            }
                            disabled={!canWrite || !selectedCycleId}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <ProfileItemAttachmentsField
                            attachments={mapAttachments(
                              postDeliveryEventForm.evidenceAttachments,
                              canWrite
                                ? (objectPath) =>
                                    setPostDeliveryEventForm((current) => ({
                                      ...current,
                                      evidenceAttachments:
                                        current.evidenceAttachments.filter(
                                          (attachment) =>
                                            attachment.objectPath !==
                                            objectPath,
                                        ),
                                    }))
                                : undefined,
                            )}
                            onUpload={
                              canWrite
                                ? (files) =>
                                    void handleUploadPostDeliveryAttachments(
                                      files,
                                    )
                                : undefined
                            }
                            uploading={postDeliveryUploading}
                            disabled={!canWrite}
                            emptyText="Nenhuma evidência anexada para este evento."
                          />
                        </div>
                      </div>

                      {canWrite ? (
                        <div className="flex justify-end">
                          <Button
                            onClick={handleSavePostDeliveryEvent}
                            disabled={
                              postDeliveryEventMutation.isPending ||
                              postDeliveryUploading ||
                              !selectedCycleId
                            }
                          >
                            {selectedPostDeliveryEventId
                              ? "Salvar evento"
                              : "Registrar evento"}
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Liberação da saída</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedCycleId ? (
                <p className="text-sm text-muted-foreground">
                  Selecione um ciclo para revisar pendências e registrar a
                  decisão.
                </p>
              ) : (
                <>
                  {pendingBlockingIssues.length > 0 ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <p className="font-medium">
                        Pendências impeditivas atuais
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {pendingBlockingIssues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      Todos os checkpoints obrigatórios estão aptos para
                      liberação.
                    </div>
                  )}

                  {cycleDetail?.releaseRecord ? (
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                      <p className="font-medium">
                        Última decisão:{" "}
                        {statusLabel(
                          cycleDetail.releaseRecord.decision === "approved"
                            ? "released"
                            : "blocked",
                        )}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {cycleDetail.releaseRecord.decidedByName ??
                          "Responsável não identificado"}{" "}
                        • {formatDateTime(cycleDetail.releaseRecord.decidedAt)}
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Decisão</Label>
                      <Select
                        className="mt-1"
                        value={releaseForm.decision}
                        onChange={(event) =>
                          setReleaseForm((current) => ({
                            ...current,
                            decision: event.target
                              .value as ReleaseFormState["decision"],
                          }))
                        }
                        disabled={!canWrite}
                      >
                        <option value="approved">Liberar saída</option>
                        <option value="blocked">Bloquear saída</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Justificativa / observação</Label>
                      <Input
                        className="mt-1"
                        value={releaseForm.decisionNotes}
                        onChange={(event) =>
                          setReleaseForm((current) => ({
                            ...current,
                            decisionNotes: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Bloqueios informados</Label>
                      <Textarea
                        className="mt-1 min-h-24"
                        value={releaseForm.blockingIssuesText}
                        onChange={(event) =>
                          setReleaseForm((current) => ({
                            ...current,
                            blockingIssuesText: event.target.value,
                          }))
                        }
                        disabled={!canWrite}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <ProfileItemAttachmentsField
                        attachments={mapAttachments(
                          releaseForm.evidenceAttachments,
                          canWrite
                            ? (objectPath) =>
                                setReleaseForm((current) => ({
                                  ...current,
                                  evidenceAttachments:
                                    current.evidenceAttachments.filter(
                                      (attachment) =>
                                        attachment.objectPath !== objectPath,
                                    ),
                                }))
                            : undefined,
                        )}
                        onUpload={
                          canWrite
                            ? (files) =>
                                void handleUploadReleaseAttachments(files)
                            : undefined
                        }
                        uploading={releaseUploading}
                        disabled={!canWrite}
                        emptyText="A liberação exige pelo menos uma evidência."
                      />
                    </div>
                  </div>

                  {canWrite ? (
                    <div className="flex justify-end">
                      <Button
                        onClick={handleRelease}
                        disabled={
                          releaseMutation.isPending ||
                          releaseUploading ||
                          (releaseForm.decision === "approved" &&
                            pendingBlockingIssues.length > 0)
                        }
                      >
                        Registrar liberação
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

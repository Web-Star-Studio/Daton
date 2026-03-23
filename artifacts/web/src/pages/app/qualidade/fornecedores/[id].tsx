import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import {
  useListUnits,
  useListUserOptions,
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FieldSet,
  FieldGroup,
  Field,
  FieldLabel,
  FieldContent,
  FieldSeparator,
} from "@/components/ui/field";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  createSupplierDocumentReview,
  createSupplierDocumentSubmission,
  createSupplierFailure,
  createSupplierOffering,
  createSupplierPerformanceReview,
  createSupplierQualificationReview,
  createSupplierReceiptCheck,
  createSupplierRequirementCommunication,
  getSupplierDetail,
  listSupplierCategories,
  listSupplierDocumentRequirements,
  listSupplierTypes,
  suppliersKeys,
  updateSupplier,
  type SupplierAttachment,
  type SupplierDetail,
} from "@/lib/suppliers-client";
import { EMPLOYEE_RECORD_ATTACHMENT_ACCEPT, formatFileSize, uploadFilesToStorage } from "@/lib/uploads";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Package2,
  Receipt,
  Save,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

type SupplierProfileForm = {
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string;
  categoryId: string;
  unitIds: number[];
  typeIds: number[];
  status: string;
  criticality: string;
  email: string;
  phone: string;
  website: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  notes: string;
};

type SupplierTabConfig = {
  value: "cadastro" | "documentos" | "homologacao" | "requisitos" | "desempenho" | "recebimentos" | "historico";
  label: string;
  icon: typeof ClipboardList;
  count?: number;
};

function AttachmentUploader({
  attachments,
  onChange,
  disabled = false,
}: {
  attachments: SupplierAttachment[];
  onChange: (next: SupplierAttachment[]) => void;
  disabled?: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      setIsUploading(true);
      const uploaded = await uploadFilesToStorage(Array.from(files));
      onChange([...attachments, ...uploaded]);
    } catch (error) {
      toast({
        title: "Falha ao enviar anexos",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="inline-flex">
        <input
          type="file"
          multiple
          accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(event) => void handleUpload(event.target.files)}
          disabled={disabled || isUploading}
        />
        <Button type="button" variant="outline" disabled={disabled || isUploading}>
          <Upload className="mr-2 h-4 w-4" />
          {isUploading ? "Enviando..." : "Adicionar anexos"}
        </Button>
      </label>
      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment, index) => (
            <div
              key={`${attachment.objectPath}-${index}`}
              className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{attachment.fileName}</div>
                <div className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(attachments.filter((_, currentIndex) => currentIndex !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum anexo adicionado.</p>
      )}
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return value;
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    pending_qualification: "Pendente",
    approved: "Aprovado",
    restricted: "Restrito",
    blocked: "Bloqueado",
    expired: "Vencido",
    inactive: "Inativo",
  };
  return labels[status] || status;
}

function statusBadgeClass(status: string) {
  const classes: Record<string, string> = {
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    pending_qualification: "border-amber-200 bg-amber-50 text-amber-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    restricted: "border-orange-200 bg-orange-50 text-orange-700",
    blocked: "border-red-200 bg-red-50 text-red-700",
    expired: "border-rose-200 bg-rose-50 text-rose-700",
    inactive: "border-zinc-200 bg-zinc-100 text-zinc-700",
  };
  return classes[status] || "border-slate-200 bg-slate-100 text-slate-700";
}

function personTypeLabel(personType: SupplierDetail["personType"]) {
  return personType === "pj" ? "Pessoa jurídica" : "Pessoa física";
}

function criticalityLabel(criticality: SupplierDetail["criticality"]) {
  const labels: Record<SupplierDetail["criticality"], string> = {
    low: "baixa",
    medium: "média",
    high: "alta",
  };
  return labels[criticality];
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("cadastro");

  const canManageGeneral = role === "org_admin" || role === "platform_admin";
  const canManageReceipts = canManageGeneral || role === "operator";

  const detailQuery = useQuery({
    queryKey: suppliersKeys.detail(orgId || 0, supplierId),
    enabled: !!orgId && Number.isFinite(supplierId) && supplierId > 0,
    queryFn: () => getSupplierDetail(orgId!, supplierId),
  });
  const categoriesQuery = useQuery({
    queryKey: suppliersKeys.categories(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierCategories(orgId!),
  });
  const typesQuery = useQuery({
    queryKey: suppliersKeys.types(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierTypes(orgId!),
  });
  const requirementsQuery = useQuery({
    queryKey: suppliersKeys.requirements(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierDocumentRequirements(orgId!),
  });
  const unitsQuery = useListUnits(orgId!, {
    query: {
      queryKey: getListUnitsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });
  const usersQuery = useListUserOptions(orgId!, {
    query: {
      queryKey: getListUserOptionsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });

  const detail = detailQuery.data;
  const categories = categoriesQuery.data || [];
  const types = typesQuery.data || [];
  const requirements = requirementsQuery.data || [];
  const units = unitsQuery.data || [];
  const users = usersQuery.data || [];

  const [profileForm, setProfileForm] = useState<SupplierProfileForm | null>(null);
  const [offeringForm, setOfferingForm] = useState({
    name: "",
    offeringType: "service",
    unitOfMeasure: "",
    description: "",
    status: "active",
    isApprovedScope: false,
  });
  const [documentSubmissionForm, setDocumentSubmissionForm] = useState({
    requirementId: "",
    submissionStatus: "pending",
    adequacyStatus: "under_review",
    validityDate: "",
    observations: "",
    exemptionReason: "",
    rejectionReason: "",
    attachments: [] as SupplierAttachment[],
  });
  const [documentReviewForm, setDocumentReviewForm] = useState({
    threshold: "80",
    nextReviewDate: "",
    observations: "",
  });
  const [qualificationForm, setQualificationForm] = useState({
    decision: "approved",
    validUntil: "",
    notes: "",
    approvedOfferingIds: [] as number[],
    attachments: [] as SupplierAttachment[],
  });
  const [communicationForm, setCommunicationForm] = useState({
    templateId: "",
    status: "linked",
    notes: "",
  });
  const [performanceForm, setPerformanceForm] = useState({
    offeringId: "",
    periodStart: "",
    periodEnd: "",
    qualityScore: "8",
    deliveryScore: "8",
    communicationScore: "8",
    complianceScore: "8",
    priceScore: "",
    conclusion: "maintain",
    riskLevel: "medium",
    observations: "",
  });
  const [receiptForm, setReceiptForm] = useState({
    offeringId: "",
    unitId: "",
    authorizedById: "",
    receiptDate: "",
    description: "",
    referenceNumber: "",
    quantity: "",
    totalValue: "",
    outcome: "accepted",
    acceptanceCriteria: "",
    notes: "",
    nonConformityStatus: "not_required",
    nonConformitySummary: "",
    attachments: [] as SupplierAttachment[],
  });
  const [failureForm, setFailureForm] = useState({
    failureType: "other",
    severity: "medium",
    description: "",
    status: "open",
  });

  const updateProfileForm = (updater: (current: SupplierProfileForm) => SupplierProfileForm) => {
    setProfileForm((current) => (current ? updater(current) : current));
  };

  useEffect(() => {
    if (!detail) return;
    setProfileForm({
      personType: detail.personType,
      legalIdentifier: detail.legalIdentifier,
      legalName: detail.legalName,
      tradeName: detail.tradeName || "",
      categoryId: detail.category ? String(detail.category.id) : "",
      unitIds: detail.units.map((unit) => unit.id),
      typeIds: detail.types.map((type) => type.id),
      status: detail.status,
      criticality: detail.criticality,
      email: detail.email || "",
      phone: detail.phone || "",
      website: detail.website || "",
      postalCode: detail.postalCode || "",
      street: detail.street || "",
      streetNumber: detail.streetNumber || "",
      complement: detail.complement || "",
      neighborhood: detail.neighborhood || "",
      city: detail.city || "",
      state: detail.state || "",
      notes: detail.notes || "",
    });
  }, [detail]);

  usePageTitle(detail ? detail.tradeName || detail.legalName : "Fornecedor");
  usePageSubtitle(detail ? `${detail.legalIdentifier} · ${statusLabel(detail.status)}` : undefined);

  const supplierDisplayName = detail ? detail.tradeName || detail.legalName : "Fornecedor";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.detail(orgId!, supplierId) });
    queryClient.invalidateQueries({ queryKey: suppliersKeys.list(orgId!, {}) });
  };

  const updateSupplierMutation = useMutation({
    mutationFn: () => {
      if (!profileForm) {
        throw new Error("Fornecedor ainda nao carregado.");
      }

      return updateSupplier(orgId!, supplierId, {
        ...profileForm,
        categoryId: profileForm.categoryId ? Number(profileForm.categoryId) : null,
        unitIds: profileForm.unitIds,
        typeIds: profileForm.typeIds,
      });
    },
    onSuccess: refresh,
    onError: (error) =>
      toast({
        title: "Falha ao salvar cadastro",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      }),
  });

  const offeringMutation = useMutation({
    mutationFn: () => createSupplierOffering(orgId!, supplierId, offeringForm),
    onSuccess: () => {
      setOfferingForm({
        name: "",
        offeringType: "service",
        unitOfMeasure: "",
        description: "",
        status: "active",
        isApprovedScope: false,
      });
      refresh();
    },
  });

  const documentSubmissionMutation = useMutation({
    mutationFn: () =>
      createSupplierDocumentSubmission(orgId!, supplierId, {
        ...documentSubmissionForm,
        requirementId: Number(documentSubmissionForm.requirementId),
        validityDate: documentSubmissionForm.validityDate || null,
      }),
    onSuccess: () => {
      setDocumentSubmissionForm({
        requirementId: "",
        submissionStatus: "pending",
        adequacyStatus: "under_review",
        validityDate: "",
        observations: "",
        exemptionReason: "",
        rejectionReason: "",
        attachments: [],
      });
      refresh();
    },
  });

  const documentReviewMutation = useMutation({
    mutationFn: () =>
      createSupplierDocumentReview(orgId!, supplierId, {
        threshold: Number(documentReviewForm.threshold),
        nextReviewDate: documentReviewForm.nextReviewDate || null,
        observations: documentReviewForm.observations || null,
      }),
    onSuccess: () => {
      setDocumentReviewForm({ threshold: "80", nextReviewDate: "", observations: "" });
      refresh();
    },
  });

  const qualificationMutation = useMutation({
    mutationFn: () =>
      createSupplierQualificationReview(orgId!, supplierId, {
        ...qualificationForm,
        validUntil: qualificationForm.validUntil || null,
      }),
    onSuccess: () => {
      setQualificationForm({
        decision: "approved",
        validUntil: "",
        notes: "",
        approvedOfferingIds: [],
        attachments: [],
      });
      refresh();
    },
  });

  const communicationMutation = useMutation({
    mutationFn: () =>
      createSupplierRequirementCommunication(orgId!, supplierId, {
        templateId: Number(communicationForm.templateId),
        status: communicationForm.status,
        notes: communicationForm.notes || null,
      }),
    onSuccess: () => {
      setCommunicationForm({ templateId: "", status: "linked", notes: "" });
      refresh();
    },
  });

  const performanceMutation = useMutation({
    mutationFn: () =>
      createSupplierPerformanceReview(orgId!, supplierId, {
        offeringId: performanceForm.offeringId ? Number(performanceForm.offeringId) : null,
        periodStart: performanceForm.periodStart,
        periodEnd: performanceForm.periodEnd,
        qualityScore: Number(performanceForm.qualityScore),
        deliveryScore: Number(performanceForm.deliveryScore),
        communicationScore: Number(performanceForm.communicationScore),
        complianceScore: Number(performanceForm.complianceScore),
        priceScore: performanceForm.priceScore ? Number(performanceForm.priceScore) : null,
        conclusion: performanceForm.conclusion,
        riskLevel: performanceForm.riskLevel,
        observations: performanceForm.observations || null,
      }),
    onSuccess: () => {
      setPerformanceForm({
        offeringId: "",
        periodStart: "",
        periodEnd: "",
        qualityScore: "8",
        deliveryScore: "8",
        communicationScore: "8",
        complianceScore: "8",
        priceScore: "",
        conclusion: "maintain",
        riskLevel: "medium",
        observations: "",
      });
      refresh();
    },
  });

  const receiptMutation = useMutation({
    mutationFn: () =>
      createSupplierReceiptCheck(orgId!, supplierId, {
        offeringId: receiptForm.offeringId ? Number(receiptForm.offeringId) : null,
        unitId: receiptForm.unitId ? Number(receiptForm.unitId) : null,
        authorizedById: Number(receiptForm.authorizedById),
        receiptDate: receiptForm.receiptDate,
        description: receiptForm.description,
        referenceNumber: receiptForm.referenceNumber || null,
        quantity: receiptForm.quantity || null,
        totalValue: receiptForm.totalValue ? Number(receiptForm.totalValue) : null,
        outcome: receiptForm.outcome,
        acceptanceCriteria: receiptForm.acceptanceCriteria,
        notes: receiptForm.notes || null,
        nonConformityStatus: receiptForm.nonConformityStatus,
        nonConformitySummary: receiptForm.nonConformitySummary || null,
        attachments: receiptForm.attachments,
      }),
    onSuccess: () => {
      setReceiptForm({
        offeringId: "",
        unitId: "",
        authorizedById: "",
        receiptDate: "",
        description: "",
        referenceNumber: "",
        quantity: "",
        totalValue: "",
        outcome: "accepted",
        acceptanceCriteria: "",
        notes: "",
        nonConformityStatus: "not_required",
        nonConformitySummary: "",
        attachments: [],
      });
      refresh();
    },
  });

  const handleReceiptSubmit = () => {
    if (!receiptForm.authorizedById || !receiptForm.receiptDate || !receiptForm.description.trim() || !receiptForm.acceptanceCriteria.trim()) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Informe autorizador, data, descrição e critérios de aceitação antes de registrar o recebimento.",
        variant: "destructive",
      });
      return;
    }

    receiptMutation.mutate();
  };

  const failureMutation = useMutation({
    mutationFn: () => createSupplierFailure(orgId!, supplierId, failureForm),
    onSuccess: () => {
      setFailureForm({ failureType: "other", severity: "medium", description: "", status: "open" });
      refresh();
    },
  });

  const typeOptions = useMemo(
    () => types.map((type) => ({ value: type.id, label: type.name })),
    [types],
  );
  const unitOptions = useMemo(
    () => units.map((unit) => ({ value: unit.id, label: unit.name })),
    [units],
  );
  const offeringOptions = useMemo(
    () => (detail?.offerings || []).map((offering) => ({ value: offering.id, label: offering.name })),
    [detail?.offerings],
  );

  const tabs = useMemo<SupplierTabConfig[]>(
    () => [
      { value: "cadastro", label: "Cadastro", icon: ClipboardList },
      {
        value: "documentos",
        label: "Documentos",
        icon: FileText,
        count: (detail?.documents.submissions.length || 0) + (detail?.documents.reviews.length || 0),
      },
      {
        value: "homologacao",
        label: "Homologação",
        icon: CheckCircle2,
        count: detail?.qualificationReviews.length || 0,
      },
      {
        value: "requisitos",
        label: "Requisitos",
        icon: ShieldCheck,
        count: detail?.requirements.communications.length || 0,
      },
      {
        value: "desempenho",
        label: "Desempenho",
        icon: ClipboardList,
        count: detail?.performanceReviews.length || 0,
      },
      {
        value: "recebimentos",
        label: "Recebimentos",
        icon: Receipt,
        count: detail?.receiptChecks.length || 0,
      },
      {
        value: "historico",
        label: "Histórico",
        icon: History,
        count: detail?.failures.length || 0,
      },
    ],
    [detail],
  );
  const sectionCardClass = "border-border/60 bg-card/70 shadow-sm";
  const nestedPanelClass = "rounded-xl border border-border/50 bg-background/40";

  const headerActions = useMemo(() => {
    if (!detail) return null;

    const renderActiveTabActions = () => {
      if (activeTab === "cadastro" && canManageGeneral) {
        return (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => offeringMutation.mutate()}
              isLoading={offeringMutation.isPending}
            >
              Adicionar item
            </Button>
            <Button
              size="sm"
              onClick={() => updateSupplierMutation.mutate()}
              isLoading={updateSupplierMutation.isPending}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Salvar cadastro
            </Button>
          </>
        );
      }

      if (activeTab === "documentos" && canManageGeneral) {
        return (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => documentSubmissionMutation.mutate()}
              isLoading={documentSubmissionMutation.isPending}
            >
              Salvar submissão
            </Button>
            <Button
              size="sm"
              onClick={() => documentReviewMutation.mutate()}
              isLoading={documentReviewMutation.isPending}
            >
              Registrar AVA1
            </Button>
          </>
        );
      }

      if (activeTab === "homologacao" && canManageGeneral) {
        return (
          <Button
            size="sm"
            onClick={() => qualificationMutation.mutate()}
            isLoading={qualificationMutation.isPending}
          >
            Registrar homologação
          </Button>
        );
      }

      if (activeTab === "requisitos" && canManageGeneral) {
        return (
          <Button
            size="sm"
            onClick={() => communicationMutation.mutate()}
            isLoading={communicationMutation.isPending}
          >
            Registrar comunicação
          </Button>
        );
      }

      if (activeTab === "desempenho" && canManageGeneral) {
        return (
          <Button
            size="sm"
            onClick={() => performanceMutation.mutate()}
            isLoading={performanceMutation.isPending}
          >
            Registrar AVA2
          </Button>
        );
      }

      if (activeTab === "recebimentos" && canManageReceipts) {
        return (
          <Button size="sm" onClick={handleReceiptSubmit} isLoading={receiptMutation.isPending}>
            Registrar recebimento
          </Button>
        );
      }

      if (activeTab === "historico" && canManageGeneral) {
        return (
          <Button
            size="sm"
            onClick={() => failureMutation.mutate()}
            isLoading={failureMutation.isPending}
          >
            Registrar falha
          </Button>
        );
      }

      return null;
    };

    return (
      <div className="flex items-center gap-2">
        <Link href="/qualidade/fornecedores">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Voltar
          </Button>
        </Link>
        {renderActiveTabActions()}
      </div>
    );
  }, [
    activeTab,
    canManageGeneral,
    canManageReceipts,
    communicationMutation,
    detail,
    documentReviewMutation,
    documentSubmissionMutation,
    failureMutation,
    handleReceiptSubmit,
    offeringMutation,
    performanceMutation,
    qualificationMutation,
    receiptMutation,
    updateSupplierMutation,
  ]);

  useHeaderActions(headerActions);

  if (detailQuery.isLoading || !profileForm) {
    return <div className="text-sm text-muted-foreground">Carregando fornecedor…</div>;
  }

  if (!detail) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Fornecedor não encontrado.</p>
        <Link href="/qualidade/fornecedores">
          <Button variant="outline" size="sm">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{supplierDisplayName}</h1>
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium",
              statusBadgeClass(detail.status),
            )}
          >
            {statusLabel(detail.status)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>{personTypeLabel(detail.personType)}</span>
          <span>{detail.legalIdentifier}</span>
          <span>{detail.category?.name || "Sem categoria"}</span>
          <span>Criticidade {criticalityLabel(detail.criticality)}</span>
          <span>Válido até {formatDate(detail.qualifiedUntil)}</span>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className={sectionCardClass}>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Status</p>
            <p className="mt-3 text-2xl font-semibold">{statusLabel(detail.status)}</p>
            <p className="mt-2 text-sm text-muted-foreground">Criticidade {criticalityLabel(detail.criticality)}</p>
          </CardContent>
        </Card>
        <Card className={sectionCardClass}>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">AVA1</p>
            <p className="mt-3 text-2xl font-semibold">
              {detail.documentCompliancePercentage === null ? "—" : `${detail.documentCompliancePercentage}%`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {detail.documentReviewStatus || "Sem parecer"}
            </p>
          </CardContent>
        </Card>
        <Card className={sectionCardClass}>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Homologação</p>
            <p className="mt-3 text-2xl font-semibold">{detail.qualificationReviews.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Válida até {formatDate(detail.qualifiedUntil)}</p>
          </CardContent>
        </Card>
        <Card className={sectionCardClass}>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Falhas</p>
            <p className="mt-3 text-2xl font-semibold">{detail.failures.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Registro operacional do fornecedor</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-nowrap overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex shrink-0 items-center gap-1.5">
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count ? (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {tab.count}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Cadastro ── */}
        <TabsContent value="cadastro">
          <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Cadastro mestre</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldSet>
                  <FieldGroup>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel>Tipo de pessoa</FieldLabel>
                        <FieldContent>
                          <Select
                            value={profileForm.personType}
                            onChange={(event) =>
                              updateProfileForm((current) => ({ ...current, personType: event.target.value as "pj" | "pf" }))
                            }
                            disabled={!canManageGeneral}
                          >
                            <option value="pj">Pessoa jurídica</option>
                            <option value="pf">Pessoa física</option>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>{profileForm.personType === "pj" ? "CNPJ" : "CPF"}</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.legalIdentifier}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, legalIdentifier: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>{profileForm.personType === "pj" ? "Razão social" : "Nome completo"}</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.legalName}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, legalName: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Nome fantasia</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.tradeName}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, tradeName: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Categoria</FieldLabel>
                        <FieldContent>
                          <Select
                            value={profileForm.categoryId}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, categoryId: event.target.value }))}
                            disabled={!canManageGeneral}
                          >
                            <option value="">Sem categoria</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Status</FieldLabel>
                        <FieldContent>
                          <Select
                            value={profileForm.status}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, status: event.target.value }))}
                            disabled={!canManageGeneral}
                          >
                            <option value="draft">Rascunho</option>
                            <option value="pending_qualification">Pendente</option>
                            <option value="approved">Aprovado</option>
                            <option value="restricted">Restrito</option>
                            <option value="blocked">Bloqueado</option>
                            <option value="expired">Vencido</option>
                            <option value="inactive">Inativo</option>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Criticidade</FieldLabel>
                        <FieldContent>
                          <Select
                            value={profileForm.criticality}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, criticality: event.target.value }))}
                            disabled={!canManageGeneral}
                          >
                            <option value="low">Baixa</option>
                            <option value="medium">Média</option>
                            <option value="high">Alta</option>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>E-mail</FieldLabel>
                        <FieldContent>
                          <Input
                            type="email"
                            value={profileForm.email}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, email: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Telefone</FieldLabel>
                        <FieldContent>
                          <Input
                            type="tel"
                            value={profileForm.phone}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, phone: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Website</FieldLabel>
                        <FieldContent>
                          <Input
                            type="url"
                            value={profileForm.website}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, website: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>CEP</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.postalCode}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, postalCode: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel>Unidades</FieldLabel>
                        <FieldContent>
                          <SearchableMultiSelect
                            options={unitOptions}
                            selected={profileForm.unitIds}
                            onToggle={(id) =>
                              updateProfileForm((current) => ({
                                ...current,
                                unitIds: current.unitIds.includes(id)
                                  ? current.unitIds.filter((value) => value !== id)
                                  : [...current.unitIds, id],
                              }))
                            }
                            placeholder="Selecione unidades"
                            searchPlaceholder="Buscar unidade"
                            emptyMessage="Nenhuma unidade encontrada."
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Tipos</FieldLabel>
                        <FieldContent>
                          <SearchableMultiSelect
                            options={typeOptions}
                            selected={profileForm.typeIds}
                            onToggle={(id) =>
                              updateProfileForm((current) => ({
                                ...current,
                                typeIds: current.typeIds.includes(id)
                                  ? current.typeIds.filter((value) => value !== id)
                                  : [...current.typeIds, id],
                              }))
                            }
                            placeholder="Selecione tipos"
                            searchPlaceholder="Buscar tipo"
                            emptyMessage="Nenhum tipo encontrado."
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel>Rua</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.street}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, street: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Número</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.streetNumber}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, streetNumber: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Complemento</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.complement}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, complement: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Bairro</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.neighborhood}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, neighborhood: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Cidade</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.city}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, city: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>UF</FieldLabel>
                        <FieldContent>
                          <Input
                            value={profileForm.state}
                            onChange={(event) => updateProfileForm((current) => ({ ...current, state: event.target.value }))}
                            disabled={!canManageGeneral}
                          />
                        </FieldContent>
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel>Observações</FieldLabel>
                      <FieldContent>
                        <Textarea
                          rows={4}
                          value={profileForm.notes}
                          onChange={(event) => updateProfileForm((current) => ({ ...current, notes: event.target.value }))}
                          disabled={!canManageGeneral}
                        />
                      </FieldContent>
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </CardContent>
            </Card>

            <Card className={sectionCardClass}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Produtos e serviços</CardTitle>
                  <Badge variant="secondary">{detail.offerings.length} item(ns)</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.offerings.map((offering) => (
                    <div key={offering.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{offering.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {offering.offeringType} · {offering.unitOfMeasure || "sem unidade"}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {offering.isApprovedScope ? <Badge>Aprovado</Badge> : null}
                          <Badge variant="secondary">{offering.status}</Badge>
                        </div>
                      </div>
                      {offering.description ? (
                        <p className="mt-2 text-sm text-muted-foreground">{offering.description}</p>
                      ) : null}
                    </div>
                  ))}
                  {detail.offerings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum produto ou serviço cadastrado.</p>
                  ) : null}
                </div>

                {canManageGeneral ? (
                  <div className="mt-5 border-t border-border/50 pt-5">
                    <FieldSet>
                      <FieldGroup>
                        <h3 className="font-medium">Novo item</h3>
                        <Field>
                          <FieldContent>
                            <Input
                              placeholder="Nome do produto ou serviço"
                              value={offeringForm.name}
                              onChange={(event) => setOfferingForm((current) => ({ ...current, name: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field>
                            <FieldLabel>Tipo</FieldLabel>
                            <FieldContent>
                              <Select
                                value={offeringForm.offeringType}
                                onChange={(event) => setOfferingForm((current) => ({ ...current, offeringType: event.target.value }))}
                              >
                                <option value="service">Serviço</option>
                                <option value="product">Produto</option>
                              </Select>
                            </FieldContent>
                          </Field>
                          <Field>
                            <FieldLabel>Unidade de medida</FieldLabel>
                            <FieldContent>
                              <Input
                                placeholder="Unidade de medida"
                                value={offeringForm.unitOfMeasure}
                                onChange={(event) => setOfferingForm((current) => ({ ...current, unitOfMeasure: event.target.value }))}
                              />
                            </FieldContent>
                          </Field>
                        </div>
                        <Field>
                          <FieldContent>
                            <Textarea
                              placeholder="Descrição"
                              value={offeringForm.description}
                              onChange={(event) => setOfferingForm((current) => ({ ...current, description: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field orientation="horizontal">
                          <Checkbox
                            id="offering-approved-scope"
                            checked={offeringForm.isApprovedScope}
                            onCheckedChange={(checked) =>
                              setOfferingForm((current) => ({ ...current, isApprovedScope: checked === true }))
                            }
                          />
                          <FieldLabel htmlFor="offering-approved-scope">Marcar como escopo aprovado</FieldLabel>
                        </Field>
                      </FieldGroup>
                    </FieldSet>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Documentos ── */}
        <TabsContent value="documentos">
          <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className={sectionCardClass}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Submissões documentais</CardTitle>
                  <Badge variant="secondary">{detail.documents.submissions.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.documents.submissions.map((submission) => (
                    <div key={submission.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{submission.requirementName}</div>
                          <div className="text-xs text-muted-foreground">
                            {submission.submissionStatus} · {submission.adequacyStatus} · peso {submission.weight}
                          </div>
                        </div>
                        {submission.validityDate ? <Badge variant="secondary">{formatDate(submission.validityDate)}</Badge> : null}
                      </div>
                      {submission.observations ? (
                        <p className="mt-2 text-sm text-muted-foreground">{submission.observations}</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {canManageGeneral ? (
                  <div className="mt-5 border-t border-border/50 pt-5">
                    <FieldSet>
                      <FieldGroup>
                        <h3 className="font-medium">Nova submissão</h3>
                        <Field>
                          <FieldLabel>Requisito</FieldLabel>
                          <FieldContent>
                            <Select
                              value={documentSubmissionForm.requirementId}
                              onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, requirementId: event.target.value }))}
                            >
                              <option value="">Selecione um requisito</option>
                              {requirements.map((requirement) => (
                                <option key={requirement.id} value={requirement.id}>
                                  {requirement.name} (peso {requirement.weight})
                                </option>
                              ))}
                            </Select>
                          </FieldContent>
                        </Field>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field>
                            <FieldLabel>Status da submissão</FieldLabel>
                            <FieldContent>
                              <Select
                                value={documentSubmissionForm.submissionStatus}
                                onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, submissionStatus: event.target.value }))}
                              >
                                <option value="pending">Pendente</option>
                                <option value="approved">Aprovado</option>
                                <option value="rejected">Rejeitado</option>
                                <option value="exempt">Isento</option>
                              </Select>
                            </FieldContent>
                          </Field>
                          <Field>
                            <FieldLabel>Adequação</FieldLabel>
                            <FieldContent>
                              <Select
                                value={documentSubmissionForm.adequacyStatus}
                                onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, adequacyStatus: event.target.value }))}
                              >
                                <option value="under_review">Em análise</option>
                                <option value="adequate">Adequado</option>
                                <option value="not_adequate">Não adequado</option>
                              </Select>
                            </FieldContent>
                          </Field>
                        </div>
                        <Field>
                          <FieldLabel>Validade</FieldLabel>
                          <FieldContent>
                            <Input
                              type="date"
                              value={documentSubmissionForm.validityDate}
                              onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, validityDate: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Observações</FieldLabel>
                          <FieldContent>
                            <Textarea
                              placeholder="Observações"
                              value={documentSubmissionForm.observations}
                              onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, observations: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <AttachmentUploader
                          attachments={documentSubmissionForm.attachments}
                          onChange={(attachments) => setDocumentSubmissionForm((current) => ({ ...current, attachments }))}
                        />
                      </FieldGroup>
                    </FieldSet>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className={sectionCardClass}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Avaliação documental</CardTitle>
                  <Badge variant="secondary">{detail.documents.reviews.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.documents.reviews.map((review) => (
                    <div key={review.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{review.result === "apt" ? "Apto" : "Não apto"}</div>
                        <Badge variant="secondary">{review.compliancePercentage}%</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Threshold {review.threshold}% · próxima revisão {formatDate(review.nextReviewDate)}
                      </div>
                    </div>
                  ))}
                </div>

                {canManageGeneral ? (
                  <div className="mt-5 border-t border-border/50 pt-5">
                    <FieldSet>
                      <FieldGroup>
                        <h3 className="font-medium">Registrar AVA1</h3>
                        <Field>
                          <FieldLabel>Threshold (%)</FieldLabel>
                          <FieldContent>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={documentReviewForm.threshold}
                              onChange={(event) => setDocumentReviewForm((current) => ({ ...current, threshold: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Próxima revisão</FieldLabel>
                          <FieldContent>
                            <Input
                              type="date"
                              value={documentReviewForm.nextReviewDate}
                              onChange={(event) => setDocumentReviewForm((current) => ({ ...current, nextReviewDate: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Observações</FieldLabel>
                          <FieldContent>
                            <Textarea
                              placeholder="Observações"
                              value={documentReviewForm.observations}
                              onChange={(event) => setDocumentReviewForm((current) => ({ ...current, observations: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                      </FieldGroup>
                    </FieldSet>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Homologação ── */}
        <TabsContent value="homologacao">
          <Card className={sectionCardClass}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Homologação e qualificação</CardTitle>
                <Badge variant="secondary">{detail.qualificationReviews.length} revisão(ões)</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                  {detail.qualificationReviews.map((review) => (
                    <div key={review.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{review.decision}</div>
                        <Badge variant="secondary">{formatDate(review.validUntil)}</Badge>
                      </div>
                      {review.notes ? <p className="mt-2 text-sm text-muted-foreground">{review.notes}</p> : null}
                    </div>
                  ))}
                </div>
                {canManageGeneral ? (
                  <div className={cn(nestedPanelClass, "p-4")}>
                    <FieldSet>
                      <FieldGroup>
                        <Field>
                          <FieldLabel>Decisão</FieldLabel>
                          <FieldContent>
                            <Select
                              value={qualificationForm.decision}
                              onChange={(event) => setQualificationForm((current) => ({ ...current, decision: event.target.value }))}
                            >
                              <option value="approved">Aprovado</option>
                              <option value="approved_with_conditions">Aprovado com condições</option>
                              <option value="rejected">Rejeitado</option>
                            </Select>
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Válido até</FieldLabel>
                          <FieldContent>
                            <Input
                              type="date"
                              value={qualificationForm.validUntil}
                              onChange={(event) => setQualificationForm((current) => ({ ...current, validUntil: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Itens aprovados</FieldLabel>
                          <FieldContent>
                            <SearchableMultiSelect
                              options={offeringOptions}
                              selected={qualificationForm.approvedOfferingIds}
                              onToggle={(id) =>
                                setQualificationForm((current) => ({
                                  ...current,
                                  approvedOfferingIds: current.approvedOfferingIds.includes(id)
                                    ? current.approvedOfferingIds.filter((value) => value !== id)
                                    : [...current.approvedOfferingIds, id],
                                }))
                              }
                              placeholder="Selecione os itens aprovados"
                              searchPlaceholder="Buscar item"
                              emptyMessage="Nenhum item disponível."
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Parecer</FieldLabel>
                          <FieldContent>
                            <Textarea
                              placeholder="Parecer"
                              value={qualificationForm.notes}
                              onChange={(event) => setQualificationForm((current) => ({ ...current, notes: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <AttachmentUploader
                          attachments={qualificationForm.attachments}
                          onChange={(attachments) => setQualificationForm((current) => ({ ...current, attachments }))}
                        />
                      </FieldGroup>
                    </FieldSet>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Requisitos ── */}
        <TabsContent value="requisitos">
          <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className={sectionCardClass}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Comunicações registradas</CardTitle>
                  <Badge variant="secondary">{detail.requirements.communications.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.requirements.communications.map((communication) => (
                    <div key={communication.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">
                          {communication.templateTitle} · v{communication.templateVersion}
                        </div>
                        <Badge variant="secondary">{communication.status}</Badge>
                      </div>
                      {communication.notes ? (
                        <p className="mt-2 text-sm text-muted-foreground">{communication.notes}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {canManageGeneral ? (
              <Card className={sectionCardClass}>
                <CardHeader>
                  <CardTitle>Vincular requisito</CardTitle>
                </CardHeader>
                <CardContent>
                  <FieldSet>
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Template</FieldLabel>
                        <FieldContent>
                          <Select
                            value={communicationForm.templateId}
                            onChange={(event) => setCommunicationForm((current) => ({ ...current, templateId: event.target.value }))}
                          >
                            <option value="">Selecione um template</option>
                            {detail.requirements.templates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.title} · v{template.version}
                              </option>
                            ))}
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Status</FieldLabel>
                        <FieldContent>
                          <Select
                            value={communicationForm.status}
                            onChange={(event) => setCommunicationForm((current) => ({ ...current, status: event.target.value }))}
                          >
                            <option value="linked">Vinculado</option>
                            <option value="sent">Enviado</option>
                            <option value="acknowledged">Ciente</option>
                            <option value="superseded">Substituído</option>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Notas</FieldLabel>
                        <FieldContent>
                          <Textarea
                            placeholder="Notas da comunicação"
                            value={communicationForm.notes}
                            onChange={(event) => setCommunicationForm((current) => ({ ...current, notes: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                    </FieldGroup>
                  </FieldSet>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* ── Desempenho ── */}
        <TabsContent value="desempenho">
          <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className={sectionCardClass}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Avaliações AVA2</CardTitle>
                  <Badge variant="secondary">{detail.performanceReviews.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.performanceReviews.map((review) => (
                    <div key={review.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{review.offeringName || "Escopo geral"}</div>
                        <Badge variant="secondary">{review.finalScore}/10</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(review.periodStart)} a {formatDate(review.periodEnd)} · {review.conclusion}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {canManageGeneral ? (
              <Card className={sectionCardClass}>
                <CardHeader>
                  <CardTitle>Nova avaliação</CardTitle>
                </CardHeader>
                <CardContent>
                  <FieldSet>
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Escopo</FieldLabel>
                        <FieldContent>
                          <Select
                            value={performanceForm.offeringId}
                            onChange={(event) => setPerformanceForm((current) => ({ ...current, offeringId: event.target.value }))}
                          >
                            <option value="">Escopo geral</option>
                            {detail.offerings.map((offering) => (
                              <option key={offering.id} value={offering.id}>
                                {offering.name}
                              </option>
                            ))}
                          </Select>
                        </FieldContent>
                      </Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field>
                          <FieldLabel>Início do período</FieldLabel>
                          <FieldContent>
                            <Input
                              type="date"
                              value={performanceForm.periodStart}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, periodStart: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Fim do período</FieldLabel>
                          <FieldContent>
                            <Input
                              type="date"
                              value={performanceForm.periodEnd}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, periodEnd: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field>
                          <FieldLabel>Qualidade</FieldLabel>
                          <FieldContent>
                            <Input
                              type="number"
                              min={0}
                              max={10}
                              value={performanceForm.qualityScore}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, qualityScore: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Entrega</FieldLabel>
                          <FieldContent>
                            <Input
                              type="number"
                              min={0}
                              max={10}
                              value={performanceForm.deliveryScore}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, deliveryScore: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Comunicação</FieldLabel>
                          <FieldContent>
                            <Input
                              type="number"
                              min={0}
                              max={10}
                              value={performanceForm.communicationScore}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, communicationScore: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Compliance</FieldLabel>
                          <FieldContent>
                            <Input
                              type="number"
                              min={0}
                              max={10}
                              value={performanceForm.complianceScore}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, complianceScore: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                      </div>
                      <Field>
                        <FieldLabel>Preço (opcional)</FieldLabel>
                        <FieldContent>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            value={performanceForm.priceScore}
                            onChange={(event) => setPerformanceForm((current) => ({ ...current, priceScore: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field>
                          <FieldLabel>Conclusão</FieldLabel>
                          <FieldContent>
                            <Select
                              value={performanceForm.conclusion}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, conclusion: event.target.value }))}
                            >
                              <option value="maintain">Manter</option>
                              <option value="restrict">Restringir</option>
                              <option value="block">Bloquear</option>
                            </Select>
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Nível de risco</FieldLabel>
                          <FieldContent>
                            <Select
                              value={performanceForm.riskLevel}
                              onChange={(event) => setPerformanceForm((current) => ({ ...current, riskLevel: event.target.value }))}
                            >
                              <option value="low">Risco baixo</option>
                              <option value="medium">Risco médio</option>
                              <option value="high">Risco alto</option>
                            </Select>
                          </FieldContent>
                        </Field>
                      </div>
                      <Field>
                        <FieldLabel>Observações</FieldLabel>
                        <FieldContent>
                          <Textarea
                            placeholder="Observações"
                            value={performanceForm.observations}
                            onChange={(event) => setPerformanceForm((current) => ({ ...current, observations: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                    </FieldGroup>
                  </FieldSet>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* ── Recebimentos ── */}
        <TabsContent value="recebimentos">
          <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className={sectionCardClass}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recebimentos</CardTitle>
                  <Badge variant="secondary">{detail.receiptChecks.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.receiptChecks.map((receipt) => (
                    <div key={receipt.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{receipt.description}</div>
                        <Badge variant="secondary">{receipt.outcome}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(receipt.receiptDate)} · autorizador #{receipt.authorizedById ?? "—"}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{receipt.acceptanceCriteria}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {canManageReceipts ? (
              <Card className={sectionCardClass}>
                <CardHeader>
                  <CardTitle>Novo recebimento</CardTitle>
                </CardHeader>
                <CardContent>
                  <FieldSet>
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Escopo</FieldLabel>
                        <FieldContent>
                          <Select
                            value={receiptForm.offeringId}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, offeringId: event.target.value }))}
                          >
                            <option value="">Escopo geral</option>
                            {detail.offerings.map((offering) => (
                              <option key={offering.id} value={offering.id}>
                                {offering.name}
                              </option>
                            ))}
                          </Select>
                        </FieldContent>
                      </Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field>
                          <FieldLabel>Unidade</FieldLabel>
                          <FieldContent>
                            <Select
                              value={receiptForm.unitId}
                              onChange={(event) => setReceiptForm((current) => ({ ...current, unitId: event.target.value }))}
                            >
                              <option value="">Sem unidade</option>
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.name}
                                </option>
                              ))}
                            </Select>
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Autorizador</FieldLabel>
                          <FieldContent>
                            <Select
                              value={receiptForm.authorizedById}
                              onChange={(event) => setReceiptForm((current) => ({ ...current, authorizedById: event.target.value }))}
                            >
                              <option value="">Selecione o autorizador</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name}
                                </option>
                              ))}
                            </Select>
                          </FieldContent>
                        </Field>
                      </div>
                      <Field>
                        <FieldLabel>Data do recebimento</FieldLabel>
                        <FieldContent>
                          <Input
                            type="date"
                            value={receiptForm.receiptDate}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, receiptDate: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Descrição da entrega</FieldLabel>
                        <FieldContent>
                          <Input
                            value={receiptForm.description}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, description: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Referência (NF, pedido, etc.)</FieldLabel>
                        <FieldContent>
                          <Input
                            value={receiptForm.referenceNumber}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, referenceNumber: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field>
                          <FieldLabel>Quantidade</FieldLabel>
                          <FieldContent>
                            <Input
                              value={receiptForm.quantity}
                              onChange={(event) => setReceiptForm((current) => ({ ...current, quantity: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Valor total</FieldLabel>
                          <FieldContent>
                            <Input
                              type="number"
                              value={receiptForm.totalValue}
                              onChange={(event) => setReceiptForm((current) => ({ ...current, totalValue: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                      </div>
                      <Field>
                        <FieldLabel>Resultado</FieldLabel>
                        <FieldContent>
                          <Select
                            value={receiptForm.outcome}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, outcome: event.target.value }))}
                          >
                            <option value="accepted">Aceito</option>
                            <option value="accepted_with_remarks">Aceito com ressalvas</option>
                            <option value="rejected">Rejeitado</option>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Critérios de aceitação verificados</FieldLabel>
                        <FieldContent>
                          <Textarea
                            value={receiptForm.acceptanceCriteria}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, acceptanceCriteria: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Não conformidade</FieldLabel>
                        <FieldContent>
                          <Select
                            value={receiptForm.nonConformityStatus}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, nonConformityStatus: event.target.value }))}
                          >
                            <option value="not_required">Sem handoff</option>
                            <option value="pending_handoff">Handoff pendente</option>
                            <option value="handed_off">Handoff realizado</option>
                          </Select>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Resumo da não conformidade</FieldLabel>
                        <FieldContent>
                          <Textarea
                            value={receiptForm.nonConformitySummary}
                            onChange={(event) => setReceiptForm((current) => ({ ...current, nonConformitySummary: event.target.value }))}
                          />
                        </FieldContent>
                      </Field>
                      <AttachmentUploader
                        attachments={receiptForm.attachments}
                        onChange={(attachments) => setReceiptForm((current) => ({ ...current, attachments }))}
                      />
                    </FieldGroup>
                  </FieldSet>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* ── Histórico ── */}
        <TabsContent value="historico">
          <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className={sectionCardClass}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>Falhas registradas</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {detail.failures.map((failure) => (
                    <div key={failure.id} className={cn(nestedPanelClass, "p-3")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{failure.failureType}</div>
                        <Badge variant="secondary">{failure.severity}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(failure.occurredAt)} · {failure.status}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{failure.description}</p>
                    </div>
                  ))}
                  {detail.failures.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem falhas registradas.</p>
                  ) : null}
                </div>

                {canManageGeneral ? (
                  <div className="mt-5 border-t border-border/50 pt-5">
                    <FieldSet>
                      <FieldGroup>
                        <h3 className="font-medium">Nova falha</h3>
                        <Field>
                          <FieldLabel>Tipo</FieldLabel>
                          <FieldContent>
                            <Select
                              value={failureForm.failureType}
                              onChange={(event) => setFailureForm((current) => ({ ...current, failureType: event.target.value }))}
                            >
                              <option value="delivery">Entrega</option>
                              <option value="quality">Qualidade</option>
                              <option value="documentation">Documentação</option>
                              <option value="compliance">Compliance</option>
                              <option value="other">Outro</option>
                            </Select>
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Severidade</FieldLabel>
                          <FieldContent>
                            <Select
                              value={failureForm.severity}
                              onChange={(event) => setFailureForm((current) => ({ ...current, severity: event.target.value }))}
                            >
                              <option value="low">Baixa</option>
                              <option value="medium">Média</option>
                              <option value="high">Alta</option>
                              <option value="critical">Crítica</option>
                            </Select>
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Descrição</FieldLabel>
                          <FieldContent>
                            <Textarea
                              placeholder="Descrição da falha"
                              value={failureForm.description}
                              onChange={(event) => setFailureForm((current) => ({ ...current, description: event.target.value }))}
                            />
                          </FieldContent>
                        </Field>
                      </FieldGroup>
                    </FieldSet>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className={cn(nestedPanelClass, "p-3")}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldCheck className="h-4 w-4" />
                      Documentos
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{detail.documents.reviews.length}</p>
                  </div>
                  <div className={cn(nestedPanelClass, "p-3")}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ClipboardList className="h-4 w-4" />
                      Avaliações
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{detail.performanceReviews.length}</p>
                  </div>
                  <div className={cn(nestedPanelClass, "p-3")}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Receipt className="h-4 w-4" />
                      Recebimentos
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{detail.receiptChecks.length}</p>
                  </div>
                </div>

                <div className={cn(nestedPanelClass, "mt-4 space-y-3 p-4")}>
                  <div className="flex items-center gap-2 font-medium">
                    <Package2 className="h-4 w-4" />
                    Linha do tempo resumida
                  </div>
                  {detail.qualificationReviews.slice(0, 3).map((review) => (
                    <div key={`qual-${review.id}`} className="text-sm text-muted-foreground">
                      Homologação {review.decision} em {formatDate(review.createdAt)}
                    </div>
                  ))}
                  {detail.performanceReviews.slice(0, 3).map((review) => (
                    <div key={`perf-${review.id}`} className="text-sm text-muted-foreground">
                      AVA2 {review.conclusion} ({review.finalScore}/10) em {formatDate(review.createdAt)}
                    </div>
                  ))}
                  {detail.receiptChecks.slice(0, 3).map((receipt) => (
                    <div key={`rec-${receipt.id}`} className="text-sm text-muted-foreground">
                      Recebimento {receipt.outcome} em {formatDate(receipt.receiptDate)}
                    </div>
                  ))}
                  {detail.failures.length === 0 &&
                  detail.performanceReviews.length === 0 &&
                  detail.receiptChecks.length === 0 &&
                  detail.qualificationReviews.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nenhum evento relevante registrado ainda.</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

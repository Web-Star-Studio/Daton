import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import {
  useListUnits,
  useListUserOptions,
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
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
import { CheckCircle2, History, Receipt, ShieldCheck, ClipboardList, Package2, Save, Upload, X } from "lucide-react";

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

  if (detailQuery.isLoading || !profileForm) {
    return <div className="text-sm text-muted-foreground">Carregando fornecedor…</div>;
  }

  if (!detail) {
    return <div className="text-sm text-muted-foreground">Fornecedor não encontrado.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/60 p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Status</p>
          <p className="mt-3 text-2xl font-semibold">{statusLabel(detail.status)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Criticidade {detail.criticality}</p>
        </Card>
        <Card className="border-border/60 p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">AVA1</p>
          <p className="mt-3 text-2xl font-semibold">
            {detail.documentCompliancePercentage === null ? "—" : `${detail.documentCompliancePercentage}%`}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.documentReviewStatus || "Sem parecer"}
          </p>
        </Card>
        <Card className="border-border/60 p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Homologação</p>
          <p className="mt-3 text-2xl font-semibold">{detail.qualificationReviews.length}</p>
          <p className="mt-2 text-sm text-muted-foreground">Válida até {formatDate(detail.qualifiedUntil)}</p>
        </Card>
        <Card className="border-border/60 p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Falhas</p>
          <p className="mt-3 text-2xl font-semibold">{detail.failures.length}</p>
          <p className="mt-2 text-sm text-muted-foreground">Registro operacional do fornecedor</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="homologacao">Homologação</TabsTrigger>
          <TabsTrigger value="requisitos">Requisitos</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
          <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro">
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Cadastro mestre</h2>
                {canManageGeneral ? (
                  <Button onClick={() => updateSupplierMutation.mutate()} isLoading={updateSupplierMutation.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar cadastro
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Tipo de pessoa</Label>
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
                </div>
                <div>
                  <Label>{profileForm.personType === "pj" ? "CNPJ" : "CPF"}</Label>
                  <Input
                    value={profileForm.legalIdentifier}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, legalIdentifier: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>{profileForm.personType === "pj" ? "Razão social" : "Nome completo"}</Label>
                  <Input
                    value={profileForm.legalName}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, legalName: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Nome fantasia</Label>
                  <Input
                    value={profileForm.tradeName}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, tradeName: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Categoria</Label>
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
                </div>
                <div>
                  <Label>Status</Label>
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
                </div>
                <div>
                  <Label>Criticidade</Label>
                  <Select
                    value={profileForm.criticality}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, criticality: event.target.value }))}
                    disabled={!canManageGeneral}
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </Select>
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={profileForm.email}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, email: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, phone: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input
                    type="url"
                    value={profileForm.website}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, website: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input
                    value={profileForm.postalCode}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, postalCode: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Unidades</Label>
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
                </div>
                <div>
                  <Label>Tipos</Label>
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
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Rua</Label>
                  <Input
                    value={profileForm.street}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, street: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input
                    value={profileForm.streetNumber}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, streetNumber: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input
                    value={profileForm.complement}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, complement: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input
                    value={profileForm.neighborhood}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, neighborhood: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    value={profileForm.city}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, city: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input
                    value={profileForm.state}
                    onChange={(event) => updateProfileForm((current) => ({ ...current, state: event.target.value }))}
                    disabled={!canManageGeneral}
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label>Observações</Label>
                <Textarea
                  rows={4}
                  value={profileForm.notes}
                  onChange={(event) => updateProfileForm((current) => ({ ...current, notes: event.target.value }))}
                  disabled={!canManageGeneral}
                />
              </div>
            </Card>

            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Produtos e serviços</h2>
                <Badge variant="secondary">{detail.offerings.length} item(ns)</Badge>
              </div>
              <div className="space-y-3">
                {detail.offerings.map((offering) => (
                  <div key={offering.id} className="rounded-xl border border-border/60 p-3">
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
                <div className="mt-5 space-y-3 border-t border-border/50 pt-5">
                  <h3 className="font-medium">Novo item</h3>
                  <Input
                    placeholder="Nome do produto ou serviço"
                    value={offeringForm.name}
                    onChange={(event) => setOfferingForm((current) => ({ ...current, name: event.target.value }))}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select
                      value={offeringForm.offeringType}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, offeringType: event.target.value }))}
                    >
                      <option value="service">Serviço</option>
                      <option value="product">Produto</option>
                    </Select>
                    <Input
                      placeholder="Unidade de medida"
                      value={offeringForm.unitOfMeasure}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, unitOfMeasure: event.target.value }))}
                    />
                  </div>
                  <Textarea
                    placeholder="Descrição"
                    value={offeringForm.description}
                    onChange={(event) => setOfferingForm((current) => ({ ...current, description: event.target.value }))}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={offeringForm.isApprovedScope}
                      onChange={(event) => setOfferingForm((current) => ({ ...current, isApprovedScope: event.target.checked }))}
                    />
                    Marcar como escopo aprovado
                  </label>
                  <Button onClick={() => offeringMutation.mutate()} isLoading={offeringMutation.isPending}>
                    Adicionar item
                  </Button>
                </div>
              ) : null}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documentos">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Submissões documentais</h2>
                <Badge variant="secondary">{detail.documents.submissions.length}</Badge>
              </div>
              <div className="space-y-3">
                {detail.documents.submissions.map((submission) => (
                  <div key={submission.id} className="rounded-xl border border-border/60 p-3">
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
                <div className="mt-5 space-y-3 border-t border-border/50 pt-5">
                  <h3 className="font-medium">Nova submissão</h3>
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select
                      value={documentSubmissionForm.submissionStatus}
                      onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, submissionStatus: event.target.value }))}
                    >
                      <option value="pending">Pendente</option>
                      <option value="approved">Aprovado</option>
                      <option value="rejected">Rejeitado</option>
                      <option value="exempt">Isento</option>
                    </Select>
                    <Select
                      value={documentSubmissionForm.adequacyStatus}
                      onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, adequacyStatus: event.target.value }))}
                    >
                      <option value="under_review">Em análise</option>
                      <option value="adequate">Adequado</option>
                      <option value="not_adequate">Não adequado</option>
                    </Select>
                  </div>
                  <Input
                    type="date"
                    value={documentSubmissionForm.validityDate}
                    onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, validityDate: event.target.value }))}
                  />
                  <Textarea
                    placeholder="Observações"
                    value={documentSubmissionForm.observations}
                    onChange={(event) => setDocumentSubmissionForm((current) => ({ ...current, observations: event.target.value }))}
                  />
                  <AttachmentUploader
                    attachments={documentSubmissionForm.attachments}
                    onChange={(attachments) => setDocumentSubmissionForm((current) => ({ ...current, attachments }))}
                  />
                  <Button onClick={() => documentSubmissionMutation.mutate()} isLoading={documentSubmissionMutation.isPending}>
                    Salvar submissão
                  </Button>
                </div>
              ) : null}
            </Card>

            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Avaliação documental</h2>
                <Badge variant="secondary">{detail.documents.reviews.length}</Badge>
              </div>
              <div className="space-y-3">
                {detail.documents.reviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-border/60 p-3">
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
                <div className="mt-5 space-y-3 border-t border-border/50 pt-5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={documentReviewForm.threshold}
                    onChange={(event) => setDocumentReviewForm((current) => ({ ...current, threshold: event.target.value }))}
                    placeholder="Threshold"
                  />
                  <Input
                    type="date"
                    value={documentReviewForm.nextReviewDate}
                    onChange={(event) => setDocumentReviewForm((current) => ({ ...current, nextReviewDate: event.target.value }))}
                  />
                  <Textarea
                    placeholder="Observações"
                    value={documentReviewForm.observations}
                    onChange={(event) => setDocumentReviewForm((current) => ({ ...current, observations: event.target.value }))}
                  />
                  <Button onClick={() => documentReviewMutation.mutate()} isLoading={documentReviewMutation.isPending}>
                    Registrar AVA1
                  </Button>
                </div>
              ) : null}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="homologacao">
          <Card className="border-border/60 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Homologação e qualificação</h2>
              <Badge variant="secondary">{detail.qualificationReviews.length} revisão(ões)</Badge>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3">
                {detail.qualificationReviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{review.decision}</div>
                      <Badge variant="secondary">{formatDate(review.validUntil)}</Badge>
                    </div>
                    {review.notes ? <p className="mt-2 text-sm text-muted-foreground">{review.notes}</p> : null}
                  </div>
                ))}
              </div>
              {canManageGeneral ? (
                <div className="space-y-3 rounded-xl border border-border/60 p-4">
                  <Select
                    value={qualificationForm.decision}
                    onChange={(event) => setQualificationForm((current) => ({ ...current, decision: event.target.value }))}
                  >
                    <option value="approved">Aprovado</option>
                    <option value="approved_with_conditions">Aprovado com condições</option>
                    <option value="rejected">Rejeitado</option>
                  </Select>
                  <Input
                    type="date"
                    value={qualificationForm.validUntil}
                    onChange={(event) => setQualificationForm((current) => ({ ...current, validUntil: event.target.value }))}
                  />
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
                  <Textarea
                    placeholder="Parecer"
                    value={qualificationForm.notes}
                    onChange={(event) => setQualificationForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                  <AttachmentUploader
                    attachments={qualificationForm.attachments}
                    onChange={(attachments) => setQualificationForm((current) => ({ ...current, attachments }))}
                  />
                  <Button onClick={() => qualificationMutation.mutate()} isLoading={qualificationMutation.isPending}>
                    Registrar homologação
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="requisitos">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Comunicações registradas</h2>
                <Badge variant="secondary">{detail.requirements.communications.length}</Badge>
              </div>
              <div className="space-y-3">
                {detail.requirements.communications.map((communication) => (
                  <div key={communication.id} className="rounded-xl border border-border/60 p-3">
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
            </Card>

            {canManageGeneral ? (
              <Card className="border-border/60 p-6">
                <h2 className="mb-4 text-xl font-semibold tracking-tight">Vincular requisito</h2>
                <div className="space-y-3">
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
                  <Select
                    value={communicationForm.status}
                    onChange={(event) => setCommunicationForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="linked">Vinculado</option>
                    <option value="sent">Enviado</option>
                    <option value="acknowledged">Ciente</option>
                    <option value="superseded">Substituído</option>
                  </Select>
                  <Textarea
                    placeholder="Notas da comunicação"
                    value={communicationForm.notes}
                    onChange={(event) => setCommunicationForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                  <Button onClick={() => communicationMutation.mutate()} isLoading={communicationMutation.isPending}>
                    Registrar comunicação
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="desempenho">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Avaliações AVA2</h2>
                <Badge variant="secondary">{detail.performanceReviews.length}</Badge>
              </div>
              <div className="space-y-3">
                {detail.performanceReviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-border/60 p-3">
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
            </Card>

            {canManageGeneral ? (
              <Card className="border-border/60 p-6">
                <h2 className="mb-4 text-xl font-semibold tracking-tight">Nova avaliação</h2>
                <div className="space-y-3">
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      type="date"
                      value={performanceForm.periodStart}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, periodStart: event.target.value }))}
                    />
                    <Input
                      type="date"
                      value={performanceForm.periodEnd}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, periodEnd: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={performanceForm.qualityScore}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, qualityScore: event.target.value }))}
                      placeholder="Qualidade"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={performanceForm.deliveryScore}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, deliveryScore: event.target.value }))}
                      placeholder="Entrega"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={performanceForm.communicationScore}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, communicationScore: event.target.value }))}
                      placeholder="Comunicação"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={performanceForm.complianceScore}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, complianceScore: event.target.value }))}
                      placeholder="Compliance"
                    />
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={performanceForm.priceScore}
                    onChange={(event) => setPerformanceForm((current) => ({ ...current, priceScore: event.target.value }))}
                    placeholder="Preço (opcional)"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select
                      value={performanceForm.conclusion}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, conclusion: event.target.value }))}
                    >
                      <option value="maintain">Manter</option>
                      <option value="restrict">Restringir</option>
                      <option value="block">Bloquear</option>
                    </Select>
                    <Select
                      value={performanceForm.riskLevel}
                      onChange={(event) => setPerformanceForm((current) => ({ ...current, riskLevel: event.target.value }))}
                    >
                      <option value="low">Risco baixo</option>
                      <option value="medium">Risco médio</option>
                      <option value="high">Risco alto</option>
                    </Select>
                  </div>
                  <Textarea
                    placeholder="Observações"
                    value={performanceForm.observations}
                    onChange={(event) => setPerformanceForm((current) => ({ ...current, observations: event.target.value }))}
                  />
                  <Button onClick={() => performanceMutation.mutate()} isLoading={performanceMutation.isPending}>
                    Registrar AVA2
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="recebimentos">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Recebimentos</h2>
                <Badge variant="secondary">{detail.receiptChecks.length}</Badge>
              </div>
              <div className="space-y-3">
                {detail.receiptChecks.map((receipt) => (
                  <div key={receipt.id} className="rounded-xl border border-border/60 p-3">
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
            </Card>

            {canManageReceipts ? (
              <Card className="border-border/60 p-6">
                <h2 className="mb-4 text-xl font-semibold tracking-tight">Novo recebimento</h2>
                <div className="space-y-3">
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
                  <div className="grid gap-3 md:grid-cols-2">
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
                  </div>
                  <Input
                    type="date"
                    value={receiptForm.receiptDate}
                    onChange={(event) => setReceiptForm((current) => ({ ...current, receiptDate: event.target.value }))}
                  />
                  <Input
                    placeholder="Descrição da entrega"
                    value={receiptForm.description}
                    onChange={(event) => setReceiptForm((current) => ({ ...current, description: event.target.value }))}
                  />
                  <Input
                    placeholder="Referência (NF, pedido, etc.)"
                    value={receiptForm.referenceNumber}
                    onChange={(event) => setReceiptForm((current) => ({ ...current, referenceNumber: event.target.value }))}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      placeholder="Quantidade"
                      value={receiptForm.quantity}
                      onChange={(event) => setReceiptForm((current) => ({ ...current, quantity: event.target.value }))}
                    />
                    <Input
                      type="number"
                      placeholder="Valor total"
                      value={receiptForm.totalValue}
                      onChange={(event) => setReceiptForm((current) => ({ ...current, totalValue: event.target.value }))}
                    />
                  </div>
                  <Select
                    value={receiptForm.outcome}
                    onChange={(event) => setReceiptForm((current) => ({ ...current, outcome: event.target.value }))}
                  >
                    <option value="accepted">Aceito</option>
                    <option value="accepted_with_remarks">Aceito com ressalvas</option>
                    <option value="rejected">Rejeitado</option>
                  </Select>
                  <Textarea
                    placeholder="Critérios de aceitação verificados"
                    value={receiptForm.acceptanceCriteria}
                    onChange={(event) => setReceiptForm((current) => ({ ...current, acceptanceCriteria: event.target.value }))}
                  />
                  <Select
                    value={receiptForm.nonConformityStatus}
                    onChange={(event) => setReceiptForm((current) => ({ ...current, nonConformityStatus: event.target.value }))}
                  >
                    <option value="not_required">Sem handoff</option>
                    <option value="pending_handoff">Handoff pendente</option>
                    <option value="handed_off">Handoff realizado</option>
                  </Select>
                  <Textarea
                    placeholder="Resumo da não conformidade"
                    value={receiptForm.nonConformitySummary}
                    onChange={(event) => setReceiptForm((current) => ({ ...current, nonConformitySummary: event.target.value }))}
                  />
                  <AttachmentUploader
                    attachments={receiptForm.attachments}
                    onChange={(attachments) => setReceiptForm((current) => ({ ...current, attachments }))}
                  />
                  <Button onClick={handleReceiptSubmit} isLoading={receiptMutation.isPending}>
                    Registrar recebimento
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="historico">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border/60 p-6">
              <div className="mb-4 flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold tracking-tight">Falhas registradas</h2>
              </div>
              <div className="space-y-3">
                {detail.failures.map((failure) => (
                  <div key={failure.id} className="rounded-xl border border-border/60 p-3">
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
                <div className="mt-5 space-y-3 border-t border-border/50 pt-5">
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
                  <Select
                    value={failureForm.severity}
                    onChange={(event) => setFailureForm((current) => ({ ...current, severity: event.target.value }))}
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </Select>
                  <Textarea
                    placeholder="Descrição da falha"
                    value={failureForm.description}
                    onChange={(event) => setFailureForm((current) => ({ ...current, description: event.target.value }))}
                  />
                  <Button onClick={() => failureMutation.mutate()} isLoading={failureMutation.isPending}>
                    Registrar falha
                  </Button>
                </div>
              ) : null}
            </Card>

            <Card className="border-border/60 p-6">
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    Documentos
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{detail.documents.reviews.length}</p>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ClipboardList className="h-4 w-4" />
                    Avaliações
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{detail.performanceReviews.length}</p>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Receipt className="h-4 w-4" />
                    Recebimentos
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{detail.receiptChecks.length}</p>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 p-4">
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
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

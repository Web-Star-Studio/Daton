import React, { useEffect, useMemo, useState } from "react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ProfileItemAttachmentsField } from "@/components/employees/profile-item-form-fields";
import {
  SearchableMultiSelect,
  type SearchableMultiSelectOption,
} from "@/components/ui/searchable-multi-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT,
  uploadFilesToStorage,
  validateProfileItemUploadSelection,
  type UploadedFileRef,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";
import {
  useAllActiveSgqProcesses,
  useDeleteKnowledgeAssetMutation,
  useKnowledgeAsset,
  useKnowledgeAssetMutation,
  useKnowledgeAssets,
  type Attachment,
  type KnowledgeAssetDetail,
  type KnowledgeAssetSummary,
} from "@/lib/governance-system-client";
import { useGovernanceRiskOpportunityItems } from "@/lib/governance-client";
import {
  getListPositionsQueryKey,
  useListDocuments,
  useListPositions,
  type DocumentSummary,
  type KnowledgeAssetEvidenceStatus,
  type KnowledgeAssetLossRiskLevel,
  type ListKnowledgeAssetsParams,
  type Position,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  BookKey,
  CheckCircle2,
  Link2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

type AttachmentState = Array<Attachment | UploadedFileRef>;

type KnowledgeAssetFormState = {
  title: string;
  description: string;
  lossRiskLevel: "low" | "medium" | "high" | "critical";
  retentionMethod: string;
  successionPlan: string;
  evidenceValidUntil: string;
  processIds: number[];
  positionIds: number[];
  documentIds: number[];
  riskOpportunityItemIds: number[];
};

function emptyForm(): KnowledgeAssetFormState {
  return {
    title: "",
    description: "",
    lossRiskLevel: "medium",
    retentionMethod: "",
    successionPlan: "",
    evidenceValidUntil: "",
    processIds: [],
    positionIds: [],
    documentIds: [],
    riskOpportunityItemIds: [],
  };
}

function getEvidenceStatusTone(status: string) {
  switch (status) {
    case "expired":
      return "bg-red-100 text-red-800 border-red-200";
    case "valid":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getEvidenceStatusLabel(status: string) {
  switch (status) {
    case "expired":
      return "Evidência vencida";
    case "valid":
      return "Evidência válida";
    default:
      return "Sem evidência";
  }
}

function getLossRiskTone(level: string) {
  switch (level) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "low":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-200";
  }
}

function getLossRiskLabel(level: string) {
  switch (level) {
    case "critical":
      return "Crítico";
    case "high":
      return "Alto";
    case "low":
      return "Baixo";
    default:
      return "Médio";
  }
}

function mapAttachmentItems(
  attachments: AttachmentState,
  onRemoveAttachment?: (objectPath: string) => void,
) {
  return attachments.map((attachment, index) => ({
    id: `${attachment.objectPath}-${index}`,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    objectPath: attachment.objectPath,
    onRemove: onRemoveAttachment
      ? () => onRemoveAttachment(attachment.objectPath)
      : undefined,
  }));
}

function buildKnowledgeAssetPayload(
  form: KnowledgeAssetFormState,
  evidenceAttachments: AttachmentState,
) {
  const links = [
    ...form.processIds.map((processId) => ({ processId })),
    ...form.positionIds.map((positionId) => ({ positionId })),
    ...form.documentIds.map((documentId) => ({ documentId })),
    ...form.riskOpportunityItemIds.map((riskOpportunityItemId) => ({
      riskOpportunityItemId,
    })),
  ];

  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    lossRiskLevel: form.lossRiskLevel,
    retentionMethod: form.retentionMethod.trim() || null,
    successionPlan: form.successionPlan.trim() || null,
    evidenceValidUntil: form.evidenceValidUntil || null,
    evidenceAttachments,
    links,
  };
}

function assetToForm(asset: KnowledgeAssetDetail): KnowledgeAssetFormState {
  return {
    title: asset.title,
    description: asset.description || "",
    lossRiskLevel: asset.lossRiskLevel,
    retentionMethod: asset.retentionMethod || "",
    successionPlan: asset.successionPlan || "",
    evidenceValidUntil: asset.evidenceValidUntil || "",
    processIds: asset.links
      .map((link: KnowledgeAssetDetail["links"][number]) => link.processId)
      .filter((value): value is number => value != null),
    positionIds: asset.links
      .map((link: KnowledgeAssetDetail["links"][number]) => link.positionId)
      .filter((value): value is number => value != null),
    documentIds: asset.links
      .map((link: KnowledgeAssetDetail["links"][number]) => link.documentId)
      .filter((value): value is number => value != null),
    riskOpportunityItemIds: asset.links
      .map((link: KnowledgeAssetDetail["links"][number]) => link.riskOpportunityItemId)
      .filter((value): value is number => value != null),
  };
}

function toggleSelection(current: number[], value: number) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function renderLinkBadges(asset: KnowledgeAssetSummary | KnowledgeAssetDetail) {
  if (asset.links.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {asset.links.map((link: KnowledgeAssetSummary["links"][number]) => {
        const label =
          link.processName
            ? `Processo: ${link.processName}`
            : link.positionName
              ? `Cargo: ${link.positionName}`
              : link.documentTitle
                ? `Documento: ${link.documentTitle}`
                : link.riskOpportunityItemLabel
                  ? `Risco/Oportunidade: ${link.riskOpportunityItemLabel}`
                  : "Vínculo";

        const supportingText = link.riskOpportunityPlanTitle
          ? ` · ${link.riskOpportunityPlanTitle}`
          : "";

        return (
          <span
            key={link.id}
            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            {label}
            {supportingText}
          </span>
        );
      })}
    </div>
  );
}

export default function GovernanceKnowledgeAssetsPage() {
  usePageTitle("Conhecimento Crítico");

  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization?.id;
  const canWrite = canWriteModule("governance");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [processFilter, setProcessFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [documentFilter, setDocumentFilter] = useState("");
  const [riskItemFilter, setRiskItemFilter] = useState("");
  const [lossRiskFilter, setLossRiskFilter] = useState("");
  const [evidenceStatusFilter, setEvidenceStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<KnowledgeAssetDetail | null>(null);
  const [form, setForm] = useState<KnowledgeAssetFormState>(emptyForm());
  const [attachments, setAttachments] = useState<AttachmentState>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const listParams = useMemo<ListKnowledgeAssetsParams>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
      processId: processFilter ? Number(processFilter) : undefined,
      positionId: positionFilter ? Number(positionFilter) : undefined,
      documentId: documentFilter ? Number(documentFilter) : undefined,
      riskOpportunityItemId: riskItemFilter ? Number(riskItemFilter) : undefined,
      lossRiskLevel:
        (lossRiskFilter as KnowledgeAssetLossRiskLevel | "") || undefined,
      evidenceStatus:
        (evidenceStatusFilter as KnowledgeAssetEvidenceStatus | "") || undefined,
    }),
    [
      debouncedSearch,
      documentFilter,
      evidenceStatusFilter,
      lossRiskFilter,
      page,
      positionFilter,
      processFilter,
      riskItemFilter,
    ],
  );

  const { data: assetList, isLoading } = useKnowledgeAssets(orgId, listParams);
  const assets = assetList?.data ?? [];
  const pagination = assetList?.pagination;

  const { data: selectedAsset } = useKnowledgeAsset(orgId, selectedId);
  const saveMutation = useKnowledgeAssetMutation(orgId, editingAsset?.id);
  const deleteMutation = useDeleteKnowledgeAssetMutation(orgId);

  const { data: processes = [] } = useAllActiveSgqProcesses(orgId);
  const { data: positions = [] } = useListPositions(orgId ?? 0, {
    query: {
      enabled: !!orgId,
      queryKey: getListPositionsQueryKey(orgId ?? 0),
    },
  });
  const { data: documents = [] } = useListDocuments(orgId ?? 0, {
    page: 1,
    pageSize: 100,
  });
  const { data: riskItems = [] } = useGovernanceRiskOpportunityItems(orgId);

  const positionOptions = useMemo<SearchableMultiSelectOption[]>(
    () =>
      (positions ?? []).map((position: Position) => ({
        value: position.id,
        label: position.name,
      })),
    [positions],
  );
  const processOptions = useMemo<SearchableMultiSelectOption[]>(
    () =>
      processes.map((process) => ({
        value: process.id,
        label: process.name,
      })),
    [processes],
  );
  const documentOptions = useMemo<SearchableMultiSelectOption[]>(
    () =>
      (documents ?? []).map((document: DocumentSummary) => ({
        value: document.id,
        label: document.title,
      })),
    [documents],
  );
  const riskItemOptions = useMemo<SearchableMultiSelectOption[]>(
    () =>
      riskItems.map((item) => ({
        value: item.id,
        label: `${item.planTitle} · ${item.type === "opportunity" ? "Oportunidade" : "Risco"} · ${item.description}`,
      })),
    [riskItems],
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    const queryPositionId = searchParams.get("positionId");
    if (queryPositionId) {
      setPositionFilter(queryPositionId);
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    processFilter,
    positionFilter,
    documentFilter,
    riskItemFilter,
    lossRiskFilter,
    evidenceStatusFilter,
  ]);

  useEffect(() => {
    if (assets.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !assets.some((asset) => asset.id === selectedId)) {
      setSelectedId(assets[0].id);
    }
  }, [assets, selectedId]);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingAsset(null);
    setForm(emptyForm());
    setAttachments([]);
    setIsUploadingAttachments(false);
  };

  const openCreateDialog = () => {
    setEditingAsset(null);
    setForm(emptyForm());
    setAttachments([]);
    setDialogOpen(true);
  };

  const openEditDialog = () => {
    if (!selectedAsset) return;
    setEditingAsset(selectedAsset);
    setForm(assetToForm(selectedAsset));
    setAttachments(selectedAsset.evidenceAttachments || []);
    setDialogOpen(true);
  };

  const handleUploadAttachments = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    const validationError = validateProfileItemUploadSelection(
      selectedFiles,
      attachments.length,
    );
    if (validationError) {
      toast({
        title: "Falha ao anexar",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAttachments(true);
    try {
      const uploadedFiles = await uploadFilesToStorage(selectedFiles);
      setAttachments((current) => [...current, ...uploadedFiles]);
    } catch (error) {
      toast({
        title: "Falha ao enviar anexo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const handleSave = async () => {
    const payload = buildKnowledgeAssetPayload(form, attachments);

    if (!payload.title) {
      toast({
        title: "Título obrigatório",
        description: "Informe o título do conhecimento crítico.",
        variant: "destructive",
      });
      return;
    }

    if (payload.links.length === 0) {
      toast({
        title: "Vínculo obrigatório",
        description:
          "Associe o ativo a pelo menos um processo, cargo, documento ou risco/oportunidade.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingAsset) {
        const updated = await saveMutation.mutateAsync({
          method: "PATCH",
          body: payload,
        });
        setSelectedId(updated.id);
        toast({
          title: "Conhecimento crítico atualizado",
          description: "As alterações foram salvas.",
        });
      } else {
        const created = await saveMutation.mutateAsync({
          method: "POST",
          body: payload,
        });
        setSelectedId(created.id);
        toast({
          title: "Conhecimento crítico criado",
          description: "O ativo foi registrado com sucesso.",
        });
      }
      closeDialog();
    } catch (error) {
      toast({
        title: "Falha ao salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedAsset) return;
    if (!window.confirm("Deseja excluir este ativo de conhecimento crítico?")) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(selectedAsset.id);
      toast({
        title: "Conhecimento crítico excluído",
        description: "O registro foi removido.",
      });
      setSelectedId(undefined);
    } catch (error) {
      toast({
        title: "Falha ao excluir",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const headerActions = useMemo(() => {
    if (!canWrite) return null;
    return (
      <Button size="sm" onClick={openCreateDialog}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Novo ativo
      </Button>
    );
  }, [canWrite]);

  useHeaderActions(headerActions);

  if (!orgId) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor="knowledge-search" className="text-xs font-semibold text-muted-foreground">
            Busca
          </Label>
          <Input
            id="knowledge-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Título, descrição ou contexto"
            className="mt-2"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Cargo</Label>
          <Select
            value={positionFilter}
            onChange={(event) => setPositionFilter(event.target.value)}
            className="mt-2"
          >
            <option value="">Todos os cargos</option>
            {positionOptions.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Processo</Label>
          <Select
            value={processFilter}
            onChange={(event) => setProcessFilter(event.target.value)}
            className="mt-2"
          >
            <option value="">Todos os processos</option>
            {processOptions.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Documento</Label>
          <Select
            value={documentFilter}
            onChange={(event) => setDocumentFilter(event.target.value)}
            className="mt-2"
          >
            <option value="">Todos os documentos</option>
            {documentOptions.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Risco/Oportunidade
          </Label>
          <Select
            value={riskItemFilter}
            onChange={(event) => setRiskItemFilter(event.target.value)}
            className="mt-2"
          >
            <option value="">Todos os vínculos</option>
            {riskItemOptions.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Risco de perda
          </Label>
          <Select
            value={lossRiskFilter}
            onChange={(event) => setLossRiskFilter(event.target.value)}
            className="mt-2"
          >
            <option value="">Todos os níveis</option>
            <option value="low">Baixo</option>
            <option value="medium">Médio</option>
            <option value="high">Alto</option>
            <option value="critical">Crítico</option>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Situação da evidência
          </Label>
          <Select
            value={evidenceStatusFilter}
            onChange={(event) => setEvidenceStatusFilter(event.target.value)}
            className="mt-2"
          >
            <option value="">Todas</option>
            <option value="missing">Sem evidência</option>
            <option value="expired">Vencida</option>
            <option value="valid">Válida</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="border-border/60">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Ativos mapeados</CardTitle>
            <p className="text-sm text-muted-foreground">
              Conhecimento organizacional crítico com retenção, sucessão e evidência.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando ativos...</p>
            ) : assets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <BookKey className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Nenhum ativo encontrado para os filtros atuais.
                </p>
              </div>
            ) : (
              assets.map((asset: KnowledgeAssetSummary) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setSelectedId(asset.id)}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                    selectedId === asset.id
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{asset.title}</p>
                      {asset.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {asset.description}
                        </p>
                      ) : null}
                    </div>
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className={cn("border", getLossRiskTone(asset.lossRiskLevel))}>
                      Risco {getLossRiskLabel(asset.lossRiskLevel)}
                    </Badge>
                    <Badge className={cn("border", getEvidenceStatusTone(asset.evidenceStatus))}>
                      {getEvidenceStatusLabel(asset.evidenceStatus)}
                    </Badge>
                  </div>
                </button>
              ))
            )}

            {pagination ? (
              <PaginationControls
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={pagination.total}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                disabled={isLoading}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Detalhe do ativo</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Vínculos contextuais, evidências e plano de retenção do conhecimento.
              </p>
            </div>
            {selectedAsset && canWrite ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={openEditDialog}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Excluir
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {!selectedAsset ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <Link2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Selecione um ativo para ver os detalhes completos.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge className={cn("border", getLossRiskTone(selectedAsset.lossRiskLevel))}>
                      Risco {getLossRiskLabel(selectedAsset.lossRiskLevel)}
                    </Badge>
                    <Badge className={cn("border", getEvidenceStatusTone(selectedAsset.evidenceStatus))}>
                      {selectedAsset.evidenceStatus === "expired" ? (
                        <AlertTriangle className="mr-1 h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      {getEvidenceStatusLabel(selectedAsset.evidenceStatus)}
                    </Badge>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{selectedAsset.title}</h2>
                    {selectedAsset.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedAsset.description}
                      </p>
                    ) : null}
                  </div>
                  {renderLinkBadges(selectedAsset)}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Retenção
                    </p>
                    <p className="mt-2 text-sm">
                      {selectedAsset.retentionMethod || "Não informado"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Sucessão
                    </p>
                    <p className="mt-2 text-sm">
                      {selectedAsset.successionPlan || "Não informado"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Validade da evidência
                    </p>
                    <p className="mt-2 text-sm">
                      {selectedAsset.evidenceValidUntil || "Sem vencimento definido"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Última atualização
                    </p>
                    <p className="mt-2 text-sm">
                      {selectedAsset.updatedAt || "Sem histórico"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Evidências
                  </p>
                  <ProfileItemAttachmentsField
                    attachments={mapAttachmentItems(selectedAsset.evidenceAttachments)}
                    emptyText="Nenhuma evidência anexada."
                    accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                  />
                </div>

                <div className="rounded-xl border border-border/60 bg-card px-4 py-3 text-xs text-muted-foreground">
                  Criado por {selectedAsset.createdByName || "usuário removido"} em{" "}
                  {selectedAsset.createdAt || "data indisponível"}.
                  {" "}
                  Última atualização por {selectedAsset.updatedByName || "usuário removido"}.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}
        title={editingAsset ? "Editar conhecimento crítico" : "Novo conhecimento crítico"}
        description="Registre o conhecimento, os vínculos contextuais e a evidência disponível."
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="knowledge-title">Título *</Label>
              <Input
                id="knowledge-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                className="mt-2"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="knowledge-description">Descrição</Label>
              <Textarea
                id="knowledge-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="mt-2 min-h-24"
              />
            </div>
            <div>
              <Label htmlFor="knowledge-loss-risk">Risco de perda</Label>
              <Select
                id="knowledge-loss-risk"
                value={form.lossRiskLevel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lossRiskLevel: event.target.value as KnowledgeAssetFormState["lossRiskLevel"],
                  }))
                }
                className="mt-2"
              >
                <option value="low">Baixo</option>
                <option value="medium">Médio</option>
                <option value="high">Alto</option>
                <option value="critical">Crítico</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="knowledge-valid-until">Validade da evidência</Label>
              <Input
                id="knowledge-valid-until"
                type="date"
                value={form.evidenceValidUntil}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    evidenceValidUntil: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="knowledge-retention">Método de retenção</Label>
              <Textarea
                id="knowledge-retention"
                value={form.retentionMethod}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    retentionMethod: event.target.value,
                  }))
                }
                className="mt-2 min-h-24"
              />
            </div>
            <div>
              <Label htmlFor="knowledge-succession">Plano de sucessão</Label>
              <Textarea
                id="knowledge-succession"
                value={form.successionPlan}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    successionPlan: event.target.value,
                  }))
                }
                className="mt-2 min-h-24"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Processos SGQ
              </Label>
              <SearchableMultiSelect
                options={processOptions}
                selected={form.processIds}
                onToggle={(value) =>
                  setForm((current) => ({
                    ...current,
                    processIds: toggleSelection(current.processIds, value),
                  }))
                }
                placeholder="Selecione processos"
                searchPlaceholder="Buscar processo"
                emptyMessage="Nenhum processo encontrado"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Cargos</Label>
              <SearchableMultiSelect
                options={positionOptions}
                selected={form.positionIds}
                onToggle={(value) =>
                  setForm((current) => ({
                    ...current,
                    positionIds: toggleSelection(current.positionIds, value),
                  }))
                }
                placeholder="Selecione cargos"
                searchPlaceholder="Buscar cargo"
                emptyMessage="Nenhum cargo encontrado"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Documentos
              </Label>
              <SearchableMultiSelect
                options={documentOptions}
                selected={form.documentIds}
                onToggle={(value) =>
                  setForm((current) => ({
                    ...current,
                    documentIds: toggleSelection(current.documentIds, value),
                  }))
                }
                placeholder="Selecione documentos"
                searchPlaceholder="Buscar documento"
                emptyMessage="Nenhum documento encontrado"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Riscos e oportunidades
              </Label>
              <SearchableMultiSelect
                options={riskItemOptions}
                selected={form.riskOpportunityItemIds}
                onToggle={(value) =>
                  setForm((current) => ({
                    ...current,
                    riskOpportunityItemIds: toggleSelection(
                      current.riskOpportunityItemIds,
                      value,
                    ),
                  }))
                }
                placeholder="Selecione riscos/oportunidades"
                searchPlaceholder="Buscar vínculo"
                emptyMessage="Nenhum vínculo encontrado"
              />
            </div>
          </div>

          <div>
            <ProfileItemAttachmentsField
              attachments={mapAttachmentItems(attachments, (objectPath) => {
                setAttachments((current) =>
                  current.filter((attachment) => attachment.objectPath !== objectPath),
                );
              })}
              onUpload={(files) => {
                void handleUploadAttachments(files);
              }}
              uploading={isUploadingAttachments}
              emptyText="Adicione evidências do conhecimento crítico, como registros, procedimentos, vídeos ou materiais de apoio."
              accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeDialog}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveMutation.isPending || isUploadingAttachments}
          >
            {editingAsset ? "Salvar alterações" : "Criar ativo"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

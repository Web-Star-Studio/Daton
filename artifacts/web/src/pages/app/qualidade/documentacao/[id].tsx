import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import {
  useGetDocument,
  getGetDocumentQueryKey,
  useUpdateDocument,
  useSubmitDocumentForReview,
  useApproveDocument,
  useRejectDocument,
  useAcknowledgeDocument,
  useAddDocumentAttachment,
  useDeleteDocumentAttachment,
  useResetDocumentVersions,
  useDeleteDocument,
  useListUnits,
  useListEmployees,
  getListEmployeesQueryKey,
  useListUserOptions,
  useListDocuments,
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import type {
  DocumentDetailUnitsItem,
  DocumentDetailApproversItem,
  DocumentDetailRecipientsItem,
  DocumentDetailReferencesItem,
  DocumentAttachment,
  DocumentVersion,
  UserOption,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmployeeCombobox } from "@/components/employees/employee-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { DialogStepTabs } from "@/components/ui/dialog-step-tabs";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";
import { DOCUMENT_ELABORATOR_PAGE_SIZE } from "@/lib/document-elaborators";
import {
  FileText,
  Upload,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Users,
  GitBranch,
  Paperclip,
  Trash2,
  RotateCcw,
  Eye,
  Pencil,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em Revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  distributed: "Distribuído",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  distributed: "bg-blue-50 text-blue-700 border-blue-200",
};

const TYPE_LABELS: Record<string, string> = {
  manual: "Manual",
  procedimento: "Procedimento",
  instrucao: "Instrução",
  formulario: "Formulário",
  registro: "Registro",
  politica: "Política",
  outro: "Outro",
};

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return String(d);
  }
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(d);
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatVersionLabel(version: number | null | undefined) {
  if (!version || version <= 0) return "Sem versão aprovada";
  return `v${version}`;
}

interface EditFormState {
  title: string;
  type: string;
  validityDate: string;
  elaboratorId: number;
  unitIds: number[];
  approverIds: number[];
  recipientIds: number[];
  referenceIds: number[];
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const docId = parseInt(id || "0", 10);
  const { organization, user, role } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "info" | "attachments" | "versions" | "flow"
  >("info");
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editStep, setEditStep] = useState(0);
  const [maxReachedEditStep, setMaxReachedEditStep] = useState(0);
  const [submitDialog, setSubmitDialog] = useState(false);
  const [submitChangeDescription, setSubmitChangeDescription] = useState("");
  const [attachmentActionKey, setAttachmentActionKey] = useState<
    string | null
  >(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const { data: doc, isLoading } = useGetDocument(orgId!, docId, {
    query: {
      queryKey: getGetDocumentQueryKey(orgId!, docId),
      enabled: !!orgId && docId > 0,
    },
  });

  const { data: allUnits } = useListUnits(orgId!, {
    query: {
      queryKey: getListUnitsQueryKey(orgId!),
      enabled: !!orgId && editDialogOpen,
    },
  });
  const { data: employeesResult } = useListEmployees(
    orgId!,
    { page: 1, pageSize: DOCUMENT_ELABORATOR_PAGE_SIZE },
    {
      query: {
        queryKey: getListEmployeesQueryKey(orgId!, {
          page: 1,
          pageSize: DOCUMENT_ELABORATOR_PAGE_SIZE,
        }),
        enabled: !!orgId && editDialogOpen,
      },
    },
  );
  const { data: allUsers } = useListUserOptions(orgId!, {
    query: {
      queryKey: getListUserOptionsQueryKey(orgId!),
      enabled: !!orgId && editDialogOpen,
    },
  });
  const { data: allDocs } = useListDocuments(
    orgId!,
    {},
    {
      query: {
        queryKey: getListDocumentsQueryKey(orgId!, {}),
        enabled: !!orgId && editDialogOpen,
      },
    },
  );
  const orgUsers = allUsers ?? [];
  const availableEmployees = useMemo(
    () => employeesResult?.data ?? [],
    [employeesResult?.data],
  );

  usePageTitle(doc?.title);

  const updateMut = useUpdateDocument();
  const submitMut = useSubmitDocumentForReview();
  const approveMut = useApproveDocument();
  const rejectMut = useRejectDocument();
  const acknowledgeMut = useAcknowledgeDocument();
  const addAttachmentMut = useAddDocumentAttachment();
  const deleteAttachmentMut = useDeleteDocumentAttachment();
  const resetVersionsMut = useResetDocumentVersions();
  const deleteMut = useDeleteDocument();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetDocumentQueryKey(orgId!, docId),
    });

  const isApprover = doc?.approvers?.some(
    (a: DocumentDetailApproversItem) => a.userId === user?.id,
  );
  const isRecipient = doc?.recipients?.some(
    (r: DocumentDetailRecipientsItem) => r.userId === user?.id,
  );
  const myApproval = doc?.approvers?.find(
    (a: DocumentDetailApproversItem) => a.userId === user?.id,
  );
  const myReceipt = doc?.recipients?.find(
    (r: DocumentDetailRecipientsItem) => r.userId === user?.id,
  );
  const canWriteDocuments = canWriteModule("documents");
  const canEdit =
    canWriteDocuments &&
    (doc?.status === "draft" || doc?.status === "rejected");
  const canSubmitForReview =
    canWriteDocuments &&
    (role === "org_admin" || role === "operator") &&
    (doc?.status === "draft" || doc?.status === "rejected");

  const handleSubmitForReview = async () => {
    if (!orgId || !submitChangeDescription.trim()) return;
    await submitMut.mutateAsync({
      orgId,
      docId,
      data: { changeDescription: submitChangeDescription.trim() },
    });
    setSubmitDialog(false);
    setSubmitChangeDescription("");
    invalidate();
  };

  const handleApprove = async () => {
    if (!orgId) return;
    await approveMut.mutateAsync({ orgId, docId, data: {} });
    invalidate();
  };

  const handleAcknowledge = async () => {
    if (!orgId) return;
    await acknowledgeMut.mutateAsync({ orgId, docId });
    invalidate();
  };

  const handleOpenEditDialog = () => {
    if (!doc) return;
    setEditForm({
      title: doc.title,
      type: doc.type,
      validityDate: doc.validityDate ?? "",
      elaboratorId: doc.elaborators?.[0]?.id ?? 0,
      unitIds:
        doc.units
          ?.map((u: DocumentDetailUnitsItem) => u.id!)
          .filter(Boolean) ?? [],
      approverIds:
        doc.approvers
          ?.map((a: DocumentDetailApproversItem) => a.userId!)
          .filter(Boolean) ?? [],
      recipientIds:
        doc.recipients
          ?.map((r: DocumentDetailRecipientsItem) => r.userId!)
          .filter(Boolean) ?? [],
      referenceIds:
        doc.references
          ?.map((ref: DocumentDetailReferencesItem) => ref.documentId!)
          .filter(Boolean) ?? [],
    });
    setEditStep(0);
    setMaxReachedEditStep(0);
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditStep(0);
    setMaxReachedEditStep(0);
    setEditForm(null);
  };

  const validateEditStep = (currentStep: number, form: EditFormState) => {
    if (currentStep === 0) {
      return form.title.trim().length > 0;
    }

    if (currentStep === 1) {
      return (
        form.elaboratorId > 0 &&
        form.approverIds.length > 0 &&
        form.recipientIds.length > 0
      );
    }

    return true;
  };

  const changeEditStep = (targetStep: number) => {
    if (!editForm) return;

    const boundedTarget = Math.max(0, Math.min(targetStep, 2));
    if (boundedTarget > editStep && !validateEditStep(editStep, editForm)) {
      return;
    }

    setEditStep(boundedTarget);
    setMaxReachedEditStep((current) => Math.max(current, boundedTarget));
  };

  const handleSaveEditDialog = async () => {
    if (!orgId || !editForm) return;
    await updateMut.mutateAsync({
      orgId,
      docId,
      data: {
        title: editForm.title.trim(),
        type: editForm.type,
        validityDate: editForm.validityDate || undefined,
        elaboratorId: editForm.elaboratorId,
        unitIds: editForm.unitIds,
        approverIds: editForm.approverIds,
        recipientIds: editForm.recipientIds,
        referenceIds: editForm.referenceIds,
      },
    });
    handleCloseEditDialog();
    invalidate();
  };

  useHeaderActions(
    doc ? (
      <div className="flex items-center gap-2">
        {canEdit && (
          <Button size="sm" variant="outline" onClick={handleOpenEditDialog}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
          </Button>
        )}
        {canSubmitForReview && doc.status === "draft" && (
          <Button
            size="sm"
            onClick={() => {
              setSubmitChangeDescription("");
              setSubmitDialog(true);
            }}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar para Revisão
          </Button>
        )}
        {canSubmitForReview && doc.status === "rejected" && (
          <Button
            size="sm"
            onClick={() => {
              setSubmitChangeDescription("");
              setSubmitDialog(true);
            }}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" /> Reenviar para Revisão
          </Button>
        )}
        {canWriteDocuments &&
          doc.status === "in_review" &&
          isApprover &&
          myApproval?.status === "pending" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectDialog(true)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" /> Rejeitar
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                isLoading={approveMut.isPending}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Aprovar
              </Button>
            </>
          )}
        {doc.status === "draft" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDeleteDialog(true)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
          </Button>
        )}
      </div>
    ) : null,
  );

  const handleReject = async () => {
    if (!orgId || !rejectComment.trim()) return;
    await rejectMut.mutateAsync({
      orgId,
      docId,
      data: { comment: rejectComment },
    });
    setRejectDialog(false);
    setRejectComment("");
    invalidate();
  };

  const handleDelete = async () => {
    if (!orgId) return;
    await deleteMut.mutateAsync({ orgId, docId });
    navigate("/qualidade/documentacao");
  };

  const handleAttachmentAction = async (
    attachment: DocumentAttachment,
    disposition: "inline" | "attachment",
  ) => {
    if (!orgId || !attachment.id) return;
    const actionKey = `${attachment.id}:${disposition}`;
    setAttachmentActionKey(actionKey);

    try {
      const response = await fetch(
        resolveApiUrl(
          `/api/organizations/${orgId}/documents/${docId}/attachments/${attachment.id}/file?disposition=${disposition}`,
        ),
        {
          headers: getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;

      if (disposition === "inline") {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      } else {
        link.download = attachment.fileName;
      }

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      console.error("Attachment fetch failed:", error);
    } finally {
      setAttachmentActionKey(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !orgId) return;

    setIsUploading(true);
    const token = localStorage.getItem("daton_token");

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) continue;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(
          resolveApiUrl("/api/storage/uploads/direct"),
          {
            method: "POST",
            headers: {
              "X-File-Content-Type": file.type,
              "X-File-Name": encodeURIComponent(file.name),
              "Content-Type": "application/octet-stream",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: arrayBuffer,
          },
        );

        if (uploadRes.ok) {
          const { objectPath } = await uploadRes.json();
          await addAttachmentMut.mutateAsync({
            orgId,
            docId,
            data: {
              fileName: file.name,
              fileSize: file.size,
              contentType: file.type,
              objectPath,
            },
          });
        } else {
          console.error("Upload failed:", await uploadRes.text());
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    setIsUploading(false);
    invalidate();
    e.target.value = "";
  };

  const toggleMultiSelect = (arr: number[], id: number): number[] =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Carregando documento...
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Documento não encontrado.</p>
        <button
          onClick={() => navigate("/qualidade/documentacao")}
          className="text-sm text-primary mt-2 cursor-pointer"
        >
          Voltar para Documentação
        </button>
      </div>
    );
  }

  const tabs = [
    { id: "info" as const, label: "Informações", icon: FileText },
    { id: "attachments" as const, label: "Anexos", icon: Paperclip },
    { id: "versions" as const, label: "Versões", icon: GitBranch },
    { id: "flow" as const, label: "Fluxo", icon: Users },
  ];

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-700"}`}
          >
            {STATUS_LABELS[doc.status] || doc.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{TYPE_LABELS[doc.type] || doc.type}</span>
          <span>{formatVersionLabel(doc.currentVersion)}</span>
          <span>Criado por {doc.createdByName}</span>
          <span>Validade: {formatDate(doc.validityDate)}</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/60 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <InfoField label="Título" value={doc.title} />
            <InfoField label="Tipo" value={TYPE_LABELS[doc.type] || doc.type} />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField
              label="Versão Atual"
              value={formatVersionLabel(doc.currentVersion)}
            />
            <InfoField
              label="Data de Validade"
              value={formatDate(doc.validityDate)}
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField
              label="Criado em"
              value={formatDateTime(doc.createdAt)}
            />
            <InfoField
              label="Atualizado em"
              value={formatDateTime(doc.updatedAt)}
            />
          </div>

          {doc.units && doc.units.length > 0 && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Filiais
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {doc.units.map((u: DocumentDetailUnitsItem) => (
                  <span
                    key={u.id}
                    className="px-2.5 py-1 bg-muted/50 rounded-md text-sm"
                  >
                    {u.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {doc.elaborators && doc.elaborators.length > 0 && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Elaborador
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {doc.elaborators.map((e) => (
                  <span
                    key={e.id}
                    className="px-2.5 py-1 bg-muted/50 rounded-md text-sm"
                  >
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {doc.references && doc.references.length > 0 && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Referências
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {doc.references.map((r: DocumentDetailReferencesItem) => (
                  <span
                    key={r.id}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-sm cursor-pointer hover:bg-blue-100 transition-colors"
                    onClick={() =>
                      navigate(`/qualidade/documentacao/${r.documentId}`)
                    }
                  >
                    {r.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "attachments" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Anexos ({doc.attachments?.length || 0})
            </h3>
            {canEdit && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-lg text-sm cursor-pointer hover:bg-muted transition-colors">
                <Upload className="h-3.5 w-3.5" />
                {isUploading ? "Enviando..." : "Adicionar Anexo"}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            )}
          </div>

          {!doc.attachments || doc.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhum anexo adicionado.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {doc.attachments.map((att: DocumentAttachment) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{att.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(att.fileSize ?? 0)} · v
                        {att.versionNumber} · {att.uploadedByName} ·{" "}
                        {formatDateTime(att.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAttachmentAction(att, "inline")}
                      disabled={attachmentActionKey === `${att.id}:inline`}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Visualizar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAttachmentAction(att, "attachment")}
                      disabled={attachmentActionKey === `${att.id}:attachment`}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Baixar
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={async () => {
                          if (!orgId) return;
                          if (!confirm(`Deseja remover o anexo "${att.fileName}"?`)) return;
                          await deleteAttachmentMut.mutateAsync({
                            orgId,
                            docId,
                            attachId: att.id,
                          });
                          invalidate();
                        }}
                        disabled={deleteAttachmentMut.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "versions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Histórico de Versões</h3>
            {canEdit && doc.versions && doc.versions.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={async () => {
                  if (!orgId) return;
                  if (!confirm("Deseja resetar todo o histórico de versões? Esta ação não pode ser desfeita.")) return;
                  await resetVersionsMut.mutateAsync({ orgId, docId });
                  invalidate();
                }}
                disabled={resetVersionsMut.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Resetar Histórico
              </Button>
            )}
          </div>
          {!doc.versions || doc.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma versão registrada.
            </p>
          ) : (
            <div className="relative pl-6 border-l-2 border-border/40 space-y-6">
              {doc.versions.map((v: DocumentVersion) => (
                <div key={v.id} className="relative">
                  <div className="absolute -left-[29px] top-1 w-4 h-4 rounded-full bg-white border-2 border-foreground/20 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">
                        v{v.versionNumber}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(v.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {v.changeDescription}
                    </p>
                    {v.changedByName && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        por {v.changedByName}
                      </p>
                    )}
                    {v.changedFields && (
                      <p className="text-xs text-muted-foreground/50 mt-0.5">
                        Campos: {v.changedFields}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "flow" && (
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Aprovadores
            </h3>
            {!doc.approvers || doc.approvers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum aprovador definido.
              </p>
            ) : (
              <div className="space-y-2">
                {doc.approvers.map((a: DocumentDetailApproversItem) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-4 py-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center text-xs font-medium">
                        {a.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <span className="text-sm font-medium">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.status === "pending" && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="h-3 w-3" /> Pendente
                        </span>
                      )}
                      {a.status === "approved" && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle className="h-3 w-3" /> Aprovado{" "}
                          {formatDateTime(a.approvedAt)}
                        </span>
                      )}
                      {a.status === "rejected" && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="h-3 w-3" /> Rejeitado
                        </span>
                      )}
                      {a.comment && (
                        <span className="text-xs text-muted-foreground italic ml-2">
                          "{a.comment}"
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" /> Destinatários
            </h3>
            {!doc.recipients || doc.recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum destinatário definido.
              </p>
            ) : (
              <div className="space-y-2">
                {doc.recipients.map((r: DocumentDetailRecipientsItem) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-4 py-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center text-xs font-medium">
                        {r.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <span className="text-sm font-medium">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.readAt ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle className="h-3 w-3" /> Confirmado{" "}
                          {formatDateTime(r.readAt)}
                        </span>
                      ) : r.receivedAt ? (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Eye className="h-3 w-3" /> Recebido{" "}
                          {formatDateTime(r.receivedAt)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> Aguardando
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-muted/20 rounded-lg border border-border/40">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Fluxo do Documento
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              {["draft", "in_review", "approved", "distributed"].map(
                (step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    {i > 0 && (
                      <span className="text-muted-foreground/30">→</span>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                        doc.status === step
                          ? STATUS_COLORS[step]
                          : "bg-muted/40 text-muted-foreground/50"
                      }`}
                    >
                      {STATUS_LABELS[step]}
                    </span>
                  </div>
                ),
              )}
              {doc.status === "rejected" && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-muted-foreground/30">↩</span>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-medium ${STATUS_COLORS["rejected"]}`}
                  >
                    {STATUS_LABELS["rejected"]}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Após aprovação de todos os aprovadores, o documento é distribuído
              automaticamente aos destinatários.
            </p>
          </div>
        </div>
      )}

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseEditDialog();
            return;
          }
          setEditDialogOpen(true);
        }}
        title="Editar Documento"
        description={
          [
            "Atualize os dados principais do documento.",
            "Defina colaborador, aprovadores e destinatários.",
            "Associe unidades e documentos de referência.",
          ][editStep]
        }
        size="lg"
      >
        {editForm && (
          <div className="space-y-5">
            <DialogStepTabs
              steps={["Básico", "Responsáveis", "Escopo"]}
              step={editStep}
              onStepChange={changeEditStep}
              maxAccessibleStep={maxReachedEditStep}
            />

            {editStep === 0 && (
              <div className="space-y-5">
                <div>
                  <Label>Título *</Label>
                  <Input
                    className="mt-2"
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label>Tipo *</Label>
                    <Select
                      className="mt-2"
                      value={editForm.type}
                      onChange={(e) =>
                        setEditForm({ ...editForm, type: e.target.value })
                      }
                    >
                      {Object.entries(TYPE_LABELS).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Data de Validade</Label>
                    <Input
                      type="date"
                      className="mt-2"
                      value={editForm.validityDate}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          validityDate: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {editStep === 1 && (
              <div className="space-y-5">
                <div>
                  <Label>Elaborador</Label>
                  <EmployeeCombobox
                    employees={availableEmployees}
                    value={editForm.elaboratorId || null}
                    onChange={(nextValue) =>
                      setEditForm({
                        ...editForm,
                        elaboratorId: nextValue ?? 0,
                      })
                    }
                    placeholder="Selecione o elaborador"
                  />
                </div>

                <div>
                  <Label>Aprovadores</Label>
                  <SearchableMultiSelect
                    placeholder="Selecione aprovadores"
                    searchPlaceholder="Buscar aprovador..."
                    emptyMessage="Nenhum aprovador encontrado."
                    options={orgUsers.map((option: UserOption) => ({
                      value: option.id,
                      label: option.name,
                      keywords: [option.email],
                    }))}
                    selected={editForm.approverIds}
                    onToggle={(id) =>
                      setEditForm({
                        ...editForm,
                        approverIds: toggleMultiSelect(
                          editForm.approverIds,
                          id,
                        ),
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Destinatários</Label>
                  <SearchableMultiSelect
                    placeholder="Selecione destinatários"
                    searchPlaceholder="Buscar destinatário..."
                    emptyMessage="Nenhum destinatário encontrado."
                    options={orgUsers.map((option: UserOption) => ({
                      value: option.id,
                      label: option.name,
                      keywords: [option.email],
                    }))}
                    selected={editForm.recipientIds}
                    onToggle={(id) =>
                      setEditForm({
                        ...editForm,
                        recipientIds: toggleMultiSelect(
                          editForm.recipientIds,
                          id,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            )}

            {editStep === 2 && (
              <div className="space-y-5">
                <div>
                  <Label>Filiais</Label>
                  <SearchableMultiSelect
                    placeholder="Selecione filiais"
                    searchPlaceholder="Buscar filial..."
                    emptyMessage="Nenhuma filial encontrada."
                    options={(allUnits || []).map((unit) => ({
                      value: unit.id,
                      label: unit.name,
                    }))}
                    selected={editForm.unitIds}
                    onToggle={(id) =>
                      setEditForm({
                        ...editForm,
                        unitIds: toggleMultiSelect(editForm.unitIds, id),
                      })
                    }
                    onToggleAll={() =>
                      setEditForm({
                        ...editForm,
                        unitIds:
                          editForm.unitIds.length === (allUnits || []).length
                            ? []
                            : (allUnits || []).map((unit) => unit.id),
                      })
                    }
                    selectAllLabel="Selecionar todas as filiais"
                  />
                </div>

                <div>
                  <Label>Referências</Label>
                  <SearchableMultiSelect
                    placeholder="Selecione documentos de referência"
                    searchPlaceholder="Buscar documento de referência..."
                    emptyMessage="Nenhum documento encontrado."
                    options={(allDocs || [])
                      .filter((item) => item.id !== docId)
                      .map((item) => ({
                        value: item.id,
                        label: item.title,
                      }))}
                    selected={editForm.referenceIds}
                    onToggle={(id) =>
                      setEditForm({
                        ...editForm,
                        referenceIds: toggleMultiSelect(
                          editForm.referenceIds,
                          id,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              {editStep > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeEditStep(editStep - 1)}
                >
                  Anterior
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseEditDialog}
                >
                  Cancelar
                </Button>
              )}
              {editStep < 2 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => changeEditStep(editStep + 1)}
                  disabled={
                    (editStep === 0 && !editForm.title.trim()) ||
                    (editStep === 1 &&
                      (editForm.elaboratorId <= 0 ||
                        editForm.approverIds.length === 0 ||
                        editForm.recipientIds.length === 0))
                  }
                >
                  Próximo
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSaveEditDialog()}
                  isLoading={updateMut.isPending}
                  disabled={
                    !editForm.title.trim() ||
                    editForm.elaboratorId <= 0 ||
                    editForm.approverIds.length === 0 ||
                    editForm.recipientIds.length === 0
                  }
                >
                  Salvar Alterações
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </Dialog>

      <Dialog
        open={submitDialog}
        onOpenChange={(open) => {
          setSubmitDialog(open);
          if (!open) setSubmitChangeDescription("");
        }}
        title={
          doc.currentVersion > 0
            ? "Enviar nova versão para revisão"
            : "Enviar primeira versão para revisão"
        }
        description="Descreva a mudança que será formalizada quando todos os aprovadores concluírem a aprovação."
      >
        <div className="space-y-4">
          <div>
            <Label>Descrição da versão *</Label>
            <Input
              className="mt-2"
              placeholder="Ex.: Atualização do fluxo de aprovação e anexos do procedimento."
              value={submitChangeDescription}
              onChange={(e) => setSubmitChangeDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSubmitDialog(false);
                setSubmitChangeDescription("");
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitForReview}
              disabled={!submitChangeDescription.trim()}
              isLoading={submitMut.isPending}
            >
              Enviar para Revisão
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      <Dialog
        open={rejectDialog}
        onOpenChange={setRejectDialog}
        title="Rejeitar Documento"
        description="Informe o motivo da rejeição."
      >
        <div className="space-y-4">
          <div>
            <Label>Motivo *</Label>
            <Input
              className="mt-2"
              placeholder="Descreva o motivo da rejeição..."
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleReject}
              disabled={!rejectComment.trim()}
              isLoading={rejectMut.isPending}
            >
              Rejeitar
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      <Dialog
        open={deleteDialog}
        onOpenChange={setDeleteDialog}
        title="Excluir Documento"
        description="Esta ação é irreversível."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o documento{" "}
            <strong>{doc.title}</strong>?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              isLoading={deleteMut.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </Label>
      <p className="mt-1 text-sm">{value || "—"}</p>
    </div>
  );
}

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
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
  useDeleteDocument,
  useListUnits,
  useListOrgUsers,
  useListDocuments,
} from "@workspace/api-client-react";
import type {
  DocumentDetailUnitsItem,
  DocumentDetailApproversItem,
  DocumentDetailRecipientsItem,
  DocumentDetailReferencesItem,
  DocumentAttachment,
  DocumentVersion,
  OrgUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  ArrowLeft,
  FileText,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Users,
  GitBranch,
  Paperclip,
  Trash2,
  Eye,
  Pencil,
  Save,
  X,
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
    return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(d);
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface EditFormState {
  title: string;
  type: string;
  validityDate: string;
  unitIds: number[];
  elaboratorIds: number[];
  approverIds: number[];
  recipientIds: number[];
  referenceIds: number[];
  changeDescription: string;
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const docId = parseInt(id || "0", 10);
  const { organization, user } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"info" | "attachments" | "versions" | "flow">("info");
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const { data: doc, isLoading } = useGetDocument(orgId!, docId, {
    query: {
      queryKey: getGetDocumentQueryKey(orgId!, docId),
      enabled: !!orgId && docId > 0,
    },
  });

  const { data: allUnits } = useListUnits(orgId!, { query: { enabled: !!orgId && isEditing } });
  const { data: allUsers } = useListOrgUsers(orgId!, { query: { enabled: !!orgId && isEditing } });
  const { data: allDocs } = useListDocuments(orgId!, {}, { query: { enabled: !!orgId && isEditing } });

  usePageTitle(doc?.title);

  const updateMut = useUpdateDocument();
  const submitMut = useSubmitDocumentForReview();
  const approveMut = useApproveDocument();
  const rejectMut = useRejectDocument();
  const acknowledgeMut = useAcknowledgeDocument();
  const addAttachmentMut = useAddDocumentAttachment();
  const deleteMut = useDeleteDocument();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(orgId!, docId) });

  const isApprover = doc?.approvers?.some((a: DocumentDetailApproversItem) => a.userId === user?.id);
  const isRecipient = doc?.recipients?.some((r: DocumentDetailRecipientsItem) => r.userId === user?.id);
  const myApproval = doc?.approvers?.find((a: DocumentDetailApproversItem) => a.userId === user?.id);
  const myReceipt = doc?.recipients?.find((r: DocumentDetailRecipientsItem) => r.userId === user?.id);
  const canEdit = doc?.status === "draft" || doc?.status === "rejected";

  const handleSubmitForReview = async () => {
    if (!orgId) return;
    await submitMut.mutateAsync({ orgId, docId });
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

  useHeaderActions(
    doc ? (
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setEditForm(null); }}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => {
              if (!orgId || !editForm || !editForm.changeDescription.trim()) return;
              updateMut.mutateAsync({
                orgId,
                docId,
                data: {
                  title: editForm.title,
                  type: editForm.type,
                  validityDate: editForm.validityDate || undefined,
                  unitIds: editForm.unitIds,
                  elaboratorIds: editForm.elaboratorIds,
                  approverIds: editForm.approverIds,
                  recipientIds: editForm.recipientIds,
                  referenceIds: editForm.referenceIds,
                  changeDescription: editForm.changeDescription,
                },
              }).then(() => { setIsEditing(false); setEditForm(null); invalidate(); });
            }} isLoading={updateMut.isPending} disabled={!editForm?.changeDescription?.trim()}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar
            </Button>
          </>
        ) : (
          <>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => {
                if (!doc) return;
                setEditForm({
                  title: doc.title,
                  type: doc.type,
                  validityDate: doc.validityDate ?? "",
                  unitIds: doc.units?.map((u: DocumentDetailUnitsItem) => u.id!).filter(Boolean) ?? [],
                  elaboratorIds: doc.elaborators?.map((e: OrgUser) => e.id!).filter(Boolean) ?? [],
                  approverIds: doc.approvers?.map((a: DocumentDetailApproversItem) => a.userId!).filter(Boolean) ?? [],
                  recipientIds: doc.recipients?.map((r: DocumentDetailRecipientsItem) => r.userId!).filter(Boolean) ?? [],
                  referenceIds: doc.references?.map((ref: DocumentDetailReferencesItem) => ref.documentId!).filter(Boolean) ?? [],
                  changeDescription: "",
                });
                setIsEditing(true);
              }}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
              </Button>
            )}
            {doc.status === "draft" && (
              <Button size="sm" onClick={handleSubmitForReview} isLoading={submitMut.isPending}>
                <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar para Revisão
              </Button>
            )}
            {doc.status === "rejected" && (
              <Button size="sm" onClick={handleSubmitForReview} isLoading={submitMut.isPending}>
                <Send className="h-3.5 w-3.5 mr-1.5" /> Reenviar para Revisão
              </Button>
            )}
            {doc.status === "in_review" && isApprover && myApproval?.status === "pending" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setRejectDialog(true)}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Rejeitar
                </Button>
                <Button size="sm" onClick={handleApprove} isLoading={approveMut.isPending}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Aprovar
                </Button>
              </>
            )}
            {doc.status === "distributed" && isRecipient && !myReceipt?.readAt && (
              <Button size="sm" onClick={handleAcknowledge} isLoading={acknowledgeMut.isPending}>
                <Eye className="h-3.5 w-3.5 mr-1.5" /> Confirmar Recebimento
              </Button>
            )}
            {doc.status === "draft" && (
              <Button size="sm" variant="outline" onClick={() => setDeleteDialog(true)} className="text-red-600 hover:text-red-700">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
              </Button>
            )}
          </>
        )}
      </div>
    ) : null
  );

  const startEditing = () => {
    if (!doc) return;
    setEditForm({
      title: doc.title,
      type: doc.type,
      validityDate: doc.validityDate ?? "",
      unitIds: doc.units?.map((u: DocumentDetailUnitsItem) => u.id!).filter(Boolean) ?? [],
      elaboratorIds: doc.elaborators?.map((e: OrgUser) => e.id!).filter(Boolean) ?? [],
      approverIds: doc.approvers?.map((a: DocumentDetailApproversItem) => a.userId!).filter(Boolean) ?? [],
      recipientIds: doc.recipients?.map((r: DocumentDetailRecipientsItem) => r.userId!).filter(Boolean) ?? [],
      referenceIds: doc.references?.map((ref: DocumentDetailReferencesItem) => ref.documentId!).filter(Boolean) ?? [],
      changeDescription: "",
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!orgId || !editForm || !editForm.changeDescription.trim()) return;
    await updateMut.mutateAsync({
      orgId,
      docId,
      data: {
        title: editForm.title,
        type: editForm.type,
        validityDate: editForm.validityDate || undefined,
        unitIds: editForm.unitIds,
        elaboratorIds: editForm.elaboratorIds,
        approverIds: editForm.approverIds,
        recipientIds: editForm.recipientIds,
        referenceIds: editForm.referenceIds,
        changeDescription: editForm.changeDescription,
      },
    });
    setIsEditing(false);
    setEditForm(null);
    invalidate();
  };

  const handleReject = async () => {
    if (!orgId || !rejectComment.trim()) return;
    await rejectMut.mutateAsync({ orgId, docId, data: { comment: rejectComment } });
    setRejectDialog(false);
    setRejectComment("");
    invalidate();
  };

  const handleDelete = async () => {
    if (!orgId) return;
    await deleteMut.mutateAsync({ orgId, docId });
    navigate("/app/qualidade/documentacao");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !orgId) return;

    setIsUploading(true);
    const token = localStorage.getItem("daton_token");
    const baseUrl = import.meta.env.BASE_URL || "/";

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) continue;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(`${baseUrl}api/storage/uploads/direct`, {
          method: "POST",
          headers: {
            "X-File-Content-Type": file.type,
            "X-File-Name": encodeURIComponent(file.name),
            "Content-Type": "application/octet-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: arrayBuffer,
        });

        if (uploadRes.ok) {
          const { objectPath } = await uploadRes.json();
          await addAttachmentMut.mutateAsync({
            orgId,
            docId,
            data: { fileName: file.name, fileSize: file.size, contentType: file.type, objectPath },
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
      <div className="py-12 text-center text-muted-foreground">Carregando documento...</div>
    );
  }

  if (!doc) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Documento não encontrado.</p>
        <button onClick={() => navigate("/app/qualidade/documentacao")} className="text-sm text-primary mt-2 cursor-pointer">
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
      <button
        onClick={() => navigate("/app/qualidade/documentacao")}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Voltar para Documentação
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-700"}`}>
            {STATUS_LABELS[doc.status] || doc.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{TYPE_LABELS[doc.type] || doc.type}</span>
          <span>v{doc.currentVersion}</span>
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

      {activeTab === "info" && !isEditing && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <InfoField label="Título" value={doc.title} />
            <InfoField label="Tipo" value={TYPE_LABELS[doc.type] || doc.type} />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField label="Versão Atual" value={`v${doc.currentVersion}`} />
            <InfoField label="Data de Validade" value={formatDate(doc.validityDate)} />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField label="Criado em" value={formatDateTime(doc.createdAt)} />
            <InfoField label="Atualizado em" value={formatDateTime(doc.updatedAt)} />
          </div>

          {doc.units && doc.units.length > 0 && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Filiais</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {doc.units.map((u: DocumentDetailUnitsItem) => (
                  <span key={u.id} className="px-2.5 py-1 bg-muted/50 rounded-md text-sm">{u.name}</span>
                ))}
              </div>
            </div>
          )}

          {doc.elaborators && doc.elaborators.length > 0 && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Elaboradores</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {doc.elaborators.map((e: OrgUser) => (
                  <span key={e.id} className="px-2.5 py-1 bg-muted/50 rounded-md text-sm">{e.name}</span>
                ))}
              </div>
            </div>
          )}

          {doc.references && doc.references.length > 0 && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Referências</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {doc.references.map((r: DocumentDetailReferencesItem) => (
                  <span key={r.id} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-sm cursor-pointer hover:bg-blue-100 transition-colors"
                    onClick={() => navigate(`/app/qualidade/documentacao/${r.documentId}`)}>
                    {r.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "info" && isEditing && editForm && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label>Título *</Label>
              <Input
                className="mt-2"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select
                className="mt-2"
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label>Data de Validade</Label>
              <Input
                type="date"
                className="mt-2"
                value={editForm.validityDate}
                onChange={(e) => setEditForm({ ...editForm, validityDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Filiais</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {allUnits?.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, unitIds: toggleMultiSelect(editForm.unitIds, u.id) })}
                  className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                    editForm.unitIds.includes(u.id)
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Elaboradores</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {allUsers?.map((u: OrgUser) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, elaboratorIds: toggleMultiSelect(editForm.elaboratorIds, u.id!) })}
                  className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                    editForm.elaboratorIds.includes(u.id!)
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Aprovadores</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {allUsers?.map((u: OrgUser) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, approverIds: toggleMultiSelect(editForm.approverIds, u.id!) })}
                  className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                    editForm.approverIds.includes(u.id!)
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Destinatários</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {allUsers?.map((u: OrgUser) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, recipientIds: toggleMultiSelect(editForm.recipientIds, u.id!) })}
                  className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                    editForm.recipientIds.includes(u.id!)
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Referências</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {allDocs
                ?.filter((d) => d.id !== docId)
                .map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setEditForm({ ...editForm, referenceIds: toggleMultiSelect(editForm.referenceIds, d.id) })}
                    className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                      editForm.referenceIds.includes(d.id)
                        ? "bg-blue-600 text-white"
                        : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    {d.title}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <Label>Descrição da Alteração *</Label>
            <Input
              className="mt-2"
              placeholder="Descreva o que foi alterado nesta versão..."
              value={editForm.changeDescription}
              onChange={(e) => setEditForm({ ...editForm, changeDescription: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button size="sm" onClick={handleSaveEdit} isLoading={updateMut.isPending} disabled={!editForm.title.trim() || !editForm.changeDescription.trim()}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar Alterações
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEditing}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {activeTab === "attachments" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Anexos ({doc.attachments?.length || 0})</h3>
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

          {(!doc.attachments || doc.attachments.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum anexo adicionado.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {doc.attachments.map((att: DocumentAttachment) => (
                <div key={att.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{att.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(att.fileSize ?? 0)} · v{att.versionNumber} · {att.uploadedByName} · {formatDateTime(att.uploadedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "versions" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Histórico de Versões</h3>
          {(!doc.versions || doc.versions.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma versão registrada.</p>
          ) : (
            <div className="relative pl-6 border-l-2 border-border/40 space-y-6">
              {doc.versions.map((v: DocumentVersion) => (
                <div key={v.id} className="relative">
                  <div className="absolute -left-[29px] top-1 w-4 h-4 rounded-full bg-white border-2 border-foreground/20 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">v{v.versionNumber}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{v.changeDescription}</p>
                    {v.changedByName && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">por {v.changedByName}</p>
                    )}
                    {v.changedFields && (
                      <p className="text-xs text-muted-foreground/50 mt-0.5">Campos: {v.changedFields}</p>
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
            {(!doc.approvers || doc.approvers.length === 0) ? (
              <p className="text-sm text-muted-foreground">Nenhum aprovador definido.</p>
            ) : (
              <div className="space-y-2">
                {doc.approvers.map((a: DocumentDetailApproversItem) => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3 bg-muted/30 rounded-lg">
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
                          <CheckCircle className="h-3 w-3" /> Aprovado {formatDateTime(a.approvedAt)}
                        </span>
                      )}
                      {a.status === "rejected" && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="h-3 w-3" /> Rejeitado
                        </span>
                      )}
                      {a.comment && (
                        <span className="text-xs text-muted-foreground italic ml-2">"{a.comment}"</span>
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
            {(!doc.recipients || doc.recipients.length === 0) ? (
              <p className="text-sm text-muted-foreground">Nenhum destinatário definido.</p>
            ) : (
              <div className="space-y-2">
                {doc.recipients.map((r: DocumentDetailRecipientsItem) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center text-xs font-medium">
                        {r.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <span className="text-sm font-medium">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.readAt ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle className="h-3 w-3" /> Confirmado {formatDateTime(r.readAt)}
                        </span>
                      ) : r.receivedAt ? (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Eye className="h-3 w-3" /> Recebido {formatDateTime(r.receivedAt)}
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
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Fluxo do Documento</h4>
            <div className="flex items-center gap-2 flex-wrap">
              {["draft", "in_review", "approved", "distributed"].map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted-foreground/30">→</span>}
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    doc.status === step
                      ? STATUS_COLORS[step]
                      : "bg-muted/40 text-muted-foreground/50"
                  }`}>
                    {STATUS_LABELS[step]}
                  </span>
                </div>
              ))}
              {doc.status === "rejected" && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-muted-foreground/30">↩</span>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${STATUS_COLORS["rejected"]}`}>
                    {STATUS_LABELS["rejected"]}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Após aprovação de todos os aprovadores, o documento é distribuído automaticamente aos destinatários.</p>
          </div>
        </div>
      )}

      <Dialog open={rejectDialog} onOpenChange={setRejectDialog} title="Rejeitar Documento" description="Informe o motivo da rejeição.">
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
            <Button variant="outline" size="sm" onClick={() => setRejectDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleReject} disabled={!rejectComment.trim()} isLoading={rejectMut.isPending}>
              Rejeitar
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog} title="Excluir Documento" description="Esta ação é irreversível.">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o documento <strong>{doc.title}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleDelete} isLoading={deleteMut.isPending} className="bg-red-600 hover:bg-red-700">
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
      <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
      <p className="mt-1 text-sm">{value || "—"}</p>
    </div>
  );
}

import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useGetEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useCreateCompetency,
  useUpdateCompetency,
  useDeleteCompetency,
  useCreateTraining,
  useUpdateTraining,
  useDeleteTraining,
  useCreateAwareness,
  useUpdateAwareness,
  useDeleteAwareness,
  useListUnits,
  useListDepartments,
  useListPositions,
  useLinkEmployeeUnit,
  useUnlinkEmployeeUnit,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  getListDepartmentsQueryKey,
  getListPositionsQueryKey,
  CreateCompetencyBodyType as CreateCompetencyBodyTypeValues,
  CreateTrainingBodyStatus as CreateTrainingBodyStatusValues,
} from "@workspace/api-client-react";
import type {
  CreateCompetencyBodyType,
  UpdateCompetencyBodyType,
  CreateTrainingBodyStatus,
  UpdateTrainingBodyStatus,
  EmployeeCompetency,
  EmployeeTraining,
  EmployeeAwareness,
  LinkedUnit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";
import { formatFileSize, uploadFileToStorage, type UploadedFileRef } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  GraduationCap,
  Award,
  Lightbulb,
  User,
  Archive,
  FileText,
  Paperclip,
  Upload,
} from "lucide-react";
import { useLocation } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  on_leave: "Afastado",
};

const CONTRACT_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  intern: "Estagiário",
  temporary: "Temporário",
};

const TRAINING_STATUS: Record<string, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  vencido: "Vencido",
};

const TRAINING_STATUS_COLORS: Record<string, string> = {
  pendente: "bg-blue-50 text-blue-700 border-blue-200",
  concluido: "bg-emerald-50 text-emerald-700 border-emerald-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
};

const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  formacao: "Formação",
  experiencia: "Experiência",
  habilidade: "Habilidade",
};

const REQUIRED_EMPLOYEE_FIELDS: Record<string, string> = {
  name: "Nome completo",
  cpf: "CPF",
  admissionDate: "Data de admissão",
};

type EmployeeProfileItemAttachment = {
  id: number;
  itemId: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
  uploadedAt: string;
};

type EmployeeProfileItemRecord = {
  id: number;
  employeeId: number;
  category: "professional_experience" | "education_certification";
  title: string;
  description?: string | null;
  attachments: EmployeeProfileItemAttachment[];
  createdAt: string;
  updatedAt: string;
};

type EmployeeProfileItemForm = {
  title: string;
  description: string;
  draftAttachments: UploadedFileRef[];
};

function InlineField({
  label,
  value,
  fieldKey,
  type = "text",
  options,
  editable = true,
  onSave,
}: {
  label: string;
  value: string | number | null | undefined;
  fieldKey: string;
  type?: "text" | "date" | "select" | "textarea";
  options?: { value: string; label: string }[];
  editable?: boolean;
  onSave: (key: string, val: string | number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const save = () => {
    onSave(fieldKey, draft || null);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(String(value ?? ""));
    setEditing(false);
  };

  return (
    <div className="group py-2.5 border-b border-border/40 last:border-0">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {editing ? (
        <div className="flex items-center gap-1.5 mt-1">
          {type === "select" && options ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 h-8 rounded border border-input bg-background px-2 text-[13px]"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : type === "textarea" ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 text-[13px] min-h-[60px]"
            />
          ) : (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              type={type}
              className="flex-1 h-8 text-[13px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
            />
          )}
          <button onClick={save} className="p-1 text-primary hover:text-primary/80 cursor-pointer">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={cancel} className="p-1 text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          className={cn("flex items-center gap-1 mt-1 group/field", editable ? "cursor-pointer" : "")}
          onClick={() => {
            if (!editable) return;
            setDraft(String(value ?? ""));
            setEditing(true);
          }}
        >
          <span className="text-[13px] text-foreground">
            {type === "select" && options
              ? options.find((o) => o.value === String(value))?.label || String(value ?? "—")
              : value || "—"}
          </span>
          {editable && <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover/field:text-muted-foreground/50 transition-colors" />}
        </div>
      )}
    </div>
  );
}

function EmployeeProfileItemsSection({
  title,
  emptyText,
  category,
  items,
  orgId,
  empId,
  editable = true,
}: {
  title: string;
  emptyText: string;
  category: "professional_experience" | "education_certification";
  items: EmployeeProfileItemRecord[];
  orgId: number;
  empId: number;
  editable?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EmployeeProfileItemRecord | null>(null);
  const [editingAttachments, setEditingAttachments] = useState<EmployeeProfileItemAttachment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<number | "create" | null>(null);
  const emptyForm: EmployeeProfileItemForm = { title: "", description: "", draftAttachments: [] };
  const [form, setForm] = useState<EmployeeProfileItemForm>(emptyForm);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });
  };

  const openCreate = () => {
    setForm(emptyForm);
    setCreateOpen(true);
  };

  const openEdit = (item: EmployeeProfileItemRecord) => {
    setEditingItem(item);
    setEditingAttachments(item.attachments || []);
    setForm({
      title: item.title,
      description: item.description || "",
      draftAttachments: [],
    });
  };

  const createItem = async () => {
    if (!form.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Preencha o título do item antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(resolveApiUrl(`/api/organizations/${orgId}/employees/${empId}/profile-items`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          category,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          attachments: form.draftAttachments.length > 0 ? form.draftAttachments : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao criar item");
      }

      await invalidate();
      setCreateOpen(false);
      setForm(emptyForm);
    } catch (error) {
      toast({
        title: "Falha ao salvar item",
        description: error instanceof Error ? error.message : "Não foi possível salvar o item.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateItem = async () => {
    if (!editingItem) return;
    if (!form.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Preencha o título do item antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(resolveApiUrl(`/api/organizations/${orgId}/employees/${empId}/profile-items/${editingItem.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao atualizar item");
      }

      await invalidate();
      setEditingItem(null);
      setEditingAttachments([]);
      setForm(emptyForm);
    } catch (error) {
      toast({
        title: "Falha ao atualizar item",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o item.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async (itemId: number) => {
    try {
      const response = await fetch(resolveApiUrl(`/api/organizations/${orgId}/employees/${empId}/profile-items/${itemId}`), {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Falha ao remover item");
      }

      await invalidate();
    } catch (error) {
      toast({
        title: "Falha ao remover item",
        description: error instanceof Error ? error.message : "Não foi possível remover o item.",
        variant: "destructive",
      });
    }
  };

  const uploadAttachmentForCreate = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingItemId("create");
    try {
      const uploadedFiles: UploadedFileRef[] = [];
      for (const file of Array.from(files)) {
        uploadedFiles.push(await uploadFileToStorage(file));
      }
      setForm((current) => ({ ...current, draftAttachments: [...current.draftAttachments, ...uploadedFiles] }));
    } catch (error) {
      toast({
        title: "Falha ao enviar anexo",
        description: error instanceof Error ? error.message : "Não foi possível enviar o arquivo.",
        variant: "destructive",
      });
    } finally {
      setUploadingItemId(null);
    }
  };

  const uploadAttachmentForEdit = async (itemId: number, files: FileList | null) => {
    if (!files?.length) return;
    setUploadingItemId(itemId);
    try {
      const uploadedAttachments: EmployeeProfileItemAttachment[] = [];
      for (const file of Array.from(files)) {
        const upload = await uploadFileToStorage(file);
        const response = await fetch(resolveApiUrl(`/api/organizations/${orgId}/employees/${empId}/profile-items/${itemId}/attachments`), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(upload),
        });

        if (!response.ok) {
          throw new Error("Falha ao registrar anexo");
        }

        uploadedAttachments.push(await response.json());
      }

      setEditingAttachments((current) => [...current, ...uploadedAttachments]);
      await invalidate();
    } catch (error) {
      toast({
        title: "Falha ao enviar anexo",
        description: error instanceof Error ? error.message : "Não foi possível enviar o arquivo.",
        variant: "destructive",
      });
    } finally {
      setUploadingItemId(null);
    }
  };

  const deleteAttachment = async (itemId: number, attachmentId: number) => {
    try {
      const response = await fetch(resolveApiUrl(`/api/organizations/${orgId}/employees/${empId}/profile-items/${itemId}/attachments/${attachmentId}`), {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Falha ao remover anexo");
      }

      setEditingAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      await invalidate();
    } catch (error) {
      toast({
        title: "Falha ao remover anexo",
        description: error instanceof Error ? error.message : "Não foi possível remover o anexo.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3 py-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyText}</p>
        </div>
        {editable && (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Item
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nenhum item cadastrado.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/60 bg-secondary/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {item.description && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.description}</p>
                  )}
                  {item.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {item.attachments.map((attachment) => (
                        <div key={attachment.id} className="flex items-center gap-2 rounded-md bg-background px-3 py-2 text-[13px]">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          <a
                            href={resolveApiUrl(`/api/storage${attachment.objectPath}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 truncate text-primary hover:underline"
                          >
                            {attachment.fileName}
                          </a>
                          <span className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {editable && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground/40 hover:text-primary">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => deleteItem(item.id)} className="p-1.5 text-muted-foreground/40 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editable && isCreateOpen} onOpenChange={setCreateOpen} title={`Novo item de ${title.toLowerCase()}`}>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Título *</Label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 min-h-24" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Anexos</Label>
            <div className="mt-2 space-y-2">
              {form.draftAttachments.map((attachment, index) => (
                <div key={`${attachment.objectPath}-${index}`} className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2 text-[13px]">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={resolveApiUrl(`/api/storage${attachment.objectPath}`)} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-primary hover:underline">
                    {attachment.fileName}
                  </a>
                  <span className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</span>
                  <button type="button" onClick={() => setForm((current) => ({
                    ...current,
                    draftAttachments: current.draftAttachments.filter((_, attachmentIndex) => attachmentIndex !== index),
                  }))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
                <Upload className="h-4 w-4" />
                <span>{uploadingItemId === "create" ? "Enviando..." : "Adicionar anexo"}</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
                  onChange={(event) => {
                    void uploadAttachmentForCreate(event.target.files);
                    event.target.value = "";
                  }}
                  disabled={uploadingItemId === "create"}
                />
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setCreateOpen(false); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={createItem} disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={editable && !!editingItem} onOpenChange={(open) => { if (!open) { setEditingItem(null); setEditingAttachments([]); setForm(emptyForm); } }} title="Editar item">
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Título *</Label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 min-h-24" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Anexos</Label>
            <div className="mt-2 space-y-2">
              {editingAttachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2 text-[13px]">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={resolveApiUrl(`/api/storage${attachment.objectPath}`)} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-primary hover:underline">
                    {attachment.fileName}
                  </a>
                  <span className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</span>
                  <button type="button" onClick={() => { if (editingItem) void deleteAttachment(editingItem.id, attachment.id); }} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {editingItem && (
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
                  <Upload className="h-4 w-4" />
                  <span>{uploadingItemId === editingItem.id ? "Enviando..." : "Adicionar anexo"}</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
                    onChange={(event) => {
                      void uploadAttachmentForEdit(editingItem.id, event.target.files);
                      event.target.value = "";
                    }}
                    disabled={uploadingItemId === editingItem.id}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setEditingItem(null); setEditingAttachments([]); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={updateItem} disabled={isSaving}>{isSaving ? "Salvando..." : "Atualizar"}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function LevelBar({ level, max = 5 }: { level: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 w-4 rounded-full",
            i < level ? "bg-primary" : "bg-border"
          )}
        />
      ))}
    </div>
  );
}

function LinkedUnitsSection({
  linkedUnits,
  allUnits,
  orgId,
  empId,
  editable = true,
}: {
  linkedUnits: LinkedUnit[];
  allUnits: { id: number; name: string }[];
  orgId: number;
  empId: number;
  editable?: boolean;
}) {
  const queryClient = useQueryClient();
  const linkMutation = useLinkEmployeeUnit();
  const unlinkMutation = useUnlinkEmployeeUnit();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const availableUnits = allUnits.filter((u) => !linkedUnits.some((lu) => lu.id === u.id));

  const handleLink = async () => {
    if (!selectedUnit) return;
    await linkMutation.mutateAsync({ orgId, empId, data: { unitId: Number(selectedUnit) } });
    invalidate();
    setSelectedUnit("");
    setShowAdd(false);
  };

  const handleUnlink = async (unitId: number) => {
    await unlinkMutation.mutateAsync({ orgId, empId, unitId });
    invalidate();
  };

  return (
    <div className="py-2.5 border-b border-border/40">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-muted-foreground">Unidades</p>
        {editable && availableUnits.length > 0 && (
          <button onClick={() => setShowAdd(!showAdd)} className="text-[11px] text-primary hover:underline cursor-pointer">
            + Vincular
          </button>
        )}
      </div>
      {linkedUnits.length === 0 && !showAdd && (
        <p className="text-[13px] text-muted-foreground/50">Nenhuma unidade vinculada</p>
      )}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {linkedUnits.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border/60">
            {u.name}
            {editable && <button onClick={() => handleUnlink(u.id)} className="text-muted-foreground/40 hover:text-red-500 cursor-pointer">
              <X className="h-3 w-3" />
            </button>}
          </span>
        ))}
      </div>
      {editable && showAdd && (
        <div className="flex items-center gap-2 mt-2">
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="flex h-8 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">Selecionar unidade...</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={String(u.id)}>{u.name}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={handleLink} disabled={!selectedUnit || linkMutation.isPending}>
            Vincular
          </Button>
        </div>
      )}
    </div>
  );
}

type CompetencyForm = {
  name: string;
  description: string;
  type: CreateCompetencyBodyType;
  requiredLevel: number;
  acquiredLevel: number;
  evidence: string;
};

function CompetencyFormFields({ form, setForm }: { form: CompetencyForm; setForm: (f: CompetencyForm) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Nome *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Ex: Gestão de Resíduos" />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Tipo</Label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CreateCompetencyBodyType })} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value={CreateCompetencyBodyTypeValues.formacao}>Formação</option>
            <option value={CreateCompetencyBodyTypeValues.experiencia}>Experiência</option>
            <option value={CreateCompetencyBodyTypeValues.habilidade}>Habilidade</option>
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Nível Requerido</Label>
          <Input type="number" min={0} max={5} value={form.requiredLevel} onChange={(e) => setForm({ ...form, requiredLevel: Number(e.target.value) })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Nível Adquirido</Label>
          <Input type="number" min={0} max={5} value={form.acquiredLevel} onChange={(e) => setForm({ ...form, acquiredLevel: Number(e.target.value) })} className="mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Evidência</Label>
        <Input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} className="mt-1" placeholder="Ex: Certificado XYZ" />
      </div>
    </div>
  );
}

function CompetenciasTab({
  competencies,
  orgId,
  empId,
  editable = true,
}: {
  competencies: EmployeeCompetency[];
  orgId: number;
  empId: number;
  editable?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<EmployeeCompetency | null>(null);
  const createMutation = useCreateCompetency();
  const updateMutation = useUpdateCompetency();
  const deleteMutation = useDeleteCompetency();

  const emptyForm: CompetencyForm = { name: "", description: "", type: "formacao", requiredLevel: 3, acquiredLevel: 0, evidence: "" };
  const [form, setForm] = useState<CompetencyForm>(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const handleCreate = async () => {
    await createMutation.mutateAsync({ orgId, empId, data: form });
    invalidate();
    setCreateOpen(false);
    setForm(emptyForm);
  };

  const openEdit = (comp: EmployeeCompetency) => {
    setEditingComp(comp);
    setForm({
      name: comp.name,
      description: comp.description || "",
      type: comp.type,
      requiredLevel: comp.requiredLevel,
      acquiredLevel: comp.acquiredLevel,
      evidence: comp.evidence || "",
    });
  };

  const handleUpdate = async () => {
    if (!editingComp) return;
    await updateMutation.mutateAsync({
      orgId, empId, compId: editingComp.id,
      data: {
        name: form.name,
        description: form.description || undefined,
        type: form.type as UpdateCompetencyBodyType,
        requiredLevel: form.requiredLevel,
        acquiredLevel: form.acquiredLevel,
        evidence: form.evidence || undefined,
      },
    });
    invalidate();
    setEditingComp(null);
    setForm(emptyForm);
  };

  const handleDelete = async (compId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, compId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Competências necessárias e adquiridas conforme ISO 9001:2015 §7.2
        </p>
        {editable && <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Competência
        </Button>}
      </div>

      {competencies.length === 0 ? (
        <div className="text-center py-12">
          <Award className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhuma competência registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {competencies.map((comp) => (
            <div key={comp.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div className={cn("flex-1", editable ? "cursor-pointer" : "")} onClick={() => editable && openEdit(comp)}>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-foreground">{comp.name}</p>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      {COMPETENCY_TYPE_LABELS[comp.type] || comp.type}
                    </span>
                  </div>
                  {comp.description && (
                    <p className="text-xs text-muted-foreground mt-1">{comp.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Nível Requerido</p>
                      <div className="flex items-center gap-2">
                        <LevelBar level={comp.requiredLevel} />
                        <span className="text-xs text-muted-foreground">{comp.requiredLevel}/5</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Nível Adquirido</p>
                      <div className="flex items-center gap-2">
                        <LevelBar level={comp.acquiredLevel} />
                        <span className="text-xs text-muted-foreground">{comp.acquiredLevel}/5</span>
                        {comp.acquiredLevel < comp.requiredLevel && (
                          <span className="text-[10px] text-red-600 font-medium">Gap</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {comp.evidence && (
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">Evidência:</span> {comp.evidence}
                    </p>
                  )}
                </div>
                {editable && <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(comp); }} className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(comp.id); }} className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editable && isCreateOpen} onOpenChange={setCreateOpen} title="Nova Competência">
        <CompetencyFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={!form.name || createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={editable && !!editingComp} onOpenChange={(open) => { if (!open) { setEditingComp(null); setForm(emptyForm); } }} title="Editar Competência">
        <CompetencyFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setEditingComp(null); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={handleUpdate} disabled={!form.name || updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

type TrainingForm = {
  title: string;
  description: string;
  institution: string;
  workloadHours: number;
  completionDate: string;
  expirationDate: string;
  status: CreateTrainingBodyStatus;
};
type AwarenessForm = { topic: string; description: string; date: string; verificationMethod: string; result: string };

function TrainingFormFields({ form, setForm }: { form: TrainingForm; setForm: (f: TrainingForm) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Título *</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" placeholder="Ex: NR-12 Segurança" />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Instituição</Label>
          <Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Carga Horária (h)</Label>
          <Input type="number" value={form.workloadHours} onChange={(e) => setForm({ ...form, workloadHours: Number(e.target.value) })} className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CreateTrainingBodyStatus })} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value={CreateTrainingBodyStatusValues.pendente}>Pendente</option>
            <option value={CreateTrainingBodyStatusValues.concluido}>Concluído</option>
            <option value={CreateTrainingBodyStatusValues.vencido}>Vencido</option>
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Data Conclusão</Label>
          <Input type="date" value={form.completionDate} onChange={(e) => setForm({ ...form, completionDate: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Validade</Label>
          <Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} className="mt-1" />
        </div>
      </div>
    </div>
  );
}

function TreinamentosTab({
  trainings,
  orgId,
  empId,
  editable = true,
}: {
  trainings: EmployeeTraining[];
  orgId: number;
  empId: number;
  editable?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<EmployeeTraining | null>(null);
  const createMutation = useCreateTraining();
  const deleteMutation = useDeleteTraining();
  const updateMutation = useUpdateTraining();

  const emptyForm: TrainingForm = {
    title: "",
    description: "",
    institution: "",
    workloadHours: 0,
    completionDate: "",
    expirationDate: "",
    status: CreateTrainingBodyStatusValues.pendente,
  };
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      orgId,
      empId,
      data: {
        ...form,
        workloadHours: form.workloadHours || undefined,
        completionDate: form.completionDate || undefined,
        expirationDate: form.expirationDate || undefined,
      },
    });
    invalidate();
    setCreateOpen(false);
    setForm(emptyForm);
  };

  const openEdit = (t: EmployeeTraining) => {
    setEditingTraining(t);
    setForm({
      title: t.title,
      description: t.description || "",
      institution: t.institution || "",
      workloadHours: t.workloadHours || 0,
      completionDate: t.completionDate || "",
      expirationDate: t.expirationDate || "",
      status: t.status,
    });
  };

  const handleUpdate = async () => {
    if (!editingTraining) return;
    await updateMutation.mutateAsync({
      orgId,
      empId,
      trainId: editingTraining.id,
      data: {
        title: form.title,
        description: form.description || undefined,
        institution: form.institution || undefined,
        workloadHours: form.workloadHours || undefined,
        completionDate: form.completionDate || undefined,
        expirationDate: form.expirationDate || undefined,
        status: form.status as UpdateTrainingBodyStatus,
      },
    });
    invalidate();
    setEditingTraining(null);
    setForm(emptyForm);
  };

  const handleDelete = async (trainId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, trainId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Registro de treinamentos conforme ISO 9001:2015 §7.2
        </p>
        {editable && <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Treinamento
        </Button>}
      </div>

      {trainings.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhum treinamento registrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trainings.map((t) => (
            <div key={t.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div className={cn("flex-1", editable ? "cursor-pointer" : "")} onClick={() => editable && openEdit(t)}>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-foreground">{t.title}</p>
                    <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full border font-medium", TRAINING_STATUS_COLORS[t.status] || "bg-gray-50 text-gray-500 border-gray-200")}>
                      {TRAINING_STATUS[t.status] || t.status}
                    </span>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    {t.institution && <span>{t.institution}</span>}
                    {t.workloadHours && <span>{t.workloadHours}h</span>}
                    {t.completionDate && <span>Concluído: {t.completionDate}</span>}
                    {t.expirationDate && <span>Validade: {t.expirationDate}</span>}
                  </div>
                </div>
                {editable && <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(t)} className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editable && isCreateOpen} onOpenChange={setCreateOpen} title="Novo Treinamento">
        <TrainingFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={!form.title || createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={editable && !!editingTraining} onOpenChange={(open) => { if (!open) { setEditingTraining(null); setForm(emptyForm); } }} title="Editar Treinamento">
        <TrainingFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setEditingTraining(null); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={handleUpdate} disabled={!form.title || updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function AwarenessFormFields({ form, setForm }: { form: AwarenessForm; setForm: (f: AwarenessForm) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Tema *</Label>
        <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="mt-1" placeholder="Ex: Política da Qualidade" />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Data *</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Método de Verificação</Label>
          <Input value={form.verificationMethod} onChange={(e) => setForm({ ...form, verificationMethod: e.target.value })} className="mt-1" placeholder="Ex: Questionário" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Resultado</Label>
          <Input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="mt-1" placeholder="Ex: Aprovado" />
        </div>
      </div>
    </div>
  );
}

function ConscientizacaoTab({
  awareness,
  orgId,
  empId,
  editable = true,
}: {
  awareness: EmployeeAwareness[];
  orgId: number;
  empId: number;
  editable?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingAwareness, setEditingAwareness] = useState<EmployeeAwareness | null>(null);
  const createMutation = useCreateAwareness();
  const deleteMutation = useDeleteAwareness();
  const updateMutation = useUpdateAwareness();

  const emptyForm = { topic: "", description: "", date: new Date().toISOString().split("T")[0], verificationMethod: "", result: "" };
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const handleCreate = async () => {
    await createMutation.mutateAsync({ orgId, empId, data: form });
    invalidate();
    setCreateOpen(false);
    setForm(emptyForm);
  };

  const openEdit = (a: EmployeeAwareness) => {
    setEditingAwareness(a);
    setForm({
      topic: a.topic,
      description: a.description || "",
      date: a.date,
      verificationMethod: a.verificationMethod || "",
      result: a.result || "",
    });
  };

  const handleUpdate = async () => {
    if (!editingAwareness) return;
    await updateMutation.mutateAsync({
      orgId,
      empId,
      awaId: editingAwareness.id,
      data: {
        topic: form.topic,
        description: form.description || undefined,
        date: form.date,
        verificationMethod: form.verificationMethod || undefined,
        result: form.result || undefined,
      },
    });
    invalidate();
    setEditingAwareness(null);
    setForm(emptyForm);
  };

  const handleDelete = async (awaId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, awaId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Registros de conscientização conforme ISO 9001:2015 §7.3
        </p>
        {editable && <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Registro
        </Button>}
      </div>

      {awareness.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhum registro de conscientização</p>
        </div>
      ) : (
        <div className="space-y-2">
          {awareness.map((a) => (
            <div key={a.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div className={cn("flex-1", editable ? "cursor-pointer" : "")} onClick={() => editable && openEdit(a)}>
                  <p className="text-[13px] font-medium text-foreground">{a.topic}</p>
                  {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{a.date}</span>
                    {a.verificationMethod && <span>Método: {a.verificationMethod}</span>}
                    {a.result && <span>Resultado: {a.result}</span>}
                  </div>
                </div>
                {editable && <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(a)} className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editable && isCreateOpen} onOpenChange={setCreateOpen} title="Novo Registro de Conscientização">
        <AwarenessFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={!form.topic || !form.date || createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={editable && !!editingAwareness} onOpenChange={(open) => { if (!open) { setEditingAwareness(null); setForm(emptyForm); } }} title="Editar Registro de Conscientização">
        <AwarenessFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setEditingAwareness(null); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={handleUpdate} disabled={!form.topic || !form.date || updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

export default function ColaboradorDetailPage() {
  const { user } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = user?.organizationId;
  const canWriteEmployees = canWriteModule("employees");
  const params = useParams<{ id: string }>();
  const empId = Number(params?.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"dados" | "competencias" | "treinamentos" | "conscientizacao">("dados");

  const { data: employee, isLoading, error } = useGetEmployee(orgId!, empId);
  const { data: units = [] } = useListUnits(orgId!);
  const { data: departments = [] } = useListDepartments(orgId!, {
    query: { queryKey: getListDepartmentsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: positions = [] } = useListPositions(orgId!, {
    query: { queryKey: getListPositionsQueryKey(orgId!), enabled: !!orgId },
  });
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId!, empId) });

  const handleFieldSave = async (key: string, val: string | number | null) => {
    if (Object.hasOwn(REQUIRED_EMPLOYEE_FIELDS, key)) {
      const normalizedValue = typeof val === "string" ? val.trim() : val;
      if (normalizedValue == null || normalizedValue === "") {
        toast({
          title: `${REQUIRED_EMPLOYEE_FIELDS[key]} obrigatório`,
          description: `Preencha ${REQUIRED_EMPLOYEE_FIELDS[key].toLowerCase()} antes de salvar.`,
          variant: "destructive",
        });
        return;
      }
      val = normalizedValue;
    }

    const data: Record<string, string | number | null | undefined> = {};
    if (key === "unitId") {
      data.unitId = val ? Number(val) : null;
    } else {
      data[key] = val;
    }
    await updateMutation.mutateAsync({ orgId: orgId!, empId, data });
    invalidate();
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(orgId!) });
  };

  const handleArchive = async () => {
    if (!confirm("Tem certeza que deseja arquivar este colaborador? O status será alterado para Inativo.")) return;
    await deleteMutation.mutateAsync({ orgId: orgId!, empId });
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(orgId!) });
    navigate("/qualidade/colaboradores");
  };

  usePageTitle(employee?.name);

  if (!orgId) return null;

  if (isLoading) {
    return <div className="text-center py-20 text-[13px] text-muted-foreground">Carregando...</div>;
  }

  if (error || !employee) {
    return (
      <div className="text-center py-20">
        <p className="text-[13px] text-muted-foreground">Colaborador não encontrado</p>
        <Link href="/qualidade/colaboradores">
          <Button variant="outline" size="sm" className="mt-4 cursor-pointer">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const tabs = [
    { key: "dados" as const, label: "Dados", icon: User },
    { key: "competencias" as const, label: "Competências", icon: Award, count: employee.competencies?.length },
    { key: "treinamentos" as const, label: "Treinamentos", icon: GraduationCap, count: employee.trainings?.length },
    { key: "conscientizacao" as const, label: "Conscientização", icon: Lightbulb, count: employee.awareness?.length },
  ];

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/qualidade/colaboradores">
              <button className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground transition-colors cursor-pointer">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{employee.name}</h1>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {employee.position || "Sem cargo"} {employee.department ? `· ${employee.department}` : ""}
              </p>
            </div>
          </div>
          {canWriteEmployees && <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={handleArchive}>
            <Archive className="h-3.5 w-3.5 mr-1.5" />
            Arquivar
          </Button>}
        </div>

        <div className="mb-1">
          <div className="flex items-center gap-6 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex items-center gap-1.5 pb-2.5 text-[13px] font-medium transition-colors duration-200 cursor-pointer hover:text-foreground",
                  activeTab === tab.key
                    ? "text-foreground font-semibold after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-foreground after:rounded-full"
                    : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "dados" && (
          <div className="grid grid-cols-2 gap-8">
            <div className="bg-white border border-border/60 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Informações Pessoais
              </h3>
              <InlineField label="Nome completo *" value={employee.name} fieldKey="name" editable={canWriteEmployees} onSave={handleFieldSave} />
              <InlineField label="CPF *" value={employee.cpf} fieldKey="cpf" editable={canWriteEmployees} onSave={handleFieldSave} />
              <InlineField label="E-mail" value={employee.email} fieldKey="email" editable={canWriteEmployees} onSave={handleFieldSave} />
              <InlineField label="Telefone" value={employee.phone} fieldKey="phone" editable={canWriteEmployees} onSave={handleFieldSave} />
            </div>
            <div className="bg-white border border-border/60 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Informações Profissionais
              </h3>
              <InlineField
                label="Cargo"
                value={employee.position}
                fieldKey="position"
                type="select"
                options={[
                  { value: "", label: "Selecionar cargo" },
                  ...positions.map((position) => ({ value: position.name, label: position.name })),
                ]}
                editable={canWriteEmployees}
                onSave={handleFieldSave}
              />
              <InlineField
                label="Departamento"
                value={employee.department}
                fieldKey="department"
                type="select"
                options={[
                  { value: "", label: "Selecionar departamento" },
                  ...departments.map((department) => ({ value: department.name, label: department.name })),
                ]}
                editable={canWriteEmployees}
                onSave={handleFieldSave}
              />
              <EmployeeProfileItemsSection
                title="Experiências profissionais"
                emptyText="Liste experiências anteriores e adicione anexos quando necessário."
                category="professional_experience"
                items={(employee.professionalExperiences || []) as EmployeeProfileItemRecord[]}
                orgId={orgId}
                empId={empId}
                editable={canWriteEmployees}
              />
              <EmployeeProfileItemsSection
                title="Educação e certificações"
                emptyText="Liste formações, cursos e certificações com anexos opcionais."
                category="education_certification"
                items={(employee.educationCertifications || []) as EmployeeProfileItemRecord[]}
                orgId={orgId}
                empId={empId}
                editable={canWriteEmployees}
              />
              <LinkedUnitsSection
                linkedUnits={employee.units || []}
                allUnits={units}
                orgId={orgId}
                empId={empId}
                editable={canWriteEmployees}
              />
              <InlineField
                label="Tipo de Contrato"
                value={employee.contractType}
                fieldKey="contractType"
                type="select"
                options={[
                  { value: "clt", label: "CLT" },
                  { value: "pj", label: "PJ" },
                  { value: "intern", label: "Estagiário" },
                  { value: "temporary", label: "Temporário" },
                ]}
                editable={canWriteEmployees}
                onSave={handleFieldSave}
              />
              <InlineField
                label="Status"
                value={employee.status}
                fieldKey="status"
                type="select"
                options={[
                  { value: "active", label: "Ativo" },
                  { value: "inactive", label: "Inativo" },
                  { value: "on_leave", label: "Afastado" },
                ]}
                editable={canWriteEmployees}
                onSave={handleFieldSave}
              />
              <InlineField label="Data de Admissão *" value={employee.admissionDate} fieldKey="admissionDate" type="date" editable={canWriteEmployees} onSave={handleFieldSave} />
              <InlineField label="Data de Desligamento" value={employee.terminationDate} fieldKey="terminationDate" type="date" editable={canWriteEmployees} onSave={handleFieldSave} />
            </div>
          </div>
        )}

        {activeTab === "competencias" && (
          <CompetenciasTab competencies={employee.competencies || []} orgId={orgId} empId={empId} editable={canWriteEmployees} />
        )}

        {activeTab === "treinamentos" && (
          <TreinamentosTab trainings={employee.trainings || []} orgId={orgId} empId={empId} editable={canWriteEmployees} />
        )}

        {activeTab === "conscientizacao" && (
          <ConscientizacaoTab awareness={employee.awareness || []} orgId={orgId} empId={empId} editable={canWriteEmployees} />
        )}
      </div>
    </>
  );
}

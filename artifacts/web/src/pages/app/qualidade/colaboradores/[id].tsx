import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
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
  useCreateEmployeeProfileItem,
  useUpdateEmployeeProfileItem,
  useDeleteEmployeeProfileItem,
  useAddEmployeeProfileItemAttachment,
  useDeleteEmployeeProfileItemAttachment,
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
  EmployeeRecordAttachment,
  EmployeeProfileItem,
  EmployeeProfileItemAttachment,
  EmployeeTraining,
  EmployeeAwareness,
  EmployeeDetail,
  LinkedUnit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmployeeProfileItemDialog } from "@/components/employees/employee-profile-item-dialog";
import { ProfileItemAttachmentsField } from "@/components/employees/profile-item-form-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  uploadFilesToStorage,
  validateProfileItemUploadSelection,
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT,
  type UploadedFileRef,
} from "@/lib/uploads";
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
  admissionDate: "Data de admissão",
};

type EmployeeProfileItemRecord = EmployeeProfileItem;

type EmployeeProfileItemForm = {
  title: string;
  description: string;
};

function OverviewSectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.12em]">
        {title}
      </h3>
      {action}
    </div>
  );
}

function DialogStepTabs({
  steps,
  step,
  onStepChange,
}: {
  steps: string[];
  step: number;
  onStepChange: (step: number) => void;
}) {
  return (
    <div className="mb-5 flex items-center gap-1">
      {steps.map((label, index) => (
        <React.Fragment key={label}>
          {index > 0 && <div className="h-px flex-1 bg-border" />}
          <button
            type="button"
            onClick={() => onStepChange(index)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              step === index
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function DialogStepFooter({
  step,
  totalSteps,
  onBack,
  onCancel,
  onNext,
  onSubmit,
  submitLabel,
  isPending,
  disabled,
}: {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitLabel: string;
  isPending?: boolean;
  disabled?: boolean;
}) {
  return (
    <DialogFooter>
      {step > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Anterior
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      )}
      {step < totalSteps - 1 ? (
        <Button type="button" size="sm" onClick={onNext}>
          Próximo
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          isLoading={isPending}
          disabled={disabled}
        >
          {submitLabel}
        </Button>
      )}
    </DialogFooter>
  );
}

async function uploadEmployeeRecordFiles(
  files: FileList | null,
  existingCount: number,
  onSuccess: (uploads: UploadedFileRef[]) => void,
  onSettled: () => void,
) {
  if (!files?.length) {
    onSettled();
    return;
  }

  const selectedFiles = Array.from(files);
  const validationError = validateProfileItemUploadSelection(selectedFiles, existingCount);
  if (validationError) {
    toast({
      title: "Limite de anexos excedido",
      description: validationError,
      variant: "destructive",
    });
    onSettled();
    return;
  }

  try {
    const uploadedFiles = await uploadFilesToStorage(selectedFiles);
    onSuccess(uploadedFiles);
  } catch (error) {
    toast({
      title: "Falha ao enviar anexo",
      description: error instanceof Error ? error.message : "Não foi possível enviar o arquivo.",
      variant: "destructive",
    });
  } finally {
    onSettled();
  }
}

function mapRecordAttachmentItems(
  attachments: Array<EmployeeRecordAttachment | UploadedFileRef> | undefined,
  onRemove?: (objectPath: string) => void,
) {
  return (attachments || []).map((attachment) => ({
    id: attachment.objectPath,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    objectPath: attachment.objectPath,
    onRemove: onRemove ? () => onRemove(attachment.objectPath) : undefined,
  }));
}

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
    <div className="min-w-0">
      <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </Label>
      {editing ? (
        <div className="mt-1 flex items-center gap-1.5">
          {type === "select" && options ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-[13px]"
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
              className="min-h-[88px] flex-1 text-[13px]"
            />
          ) : (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              type={type}
              className="h-9 flex-1 text-[13px]"
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
        <button
          type="button"
          className={cn(
            "group/field mt-1 flex items-start gap-1 text-left",
            editable ? "cursor-pointer" : "cursor-default",
          )}
          onClick={() => {
            if (!editable) return;
            setDraft(String(value ?? ""));
            setEditing(true);
          }}
        >
          <span className="break-words text-[14px] text-foreground">
            {type === "select" && options
              ? options.find((o) => o.value === String(value))?.label || String(value ?? "—")
              : value || "—"}
          </span>
          {editable && (
            <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/0 transition-colors group-hover/field:text-muted-foreground/50" />
          )}
        </button>
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
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>([]);
  const [editingAttachments, setEditingAttachments] = useState<EmployeeProfileItemAttachment[]>([]);
  const [uploadingItemId, setUploadingItemId] = useState<number | "create" | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<EmployeeProfileItemRecord | null>(null);
  const [pendingDeleteAttachment, setPendingDeleteAttachment] = useState<{
    itemId: number;
    attachment: EmployeeProfileItemAttachment;
  } | null>(null);
  const emptyForm: EmployeeProfileItemForm = { title: "", description: "" };
  const [form, setForm] = useState<EmployeeProfileItemForm>(emptyForm);
  const createItemMutation = useCreateEmployeeProfileItem();
  const updateItemMutation = useUpdateEmployeeProfileItem();
  const deleteItemMutation = useDeleteEmployeeProfileItem();
  const addAttachmentMutation = useAddEmployeeProfileItemAttachment();
  const deleteAttachmentMutation = useDeleteEmployeeProfileItemAttachment();

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) }),
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(orgId) }),
    ]);
  };

  const resetCreateState = () => {
    setCreateOpen(false);
    setCreateAttachments([]);
    setForm(emptyForm);
    setUploadingItemId(null);
  };

  const resetEditState = () => {
    setEditingItem(null);
    setEditingAttachments([]);
    setForm(emptyForm);
    setUploadingItemId(null);
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    return error instanceof Error ? error.message : fallback;
  };

  const openCreate = () => {
    setForm(emptyForm);
    setCreateAttachments([]);
    setCreateOpen(true);
  };

  const openEdit = (item: EmployeeProfileItemRecord) => {
    setEditingItem(item);
    setEditingAttachments(item.attachments || []);
    setForm({
      title: item.title,
      description: item.description || "",
    });
  };

  const uploadDraftFiles = async (
    files: FileList | null,
    existingCount: number,
    onSuccess: (uploads: UploadedFileRef[]) => Promise<void> | void,
    target: number | "create",
  ) => {
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const validationError = validateProfileItemUploadSelection(selectedFiles, existingCount);
    if (validationError) {
      toast({
        title: "Limite de anexos excedido",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setUploadingItemId(target);
    try {
      const uploadedFiles = await uploadFilesToStorage(selectedFiles);
      await onSuccess(uploadedFiles);
    } catch (error) {
      toast({
        title: "Falha ao enviar anexo",
        description: getErrorMessage(error, "Não foi possível enviar o arquivo."),
        variant: "destructive",
      });
    } finally {
      setUploadingItemId(null);
    }
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

    try {
      await createItemMutation.mutateAsync({
        orgId,
        empId,
        data: {
          category,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          attachments: createAttachments.length > 0 ? createAttachments : undefined,
        },
      });
      await invalidate();
      resetCreateState();
    } catch (error) {
      toast({
        title: "Falha ao salvar item",
        description: getErrorMessage(error, "Não foi possível salvar o item."),
        variant: "destructive",
      });
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

    try {
      await updateItemMutation.mutateAsync({
        orgId,
        empId,
        itemId: editingItem.id,
        data: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
        },
      });
      await invalidate();
      resetEditState();
    } catch (error) {
      toast({
        title: "Falha ao atualizar item",
        description: getErrorMessage(error, "Não foi possível atualizar o item."),
        variant: "destructive",
      });
    }
  };

  const deleteItem = async () => {
    if (!pendingDeleteItem) return;

    try {
      await deleteItemMutation.mutateAsync({
        orgId,
        empId,
        itemId: pendingDeleteItem.id,
      });
      await invalidate();
      setPendingDeleteItem(null);
    } catch (error) {
      toast({
        title: "Falha ao remover item",
        description: getErrorMessage(error, "Não foi possível remover o item."),
        variant: "destructive",
      });
    }
  };

  const uploadAttachmentForCreate = async (files: FileList | null) => {
    await uploadDraftFiles(files, createAttachments.length, async (uploadedFiles) => {
      setCreateAttachments((current) => [...current, ...uploadedFiles]);
    }, "create");
  };

  const uploadAttachmentForEdit = async (itemId: number, files: FileList | null) => {
    await uploadDraftFiles(files, editingAttachments.length, async (uploadedFiles) => {
      const uploadedAttachments = await Promise.all(uploadedFiles.map((upload) => (
        addAttachmentMutation.mutateAsync({
          orgId,
          empId,
          itemId,
          data: upload,
        })
      )));

      setEditingAttachments((current) => [...current, ...uploadedAttachments]);
      await invalidate();
    }, itemId);
  };

  const deleteAttachment = async () => {
    if (!pendingDeleteAttachment) return;

    try {
      await deleteAttachmentMutation.mutateAsync({
        orgId,
        empId,
        itemId: pendingDeleteAttachment.itemId,
        attachmentId: pendingDeleteAttachment.attachment.id,
      });
      setEditingAttachments((current) => current.filter((attachment) => attachment.id !== pendingDeleteAttachment.attachment.id));
      await invalidate();
      setPendingDeleteAttachment(null);
    } catch (error) {
      toast({
        title: "Falha ao remover anexo",
        description: getErrorMessage(error, "Não foi possível remover o anexo."),
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <OverviewSectionTitle
        title={title}
        action={
          editable ? (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Item
            </Button>
          ) : undefined
        }
      />

      <p className="mb-4 text-[13px] text-muted-foreground">{emptyText}</p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          Nenhum item cadastrado.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {item.description && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.description}</p>
                  )}
                  {item.attachments.length > 0 && (
                    <div className="mt-3">
                      <ProfileItemAttachmentsField
                        attachments={item.attachments.map((attachment) => ({
                          id: attachment.id,
                          fileName: attachment.fileName,
                          fileSize: attachment.fileSize,
                          objectPath: attachment.objectPath,
                        }))}
                      />
                    </div>
                  )}
                </div>
                {editable && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground/40 hover:text-primary">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setPendingDeleteItem(item)} className="p-1.5 text-muted-foreground/40 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <EmployeeProfileItemDialog
        open={editable && isCreateOpen}
        onOpenChange={(open) => {
          if (!open) resetCreateState();
          else setCreateOpen(true);
        }}
        title={`Novo item de ${title.toLowerCase()}`}
        submitLabel="Salvar"
        isSubmitting={createItemMutation.isPending}
        form={form}
        onFormChange={setForm}
        attachments={createAttachments.map((attachment, index) => ({
          id: `${attachment.objectPath}-${index}`,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          objectPath: attachment.objectPath,
          onRemove: () => setCreateAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index)),
        }))}
        onUpload={(files) => {
          void uploadAttachmentForCreate(files);
        }}
        uploading={uploadingItemId === "create"}
        onSubmit={() => { void createItem(); }}
        onCancel={resetCreateState}
      />

      <EmployeeProfileItemDialog
        open={editable && !!editingItem}
        onOpenChange={(open) => {
          if (!open) resetEditState();
        }}
        title="Editar item"
        submitLabel="Atualizar"
        isSubmitting={updateItemMutation.isPending}
        form={form}
        onFormChange={setForm}
        attachments={editingAttachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          objectPath: attachment.objectPath,
          onRemove: () => {
            if (editingItem) {
              setPendingDeleteAttachment({ itemId: editingItem.id, attachment });
            }
          },
        }))}
        onUpload={(files) => {
          if (editingItem) {
            void uploadAttachmentForEdit(editingItem.id, files);
          }
        }}
        uploading={uploadingItemId === editingItem?.id}
        onSubmit={() => { void updateItem(); }}
        onCancel={resetEditState}
      />

      <Dialog open={!!pendingDeleteItem} onOpenChange={(open) => { if (!open) setPendingDeleteItem(null); }} title="Confirmar exclusão do item">
        <p className="text-sm text-muted-foreground mt-2">
          Este item será removido permanentemente, incluindo seus anexos.
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setPendingDeleteItem(null)}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { void deleteItem(); }} disabled={deleteItemMutation.isPending}>
            {deleteItemMutation.isPending ? "Removendo..." : "Remover"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!pendingDeleteAttachment} onOpenChange={(open) => { if (!open) setPendingDeleteAttachment(null); }} title="Confirmar exclusão do anexo">
        <p className="text-sm text-muted-foreground mt-2">
          O anexo {pendingDeleteAttachment?.attachment.fileName ? `"${pendingDeleteAttachment.attachment.fileName}"` : ""} será removido deste item.
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setPendingDeleteAttachment(null)}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { void deleteAttachment(); }} disabled={deleteAttachmentMutation.isPending}>
            {deleteAttachmentMutation.isPending ? "Removendo..." : "Remover"}
          </Button>
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
    <div>
      <OverviewSectionTitle
        title="Unidades"
        action={
          editable && availableUnits.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowAdd(!showAdd)}
              className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
            >
              {showAdd ? "Cancelar vínculo" : "+ Vincular"}
            </button>
          ) : undefined
        }
      />
      {linkedUnits.length === 0 && !showAdd && (
        <p className="text-[14px] text-muted-foreground">Nenhuma unidade vinculada</p>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        {linkedUnits.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-3 py-1 text-[12px] text-foreground"
          >
            {u.name}
            {editable && <button onClick={() => handleUnlink(u.id)} className="cursor-pointer text-muted-foreground/40 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>}
          </span>
        ))}
      </div>
      {editable && showAdd && (
        <div className="mt-4 flex items-center gap-2">
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 py-2 text-[13px]"
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

function CompetencyFormStep({
  form,
  setForm,
  step,
  attachments,
  onUpload,
  onRemoveAttachment,
  uploading = false,
}: {
  form: CompetencyForm;
  setForm: (f: CompetencyForm) => void;
  step: number;
  attachments: Array<EmployeeRecordAttachment | UploadedFileRef>;
  onUpload?: (files: FileList | null) => void;
  onRemoveAttachment?: (objectPath: string) => void;
  uploading?: boolean;
}) {
  if (step === 0) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">Nome *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Ex: Gestão de Resíduos" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Tipo</Label>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CreateCompetencyBodyType })} className="mt-1 h-10 text-[13px]">
            <option value={CreateCompetencyBodyTypeValues.formacao}>Formação</option>
            <option value={CreateCompetencyBodyTypeValues.experiencia}>Experiência</option>
            <option value={CreateCompetencyBodyTypeValues.habilidade}>Habilidade</option>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={4} />
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Nível Requerido</Label>
          <Input type="number" min={0} max={5} value={form.requiredLevel} onChange={(e) => setForm({ ...form, requiredLevel: Number(e.target.value) })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Nível Adquirido</Label>
          <Input type="number" min={0} max={5} value={form.acquiredLevel} onChange={(e) => setForm({ ...form, acquiredLevel: Number(e.target.value) })} className="mt-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Evidência</Label>
        <Input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} className="mt-1" placeholder="Ex: Certificado XYZ" />
      </div>
      <ProfileItemAttachmentsField
        attachments={mapRecordAttachmentItems(attachments, onRemoveAttachment)}
        onUpload={onUpload}
        uploading={uploading}
        emptyText="Adicione PDF ou imagem para validar a competência."
        accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
      />
    </div>
  );
}

function TrainingFormStep({
  form,
  setForm,
  step,
  attachments,
  onUpload,
  onRemoveAttachment,
  uploading = false,
}: {
  form: TrainingForm;
  setForm: (f: TrainingForm) => void;
  step: number;
  attachments: Array<EmployeeRecordAttachment | UploadedFileRef>;
  onUpload?: (files: FileList | null) => void;
  onRemoveAttachment?: (objectPath: string) => void;
  uploading?: boolean;
}) {
  if (step === 0) {
    return (
      <div className="space-y-5">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Título *</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" placeholder="Ex: NR-12 Segurança" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={4} />
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Instituição</Label>
          <Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Carga Horária (h)</Label>
          <Input type="number" value={form.workloadHours} onChange={(e) => setForm({ ...form, workloadHours: Number(e.target.value) })} className="mt-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CreateTrainingBodyStatus })} className="mt-1 h-10 text-[13px]">
            <option value={CreateTrainingBodyStatusValues.pendente}>Pendente</option>
            <option value={CreateTrainingBodyStatusValues.concluido}>Concluído</option>
            <option value={CreateTrainingBodyStatusValues.vencido}>Vencido</option>
          </Select>
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
      <ProfileItemAttachmentsField
        attachments={mapRecordAttachmentItems(attachments, onRemoveAttachment)}
        onUpload={onUpload}
        uploading={uploading}
        emptyText="Adicione PDF ou imagem para validar o treinamento."
        accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
      />
    </div>
  );
}

function AwarenessFormStep({
  form,
  setForm,
  step,
  attachments,
  onUpload,
  onRemoveAttachment,
  uploading = false,
}: {
  form: AwarenessForm;
  setForm: (f: AwarenessForm) => void;
  step: number;
  attachments: Array<EmployeeRecordAttachment | UploadedFileRef>;
  onUpload?: (files: FileList | null) => void;
  onRemoveAttachment?: (objectPath: string) => void;
  uploading?: boolean;
}) {
  if (step === 0) {
    return (
      <div className="space-y-5">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Tema *</Label>
          <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="mt-1" placeholder="Ex: Política da Qualidade" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
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
      <ProfileItemAttachmentsField
        attachments={mapRecordAttachmentItems(attachments, onRemoveAttachment)}
        onUpload={onUpload}
        uploading={uploading}
        emptyText="Adicione PDF ou imagem para validar o registro."
        accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
      />
    </div>
  );
}

function CompetenciasTab({
  competencies,
  orgId,
  empId,
  editable = true,
  createOpen = false,
  onCreateOpenChange,
}: {
  competencies: EmployeeCompetency[];
  orgId: number;
  empId: number;
  editable?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const isCreateOpen = onCreateOpenChange ? createOpen : internalCreateOpen;
  const setCreateOpen = onCreateOpenChange || setInternalCreateOpen;
  const [editingComp, setEditingComp] = useState<EmployeeCompetency | null>(null);
  const [createStep, setCreateStep] = useState(0);
  const [editStep, setEditStep] = useState(0);
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>([]);
  const [editingAttachments, setEditingAttachments] = useState<EmployeeRecordAttachment[]>([]);
  const [isUploadingCreateAttachments, setIsUploadingCreateAttachments] = useState(false);
  const [isUploadingEditAttachments, setIsUploadingEditAttachments] = useState(false);
  const createMutation = useCreateCompetency();
  const updateMutation = useUpdateCompetency();
  const deleteMutation = useDeleteCompetency();
  const steps = ["Básico", "Níveis", "Evidência"];
  const descriptions = ["Informações básicas", "Níveis de competência", "Registro de evidência"];

  const emptyForm: CompetencyForm = { name: "", description: "", type: "formacao", requiredLevel: 3, acquiredLevel: 0, evidence: "" };
  const [form, setForm] = useState<CompetencyForm>(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreateStep(0);
    setForm(emptyForm);
    setCreateAttachments([]);
    setIsUploadingCreateAttachments(false);
  };

  const closeEditDialog = () => {
    setEditingComp(null);
    setEditStep(0);
    setForm(emptyForm);
    setEditingAttachments([]);
    setIsUploadingEditAttachments(false);
  };

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      orgId,
      empId,
      data: {
        ...form,
        attachments: createAttachments.length > 0 ? createAttachments : undefined,
      },
    });
    invalidate();
    closeCreateDialog();
  };

  const openEdit = (comp: EmployeeCompetency) => {
    setEditingComp(comp);
    setEditStep(0);
    setForm({
      name: comp.name,
      description: comp.description || "",
      type: comp.type,
      requiredLevel: comp.requiredLevel,
      acquiredLevel: comp.acquiredLevel,
      evidence: comp.evidence || "",
    });
    setEditingAttachments(comp.attachments || []);
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
        attachments: editingAttachments,
      },
    });
    invalidate();
    closeEditDialog();
  };

  const handleDelete = async (compId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, compId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Competências necessárias e adquiridas conforme ISO 9001:2015 §7.2
      </p>

      {competencies.length === 0 ? (
        <div className="text-center py-12">
          <Award className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhuma competência registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {competencies.map((comp) => (
            <div key={comp.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              {(() => {
                const compAttachments = comp.attachments || [];
                return (
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
                  {compAttachments.length > 0 && (
                    <div className="mt-3">
                      <ProfileItemAttachmentsField
                        attachments={mapRecordAttachmentItems(compAttachments)}
                        emptyText=""
                        accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                      />
                    </div>
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
                );
              })()}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={editable && isCreateOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
          else setCreateOpen(true);
        }}
        title="Nova Competência"
        description={descriptions[createStep]}
        size="lg"
      >
        <DialogStepTabs steps={steps} step={createStep} onStepChange={setCreateStep} />
        <CompetencyFormStep
          form={form}
          setForm={setForm}
          step={createStep}
          attachments={createAttachments}
          onUpload={(files) => {
            setIsUploadingCreateAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              createAttachments.length,
              (uploads) => setCreateAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingCreateAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setCreateAttachments((current) => current.filter((attachment) => attachment.objectPath !== objectPath));
          }}
          uploading={isUploadingCreateAttachments}
        />
        <DialogStepFooter
          step={createStep}
          totalSteps={steps.length}
          onBack={() => setCreateStep((current) => current - 1)}
          onCancel={closeCreateDialog}
          onNext={() => setCreateStep((current) => current + 1)}
          onSubmit={handleCreate}
          submitLabel="Salvar"
          isPending={createMutation.isPending}
          disabled={!form.name}
        />
      </Dialog>

      <Dialog
        open={editable && !!editingComp}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
        title="Editar Competência"
        description={descriptions[editStep]}
        size="lg"
      >
        <DialogStepTabs steps={steps} step={editStep} onStepChange={setEditStep} />
        <CompetencyFormStep
          form={form}
          setForm={setForm}
          step={editStep}
          attachments={editingAttachments}
          onUpload={(files) => {
            setIsUploadingEditAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              editingAttachments.length,
              (uploads) => setEditingAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingEditAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setEditingAttachments((current) => current.filter((attachment) => attachment.objectPath !== objectPath));
          }}
          uploading={isUploadingEditAttachments}
        />
        <DialogStepFooter
          step={editStep}
          totalSteps={steps.length}
          onBack={() => setEditStep((current) => current - 1)}
          onCancel={closeEditDialog}
          onNext={() => setEditStep((current) => current + 1)}
          onSubmit={handleUpdate}
          submitLabel="Atualizar"
          isPending={updateMutation.isPending}
          disabled={!form.name}
        />
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

function TreinamentosTab({
  trainings,
  orgId,
  empId,
  editable = true,
  createOpen = false,
  onCreateOpenChange,
}: {
  trainings: EmployeeTraining[];
  orgId: number;
  empId: number;
  editable?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const isCreateOpen = onCreateOpenChange ? createOpen : internalCreateOpen;
  const setCreateOpen = onCreateOpenChange || setInternalCreateOpen;
  const [editingTraining, setEditingTraining] = useState<EmployeeTraining | null>(null);
  const [createStep, setCreateStep] = useState(0);
  const [editStep, setEditStep] = useState(0);
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>([]);
  const [editingAttachments, setEditingAttachments] = useState<EmployeeRecordAttachment[]>([]);
  const [isUploadingCreateAttachments, setIsUploadingCreateAttachments] = useState(false);
  const [isUploadingEditAttachments, setIsUploadingEditAttachments] = useState(false);
  const createMutation = useCreateTraining();
  const deleteMutation = useDeleteTraining();
  const updateMutation = useUpdateTraining();
  const steps = ["Básico", "Instituição", "Status"];
  const descriptions = ["Informações básicas", "Instituição e carga horária", "Status e prazos"];

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

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreateStep(0);
    setForm(emptyForm);
    setCreateAttachments([]);
    setIsUploadingCreateAttachments(false);
  };

  const closeEditDialog = () => {
    setEditingTraining(null);
    setEditStep(0);
    setForm(emptyForm);
    setEditingAttachments([]);
    setIsUploadingEditAttachments(false);
  };

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      orgId,
      empId,
      data: {
        ...form,
        workloadHours: form.workloadHours || undefined,
        completionDate: form.completionDate || undefined,
        expirationDate: form.expirationDate || undefined,
        attachments: createAttachments.length > 0 ? createAttachments : undefined,
      },
    });
    invalidate();
    closeCreateDialog();
  };

  const openEdit = (t: EmployeeTraining) => {
    setEditingTraining(t);
    setEditStep(0);
    setForm({
      title: t.title,
      description: t.description || "",
      institution: t.institution || "",
      workloadHours: t.workloadHours || 0,
      completionDate: t.completionDate || "",
      expirationDate: t.expirationDate || "",
      status: t.status,
    });
    setEditingAttachments(t.attachments || []);
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
        attachments: editingAttachments,
      },
    });
    invalidate();
    closeEditDialog();
  };

  const handleDelete = async (trainId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, trainId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Registro de treinamentos conforme ISO 9001:2015 §7.2
      </p>

      {trainings.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhum treinamento registrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trainings.map((t) => (
            <div key={t.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              {(() => {
                const trainingAttachments = t.attachments || [];
                return (
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
                  {trainingAttachments.length > 0 && (
                    <div className="mt-3">
                      <ProfileItemAttachmentsField
                        attachments={mapRecordAttachmentItems(trainingAttachments)}
                        emptyText=""
                        accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                      />
                    </div>
                  )}
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
                );
              })()}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={editable && isCreateOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
          else setCreateOpen(true);
        }}
        title="Novo Treinamento"
        description={descriptions[createStep]}
        size="lg"
      >
        <DialogStepTabs steps={steps} step={createStep} onStepChange={setCreateStep} />
        <TrainingFormStep
          form={form}
          setForm={setForm}
          step={createStep}
          attachments={createAttachments}
          onUpload={(files) => {
            setIsUploadingCreateAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              createAttachments.length,
              (uploads) => setCreateAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingCreateAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setCreateAttachments((current) => current.filter((attachment) => attachment.objectPath !== objectPath));
          }}
          uploading={isUploadingCreateAttachments}
        />
        <DialogStepFooter
          step={createStep}
          totalSteps={steps.length}
          onBack={() => setCreateStep((current) => current - 1)}
          onCancel={closeCreateDialog}
          onNext={() => setCreateStep((current) => current + 1)}
          onSubmit={handleCreate}
          submitLabel="Salvar"
          isPending={createMutation.isPending}
          disabled={!form.title}
        />
      </Dialog>

      <Dialog
        open={editable && !!editingTraining}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
        title="Editar Treinamento"
        description={descriptions[editStep]}
        size="lg"
      >
        <DialogStepTabs steps={steps} step={editStep} onStepChange={setEditStep} />
        <TrainingFormStep
          form={form}
          setForm={setForm}
          step={editStep}
          attachments={editingAttachments}
          onUpload={(files) => {
            setIsUploadingEditAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              editingAttachments.length,
              (uploads) => setEditingAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingEditAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setEditingAttachments((current) => current.filter((attachment) => attachment.objectPath !== objectPath));
          }}
          uploading={isUploadingEditAttachments}
        />
        <DialogStepFooter
          step={editStep}
          totalSteps={steps.length}
          onBack={() => setEditStep((current) => current - 1)}
          onCancel={closeEditDialog}
          onNext={() => setEditStep((current) => current + 1)}
          onSubmit={handleUpdate}
          submitLabel="Atualizar"
          isPending={updateMutation.isPending}
          disabled={!form.title}
        />
      </Dialog>
    </div>
  );
}

function ConscientizacaoTab({
  awareness,
  orgId,
  empId,
  editable = true,
  createOpen = false,
  onCreateOpenChange,
}: {
  awareness: EmployeeAwareness[];
  orgId: number;
  empId: number;
  editable?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const isCreateOpen = onCreateOpenChange ? createOpen : internalCreateOpen;
  const setCreateOpen = onCreateOpenChange || setInternalCreateOpen;
  const [editingAwareness, setEditingAwareness] = useState<EmployeeAwareness | null>(null);
  const [createStep, setCreateStep] = useState(0);
  const [editStep, setEditStep] = useState(0);
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>([]);
  const [editingAttachments, setEditingAttachments] = useState<EmployeeRecordAttachment[]>([]);
  const [isUploadingCreateAttachments, setIsUploadingCreateAttachments] = useState(false);
  const [isUploadingEditAttachments, setIsUploadingEditAttachments] = useState(false);
  const createMutation = useCreateAwareness();
  const deleteMutation = useDeleteAwareness();
  const updateMutation = useUpdateAwareness();
  const steps = ["Básico", "Verificação"];
  const descriptions = ["Informações básicas", "Data, verificação e resultado"];

  const emptyForm = { topic: "", description: "", date: new Date().toISOString().split("T")[0], verificationMethod: "", result: "" };
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreateStep(0);
    setForm(emptyForm);
    setCreateAttachments([]);
    setIsUploadingCreateAttachments(false);
  };

  const closeEditDialog = () => {
    setEditingAwareness(null);
    setEditStep(0);
    setForm(emptyForm);
    setEditingAttachments([]);
    setIsUploadingEditAttachments(false);
  };

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      orgId,
      empId,
      data: {
        ...form,
        attachments: createAttachments.length > 0 ? createAttachments : undefined,
      },
    });
    invalidate();
    closeCreateDialog();
  };

  const openEdit = (a: EmployeeAwareness) => {
    setEditingAwareness(a);
    setEditStep(0);
    setForm({
      topic: a.topic,
      description: a.description || "",
      date: a.date,
      verificationMethod: a.verificationMethod || "",
      result: a.result || "",
    });
    setEditingAttachments(a.attachments || []);
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
        attachments: editingAttachments,
      },
    });
    invalidate();
    closeEditDialog();
  };

  const handleDelete = async (awaId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, awaId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Registros de conscientização conforme ISO 9001:2015 §7.3
      </p>

      {awareness.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhum registro de conscientização</p>
        </div>
      ) : (
        <div className="space-y-2">
          {awareness.map((a) => (
            <div key={a.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              {(() => {
                const awarenessAttachments = a.attachments || [];
                return (
              <div className="flex items-start justify-between">
                <div className={cn("flex-1", editable ? "cursor-pointer" : "")} onClick={() => editable && openEdit(a)}>
                  <p className="text-[13px] font-medium text-foreground">{a.topic}</p>
                  {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{a.date}</span>
                    {a.verificationMethod && <span>Método: {a.verificationMethod}</span>}
                    {a.result && <span>Resultado: {a.result}</span>}
                  </div>
                  {awarenessAttachments.length > 0 && (
                    <div className="mt-3">
                      <ProfileItemAttachmentsField
                        attachments={mapRecordAttachmentItems(awarenessAttachments)}
                        emptyText=""
                        accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                      />
                    </div>
                  )}
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
                );
              })()}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={editable && isCreateOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
          else setCreateOpen(true);
        }}
        title="Novo Registro de Conscientização"
        description={descriptions[createStep]}
        size="lg"
      >
        <DialogStepTabs steps={steps} step={createStep} onStepChange={setCreateStep} />
        <AwarenessFormStep
          form={form}
          setForm={setForm}
          step={createStep}
          attachments={createAttachments}
          onUpload={(files) => {
            setIsUploadingCreateAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              createAttachments.length,
              (uploads) => setCreateAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingCreateAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setCreateAttachments((current) => current.filter((attachment) => attachment.objectPath !== objectPath));
          }}
          uploading={isUploadingCreateAttachments}
        />
        <DialogStepFooter
          step={createStep}
          totalSteps={steps.length}
          onBack={() => setCreateStep((current) => current - 1)}
          onCancel={closeCreateDialog}
          onNext={() => setCreateStep((current) => current + 1)}
          onSubmit={handleCreate}
          submitLabel="Salvar"
          isPending={createMutation.isPending}
          disabled={!form.topic || !form.date}
        />
      </Dialog>

      <Dialog
        open={editable && !!editingAwareness}
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
        title="Editar Registro de Conscientização"
        description={descriptions[editStep]}
        size="lg"
      >
        <DialogStepTabs steps={steps} step={editStep} onStepChange={setEditStep} />
        <AwarenessFormStep
          form={form}
          setForm={setForm}
          step={editStep}
          attachments={editingAttachments}
          onUpload={(files) => {
            setIsUploadingEditAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              editingAttachments.length,
              (uploads) => setEditingAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingEditAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setEditingAttachments((current) => current.filter((attachment) => attachment.objectPath !== objectPath));
          }}
          uploading={isUploadingEditAttachments}
        />
        <DialogStepFooter
          step={editStep}
          totalSteps={steps.length}
          onBack={() => setEditStep((current) => current - 1)}
          onCancel={closeEditDialog}
          onNext={() => setEditStep((current) => current + 1)}
          onSubmit={handleUpdate}
          submitLabel="Atualizar"
          isPending={updateMutation.isPending}
          disabled={!form.topic || !form.date}
        />
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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editStep, setEditStep] = useState(0);
  const [compCreateOpen, setCompCreateOpen] = useState(false);
  const [trainingCreateOpen, setTrainingCreateOpen] = useState(false);
  const [awarenessCreateOpen, setAwarenessCreateOpen] = useState(false);

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
    navigate("/organizacao/colaboradores");
  };

  usePageTitle(employee?.name);

  const headerActions = React.useMemo(() => {
    if (!employee) return null;

    const addButton = canWriteEmployees ? (() => {
      switch (activeTab) {
        case "competencias":
          return (
            <Button size="sm" onClick={() => setCompCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nova Competência
            </Button>
          );
        case "treinamentos":
          return (
            <Button size="sm" onClick={() => setTrainingCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo Treinamento
            </Button>
          );
        case "conscientizacao":
          return (
            <Button size="sm" onClick={() => setAwarenessCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo Registro
            </Button>
          );
        default:
          return null;
      }
    })() : null;

    return (
      <div className="flex items-center gap-2">
        <Link href="/organizacao/colaboradores">
          <Button variant="outline" size="sm" className="cursor-pointer">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Voltar
          </Button>
        </Link>
        {canWriteEmployees && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar
            </Button>
            <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={handleArchive}>
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Arquivar
            </Button>
          </>
        )}
        {addButton}
      </div>
    );
  }, [employee, canWriteEmployees, handleArchive, activeTab]);

  useHeaderActions(headerActions);

  if (!orgId) return null;

  if (isLoading) {
    return <div className="text-center py-20 text-[13px] text-muted-foreground">Carregando...</div>;
  }

  if (error || !employee) {
    return (
      <div className="text-center py-20">
        <p className="text-[13px] text-muted-foreground">Colaborador não encontrado</p>
        <Link href="/organizacao/colaboradores">
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
      <div className="space-y-10">
        <div className="mb-3">
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
          <div className="space-y-10">
            <div>
              <OverviewSectionTitle title="Informações Pessoais" />
              <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
                <InlineField label="Nome completo *" value={employee.name} fieldKey="name" editable={canWriteEmployees} onSave={handleFieldSave} />
                <InlineField label="CPF" value={employee.cpf} fieldKey="cpf" editable={canWriteEmployees} onSave={handleFieldSave} />
                <InlineField label="E-mail" value={employee.email} fieldKey="email" editable={canWriteEmployees} onSave={handleFieldSave} />
                <InlineField label="Telefone" value={employee.phone} fieldKey="phone" editable={canWriteEmployees} onSave={handleFieldSave} />
              </div>
            </div>

            <div>
              <OverviewSectionTitle title="Informações Profissionais" />
              <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
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
          </div>
        )}

        {activeTab === "competencias" && (
          <CompetenciasTab competencies={employee.competencies || []} orgId={orgId} empId={empId} editable={canWriteEmployees} createOpen={compCreateOpen} onCreateOpenChange={setCompCreateOpen} />
        )}

        {activeTab === "treinamentos" && (
          <TreinamentosTab trainings={employee.trainings || []} orgId={orgId} empId={empId} editable={canWriteEmployees} createOpen={trainingCreateOpen} onCreateOpenChange={setTrainingCreateOpen} />
        )}

        {activeTab === "conscientizacao" && (
          <ConscientizacaoTab awareness={employee.awareness || []} orgId={orgId} empId={empId} editable={canWriteEmployees} createOpen={awarenessCreateOpen} onCreateOpenChange={setAwarenessCreateOpen} />
        )}
      </div>

      <Dialog
        open={editModalOpen}
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) setEditStep(0);
        }}
        title="Editar Colaborador"
        description={["Informações pessoais", "Informações profissionais"][editStep]}
        size="lg"
      >
        {employee && (
          <EditEmployeeModal
            employee={employee}
            positions={positions}
            departments={departments}
            step={editStep}
            onStepChange={setEditStep}
            onSave={async (data) => {
              await updateMutation.mutateAsync({ orgId: orgId!, empId, data });
              invalidate();
              queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(orgId!) });
              setEditModalOpen(false);
              setEditStep(0);
            }}
            onCancel={() => { setEditModalOpen(false); setEditStep(0); }}
            isPending={updateMutation.isPending}
          />
        )}
      </Dialog>
    </>
  );
}

function EditEmployeeModal({
  employee,
  positions,
  departments,
  step,
  onStepChange,
  onSave,
  onCancel,
  isPending,
}: {
  employee: EmployeeDetail;
  positions: Array<{ name: string }>;
  departments: Array<{ name: string }>;
  step: number;
  onStepChange: (s: number) => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    name: employee.name || "",
    cpf: employee.cpf || "",
    email: employee.email || "",
    phone: employee.phone || "",
    position: employee.position || "",
    department: employee.department || "",
    contractType: employee.contractType || "clt",
    status: employee.status || "active",
    admissionDate: employee.admissionDate || "",
    terminationDate: employee.terminationDate || "",
  });

  const update = (key: string, val: string) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    await onSave({
      name: form.name.trim(),
      cpf: form.cpf.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      position: form.position || null,
      department: form.department || null,
      contractType: form.contractType,
      status: form.status,
      admissionDate: form.admissionDate || null,
      terminationDate: form.terminationDate || null,
    });
  };

  const steps = ["Pessoal", "Profissional"];

  return (
    <>
      <div className="flex items-center gap-1 mb-5">
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className="h-px flex-1 bg-border" />}
            <button
              type="button"
              onClick={() => onStepChange(i)}
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors whitespace-nowrap cursor-pointer",
                step === i
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <Label>Nome completo *</Label>
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>CPF</Label>
            <Input value={form.cpf} onChange={(e) => update("cpf", e.target.value)} className="mt-1" placeholder="000.000.000-00" />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input value={form.email} onChange={(e) => update("email", e.target.value)} className="mt-1" type="email" />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1" />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <Label>Cargo</Label>
            <Select value={form.position} onChange={(e) => update("position", e.target.value)} className="mt-1">
              <option value="">Selecionar cargo</option>
              {positions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Departamento</Label>
            <Select value={form.department} onChange={(e) => update("department", e.target.value)} className="mt-1">
              <option value="">Selecionar departamento</option>
              {departments.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Tipo de Contrato</Label>
            <Select value={form.contractType} onChange={(e) => update("contractType", e.target.value)} className="mt-1">
              <option value="clt">CLT</option>
              <option value="pj">PJ</option>
              <option value="intern">Estagiário</option>
              <option value="temporary">Temporário</option>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => update("status", e.target.value)} className="mt-1">
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="on_leave">Afastado</option>
            </Select>
          </div>
          <div>
            <Label>Data de Admissão *</Label>
            <Input value={form.admissionDate} onChange={(e) => update("admissionDate", e.target.value)} className="mt-1" type="date" />
          </div>
          <div>
            <Label>Data de Desligamento</Label>
            <Input value={form.terminationDate} onChange={(e) => update("terminationDate", e.target.value)} className="mt-1" type="date" />
          </div>
        </div>
      )}

      <DialogFooter>
        {step > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onStepChange(step - 1)}>
            Anterior
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button type="button" size="sm" onClick={() => onStepChange(step + 1)}>
            Próximo
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleSubmit} isLoading={isPending} disabled={!form.name.trim()}>
            Salvar
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

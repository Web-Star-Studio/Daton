import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
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
  useCreateTrainingEffectivenessReview,
  useCreateAwareness,
  useUpdateAwareness,
  useDeleteAwareness,
  useListUnits,
  useListDepartments,
  useListPositions,
  useListDocuments,
  useCreateEmployeeProfileItem,
  useUpdateEmployeeProfileItem,
  useDeleteEmployeeProfileItem,
  useAddEmployeeProfileItemAttachment,
  useDeleteEmployeeProfileItemAttachment,
  useLinkEmployeeUnit,
  useUnlinkEmployeeUnit,
  listStrategicPlans,
  getStrategicPlan,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  useListEmployees,
  getListDepartmentsQueryKey,
  getListPositionsQueryKey,
  CreateCompetencyBodyType as CreateCompetencyBodyTypeValues,
  CreateTrainingBodyStatus as CreateTrainingBodyStatusValues,
  CreateTrainingBodyTargetCompetencyType as CreateTrainingBodyTargetCompetencyTypeValues,
} from "@workspace/api-client-react";
import type {
  CreateCompetencyBodyType,
  UpdateCompetencyBodyType,
  CreateTrainingBodyStatus,
  UpdateTrainingBodyStatus,
  CreateTrainingBodyTargetCompetencyType,
  EmployeeCompetency,
  EmployeeRecordAttachment,
  EmployeeProfileItem,
  EmployeeProfileItemAttachment,
  EmployeeTraining,
  EmployeeAwareness,
  EmployeeDetail,
  LinkedUnit,
  TrainingEffectivenessReview,
  DocumentSummary,
  StrategicPlanObjective,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmployeeProfileItemDialog } from "@/components/employees/employee-profile-item-dialog";
import { ProfileItemAttachmentsField } from "@/components/employees/profile-item-form-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { formatKpiNumber } from "@/lib/kpi-client";
import { CriarAcaoButton } from "@/pages/app/planos-acao/_components/criar-acao-button";
import { AcoesVinculadas } from "@/pages/app/planos-acao/_components/acoes-vinculadas";
import {
  TrainingWorkloadCell,
  TrainingWorkloadInput,
} from "@/pages/app/aprendizagem/_components/carga-horaria";
import { useAllActiveSgqProcesses } from "@/lib/governance-system-client";
import {
  uploadFilesToStorage,
  validateProfileItemUploadSelection,
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT,
  type UploadedFileRef,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { downloadTrainingCertificate } from "@/lib/training-certificate-pdf";
import {
  ArrowLeft,
  Pencil,
  X,
  Plus,
  Trash2,
  GraduationCap,
  Award,
  Lightbulb,
  Archive,
  CheckCircle2,
  CalendarCheck,
  Download,
} from "lucide-react";
import { useLocation } from "wouter";
import { FichaHeader } from "./_components/FichaHeader";
import { DadosCards } from "./_components/DadosCards";
import {
  FormacaoQualificacoes,
  type RequirementRow,
} from "./_components/FormacaoQualificacoes";
import { RegistrarConclusaoForm } from "./_components/RegistrarConclusaoForm";
import { RegistrarEvidenciaDialog } from "./_components/RegistrarEvidenciaDialog";
import {
  toChaCompetencyType,
  selectOtherCompetencies,
} from "./_lib/ficha-derivations";
import {
  uploadEmployeeRecordFiles,
  mapRecordAttachmentItems,
} from "./_lib/employee-record-attachments";

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
  terceirizado: "Terceirizado",
};

const TRAINING_STATUS: Record<string, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  vencido: "Vencido",
  nao_aplicavel: "Não aplicável",
  // Legado da carga do sistema antigo: não é estado do v2 nem selecionável,
  // só histórico que precisa de rótulo para não aparecer cru na ficha.
  em_andamento: "Em andamento",
};

const TRAINING_STATUS_COLORS: Record<string, string> = {
  pendente:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  concluido:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  vencido:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  // Neutro: ausência de obrigação, não é sucesso nem alerta.
  nao_aplicavel: "bg-muted text-muted-foreground border-border",
};

const EFFECTIVENESS_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente de eficácia",
  effective: "Eficaz",
  ineffective: "Ineficaz",
};

const EFFECTIVENESS_STATUS_COLORS: Record<string, string> = {
  pending:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  effective:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  ineffective:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
};

const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  conhecimento: "Conhecimento",
  habilidade: "Habilidade",
  atitude: "Atitude",
};

type EmployeeProfileItemRecord = EmployeeProfileItem;
type StrategicObjectiveOption = {
  id: number;
  label: string;
  planTitle: string;
};

function useStrategicObjectiveOptions(orgId?: number) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["employee-awareness-objectives", orgId],
    queryFn: async (): Promise<StrategicObjectiveOption[]> => {
      if (!orgId) return [];

      const plans = await listStrategicPlans(orgId);
      const activePlans = plans.filter((plan) => plan.status !== "archived");
      const details = await Promise.all(
        activePlans.map((plan) => getStrategicPlan(orgId, plan.id)),
      );

      return details.flatMap((planDetail) =>
        planDetail.objectives.map((objective: StrategicPlanObjective) => ({
          id: objective.id,
          label: objective.code
            ? `${objective.code} · ${objective.description}`
            : objective.description,
          planTitle: planDetail.title,
        })),
      );
    },
  });
}

type EmployeeProfileItemForm = {
  title: string;
  description: string;
};

function OverviewSectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.12em]">
          {title}
        </h3>
        {subtitle ? (
          <p className="text-[11px] normal-case tracking-normal text-muted-foreground/80 mt-0.5">
            {subtitle}
          </p>
        ) : null}
      </div>
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
  const [editingItem, setEditingItem] =
    useState<EmployeeProfileItemRecord | null>(null);
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>(
    [],
  );
  const [editingAttachments, setEditingAttachments] = useState<
    EmployeeProfileItemAttachment[]
  >([]);
  const [uploadingItemId, setUploadingItemId] = useState<
    number | "create" | null
  >(null);
  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<EmployeeProfileItemRecord | null>(null);
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
      queryClient.invalidateQueries({
        queryKey: getGetEmployeeQueryKey(orgId, empId),
      }),
      queryClient.invalidateQueries({
        queryKey: getListEmployeesQueryKey(orgId),
      }),
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
    const validationError = validateProfileItemUploadSelection(
      selectedFiles,
      existingCount,
    );
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
        description: getErrorMessage(
          error,
          "Não foi possível enviar o arquivo.",
        ),
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
          attachments:
            createAttachments.length > 0 ? createAttachments : undefined,
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
        description: getErrorMessage(
          error,
          "Não foi possível atualizar o item.",
        ),
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
    await uploadDraftFiles(
      files,
      createAttachments.length,
      async (uploadedFiles) => {
        setCreateAttachments((current) => [...current, ...uploadedFiles]);
      },
      "create",
    );
  };

  const uploadAttachmentForEdit = async (
    itemId: number,
    files: FileList | null,
  ) => {
    await uploadDraftFiles(
      files,
      editingAttachments.length,
      async (uploadedFiles) => {
        const uploadedAttachments = await Promise.all(
          uploadedFiles.map((upload) =>
            addAttachmentMutation.mutateAsync({
              orgId,
              empId,
              itemId,
              data: upload,
            }),
          ),
        );

        setEditingAttachments((current) => [
          ...current,
          ...uploadedAttachments,
        ]);
        await invalidate();
      },
      itemId,
    );
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
      setEditingAttachments((current) =>
        current.filter(
          (attachment) =>
            attachment.id !== pendingDeleteAttachment.attachment.id,
        ),
      );
      await invalidate();
      setPendingDeleteAttachment(null);
    } catch (error) {
      toast({
        title: "Falha ao remover anexo",
        description: getErrorMessage(
          error,
          "Não foi possível remover o anexo.",
        ),
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
            <div
              key={item.id}
              className="rounded-xl border border-border/60 bg-muted/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {item.description}
                    </p>
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
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="p-1.5 text-muted-foreground/40 hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteItem(item)}
                      className="p-1.5 text-muted-foreground/40 hover:text-red-500"
                    >
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
          onRemove: () =>
            setCreateAttachments((current) =>
              current.filter((_, attachmentIndex) => attachmentIndex !== index),
            ),
        }))}
        onUpload={(files) => {
          void uploadAttachmentForCreate(files);
        }}
        uploading={uploadingItemId === "create"}
        onSubmit={() => {
          void createItem();
        }}
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
              setPendingDeleteAttachment({
                itemId: editingItem.id,
                attachment,
              });
            }
          },
        }))}
        onUpload={(files) => {
          if (editingItem) {
            void uploadAttachmentForEdit(editingItem.id, files);
          }
        }}
        uploading={uploadingItemId === editingItem?.id}
        onSubmit={() => {
          void updateItem();
        }}
        onCancel={resetEditState}
      />

      <Dialog
        open={!!pendingDeleteItem}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteItem(null);
        }}
        title="Confirmar exclusão do item"
      >
        <p className="text-sm text-muted-foreground mt-2">
          Este item será removido permanentemente, incluindo seus anexos.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPendingDeleteItem(null)}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              void deleteItem();
            }}
            disabled={deleteItemMutation.isPending}
          >
            {deleteItemMutation.isPending ? "Removendo..." : "Remover"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={!!pendingDeleteAttachment}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteAttachment(null);
        }}
        title="Confirmar exclusão do anexo"
      >
        <p className="text-sm text-muted-foreground mt-2">
          O anexo{" "}
          {pendingDeleteAttachment?.attachment.fileName
            ? `"${pendingDeleteAttachment.attachment.fileName}"`
            : ""}{" "}
          será removido deste item.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPendingDeleteAttachment(null)}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              void deleteAttachment();
            }}
            disabled={deleteAttachmentMutation.isPending}
          >
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
            i < level ? "bg-primary" : "bg-border",
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

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetEmployeeQueryKey(orgId, empId),
    });

  const availableUnits = allUnits.filter(
    (u) => !linkedUnits.some((lu) => lu.id === u.id),
  );

  const handleLink = async () => {
    if (!selectedUnit) return;
    await linkMutation.mutateAsync({
      orgId,
      empId,
      data: { unitId: Number(selectedUnit) },
    });
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
        <p className="text-[14px] text-muted-foreground">
          Nenhuma unidade vinculada
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        {linkedUnits.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-3 py-1 text-[12px] text-foreground"
          >
            {u.name}
            {editable && (
              <button
                onClick={() => handleUnlink(u.id)}
                className="cursor-pointer text-muted-foreground/40 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            )}
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
              <option key={u.id} value={String(u.id)}>
                {u.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleLink}
            disabled={!selectedUnit || linkMutation.isPending}
          >
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
          <Label className="text-xs font-semibold text-muted-foreground">
            Nome *
          </Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1"
            placeholder="Ex: Gestão de Resíduos"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Tipo
          </Label>
          <Select
            value={form.type}
            onChange={(e) =>
              setForm({
                ...form,
                type: e.target.value as CreateCompetencyBodyType,
              })
            }
            className="mt-1 h-10 text-[13px]"
          >
            <option value={CreateCompetencyBodyTypeValues.conhecimento}>
              Conhecimento
            </option>
            <option value={CreateCompetencyBodyTypeValues.habilidade}>
              Habilidade
            </option>
            <option value={CreateCompetencyBodyTypeValues.atitude}>
              Atitude
            </option>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            Descrição
          </Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1"
            rows={4}
          />
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Nível Requerido
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            value={form.requiredLevel}
            onChange={(e) =>
              setForm({ ...form, requiredLevel: Number(e.target.value) })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Nível Adquirido
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            value={form.acquiredLevel}
            onChange={(e) =>
              setForm({ ...form, acquiredLevel: Number(e.target.value) })
            }
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">
          Evidência
        </Label>
        <Input
          value={form.evidence}
          onChange={(e) => setForm({ ...form, evidence: e.target.value })}
          className="mt-1"
          placeholder="Ex: Certificado XYZ"
        />
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
          <Label className="text-xs font-semibold text-muted-foreground">
            Título *
          </Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="mt-1"
            placeholder="Ex: NR-12 Segurança"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Descrição
          </Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1"
            rows={4}
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Objetivo do treinamento
          </Label>
          <Textarea
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
            className="mt-1"
            rows={3}
            placeholder="Ex: desenvolver a competência exigida para auditorias internas do SGQ."
          />
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Instituição
          </Label>
          <Input
            value={form.institution}
            onChange={(e) => setForm({ ...form, institution: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Carga Horária (h)
          </Label>
          <TrainingWorkloadInput
            value={form.workloadHours}
            onChange={(v) => setForm({ ...form, workloadHours: Number(v) })}
            className="mt-1"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            Competência-alvo
          </Label>
          <Input
            value={form.targetCompetencyName}
            onChange={(e) =>
              setForm({ ...form, targetCompetencyName: e.target.value })
            }
            className="mt-1"
            placeholder="Ex: Auditoria interna"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Tipo da competência
          </Label>
          <Select
            value={form.targetCompetencyType}
            onChange={(e) =>
              setForm({
                ...form,
                targetCompetencyType: e.target
                  .value as CreateTrainingBodyTargetCompetencyType,
              })
            }
            className="mt-1 h-10 text-[13px]"
          >
            <option
              value={CreateTrainingBodyTargetCompetencyTypeValues.conhecimento}
            >
              Conhecimento
            </option>
            <option
              value={CreateTrainingBodyTargetCompetencyTypeValues.habilidade}
            >
              Habilidade
            </option>
            <option
              value={CreateTrainingBodyTargetCompetencyTypeValues.atitude}
            >
              Atitude
            </option>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Nível-alvo
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            value={form.targetCompetencyLevel}
            onChange={(e) =>
              setForm({
                ...form,
                targetCompetencyLevel: Number(e.target.value),
              })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Método de avaliação
          </Label>
          <Input
            value={form.evaluationMethod}
            onChange={(e) =>
              setForm({ ...form, evaluationMethod: e.target.value })
            }
            className="mt-1"
            placeholder="Ex: prova prática, observação em campo"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Renovação (meses)
          </Label>
          <Input
            type="number"
            min={0}
            value={form.renewalMonths}
            onChange={(e) =>
              setForm({ ...form, renewalMonths: Number(e.target.value) })
            }
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Status
          </Label>
          <Select
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as CreateTrainingBodyStatus,
              })
            }
            className="mt-1 h-10 text-[13px]"
          >
            <option value={CreateTrainingBodyStatusValues.pendente}>
              Pendente
            </option>
            <option value={CreateTrainingBodyStatusValues.concluido}>
              Concluído
            </option>
            <option value={CreateTrainingBodyStatusValues.vencido}>
              Vencido
            </option>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Data Conclusão
          </Label>
          <Input
            type="date"
            value={form.completionDate}
            onChange={(e) =>
              setForm({ ...form, completionDate: e.target.value })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Validade
          </Label>
          <Input
            type="date"
            value={form.expirationDate}
            onChange={(e) =>
              setForm({ ...form, expirationDate: e.target.value })
            }
            className="mt-1"
          />
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
  policyDocuments,
  documents,
  processes,
  objectives,
  attachments,
  onUpload,
  onRemoveAttachment,
  uploading = false,
}: {
  form: AwarenessForm;
  setForm: (f: AwarenessForm) => void;
  step: number;
  policyDocuments: DocumentSummary[];
  documents: DocumentSummary[];
  processes: Array<{ id: number; name: string }>;
  objectives: StrategicObjectiveOption[];
  attachments: Array<EmployeeRecordAttachment | UploadedFileRef>;
  onUpload?: (files: FileList | null) => void;
  onRemoveAttachment?: (objectPath: string) => void;
  uploading?: boolean;
}) {
  if (step === 0) {
    return (
      <div className="space-y-5">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Tema *
          </Label>
          <Input
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            className="mt-1"
            placeholder="Ex: Política da Qualidade"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Descrição
          </Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1"
            rows={4}
          />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Política vinculada
            </Label>
            <Select
              value={form.policyDocumentId}
              onChange={(e) =>
                setForm({ ...form, policyDocumentId: e.target.value })
              }
              className="mt-1 h-10 text-[13px]"
            >
              <option value="">Selecionar política</option>
              {policyDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Documento relacionado
            </Label>
            <Select
              value={form.documentId}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
              className="mt-1 h-10 text-[13px]"
            >
              <option value="">Selecionar documento</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Processo SGQ
            </Label>
            <Select
              value={form.processId}
              onChange={(e) => setForm({ ...form, processId: e.target.value })}
              className="mt-1 h-10 text-[13px]"
            >
              <option value="">Selecionar processo</option>
              {processes.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Objetivo estratégico
            </Label>
            <Select
              value={form.objectiveId}
              onChange={(e) =>
                setForm({ ...form, objectiveId: e.target.value })
              }
              className="mt-1 h-10 text-[13px]"
            >
              <option value="">Selecionar objetivo</option>
              {objectives.map((objective) => (
                <option key={objective.id} value={objective.id}>
                  {objective.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Data *
          </Label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Método de Verificação
          </Label>
          <Input
            value={form.verificationMethod}
            onChange={(e) =>
              setForm({ ...form, verificationMethod: e.target.value })
            }
            className="mt-1"
            placeholder="Ex: Questionário"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Resultado
          </Label>
          <Input
            value={form.result}
            onChange={(e) => setForm({ ...form, result: e.target.value })}
            className="mt-1"
            placeholder="Ex: Aprovado"
          />
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
  const [editingComp, setEditingComp] = useState<EmployeeCompetency | null>(
    null,
  );
  const [createStep, setCreateStep] = useState(0);
  const [editStep, setEditStep] = useState(0);
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>(
    [],
  );
  const [editingAttachments, setEditingAttachments] = useState<
    EmployeeRecordAttachment[]
  >([]);
  const [isUploadingCreateAttachments, setIsUploadingCreateAttachments] =
    useState(false);
  const [isUploadingEditAttachments, setIsUploadingEditAttachments] =
    useState(false);
  const createMutation = useCreateCompetency();
  const updateMutation = useUpdateCompetency();
  const deleteMutation = useDeleteCompetency();
  const steps = ["Básico", "Níveis", "Evidência"];
  const descriptions = [
    "Informações básicas",
    "Níveis de competência",
    "Registro de evidência",
  ];

  const emptyForm: CompetencyForm = {
    name: "",
    description: "",
    type: "conhecimento",
    requiredLevel: 3,
    acquiredLevel: 0,
    evidence: "",
  };
  const [form, setForm] = useState<CompetencyForm>(emptyForm);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetEmployeeQueryKey(orgId, empId),
    });

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
        attachments:
          createAttachments.length > 0 ? createAttachments : undefined,
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
      type: toChaCompetencyType(comp.type),
      requiredLevel: comp.requiredLevel,
      acquiredLevel: comp.acquiredLevel,
      evidence: comp.evidence || "",
    });
    setEditingAttachments(comp.attachments || []);
  };

  const handleUpdate = async () => {
    if (!editingComp) return;
    await updateMutation.mutateAsync({
      orgId,
      empId,
      compId: editingComp.id,
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
    if (!confirm("Excluir esta competência? Esta ação não pode ser desfeita."))
      return;
    try {
      await deleteMutation.mutateAsync({ orgId, empId, compId });
      invalidate();
    } catch {
      toast({
        title: "Não foi possível excluir a competência",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Competências necessárias e adquiridas conforme ISO 9001:2015 §7.2
      </p>

      {competencies.length === 0 ? (
        <div className="text-center py-12">
          <Award className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">
            Nenhuma competência registrada
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {competencies.map((comp) => (
            <div
              key={comp.id}
              id={`comp-card-${comp.id}`}
              className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md scroll-mt-4 transition-shadow"
            >
              {(() => {
                const compAttachments = comp.attachments || [];
                return (
                  <div className="flex items-start justify-between">
                    <div
                      className={cn("flex-1", editable ? "cursor-pointer" : "")}
                      onClick={() => editable && openEdit(comp)}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-foreground">
                          {comp.name}
                        </p>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {COMPETENCY_TYPE_LABELS[comp.type] || comp.type}
                        </span>
                      </div>
                      {comp.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {comp.description}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">
                            Nível Requerido
                          </p>
                          <div className="flex items-center gap-2">
                            <LevelBar level={comp.requiredLevel} />
                            <span className="text-xs text-muted-foreground">
                              {comp.requiredLevel}/5
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">
                            Nível Adquirido
                          </p>
                          <div className="flex items-center gap-2">
                            <LevelBar level={comp.acquiredLevel} />
                            <span className="text-xs text-muted-foreground">
                              {comp.acquiredLevel}/5
                            </span>
                            {comp.acquiredLevel < comp.requiredLevel && (
                              <span className="text-[10px] text-red-600 font-medium">
                                Gap
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {comp.evidence && (
                        <p className="text-xs text-muted-foreground mt-2">
                          <span className="font-medium">Evidência:</span>{" "}
                          {comp.evidence}
                        </p>
                      )}
                      {compAttachments.length > 0 && (
                        <div className="mt-3">
                          <ProfileItemAttachmentsField
                            attachments={mapRecordAttachmentItems(
                              compAttachments,
                            )}
                            emptyText=""
                            accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                          />
                        </div>
                      )}
                    </div>
                    {editable && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(comp);
                          }}
                          className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(comp.id);
                          }}
                          className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
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
        <DialogStepTabs
          steps={steps}
          step={createStep}
          onStepChange={setCreateStep}
        />
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
              (uploads) =>
                setCreateAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingCreateAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setCreateAttachments((current) =>
              current.filter(
                (attachment) => attachment.objectPath !== objectPath,
              ),
            );
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
        <DialogStepTabs
          steps={steps}
          step={editStep}
          onStepChange={setEditStep}
        />
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
              (uploads) =>
                setEditingAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingEditAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setEditingAttachments((current) =>
              current.filter(
                (attachment) => attachment.objectPath !== objectPath,
              ),
            );
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
  objective: string;
  institution: string;
  instructor: string;
  targetCompetencyName: string;
  targetCompetencyType: CreateTrainingBodyTargetCompetencyType;
  targetCompetencyLevel: number;
  evaluationMethod: string;
  renewalMonths: number;
  workloadHours: number;
  completionDate: string;
  expirationDate: string;
  status: CreateTrainingBodyStatus;
  notApplicableReason: string;
};
type AwarenessForm = {
  topic: string;
  description: string;
  date: string;
  policyDocumentId: string;
  documentId: string;
  processId: string;
  objectiveId: string;
  verificationMethod: string;
  result: string;
};
type TrainingPrefill = Partial<
  Pick<
    TrainingForm,
    | "title"
    | "description"
    | "objective"
    | "targetCompetencyName"
    | "targetCompetencyType"
    | "targetCompetencyLevel"
    | "evaluationMethod"
  >
>;

function TreinamentosTab({
  trainings,
  orgId,
  empId,
  employeeName,
  employeeCpf,
  employeePosition,
  orgName,
  editable = true,
  createOpen = false,
  onCreateOpenChange,
  prefillTraining,
}: {
  trainings: EmployeeTraining[];
  orgId: number;
  empId: number;
  employeeName?: string;
  employeeCpf?: string | null;
  employeePosition?: string | null;
  orgName?: string;
  editable?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  prefillTraining?: TrainingPrefill | null;
}) {
  const queryClient = useQueryClient();
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const isCreateOpen = onCreateOpenChange ? createOpen : internalCreateOpen;
  const setCreateOpen = onCreateOpenChange || setInternalCreateOpen;
  const [editingTraining, setEditingTraining] =
    useState<EmployeeTraining | null>(null);
  const [reviewTraining, setReviewTraining] = useState<EmployeeTraining | null>(
    null,
  );
  const [deleteTraining, setDeleteTraining] = useState<EmployeeTraining | null>(
    null,
  );
  const [createStep, setCreateStep] = useState(0);
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>(
    [],
  );
  const [editingAttachments, setEditingAttachments] = useState<
    EmployeeRecordAttachment[]
  >([]);
  const [reviewAttachments, setReviewAttachments] = useState<
    Array<EmployeeRecordAttachment | UploadedFileRef>
  >([]);
  const [isUploadingCreateAttachments, setIsUploadingCreateAttachments] =
    useState(false);
  const [isUploadingEditAttachments, setIsUploadingEditAttachments] =
    useState(false);
  const [isUploadingReviewAttachments, setIsUploadingReviewAttachments] =
    useState(false);
  const createMutation = useCreateTraining();
  const deleteMutation = useDeleteTraining();
  const updateMutation = useUpdateTraining();
  const reviewMutation = useCreateTrainingEffectivenessReview();
  const steps = ["Escopo", "Desenvolvimento", "Status"];
  const descriptions = [
    "Objetivo e contexto",
    "Competência-alvo e avaliação",
    "Status, validade e evidências",
  ];

  const emptyForm: TrainingForm = {
    title: "",
    description: "",
    objective: "",
    institution: "",
    instructor: "",
    targetCompetencyName: "",
    targetCompetencyType:
      CreateTrainingBodyTargetCompetencyTypeValues.habilidade,
    targetCompetencyLevel: 0,
    evaluationMethod: "",
    renewalMonths: 0,
    workloadHours: 0,
    completionDate: "",
    expirationDate: "",
    status: CreateTrainingBodyStatusValues.pendente,
    notApplicableReason: "",
  };
  const [form, setForm] = useState(emptyForm);
  // score fica como string enquanto o usuário digita (estado controlado) —
  // convertê-lo a Number a cada tecla, como antes, impede digitar "7.5"
  // (o "." vira "7" e o dígito seguinte é perdido; mesma armadilha do PR
  // #150). A conversão pra número só acontece no blur/submit.
  const [reviewForm, setReviewForm] = useState({
    evaluationDate: new Date().toISOString().split("T")[0],
    score: "",
    isEffective: true,
    resultLevel: 0,
    comments: "",
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetEmployeeQueryKey(orgId, empId),
    });

  // Instrutor: busca server-side na lista de funcionários (escala p/ empresas
  // grandes) + permite texto livre (palestrante de fora) via onCreateOption.
  const [instructorSearch, setInstructorSearch] = useState("");
  const instructorEmpParams = {
    search: instructorSearch || undefined,
    pageSize: 50,
  };
  const { data: instructorEmployeesResult } = useListEmployees(
    orgId,
    instructorEmpParams,
    {
      query: {
        enabled: !!orgId && !!editingTraining,
        queryKey: getListEmployeesQueryKey(orgId, instructorEmpParams),
      },
    },
  );
  const instructorOptions = (instructorEmployeesResult?.data ?? []).map(
    (e) => ({
      value: e.name,
      label: e.name,
    }),
  );
  if (
    form.instructor &&
    !instructorOptions.some((o) => o.value === form.instructor)
  ) {
    instructorOptions.unshift({
      value: form.instructor,
      label: form.instructor,
    });
  }

  useEffect(() => {
    if (!isCreateOpen || !prefillTraining) return;
    setForm((current) => ({
      ...current,
      ...prefillTraining,
      // `targetCompetencyType` chega cru da query string (deep link de outra
      // tela) e pode carregar um valor legado de competência — normaliza pro
      // CHA só quando não-vazio; vazio preserva o fallback existente (treino
      // sem competência-alvo continua sem competência-alvo).
      targetCompetencyType: prefillTraining.targetCompetencyType
        ? toChaCompetencyType(prefillTraining.targetCompetencyType)
        : current.targetCompetencyType ||
          CreateTrainingBodyTargetCompetencyTypeValues.habilidade,
      targetCompetencyLevel:
        prefillTraining.targetCompetencyLevel ?? current.targetCompetencyLevel,
    }));
  }, [isCreateOpen, prefillTraining]);

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreateStep(0);
    setForm(emptyForm);
    setCreateAttachments([]);
    setIsUploadingCreateAttachments(false);
  };

  const closeEditDialog = () => {
    setEditingTraining(null);
    setForm(emptyForm);
    setEditingAttachments([]);
    setIsUploadingEditAttachments(false);
  };

  const closeReviewDialog = () => {
    setReviewTraining(null);
    setReviewAttachments([]);
    setIsUploadingReviewAttachments(false);
    setReviewForm({
      evaluationDate: new Date().toISOString().split("T")[0],
      score: "",
      isEffective: true,
      resultLevel: 0,
      comments: "",
    });
  };

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      orgId,
      empId,
      data: {
        ...form,
        objective: form.objective || undefined,
        workloadHours: form.workloadHours || undefined,
        targetCompetencyName: form.targetCompetencyName || undefined,
        targetCompetencyType: form.targetCompetencyName
          ? form.targetCompetencyType
          : undefined,
        targetCompetencyLevel: form.targetCompetencyName
          ? form.targetCompetencyLevel
          : undefined,
        evaluationMethod: form.evaluationMethod || undefined,
        renewalMonths: form.renewalMonths || undefined,
        completionDate: form.completionDate || undefined,
        expirationDate: form.expirationDate || undefined,
        attachments:
          createAttachments.length > 0 ? createAttachments : undefined,
      },
    });
    invalidate();
    closeCreateDialog();
  };

  const openComplete = (t: EmployeeTraining) => {
    setEditingTraining(t);
    setForm({
      title: t.title,
      description: t.description || "",
      objective: t.objective || "",
      institution: t.institution || "",
      instructor: t.instructor || "",
      targetCompetencyName: t.targetCompetencyName || "",
      // Mesmo achado do form de competência (openEdit acima): normaliza um
      // valor legado pro CHA na abertura do form, senão o <Select> (só 3
      // opções CHA) fica sem opção e o PATCH reenvia o legado -> 400. Vazio
      // preserva o fallback existente (treino sem competência-alvo).
      targetCompetencyType: t.targetCompetencyType
        ? toChaCompetencyType(t.targetCompetencyType)
        : CreateTrainingBodyTargetCompetencyTypeValues.habilidade,
      targetCompetencyLevel: t.targetCompetencyLevel || 0,
      evaluationMethod: t.evaluationMethod || "",
      renewalMonths: t.renewalMonths || 0,
      workloadHours: t.workloadHours || 0,
      completionDate: t.completionDate || "",
      expirationDate: t.expirationDate || "",
      status: t.status,
      notApplicableReason: t.notApplicableReason || "",
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
        objective: form.objective || undefined,
        institution: form.institution || undefined,
        instructor: form.instructor || undefined,
        targetCompetencyName: form.targetCompetencyName || undefined,
        targetCompetencyType: form.targetCompetencyName
          ? form.targetCompetencyType
          : undefined,
        targetCompetencyLevel: form.targetCompetencyName
          ? form.targetCompetencyLevel
          : undefined,
        evaluationMethod: form.evaluationMethod || undefined,
        renewalMonths: form.renewalMonths || undefined,
        workloadHours: form.workloadHours || undefined,
        completionDate: form.completionDate || undefined,
        expirationDate: form.expirationDate || undefined,
        status: form.status as UpdateTrainingBodyStatus,
        notApplicableReason: form.notApplicableReason || undefined,
        attachments: editingAttachments,
      },
    });
    invalidate();
    closeEditDialog();
  };

  const confirmDelete = async () => {
    if (!deleteTraining) return;
    try {
      await deleteMutation.mutateAsync({
        orgId,
        empId,
        trainId: deleteTraining.id,
      });
      invalidate();
      setDeleteTraining(null);
    } catch {
      toast({
        title: "Não foi possível excluir o treinamento",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const openReviewDialog = (training: EmployeeTraining) => {
    setReviewTraining(training);
    const latestReview = training.latestEffectivenessReview || null;
    setReviewForm({
      evaluationDate:
        latestReview?.evaluationDate || new Date().toISOString().split("T")[0],
      score: latestReview?.score != null ? String(latestReview.score) : "",
      isEffective: latestReview?.isEffective ?? true,
      resultLevel:
        latestReview?.resultLevel || training.targetCompetencyLevel || 0,
      comments: latestReview?.comments || "",
    });
    setReviewAttachments([]);
  };

  const handleCreateReview = async () => {
    if (!reviewTraining) return;

    const parsedScore =
      reviewForm.score.trim() === "" ? undefined : Number(reviewForm.score);
    if (
      parsedScore !== undefined &&
      (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 10)
    ) {
      toast({
        title: "Nota inválida",
        description: "A nota deve estar entre 0 e 10.",
        variant: "destructive",
      });
      return;
    }

    await reviewMutation.mutateAsync({
      orgId,
      empId,
      trainId: reviewTraining.id,
      data: {
        evaluationDate: reviewForm.evaluationDate,
        score: parsedScore,
        isEffective: reviewForm.isEffective,
        resultLevel: reviewForm.resultLevel || undefined,
        comments: reviewForm.comments || undefined,
        attachments:
          reviewAttachments.length > 0 ? reviewAttachments : undefined,
      },
    });
    invalidate();
    closeReviewDialog();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Registro de treinamentos conforme ISO 9001:2015 §7.2
      </p>

      {trainings.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">
            Nenhum treinamento registrado
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {trainings.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md"
            >
              {(() => {
                const trainingAttachments = t.attachments || [];
                const isConcluido =
                  t.status === CreateTrainingBodyStatusValues.concluido;
                const effectivenessStatus = t.latestEffectivenessReview
                  ? t.latestEffectivenessReview.isEffective
                    ? "effective"
                    : "ineffective"
                  : isConcluido &&
                      (t.evaluationMethod || t.targetCompetencyName)
                    ? "pending"
                    : null;
                return (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-foreground">
                          {t.title}
                        </p>
                        <span
                          className={cn(
                            "text-[11px] px-1.5 py-0.5 rounded-full border font-medium",
                            TRAINING_STATUS_COLORS[t.status] ||
                              "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {TRAINING_STATUS[t.status] || t.status}
                        </span>
                        {effectivenessStatus && (
                          <span
                            className={cn(
                              "text-[11px] px-1.5 py-0.5 rounded-full border font-medium",
                              EFFECTIVENESS_STATUS_COLORS[effectivenessStatus],
                            )}
                          >
                            {EFFECTIVENESS_STATUS_LABELS[effectivenessStatus]}
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t.description}
                        </p>
                      )}
                      {t.status ===
                        CreateTrainingBodyStatusValues.nao_aplicavel &&
                        t.notApplicableReason && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium text-foreground">
                              Motivo:
                            </span>{" "}
                            {t.notApplicableReason}
                          </p>
                        )}
                      {t.objective && (
                        <p className="text-xs text-muted-foreground mt-2">
                          <span className="font-medium text-foreground">
                            Objetivo:
                          </span>{" "}
                          {t.objective}
                        </p>
                      )}
                      {(t.targetCompetencyName || t.evaluationMethod) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {t.targetCompetencyName && (
                            <span className="rounded-full bg-secondary px-2 py-1">
                              Competência: {t.targetCompetencyName}
                              {t.targetCompetencyLevel != null
                                ? ` · nível ${t.targetCompetencyLevel}`
                                : ""}
                            </span>
                          )}
                          {t.evaluationMethod && (
                            <span className="rounded-full bg-secondary px-2 py-1">
                              Avaliação: {t.evaluationMethod}
                            </span>
                          )}
                          {t.renewalMonths ? (
                            <span className="rounded-full bg-secondary px-2 py-1">
                              Renovação: {t.renewalMonths} meses
                            </span>
                          ) : null}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {t.institution && <span>{t.institution}</span>}
                        {t.instructor && <span>Instrutor: {t.instructor}</span>}
                        <TrainingWorkloadCell hours={t.workloadHours} />
                        {t.completionDate && (
                          <span>Concluído: {t.completionDate}</span>
                        )}
                        {t.expirationDate && (
                          <span>Validade: {t.expirationDate}</span>
                        )}
                      </div>
                      {t.latestEffectivenessReview && (
                        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">
                            Última avaliação de eficácia
                          </p>
                          <p className="mt-1">
                            {t.latestEffectivenessReview.isEffective
                              ? "Eficaz"
                              : "Ineficaz"}{" "}
                            em {t.latestEffectivenessReview.evaluationDate}
                            {t.latestEffectivenessReview.score != null
                              ? ` · nota ${formatKpiNumber(t.latestEffectivenessReview.score)}`
                              : ""}
                            {t.latestEffectivenessReview.resultLevel != null
                              ? ` · nível ${t.latestEffectivenessReview.resultLevel}`
                              : ""}
                          </p>
                          {t.latestEffectivenessReview.comments && (
                            <p className="mt-1">
                              {t.latestEffectivenessReview.comments}
                            </p>
                          )}
                        </div>
                      )}
                      {t.latestEffectivenessReview &&
                      !t.latestEffectivenessReview.isEffective ? (
                        <div className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-2">
                          <AcoesVinculadas
                            orgId={orgId}
                            sourceModule="training"
                            refId={t.id}
                          />
                          {editable ? (
                            <CriarAcaoButton
                              orgId={orgId}
                              source={{
                                sourceModule: "training",
                                sourceRef: { trainingId: t.id },
                              }}
                            />
                          ) : null}
                        </div>
                      ) : null}
                      {t.effectivenessReviews?.length ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            Histórico de eficácia
                          </p>
                          {t.effectivenessReviews.map(
                            (review: TrainingEffectivenessReview) => (
                              <div
                                key={review.id}
                                className="rounded-lg border border-border/50 px-3 py-2 text-xs"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                      review.isEffective
                                        ? EFFECTIVENESS_STATUS_COLORS.effective
                                        : EFFECTIVENESS_STATUS_COLORS.ineffective,
                                    )}
                                  >
                                    {review.isEffective ? "Eficaz" : "Ineficaz"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {review.evaluationDate}
                                  </span>
                                  {review.evaluatorName ? (
                                    <span className="text-muted-foreground">
                                      · {review.evaluatorName}
                                    </span>
                                  ) : null}
                                  {review.score != null ? (
                                    <span className="text-muted-foreground">
                                      · nota {formatKpiNumber(review.score)}
                                    </span>
                                  ) : null}
                                  {review.resultLevel != null ? (
                                    <span className="text-muted-foreground">
                                      · nível {review.resultLevel}
                                    </span>
                                  ) : null}
                                </div>
                                {review.comments ? (
                                  <p className="mt-1 text-muted-foreground">
                                    {review.comments}
                                  </p>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      ) : null}
                      {trainingAttachments.length > 0 && (
                        <div className="mt-3">
                          <ProfileItemAttachmentsField
                            attachments={mapRecordAttachmentItems(
                              trainingAttachments,
                            )}
                            emptyText=""
                            accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                          />
                        </div>
                      )}
                    </div>
                    {editable && (
                      <TooltipProvider delayDuration={200}>
                        <div className="flex items-center gap-1">
                          {isConcluido && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex"
                                  tabIndex={t.completionDate ? undefined : 0}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    aria-label="Baixar certificado"
                                    disabled={!t.completionDate}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void downloadTrainingCertificate({
                                        orgName: orgName ?? "",
                                        employeeName: employeeName ?? "",
                                        employeeCpf,
                                        employeePosition,
                                        title: t.title,
                                        completionDate: t.completionDate,
                                        workloadHours: t.workloadHours,
                                        institution: t.institution,
                                        instructor: t.instructor,
                                        expirationDate: t.expirationDate,
                                        competencyName: t.targetCompetencyName,
                                      });
                                    }}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t.completionDate
                                  ? "Baixar certificado"
                                  : "Informe a data de conclusão para emitir o certificado"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {isConcluido && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  aria-label="Avaliar eficácia"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openReviewDialog(t);
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Avaliar eficácia</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                aria-label="Registrar conclusão"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openComplete(t);
                                }}
                              >
                                <CalendarCheck className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Registrar conclusão</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                aria-label="Remover da ficha"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTraining(t);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remover da ficha</TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    )}
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
        <DialogStepTabs
          steps={steps}
          step={createStep}
          onStepChange={setCreateStep}
        />
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
              (uploads) =>
                setCreateAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingCreateAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setCreateAttachments((current) =>
              current.filter(
                (attachment) => attachment.objectPath !== objectPath,
              ),
            );
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
        title="Registrar conclusão"
        description={
          editingTraining
            ? `Treinamento "${editingTraining.title}"`
            : "Registro do colaborador"
        }
        size="lg"
      >
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Atualize o andamento deste treinamento na ficha do colaborador. Para
            corrigir o nome ou o conteúdo do treinamento, edite no catálogo — a
            alteração vale para todos.
          </p>
          <RegistrarConclusaoForm
            form={form}
            onChange={(next) => setForm((current) => ({ ...current, ...next }))}
            instructorOptions={instructorOptions}
            instructorSearch={instructorSearch}
            onInstructorSearchChange={setInstructorSearch}
          />
          <ProfileItemAttachmentsField
            attachments={mapRecordAttachmentItems(
              editingAttachments,
              (objectPath) => {
                setEditingAttachments((current) =>
                  current.filter(
                    (attachment) => attachment.objectPath !== objectPath,
                  ),
                );
              },
            )}
            onUpload={(files) => {
              setIsUploadingEditAttachments(true);
              void uploadEmployeeRecordFiles(
                files,
                editingAttachments.length,
                (uploads) =>
                  setEditingAttachments((current) => [...current, ...uploads]),
                () => setIsUploadingEditAttachments(false),
              );
            }}
            uploading={isUploadingEditAttachments}
            emptyText="Anexe o certificado ou evidência de conclusão."
            accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeEditDialog}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleUpdate}
              disabled={
                updateMutation.isPending ||
                isUploadingEditAttachments ||
                (form.status === CreateTrainingBodyStatusValues.nao_aplicavel &&
                  !form.notApplicableReason.trim())
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      <Dialog
        open={editable && !!reviewTraining}
        onOpenChange={(open) => {
          if (!open) closeReviewDialog();
        }}
        title="Registrar eficácia"
        description={
          reviewTraining
            ? `Avaliação do treinamento "${reviewTraining.title}"`
            : "Avaliação de eficácia do treinamento"
        }
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Data da avaliação *
              </Label>
              <Input
                type="date"
                value={reviewForm.evaluationDate}
                onChange={(e) =>
                  setReviewForm((current) => ({
                    ...current,
                    evaluationDate: e.target.value,
                  }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Nota
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={10}
                step={0.5}
                value={reviewForm.score}
                onChange={(e) =>
                  setReviewForm((current) => ({
                    ...current,
                    score: e.target.value,
                  }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Resultado *
              </Label>
              <Select
                value={reviewForm.isEffective ? "effective" : "ineffective"}
                onChange={(e) =>
                  setReviewForm((current) => ({
                    ...current,
                    isEffective: e.target.value === "effective",
                  }))
                }
                className="mt-1 h-10 text-[13px]"
              >
                <option value="effective">Eficaz</option>
                <option value="ineffective">Ineficaz</option>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Nível evidenciado
              </Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={reviewForm.resultLevel}
                onChange={(e) =>
                  setReviewForm((current) => ({
                    ...current,
                    resultLevel: Number(e.target.value),
                  }))
                }
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Comentários
            </Label>
            <Textarea
              value={reviewForm.comments}
              onChange={(e) =>
                setReviewForm((current) => ({
                  ...current,
                  comments: e.target.value,
                }))
              }
              className="mt-1"
              rows={4}
              placeholder="Evidências da transferência de aprendizado, observações em campo, feedback do gestor, etc."
            />
          </div>
          <ProfileItemAttachmentsField
            attachments={mapRecordAttachmentItems(
              reviewAttachments,
              (objectPath) => {
                setReviewAttachments((current) =>
                  current.filter(
                    (attachment) => attachment.objectPath !== objectPath,
                  ),
                );
              },
            )}
            onUpload={(files) => {
              setIsUploadingReviewAttachments(true);
              void uploadEmployeeRecordFiles(
                files,
                reviewAttachments.length,
                (uploads) =>
                  setReviewAttachments((current) => [...current, ...uploads]),
                () => setIsUploadingReviewAttachments(false),
              );
            }}
            uploading={isUploadingReviewAttachments}
            emptyText="Adicione evidências da avaliação de eficácia."
            accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeReviewDialog}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCreateReview}
              disabled={!reviewForm.evaluationDate}
            >
              Registrar eficácia
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      <Dialog
        open={editable && !!deleteTraining}
        onOpenChange={(open) => {
          if (!open) setDeleteTraining(null);
        }}
        title="Remover treinamento da ficha"
        description={deleteTraining ? `"${deleteTraining.title}"` : undefined}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Isto remove este treinamento da ficha
            {employeeName ? ` de ${employeeName}` : " deste colaborador"}. Não
            afeta os outros colaboradores nem o catálogo de treinamentos.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteTraining(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </div>
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
  const [editingAwareness, setEditingAwareness] =
    useState<EmployeeAwareness | null>(null);
  const [createStep, setCreateStep] = useState(0);
  const [editStep, setEditStep] = useState(0);
  const [createAttachments, setCreateAttachments] = useState<UploadedFileRef[]>(
    [],
  );
  const [editingAttachments, setEditingAttachments] = useState<
    EmployeeRecordAttachment[]
  >([]);
  const [isUploadingCreateAttachments, setIsUploadingCreateAttachments] =
    useState(false);
  const [isUploadingEditAttachments, setIsUploadingEditAttachments] =
    useState(false);
  const createMutation = useCreateAwareness();
  const deleteMutation = useDeleteAwareness();
  const updateMutation = useUpdateAwareness();
  const { data: policyDocuments = [] } = useListDocuments(orgId, {
    type: "politica",
    page: 1,
    pageSize: 100,
  });
  const { data: documents = [] } = useListDocuments(orgId, {
    page: 1,
    pageSize: 100,
  });
  const { data: processes = [] } = useAllActiveSgqProcesses(orgId);
  const { data: objectives = [] } = useStrategicObjectiveOptions(orgId);
  const steps = ["Contexto", "Verificação"];
  const descriptions = ["Tema e vínculos SGQ", "Data, verificação e resultado"];

  const emptyForm = {
    topic: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    policyDocumentId: "",
    documentId: "",
    processId: "",
    objectiveId: "",
    verificationMethod: "",
    result: "",
  };
  const [form, setForm] = useState(emptyForm);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetEmployeeQueryKey(orgId, empId),
    });

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
        policyDocumentId: form.policyDocumentId
          ? Number(form.policyDocumentId)
          : null,
        documentId: form.documentId ? Number(form.documentId) : null,
        processId: form.processId ? Number(form.processId) : null,
        objectiveId: form.objectiveId ? Number(form.objectiveId) : null,
        attachments:
          createAttachments.length > 0 ? createAttachments : undefined,
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
      policyDocumentId: a.policyDocumentId ? String(a.policyDocumentId) : "",
      documentId: a.documentId ? String(a.documentId) : "",
      processId: a.processId ? String(a.processId) : "",
      objectiveId: a.objectiveId ? String(a.objectiveId) : "",
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
        policyDocumentId: form.policyDocumentId
          ? Number(form.policyDocumentId)
          : null,
        documentId: form.documentId ? Number(form.documentId) : null,
        processId: form.processId ? Number(form.processId) : null,
        objectiveId: form.objectiveId ? Number(form.objectiveId) : null,
        verificationMethod: form.verificationMethod || undefined,
        result: form.result || undefined,
        attachments: editingAttachments,
      },
    });
    invalidate();
    closeEditDialog();
  };

  const handleDelete = async (awaId: number) => {
    if (
      !confirm(
        "Excluir este registro de conscientização? Esta ação não pode ser desfeita.",
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync({ orgId, empId, awaId });
      invalidate();
    } catch {
      toast({
        title: "Não foi possível excluir o registro",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Registros de conscientização conforme ISO 9001:2015 §7.3
      </p>

      {awareness.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">
            Nenhum registro de conscientização
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {awareness.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md"
            >
              {(() => {
                const awarenessAttachments = a.attachments || [];
                return (
                  <div className="flex items-start justify-between">
                    <div
                      className={cn("flex-1", editable ? "cursor-pointer" : "")}
                      onClick={() => editable && openEdit(a)}
                    >
                      <p className="text-[13px] font-medium text-foreground">
                        {a.topic}
                      </p>
                      {a.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {a.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{a.date}</span>
                        {a.verificationMethod && (
                          <span>Método: {a.verificationMethod}</span>
                        )}
                        {a.result && <span>Resultado: {a.result}</span>}
                      </div>
                      {(a.policyDocumentTitle ||
                        a.documentTitle ||
                        a.processName ||
                        a.objectiveLabel) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {a.policyDocumentTitle ? (
                            <span className="rounded-full bg-secondary px-2 py-1">
                              Política: {a.policyDocumentTitle}
                            </span>
                          ) : null}
                          {a.documentTitle ? (
                            <span className="rounded-full bg-secondary px-2 py-1">
                              Documento: {a.documentTitle}
                            </span>
                          ) : null}
                          {a.processName ? (
                            <span className="rounded-full bg-secondary px-2 py-1">
                              Processo: {a.processName}
                            </span>
                          ) : null}
                          {a.objectiveLabel ? (
                            <span className="rounded-full bg-secondary px-2 py-1">
                              Objetivo: {a.objectiveLabel}
                            </span>
                          ) : null}
                        </div>
                      )}
                      {awarenessAttachments.length > 0 && (
                        <div className="mt-3">
                          <ProfileItemAttachmentsField
                            attachments={mapRecordAttachmentItems(
                              awarenessAttachments,
                            )}
                            emptyText=""
                            accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                          />
                        </div>
                      )}
                    </div>
                    {editable && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(a)}
                          className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
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
        <DialogStepTabs
          steps={steps}
          step={createStep}
          onStepChange={setCreateStep}
        />
        <AwarenessFormStep
          form={form}
          setForm={setForm}
          step={createStep}
          policyDocuments={policyDocuments}
          documents={documents}
          processes={processes.map((process) => ({
            id: process.id,
            name: process.name,
          }))}
          objectives={objectives}
          attachments={createAttachments}
          onUpload={(files) => {
            setIsUploadingCreateAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              createAttachments.length,
              (uploads) =>
                setCreateAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingCreateAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setCreateAttachments((current) =>
              current.filter(
                (attachment) => attachment.objectPath !== objectPath,
              ),
            );
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
        <DialogStepTabs
          steps={steps}
          step={editStep}
          onStepChange={setEditStep}
        />
        <AwarenessFormStep
          form={form}
          setForm={setForm}
          step={editStep}
          policyDocuments={policyDocuments}
          documents={documents}
          processes={processes.map((process) => ({
            id: process.id,
            name: process.name,
          }))}
          objectives={objectives}
          attachments={editingAttachments}
          onUpload={(files) => {
            setIsUploadingEditAttachments(true);
            void uploadEmployeeRecordFiles(
              files,
              editingAttachments.length,
              (uploads) =>
                setEditingAttachments((current) => [...current, ...uploads]),
              () => setIsUploadingEditAttachments(false),
            );
          }}
          onRemoveAttachment={(objectPath) => {
            setEditingAttachments((current) =>
              current.filter(
                (attachment) => attachment.objectPath !== objectPath,
              ),
            );
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
  const { user, organization } = useAuth();
  const { canWriteModule, hasModuleAccess } = usePermissions();
  const orgId = user?.organizationId;
  const orgName = organization?.tradeName || organization?.name || "";
  const canWriteEmployees = canWriteModule("employees");
  const canAccessGovernance = hasModuleAccess("governance");
  const params = useParams<{ id: string }>();
  const empId = Number(params?.id);
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: employee, isLoading, error } = useGetEmployee(orgId!, empId);
  const { data: units = [] } = useListUnits(orgId!);
  const { data: departments = [] } = useListDepartments(orgId!, {
    query: { queryKey: getListDepartmentsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: positions = [] } = useListPositions(orgId!, {
    query: { queryKey: getListPositionsQueryKey(orgId!), enabled: !!orgId },
  });
  const employeePositionRecord = useMemo(
    () =>
      employee?.position
        ? (positions.find(
            (position) =>
              position.name.trim().toLowerCase() ===
              employee.position!.trim().toLowerCase(),
          ) ?? null)
        : null,
    [employee?.position, positions],
  );
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editStep, setEditStep] = useState(0);
  const [compCreateOpen, setCompCreateOpen] = useState(false);
  const [trainingCreateOpen, setTrainingCreateOpen] = useState(false);
  const [awarenessCreateOpen, setAwarenessCreateOpen] = useState(false);
  // Requisito de "Competências do cargo" (Formação e qualificações) sendo
  // anexado/editado — `existing` só existe no modo edição (linha "atende" +
  // source manual), buscado por `manualCompetencyId` no array já carregado
  // do colaborador (nenhuma query extra).
  const [evidenceTarget, setEvidenceTarget] = useState<{
    requirement: RequirementRow;
    existing?: EmployeeCompetency;
  } | null>(null);
  const [queryTrainingPrefill, setQueryTrainingPrefill] =
    useState<TrainingPrefill | null>(null);
  const searchParams = useMemo(
    () =>
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      ),
    [location],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetEmployeeQueryKey(orgId!, empId),
    });

  // Painel único: não há mais abas para trocar. `?tab=` (usado por outras
  // telas, ex. treinamentos.tsx "Abrir competência") agora rola até a seção
  // correspondente em vez de trocar de aba — a seção já está sempre visível.
  // Rola só UMA vez por valor de `?tab=`: o efeito depende de `employee` para
  // esperar as seções existirem no DOM (navegação fria), mas sem este guard ele
  // re-rolaria a cada refetch (toda mutation invalida o employee) — puxando o
  // usuário de volta pra seção do deep-link no meio de uma edição.
  const scrolledTabRef = useRef<string | null>(null);
  useEffect(() => {
    if (!employee) return;
    const requestedTab = searchParams.get("tab");
    if (!requestedTab || requestedTab === scrolledTabRef.current) return;
    const sectionId =
      requestedTab === "competencias"
        ? "secao-competencias"
        : requestedTab === "treinamentos"
          ? "secao-treinamentos"
          : requestedTab === "conscientizacao"
            ? "secao-conscientizacao"
            : requestedTab === "dados"
              ? "secao-dados"
              : null;
    if (!sectionId) return;
    document.getElementById(sectionId)?.scrollIntoView({ block: "start" });
    scrolledTabRef.current = requestedTab;
  }, [searchParams, employee]);

  useEffect(() => {
    if (searchParams.get("createTraining") !== "1") return;

    const targetCompetencyLevel = searchParams.get("targetCompetencyLevel");
    setQueryTrainingPrefill({
      title: searchParams.get("trainingTitle") || undefined,
      objective: searchParams.get("objective") || undefined,
      description: searchParams.get("description") || undefined,
      targetCompetencyName:
        searchParams.get("targetCompetencyName") || undefined,
      targetCompetencyType:
        (searchParams.get(
          "targetCompetencyType",
        ) as CreateTrainingBodyTargetCompetencyType | null) || undefined,
      targetCompetencyLevel: targetCompetencyLevel
        ? Number(targetCompetencyLevel)
        : undefined,
      evaluationMethod: searchParams.get("evaluationMethod") || undefined,
    });
    setTrainingCreateOpen(true);
  }, [searchParams]);

  const handleArchive = async () => {
    if (
      !confirm(
        "Tem certeza que deseja arquivar este colaborador? O status será alterado para Inativo.",
      )
    )
      return;
    await deleteMutation.mutateAsync({ orgId: orgId!, empId });
    queryClient.invalidateQueries({
      queryKey: getListEmployeesQueryKey(orgId!),
    });
    navigate("/aprendizagem/colaboradores");
  };

  usePageTitle(employee?.name);

  const handleTrainingCreateOpenChange = (open: boolean) => {
    setTrainingCreateOpen(open);
    if (!open) {
      setQueryTrainingPrefill(null);
    }
  };

  const headerActions = React.useMemo(() => {
    if (!employee) return null;

    // Painel único: "Nova Competência" / "Novo Treinamento" / "Novo Registro"
    // deixam de ser contextuais por aba e passam a viver junto do título de
    // cada seção (mesmo padrão de "+ Item" / "+ Vincular" já usado no painel).
    return (
      <div className="flex items-center gap-2">
        <Link href="/aprendizagem/colaboradores">
          <HeaderActionButton
            variant="outline"
            size="sm"
            className="cursor-pointer"
            label="Voltar"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          />
        </Link>
        {canWriteEmployees && (
          <>
            <HeaderActionButton
              variant="outline"
              size="sm"
              onClick={() => setEditModalOpen(true)}
              label="Editar"
              icon={<Pencil className="h-3.5 w-3.5" />}
            />
            <HeaderActionButton
              variant="outline"
              size="sm"
              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-500/10"
              onClick={handleArchive}
              label="Arquivar"
              icon={<Archive className="h-3.5 w-3.5" />}
            >
              Arquivar
            </HeaderActionButton>
          </>
        )}
        {canAccessGovernance && employeePositionRecord ? (
          <Link
            href={`/governanca/conhecimento-critico?positionId=${employeePositionRecord.id}`}
          >
            <HeaderActionButton
              variant="outline"
              size="sm"
              className="cursor-pointer"
              label="Conhecimento do cargo"
              icon={<Lightbulb className="h-3.5 w-3.5" />}
            />
          </Link>
        ) : null}
      </div>
    );
  }, [
    employee,
    canAccessGovernance,
    canWriteEmployees,
    employeePositionRecord,
    handleArchive,
  ]);

  useHeaderActions(headerActions);

  if (!orgId) return null;

  if (isLoading) {
    return (
      <div className="text-center py-20 text-[13px] text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="text-center py-20">
        <p className="text-[13px] text-muted-foreground">
          Colaborador não encontrado
        </p>
        <Link href="/aprendizagem/colaboradores">
          <Button variant="outline" size="sm" className="mt-4 cursor-pointer">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        <FichaHeader
          name={employee.name}
          position={employee.position}
          contractLabel={CONTRACT_LABELS[employee.contractType]}
          department={employee.department}
          unitName={employee.unitName}
          trainings={employee.trainings ?? []}
        />

        <div id="secao-dados" className="space-y-8">
          <DadosCards
            employee={employee}
            gestor={
              (employee.managers ?? []).map((m) => m.name).join(", ") ||
              undefined
            }
            onEdit={
              canWriteEmployees ? () => setEditModalOpen(true) : undefined
            }
          />

          <div className="grid gap-8 md:grid-cols-2">
            <EmployeeProfileItemsSection
              title="Experiências profissionais"
              emptyText="Liste experiências anteriores e adicione anexos quando necessário."
              category="professional_experience"
              items={
                (employee.professionalExperiences ||
                  []) as EmployeeProfileItemRecord[]
              }
              orgId={orgId}
              empId={empId}
              editable={canWriteEmployees}
            />

            <EmployeeProfileItemsSection
              title="Educação e certificações"
              emptyText="Liste formações, cursos e certificações com anexos opcionais."
              category="education_certification"
              items={
                (employee.educationCertifications ||
                  []) as EmployeeProfileItemRecord[]
              }
              orgId={orgId}
              empId={empId}
              editable={canWriteEmployees}
            />
          </div>

          <LinkedUnitsSection
            linkedUnits={employee.units || []}
            allUnits={units}
            orgId={orgId}
            empId={empId}
            editable={canWriteEmployees}
          />
        </div>

        <FormacaoQualificacoes
          education={employee.education}
          requiredEducation={employeePositionRecord?.education ?? null}
          conformance={employee.competencyConformance ?? null}
          competencies={employee.competencies || []}
          editable={canWriteEmployees}
          onAttachEvidence={(requirement) => setEvidenceTarget({ requirement })}
          onEditEvidence={(requirement) =>
            setEvidenceTarget({
              requirement,
              existing: (employee.competencies || []).find(
                (comp) => comp.id === requirement.manualCompetencyId,
              ),
            })
          }
        />

        <div id="secao-treinamentos">
          <OverviewSectionTitle
            title="Treinamentos"
            action={
              canWriteEmployees ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTrainingCreateOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo Treinamento
                </Button>
              ) : undefined
            }
          />
          <TreinamentosTab
            trainings={employee.trainings || []}
            orgId={orgId}
            empId={empId}
            employeeName={employee.name}
            employeeCpf={employee.cpf}
            employeePosition={employee.position}
            orgName={orgName}
            editable={canWriteEmployees}
            createOpen={trainingCreateOpen}
            onCreateOpenChange={handleTrainingCreateOpenChange}
            prefillTraining={queryTrainingPrefill}
          />
        </div>

        <div id="secao-competencias">
          <OverviewSectionTitle
            title="Outras competências"
            subtitle="Qualificações além das que o cargo exige"
            action={
              canWriteEmployees ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCompCreateOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nova Competência
                </Button>
              ) : undefined
            }
          />
          <CompetenciasTab
            competencies={selectOtherCompetencies(employee.competencies || [])}
            orgId={orgId}
            empId={empId}
            editable={canWriteEmployees}
            createOpen={compCreateOpen}
            onCreateOpenChange={setCompCreateOpen}
          />
        </div>

        <div id="secao-conscientizacao">
          <OverviewSectionTitle
            title="Conscientização"
            action={
              canWriteEmployees ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAwarenessCreateOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo Registro
                </Button>
              ) : undefined
            }
          />
          <ConscientizacaoTab
            awareness={employee.awareness || []}
            orgId={orgId}
            empId={empId}
            editable={canWriteEmployees}
            createOpen={awarenessCreateOpen}
            onCreateOpenChange={setAwarenessCreateOpen}
          />
        </div>
      </div>

      <Dialog
        open={editModalOpen}
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) setEditStep(0);
        }}
        title="Editar Colaborador"
        description={
          ["Informações pessoais", "Informações profissionais"][editStep]
        }
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
              queryClient.invalidateQueries({
                queryKey: getListEmployeesQueryKey(orgId!),
              });
              setEditModalOpen(false);
              setEditStep(0);
            }}
            onCancel={() => {
              setEditModalOpen(false);
              setEditStep(0);
            }}
            isPending={updateMutation.isPending}
          />
        )}
      </Dialog>

      {evidenceTarget && (
        <RegistrarEvidenciaDialog
          open={!!evidenceTarget}
          onOpenChange={(open) => {
            if (!open) setEvidenceTarget(null);
          }}
          requirement={evidenceTarget.requirement}
          existingCompetency={evidenceTarget.existing}
          orgId={orgId}
          empId={empId}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: getGetEmployeeQueryKey(orgId, empId),
            });
            setEvidenceTarget(null);
          }}
        />
      )}
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

  const update = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

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
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>CPF</Label>
            <Input
              value={form.cpf}
              onChange={(e) => update("cpf", e.target.value)}
              className="mt-1"
              placeholder="000.000.000-00"
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="mt-1"
              type="email"
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <Label>Cargo</Label>
            <Select
              value={form.position}
              onChange={(e) => update("position", e.target.value)}
              className="mt-1"
            >
              <option value="">Selecionar cargo</option>
              {positions.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Departamento</Label>
            <Select
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
              className="mt-1"
            >
              <option value="">Selecionar departamento</option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tipo de Contrato</Label>
            <Select
              value={form.contractType}
              onChange={(e) => update("contractType", e.target.value)}
              className="mt-1"
            >
              <option value="clt">CLT</option>
              <option value="pj">PJ</option>
              <option value="intern">Estagiário</option>
              <option value="temporary">Temporário</option>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
              className="mt-1"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="on_leave">Afastado</option>
            </Select>
          </div>
          <div>
            <Label>Data de Admissão *</Label>
            <Input
              value={form.admissionDate}
              onChange={(e) => update("admissionDate", e.target.value)}
              className="mt-1"
              type="date"
            />
          </div>
          <div>
            <Label>Data de Desligamento</Label>
            <Input
              value={form.terminationDate}
              onChange={(e) => update("terminationDate", e.target.value)}
              className="mt-1"
              type="date"
            />
          </div>
        </div>
      )}

      <DialogFooter>
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStepChange(step - 1)}
          >
            Anterior
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onStepChange(step + 1)}
          >
            Próximo
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            isLoading={isPending}
            disabled={!form.name.trim()}
          >
            Salvar
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

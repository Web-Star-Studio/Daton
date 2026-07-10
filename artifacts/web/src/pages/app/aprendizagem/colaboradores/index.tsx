import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import {
  useListEmployees,
  useCreateEmployee,
  useDeleteEmployee,
  useListUnits,
  useListDepartments,
  useListPositions,
  usePreviewTrainingRequirements,
  getPreviewTrainingRequirementsQueryKey,
  getListEmployeesQueryKey,
  getListDepartmentsQueryKey,
  getListPositionsQueryKey,
} from "@workspace/api-client-react";
import { useAllTrainingCatalog } from "@/lib/training-catalog-client";
import type {
  CreateEmployeeBody,
  Employee,
  PaginatedEmployeesPagination,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SearchableSelect,
  toNameOptions,
} from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { DialogStepTabs } from "@/components/ui/dialog-step-tabs";
import { ProfileItemAttachmentsField } from "@/components/employees/profile-item-form-fields";
import { toast } from "@/hooks/use-toast";
import {
  uploadFilesToStorage,
  validateProfileItemUploadSelection,
  type UploadedFileRef,
} from "@/lib/uploads";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";
import {
  GraduationCap,
  Plus,
  Search,
  Users,
  ChevronRight,
  ChevronLeft,
  Trash2,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  on_leave: "Afastado",
};

const STATUS_COLORS: Record<string, string> = {
  active:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  inactive: "bg-muted text-muted-foreground border-border",
  on_leave:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
};

const CONTRACT_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  intern: "Estagiário",
  temporary: "Temporário",
  terceirizado: "Terceirizado",
};

const COMPETENCY_BADGE: Record<
  string,
  { label: string; className: string; help: string }
> = {
  ok: {
    label: "OK",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    help: "Competências exigidas pelo cargo atendidas.",
  },
  gap: {
    label: "Gap",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    help: "Alguma competência do cargo está abaixo do nível requerido (lacuna não crítica).",
  },
  critical: {
    label: "Crítico",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
    help: "Lacuna crítica: nível 2+ abaixo do requerido, ou qualquer lacuna em competência de nível requerido alto (≥ 4).",
  },
};

function trainingBarColor(pct: number): string {
  if (pct >= 92) return "bg-emerald-500";
  if (pct >= 61) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function toRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

type ProfileDraftItem = {
  tempId: string;
  title: string;
  description: string;
  attachments: UploadedFileRef[];
};

function createEmptyProfileDraftItem(): ProfileDraftItem {
  return {
    tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    description: "",
    attachments: [],
  };
}

function ProfileDraftListSection({
  label,
  emptyText,
  items,
  onChange,
}: {
  label: string;
  emptyText: string;
  items: ProfileDraftItem[];
  onChange: (items: ProfileDraftItem[]) => void;
}) {
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  const updateItem = (tempId: string, patch: Partial<ProfileDraftItem>) => {
    onChange(
      items.map((item) =>
        item.tempId === tempId ? { ...item, ...patch } : item,
      ),
    );
  };

  const removeItem = (tempId: string) => {
    onChange(items.filter((item) => item.tempId !== tempId));
  };

  const handleUpload = async (tempId: string, files: FileList | null) => {
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const targetItem = items.find((item) => item.tempId === tempId);
    const validationError = validateProfileItemUploadSelection(
      selectedFiles,
      targetItem?.attachments.length || 0,
    );
    if (validationError) {
      toast({
        title: "Limite de anexos excedido",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setUploadingItemId(tempId);
    try {
      const uploadedFiles = await uploadFilesToStorage(selectedFiles);

      onChange(
        items.map((item) =>
          item.tempId === tempId
            ? { ...item, attachments: [...item.attachments, ...uploadedFiles] }
            : item,
        ),
      );
    } catch (error) {
      toast({
        title: "Falha ao enviar anexo",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar o arquivo.",
        variant: "destructive",
      });
    } finally {
      setUploadingItemId(null);
    }
  };

  return (
    <div className="col-span-2 rounded-xl border border-border/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">{emptyText}</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...items, createEmptyProfileDraftItem()])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar item
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nenhum item adicionado.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.tempId}
              className="rounded-lg border border-border/60 bg-secondary/20 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Item {index + 1}
                </p>
                <button
                  type="button"
                  onClick={() => removeItem(item.tempId)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Título *
                  </Label>
                  <Input
                    value={item.title}
                    onChange={(event) =>
                      updateItem(item.tempId, { title: event.target.value })
                    }
                    className="mt-1"
                    placeholder="Ex: Analista de SGI na Empresa X"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Descrição
                  </Label>
                  <Textarea
                    value={item.description}
                    onChange={(event) =>
                      updateItem(item.tempId, {
                        description: event.target.value,
                      })
                    }
                    className="mt-1 min-h-24"
                    placeholder="Detalhes relevantes do item, escopo, período, curso, certificado, etc."
                  />
                </div>
                <div>
                  <ProfileItemAttachmentsField
                    attachments={item.attachments.map(
                      (attachment, attachmentIndex) => ({
                        id: `${attachment.objectPath}-${attachmentIndex}`,
                        fileName: attachment.fileName,
                        fileSize: attachment.fileSize,
                        objectPath: attachment.objectPath,
                        onRemove: () =>
                          updateItem(item.tempId, {
                            attachments: item.attachments.filter(
                              (_, indexValue) => indexValue !== attachmentIndex,
                            ),
                          }),
                      }),
                    )}
                    onUpload={(selectedFiles) => {
                      void handleUpload(item.tempId, selectedFiles);
                    }}
                    uploading={uploadingItemId === item.tempId}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ColaboradoresPage() {
  const { user } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [onlyWithUser, setOnlyWithUser] = useState(false);
  const [unitFilter, setUnitFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [maxReachedCreateStep, setMaxReachedCreateStep] = useState(0);
  const [professionalExperiences, setProfessionalExperiences] = useState<
    ProfileDraftItem[]
  >([]);
  const [educationCertifications, setEducationCertifications] = useState<
    ProfileDraftItem[]
  >([]);

  const { data: result, isLoading } = useListEmployees(orgId!, {
    search: search || undefined,
    status: onlyWithUser ? undefined : statusFilter || undefined,
    unitId: unitFilter ? Number(unitFilter) : undefined,
    position: positionFilter || undefined,
    page,
    pageSize: 25,
    ...(onlyWithUser ? { hasUser: true } : {}),
  } as Parameters<typeof useListEmployees>[1]);

  const employees: Employee[] = result?.data ?? [];
  const pagination: PaginatedEmployeesPagination | undefined =
    result?.pagination;

  const { data: units = [] } = useListUnits(orgId!);
  // Mapa filial → nomes dos gestores, para a coluna "Gestor direto".
  const managersByUnit = useMemo(
    () =>
      new Map(
        units.map((u) => [u.id, (u.managers ?? []).map((m) => m.userName)]),
      ),
    [units],
  );
  const { data: departments = [] } = useListDepartments(orgId!, {
    query: { queryKey: getListDepartmentsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: positions = [] } = useListPositions(orgId!, {
    query: { queryKey: getListPositionsQueryKey(orgId!), enabled: !!orgId },
  });

  const createMutation = useCreateEmployee();
  const deleteEmpMut = useDeleteEmployee();
  const {
    register,
    handleSubmit,
    reset,
    trigger,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<CreateEmployeeBody>({
    defaultValues: {
      contractType: "clt",
    },
  });

  // Preview de obrigatoriedades que serão auto-vinculadas conforme cargo + filial.
  const watchedPosition = watch("position");
  const watchedUnitId = watch("unitId");
  const { data: catalogPreviewResult } = useAllTrainingCatalog(orgId ?? 0, undefined, {
    query: { enabled: !!orgId },
  });
  const catalogTitleById = new Map(
    (catalogPreviewResult?.data ?? []).map((c) => [c.id, c.title]),
  );
  const previewParams = {
    position: watchedPosition ?? "",
    unitId: typeof watchedUnitId === "number" ? watchedUnitId : undefined,
  };
  const { data: requirementsPreview } = usePreviewTrainingRequirements(
    orgId ?? 0,
    previewParams,
    {
      query: {
        enabled: !!orgId && !!watchedPosition,
        queryKey: getPreviewTrainingRequirementsQueryKey(
          orgId ?? 0,
          previewParams,
        ),
      },
    },
  );
  const previewRequirements = requirementsPreview?.requirements ?? [];

  const [lookupBirthdate, setLookupBirthdate] = useState("");
  const [isLookingUpCpf, setIsLookingUpCpf] = useState(false);

  async function handleLookupCpf() {
    if (!orgId) return;
    const rawCpf = (getValues("cpf") ?? "").toString().replace(/\D/g, "");
    if (rawCpf.length !== 11) {
      toast({
        title: "CPF inválido",
        description: "Informe o CPF completo antes de buscar.",
        variant: "destructive",
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lookupBirthdate)) {
      toast({
        title: "Data de nascimento obrigatória",
        description: "Informe a data de nascimento para consultar a Receita.",
        variant: "destructive",
      });
      return;
    }

    setIsLookingUpCpf(true);
    try {
      const response = await fetch(
        resolveApiUrl(`/api/organizations/${orgId}/employees/lookup-cpf`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ cpf: rawCpf, birthdate: lookupBirthdate }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        nome?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.nome) {
        throw new Error(
          payload?.error || "Falha ao consultar a Receita Federal",
        );
      }
      setValue("name", payload.nome, {
        shouldValidate: true,
        shouldDirty: true,
      });
      toast({
        title: "Dados encontrados",
        description: `Nome preenchido a partir da Receita Federal.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível consultar",
        description:
          error instanceof Error ? error.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setIsLookingUpCpf(false);
    }
  }

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter, unitFilter, positionFilter, page]);

  const allSelectableIds = useMemo(
    () => employees.map((e) => e.id),
    [employees],
  );
  const allSelected =
    allSelectableIds.length > 0 &&
    allSelectableIds.every((id) => selectedIds.has(id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allSelectableIds));
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const executeBulkDelete = async () => {
    setIsDeleting(true);
    const totalToDelete = selectedIds.size;
    let failed = 0;
    try {
      for (const id of selectedIds) {
        try {
          await deleteEmpMut.mutateAsync({ orgId: orgId!, empId: id });
        } catch {
          failed++;
        }
      }
      queryClient.invalidateQueries({
        queryKey: getListEmployeesQueryKey(orgId!),
      });
      setSelectedIds(new Set());
      if (failed > 0) {
        toast({
          title: "Alguns colaboradores não puderam ser removidos",
          description: `${failed} de ${totalToDelete} falharam. Tente novamente.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Colaboradores removidos",
          description: `${totalToDelete} colaborador(es) removido(s).`,
        });
      }
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const stats = useMemo(() => {
    const r = result as
      | {
          statusCounts?: {
            active?: number;
            inactive?: number;
            onLeave?: number;
          };
          withUserCount?: number;
        }
      | undefined;
    const sc = r?.statusCounts;
    const active = sc?.active ?? 0;
    const inactive = sc?.inactive ?? 0;
    const onLeave = sc?.onLeave ?? 0;
    const users = r?.withUserCount ?? 0;
    return { active, inactive, onLeave, users };
  }, [result]);

  const resetCreateForm = () => {
    reset();
    setCreateStep(0);
    setMaxReachedCreateStep(0);
    setProfessionalExperiences([]);
    setEducationCertifications([]);
    setLookupBirthdate("");
  };

  const changeCreateStep = async (targetStep: number) => {
    const boundedTarget = Math.max(0, Math.min(targetStep, 2));

    if (boundedTarget > createStep) {
      if (createStep === 0) {
        const valid = await trigger(["cpf", "name", "email", "phone"]);
        if (!valid) return;
      }

      if (createStep === 1) {
        const valid = await trigger([
          "department",
          "position",
          "unitId",
          "contractType",
          "admissionDate",
        ]);
        if (!valid) return;
      }
    }

    setCreateStep(boundedTarget);
    setMaxReachedCreateStep((current) => Math.max(current, boundedTarget));
  };

  const onCreateSubmit = async (data: CreateEmployeeBody) => {
    const invalidExperience = professionalExperiences.find(
      (item) => item.title.trim().length === 0,
    );
    const invalidEducation = educationCertifications.find(
      (item) => item.title.trim().length === 0,
    );
    if (invalidExperience || invalidEducation) {
      toast({
        title: "Itens incompletos",
        description:
          "Todos os itens de experiências e educação/certificações precisam ter título.",
        variant: "destructive",
      });
      return;
    }

    const payload: CreateEmployeeBody = {
      name: data.name.trim(),
      ...(data.cpf ? { cpf: data.cpf.trim() } : {}),
      admissionDate: data.admissionDate,
      contractType: data.contractType || "clt",
      ...(data.email ? { email: data.email } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.department ? { department: data.department } : {}),
      ...(data.position ? { position: data.position } : {}),
      ...(data.birthDate ? { birthDate: data.birthDate } : {}),
      ...(data.gender ? { gender: data.gender } : {}),
      ...(data.education ? { education: data.education } : {}),
      ...(professionalExperiences.length > 0
        ? {
            professionalExperiences: professionalExperiences.map((item) => ({
              title: item.title.trim(),
              description: item.description.trim() || undefined,
              attachments:
                item.attachments.length > 0 ? item.attachments : undefined,
            })),
          }
        : {}),
      ...(educationCertifications.length > 0
        ? {
            educationCertifications: educationCertifications.map((item) => ({
              title: item.title.trim(),
              description: item.description.trim() || undefined,
              attachments:
                item.attachments.length > 0 ? item.attachments : undefined,
            })),
          }
        : {}),
      ...(typeof data.unitId === "number" ? { unitId: data.unitId } : {}),
    };

    try {
      const created = await createMutation.mutateAsync({
        orgId: orgId!,
        data: payload,
      });
      queryClient.invalidateQueries({
        queryKey: getListEmployeesQueryKey(orgId!),
      });
      const auto = created.autoLinkedTrainings;
      toast({
        title: "Colaborador cadastrado",
        description: auto
          ? `${auto.generated} treinamento(s) vinculado(s)${
              auto.reused ? ` · ${auto.reused} aproveitado(s)` : ""
            }`
          : undefined,
      });
      setCreateOpen(false);
      resetCreateForm();
    } catch (error) {
      toast({
        title: "Falha ao criar colaborador",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível criar o colaborador.",
        variant: "destructive",
      });
    }
  };

  const handleFilterChange = () => {
    setPage(1);
  };

  const applyStatus = (s: string) => {
    setOnlyWithUser(false);
    setStatusFilter(s);
    setPage(1);
  };
  const applyOnlyWithUser = () => {
    setOnlyWithUser(true);
    setStatusFilter("");
    setPage(1);
  };
  const cardBase =
    "rounded-xl border px-4 py-3 backdrop-blur-md text-left w-full cursor-pointer transition-colors hover:bg-card/60";
  const statusCardCls = (s: string, ring: string) =>
    `${cardBase} ${
      !onlyWithUser && statusFilter === s
        ? `${ring} bg-card/60`
        : "border-border/60 bg-card/42"
    }`;

  const headerActions = useMemo(() => {
    const canWriteEmployees = canWriteModule("employees");
    if (!orgId) return null;
    // Bulk actions moved to floating bar at bottom
    return (
      <div className="flex items-center gap-2">
        <Link href="/aprendizagem/colaboradores/treinamentos">
          <HeaderActionButton
            size="sm"
            variant="outline"
            label="Treinamentos"
            icon={<GraduationCap className="h-3.5 w-3.5" />}
          />
        </Link>
        {canWriteEmployees ? (
          <HeaderActionButton
            size="sm"
            onClick={() => {
              setCreateStep(0);
              setMaxReachedCreateStep(0);
              setCreateOpen(true);
            }}
            label="Novo Colaborador"
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Novo Colaborador
          </HeaderActionButton>
        ) : null}
      </div>
    );
  }, [canWriteModule, isDeleting, orgId, selectedIds]);

  useHeaderActions(headerActions);

  if (!orgId) return null;

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => applyStatus("active")}
            className={statusCardCls(
              "active",
              "border-emerald-500/70 ring-1 ring-emerald-500/40",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Colaboradores ativos
            </p>
            <p className="text-xl font-semibold text-emerald-600 mt-0.5">
              {stats.active}
            </p>
          </button>
          <button
            type="button"
            onClick={applyOnlyWithUser}
            className={`${cardBase} ${
              onlyWithUser
                ? "border-sky-500/70 ring-1 ring-sky-500/40 bg-card/60"
                : "border-border/60 bg-card/42"
            }`}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Usuários cadastrados
            </p>
            <p className="text-xl font-semibold text-sky-600 mt-0.5">
              {stats.users}
            </p>
          </button>
          <button
            type="button"
            onClick={() => applyStatus("inactive")}
            className={statusCardCls(
              "inactive",
              "border-gray-400/70 ring-1 ring-gray-400/40",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Inativos
            </p>
            <p className="text-xl font-semibold text-gray-500 mt-0.5">
              {stats.inactive}
            </p>
          </button>
          <button
            type="button"
            onClick={() => applyStatus("on_leave")}
            className={statusCardCls(
              "on_leave",
              "border-amber-500/70 ring-1 ring-amber-500/40",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Afastados
            </p>
            <p className="text-xl font-semibold text-amber-600 mt-0.5">
              {stats.onLeave}
            </p>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                handleFilterChange();
              }}
              className="pl-9 h-9 text-[13px]"
            />
          </div>
          <Select
            value={onlyWithUser ? "" : statusFilter}
            onChange={(e) => {
              setOnlyWithUser(false);
              setStatusFilter(e.target.value);
              handleFilterChange();
            }}
            className="h-9 text-[13px] w-36"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
            <option value="on_leave">Afastado</option>
          </Select>
          <Select
            value={unitFilter}
            onChange={(e) => {
              setUnitFilter(e.target.value);
              handleFilterChange();
            }}
            className="h-9 text-[13px] w-44"
          >
            <option value="">Todas as unidades</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <div className="w-44">
            <SearchableSelect
              value={positionFilter}
              onChange={(v) => {
                setPositionFilter(v);
                handleFilterChange();
              }}
              options={toNameOptions(
                positions.map((p) => p.name),
                positionFilter,
              )}
              onCreateOption={(v) => {
                setPositionFilter(v);
                handleFilterChange();
              }}
              createOptionLabel={(input) => `Filtrar por “${input}”`}
              placeholder="Todos os cargos"
              searchPlaceholder="Buscar cargo..."
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-[13px] text-muted-foreground">
            Carregando...
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">
              Nenhum colaborador encontrado
            </p>
            {canWriteModule("employees") && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setCreateStep(0);
                  setMaxReachedCreateStep(0);
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Adicionar Colaborador
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded border-border text-primary cursor-pointer"
                        disabled={
                          !canWriteModule("employees") || employees.length === 0
                        }
                      />
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Colaborador
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Cargo
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Unidade
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Vínculo
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Gestor direto
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Escolaridade
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Competências
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-36">
                      Treinamentos
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      Status
                    </th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const isSelected = selectedIds.has(emp.id);
                    return (
                      <tr
                        key={emp.id}
                        className={`border-b border-border/40 last:border-0 transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-secondary/30"}`}
                      >
                        <td className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(emp.id)}
                            className="rounded border-border text-primary cursor-pointer"
                            disabled={!canWriteModule("employees")}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/aprendizagem/colaboradores/${emp.id}`}
                            className="cursor-pointer"
                          >
                            <p className="text-[13px] font-medium text-foreground hover:text-primary transition-colors">
                              {emp.name}
                            </p>
                            {emp.email && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {emp.email}
                              </p>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {emp.position || "—"}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {emp.unitName || "—"}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {CONTRACT_LABELS[emp.contractType] ||
                            emp.contractType}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {/* Gestor direto = gestores da filial do colaborador. */}
                          {emp.unitId && managersByUnit.get(emp.unitId)?.length
                            ? managersByUnit.get(emp.unitId)!.join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {emp.education || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {emp.competencyGapStatus &&
                          COMPETENCY_BADGE[emp.competencyGapStatus] ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    tabIndex={0}
                                    className={cn(
                                      "inline-flex cursor-help items-center px-2 py-0.5 rounded-full text-[11px] font-medium border outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                      COMPETENCY_BADGE[emp.competencyGapStatus]
                                        .className,
                                    )}
                                  >
                                    {
                                      COMPETENCY_BADGE[emp.competencyGapStatus]
                                        .label
                                    }
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px]">
                                  {
                                    COMPETENCY_BADGE[emp.competencyGapStatus]
                                      .help
                                  }
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {emp.trainingCompletionPercent != null ? (
                            <div className="flex items-center gap-2 min-w-[7rem]">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    trainingBarColor(
                                      emp.trainingCompletionPercent,
                                    ),
                                  )}
                                  style={{
                                    width: `${Math.min(100, emp.trainingCompletionPercent)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[11px] text-muted-foreground tabular-nums w-8 shrink-0">
                                {emp.trainingCompletionPercent}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLORS[emp.status] || "bg-muted text-muted-foreground border-border"}`}
                          >
                            {STATUS_LABELS[emp.status] || emp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/aprendizagem/colaboradores/${emp.id}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 cursor-pointer" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Mostrando {(pagination.page - 1) * pagination.pageSize + 1}–
                  {Math.min(
                    pagination.page * pagination.pageSize,
                    pagination.total,
                  )}{" "}
                  de {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-2"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 px-2"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
        title="Novo colaborador"
        description={
          [
            "Cadastre os dados pessoais do colaborador.",
            "Defina vínculo, cargo e unidade principal.",
            "Registre experiências e certificações iniciais.",
          ][createStep]
        }
        size="lg"
      >
        <form onSubmit={handleSubmit(onCreateSubmit)}>
          <DialogStepTabs
            steps={["Pessoal", "Profissional", "Histórico"]}
            step={createStep}
            onStepChange={(nextStep) => {
              void changeCreateStep(nextStep);
            }}
            maxAccessibleStep={maxReachedCreateStep}
          />

          {createStep === 0 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div className="col-span-2 rounded-xl border border-border/60 bg-secondary/20 p-4">
                <div className="grid grid-cols-[1fr_160px_auto] items-end gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground">
                      CPF
                    </Label>
                    <Input
                      {...register("cpf", {
                        setValueAs: toRequiredString,
                        onChange: (event) => {
                          event.target.value = formatCpfInput(
                            event.target.value,
                          );
                        },
                      })}
                      className="mt-1"
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      maxLength={14}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Data de nascimento
                    </Label>
                    <Input
                      type="date"
                      value={lookupBirthdate}
                      onChange={(event) =>
                        setLookupBirthdate(event.target.value)
                      }
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleLookupCpf()}
                    disabled={isLookingUpCpf}
                  >
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    {isLookingUpCpf ? "Buscando..." : "Buscar na Receita"}
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Informe CPF e data de nascimento para autopreencher o nome via
                  Receita Federal.
                </p>
                {errors.cpf && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors.cpf.message}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Nome completo *
                </Label>
                <Input
                  {...register("name", {
                    required: "Nome completo é obrigatório",
                    setValueAs: toRequiredString,
                  })}
                  className="mt-1"
                  placeholder="Nome completo do funcionário"
                />
                {errors.name && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  E-mail
                </Label>
                <Input
                  {...register("email", {
                    setValueAs: toOptionalString,
                  })}
                  className="mt-1"
                  type="email"
                  placeholder="email@empresa.com"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Telefone
                </Label>
                <Input
                  {...register("phone", {
                    setValueAs: toOptionalString,
                  })}
                  className="mt-1"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Data de nascimento
                </Label>
                <Input
                  {...register("birthDate", {
                    setValueAs: toOptionalString,
                  })}
                  className="mt-1"
                  type="date"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Gênero
                </Label>
                <Select
                  {...register("gender", {
                    setValueAs: (value) => value || undefined,
                  })}
                  className="mt-1 h-10 text-[13px]"
                >
                  <option value="">Selecionar gênero</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Não Binário">Não Binário</option>
                  <option value="Prefiro Não Informar">
                    Prefiro Não Informar
                  </option>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Escolaridade
                </Label>
                <Select
                  {...register("education", {
                    setValueAs: (value) => value || undefined,
                  })}
                  className="mt-1 h-10 text-[13px]"
                >
                  <option value="">Selecionar escolaridade</option>
                  <option value="Fundamental Incompleto">
                    Fundamental Incompleto
                  </option>
                  <option value="Fundamental Completo">
                    Fundamental Completo
                  </option>
                  <option value="Médio Incompleto">Médio Incompleto</option>
                  <option value="Médio Completo">Médio Completo</option>
                  <option value="Técnico">Técnico</option>
                  <option value="Superior Incompleto">
                    Superior Incompleto
                  </option>
                  <option value="Superior Completo">Superior Completo</option>
                  <option value="Pós-Graduação">Pós-Graduação</option>
                  <option value="Mestrado">Mestrado</option>
                  <option value="Doutorado">Doutorado</option>
                  <option value="Não Aplicável">Não Aplicável</option>
                </Select>
              </div>
            </div>
          )}

          {createStep === 1 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Departamento
                </Label>
                <Select
                  {...register("department", {
                    setValueAs: (value) => value || undefined,
                  })}
                  className="mt-1 h-10 text-[13px]"
                >
                  <option value="">Selecionar departamento</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.name}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Cargo
                </Label>
                <Select
                  {...register("position", {
                    setValueAs: (value) => value || undefined,
                  })}
                  className="mt-1 h-10 text-[13px]"
                >
                  <option value="">Selecionar cargo</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.name}>
                      {position.name}
                    </option>
                  ))}
                </Select>
              </div>
              {previewRequirements.length > 0 ? (
                <div className="md:col-span-2 rounded-lg border bg-blue-50/50 p-3">
                  <div className="text-xs font-semibold text-blue-900">
                    {previewRequirements.length} treinamento(s) obrigatório(s)
                    serão vinculados a este cargo
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {previewRequirements.map((r) => (
                      <span
                        key={r.id}
                        className="rounded-full border bg-white px-2 py-0.5 text-xs text-blue-800"
                      >
                        {catalogTitleById.get(r.catalogItemId) ??
                          `#${r.catalogItemId}`}
                        {r.isCritical ? " · crítico" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Unidade
                </Label>
                <Select
                  {...register("unitId", {
                    setValueAs: (v) => (v ? Number(v) : undefined),
                  })}
                  className="mt-1 h-10 text-[13px]"
                >
                  <option value="">Selecionar unidade</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Tipo de contrato
                </Label>
                <select
                  {...register("contractType")}
                  className="mt-1 flex h-10 w-full appearance-none border-b border-input bg-transparent px-0 py-2 text-[13px] transition-colors cursor-pointer focus:border-foreground focus:outline-none"
                >
                  <option value="clt">CLT</option>
                  <option value="pj">PJ</option>
                  <option value="intern">Estagiário</option>
                  <option value="temporary">Temporário</option>
                  <option value="terceirizado">Terceirizado</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  Data de admissão *
                </Label>
                <Input
                  {...register("admissionDate", {
                    required: "Data de admissão é obrigatória",
                    setValueAs: toRequiredString,
                  })}
                  className="mt-1"
                  type="date"
                />
                {errors.admissionDate && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors.admissionDate.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <ProfileDraftListSection
                label="Experiências profissionais"
                emptyText="Adicione uma lista de experiências com anexos opcionais."
                items={professionalExperiences}
                onChange={setProfessionalExperiences}
              />
              <ProfileDraftListSection
                label="Educação e certificações"
                emptyText="Adicione formação, cursos e certificados com anexos opcionais."
                items={educationCertifications}
                onChange={setEducationCertifications}
              />
            </div>
          )}
          <DialogFooter>
            {createStep > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void changeCreateStep(createStep - 1);
                }}
              >
                Anterior
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
              >
                Cancelar
              </Button>
            )}
            {createStep < 2 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void changeCreateStep(createStep + 1);
                }}
              >
                Próximo
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Criando..." : "Criar colaborador"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Confirmar Desativação"
      >
        <p className="text-sm text-muted-foreground mt-2">
          Tem certeza que deseja desativar {selectedIds.size} colaborador
          {selectedIds.size > 1 ? "es" : ""}? Os registros serão marcados como
          inativos.
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmDeleteOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={executeBulkDelete}
            isLoading={isDeleting}
          >
            Desativar
          </Button>
        </DialogFooter>
      </Dialog>

      {selectedIds.size > 0 &&
        canWriteModule("employees") &&
        createPortal(
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-lg backdrop-blur-xl">
                <span className="px-2 text-[13px] font-medium text-foreground">
                  {selectedIds.size} selecionado
                  {selectedIds.size > 1 ? "s" : ""}
                </span>
                <div className="mx-1 h-5 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteOpen(true)}
                      disabled={isDeleting}
                      aria-label="Desativar colaboradores selecionados"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Desativar selecionados</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setSelectedIds(new Set())}
                      aria-label="Limpar seleção"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Limpar seleção</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>,
          document.body,
        )}
    </>
  );
}

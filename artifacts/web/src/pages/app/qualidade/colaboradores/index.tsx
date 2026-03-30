import React, { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useListEmployees,
  useCreateEmployee,
  useDeleteEmployee,
  useListUnits,
  useListDepartments,
  useListPositions,
  getListEmployeesQueryKey,
  getListDepartmentsQueryKey,
  getListPositionsQueryKey,
} from "@workspace/api-client-react";
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
import {
  Plus,
  Search,
  Users,
  ChevronRight,
  ChevronLeft,
  Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  on_leave: "Afastado",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-50 text-gray-500 border-gray-200",
  on_leave: "bg-amber-50 text-amber-700 border-amber-200",
};

const CONTRACT_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  intern: "Estagiário",
  temporary: "Temporário",
};

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
  const [statusFilter, setStatusFilter] = useState("");
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
    status: statusFilter || undefined,
    unitId: unitFilter ? Number(unitFilter) : undefined,
    position: positionFilter || undefined,
    page,
    pageSize: 25,
  });

  const employees: Employee[] = result?.data ?? [];
  const pagination: PaginatedEmployeesPagination | undefined =
    result?.pagination;

  const { data: units = [] } = useListUnits(orgId!);
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
    formState: { errors },
  } = useForm<CreateEmployeeBody>({
    defaultValues: {
      contractType: "clt",
    },
  });

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
    try {
      for (const id of selectedIds) {
        try {
          await deleteEmpMut.mutateAsync({ orgId: orgId!, empId: id });
        } catch {}
      }
      queryClient.invalidateQueries({
        queryKey: getListEmployeesQueryKey(orgId!),
      });
      setSelectedIds(new Set());
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const stats = useMemo(() => {
    const total = pagination?.total ?? employees.length;
    const active = employees.filter((e) => e.status === "active").length;
    const inactive = employees.filter((e) => e.status === "inactive").length;
    const onLeave = employees.filter((e) => e.status === "on_leave").length;
    return { total, active, inactive, onLeave };
  }, [employees, pagination]);

  const resetCreateForm = () => {
    reset();
    setCreateStep(0);
    setMaxReachedCreateStep(0);
    setProfessionalExperiences([]);
    setEducationCertifications([]);
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
      await createMutation.mutateAsync({ orgId: orgId!, data: payload });
      queryClient.invalidateQueries({
        queryKey: getListEmployeesQueryKey(orgId!),
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

  const headerActions = useMemo(() => {
    const canWriteEmployees = canWriteModule("employees");
    if (!orgId) return null;
    if (selectedIds.size > 0) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
          </span>
          {canWriteEmployees && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              isLoading={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Desativar ({selectedIds.size})
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancelar
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Link href="/organizacao/colaboradores/treinamentos">
          <Button size="sm" variant="outline">
            Treinamentos
          </Button>
        </Link>
        {canWriteEmployees ? (
          <Button
            size="sm"
            onClick={() => {
              setCreateStep(0);
              setMaxReachedCreateStep(0);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Colaborador
          </Button>
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
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Total</p>
            <p className="text-xl font-semibold text-foreground mt-0.5">
              {stats.total}
            </p>
          </div>
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Ativos</p>
            <p className="text-xl font-semibold text-emerald-600 mt-0.5">
              {stats.active}
            </p>
          </div>
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Inativos
            </p>
            <p className="text-xl font-semibold text-gray-500 mt-0.5">
              {stats.inactive}
            </p>
          </div>
          <div className="bg-card border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Afastados
            </p>
            <p className="text-xl font-semibold text-amber-600 mt-0.5">
              {stats.onLeave}
            </p>
          </div>
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
            value={statusFilter}
            onChange={(e) => {
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
          <Input
            placeholder="Filtrar por cargo..."
            value={positionFilter}
            onChange={(e) => {
              setPositionFilter(e.target.value);
              handleFilterChange();
            }}
            className="h-9 text-[13px] w-44"
          />
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
                      Nome
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
                            href={`/organizacao/colaboradores/${emp.id}`}
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
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLORS[emp.status] || "bg-gray-50 text-gray-500 border-gray-200"}`}
                          >
                            {STATUS_LABELS[emp.status] || emp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/organizacao/colaboradores/${emp.id}`}>
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
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">
                  CPF
                </Label>
                <Input
                  {...register("cpf", {
                    setValueAs: toRequiredString,
                    onChange: (event) => {
                      event.target.value = formatCpfInput(event.target.value);
                    },
                  })}
                  className="mt-1"
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                />
                {errors.cpf && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {errors.cpf.message}
                  </p>
                )}
              </div>
              <div>
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
    </>
  );
}

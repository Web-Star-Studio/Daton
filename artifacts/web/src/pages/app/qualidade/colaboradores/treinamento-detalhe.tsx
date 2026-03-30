import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrganizationTrainings,
  useListEmployees,
  useListUnits,
  useUpdateTraining,
  useDeleteTraining,
  useCreateTraining,
  getListEmployeesQueryKey,
  getListOrganizationTrainingsQueryKey,
  getListUnitsQueryKey,
  CreateTrainingBodyStatus as CreateTrainingBodyStatusValues,
  CreateTrainingBodyTargetCompetencyType as CreateTrainingBodyTargetCompetencyTypeValues,
} from "@workspace/api-client-react";
import type {
  CreateTrainingBodyStatus,
  CreateTrainingBodyTargetCompetencyType,
  Employee,
  EmployeeRecordAttachment,
  OrganizationTraining,
  UpdateTrainingBodyStatus,
} from "@workspace/api-client-react";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ProfileItemAttachmentsField } from "@/components/employees/profile-item-form-fields";
import {
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT,
  type UploadedFileRef,
} from "@/lib/uploads";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

const TRAINING_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  concluido: "Concluido",
  vencido: "Vencido",
};

const TRAINING_STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pendente: "secondary",
  concluido: "default",
  vencido: "destructive",
};

const EFFECTIVENESS_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente de eficacia",
  effective: "Eficaz",
  ineffective: "Ineficaz",
};

const EFFECTIVENESS_STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  effective: "default",
  ineffective: "destructive",
};

type TrainingAdminForm = {
  employeeId: string;
  title: string;
  description: string;
  objective: string;
  institution: string;
  targetCompetencyName: string;
  targetCompetencyType: CreateTrainingBodyTargetCompetencyType;
  targetCompetencyLevel: number;
  evaluationMethod: string;
  renewalMonths: number;
  workloadHours: number;
  completionDate: string;
  expirationDate: string;
  status: CreateTrainingBodyStatus;
};

function getDefaultTrainingForm(): TrainingAdminForm {
  return {
    employeeId: "",
    title: "",
    description: "",
    objective: "",
    institution: "",
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
  };
}

function mapRecordAttachmentItems(
  attachments: Array<EmployeeRecordAttachment | UploadedFileRef> | undefined,
) {
  return (attachments || []).map((attachment, index) => ({
    id: `${attachment.objectPath}-${index}`,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    objectPath: attachment.objectPath,
  }));
}

export default function TrainingDetailPage() {
  const { title: encodedTitle } = useParams<{ title: string }>();
  const trainingTitle = (() => {
    try {
      return decodeURIComponent(encodedTitle || "");
    } catch {
      return encodedTitle || "";
    }
  })();
  const [, navigate] = useLocation();
  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const canWriteEmployees = canWriteModule("employees");
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  usePageTitle(trainingTitle || "Treinamento");
  useHeaderActions(
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate("/organizacao/colaboradores/treinamentos")}
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Voltar
      </Button>
      {canWriteEmployees && (
        <Button size="sm" onClick={() => openNewTraining()}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Atribuir colaborador
        </Button>
      )}
    </div>,
  );

  // ── Filter state ──
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

  // ── Selection state ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── Dialog state ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTraining, setEditingTraining] =
    useState<OrganizationTraining | null>(null);
  const [form, setForm] = useState<TrainingAdminForm>(getDefaultTrainingForm());
  const [historyTraining, setHistoryTraining] =
    useState<OrganizationTraining | null>(null);

  // ── Bulk action dialog state ──
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("concluido");
  const [bulkExpirationDialogOpen, setBulkExpirationDialogOpen] = useState(false);
  const [bulkExpiration, setBulkExpiration] = useState("");
  const [bulkActionPending, setBulkActionPending] = useState(false);

  // ── Data queries ──
  const apiFilters = useMemo(
    () => ({ page: 1, pageSize: 500, search: trainingTitle || undefined }),
    [trainingTitle],
  );

  const { data: trainingsResult, isLoading } = useListOrganizationTrainings(
    orgId ?? 0,
    apiFilters,
    {
      query: {
        enabled: !!orgId && !!trainingTitle,
        queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, apiFilters),
      },
    },
  );

  const { data: employeesResult } = useListEmployees(
    orgId ?? 0,
    {
      page: 1,
      pageSize: 500,
    },
    {
      query: {
        enabled: !!orgId,
        queryKey: getListEmployeesQueryKey(orgId ?? 0, {
          page: 1,
          pageSize: 500,
        }),
      },
    },
  );
  const employees = employeesResult?.data ?? [];

  const { data: units = [] } = useListUnits(orgId ?? 0, {
    query: {
      enabled: !!orgId,
      queryKey: getListUnitsQueryKey(orgId ?? 0),
    },
  });

  // ── Filtered trainings ──
  const allTrainings = useMemo(
    () =>
      (trainingsResult?.data ?? []).filter((t) => t.title === trainingTitle),
    [trainingsResult, trainingTitle],
  );

  const filteredTrainings = useMemo(() => {
    let result = allTrainings;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      result = result.filter(
        (t) =>
          t.employeeName.toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (unitFilter) {
      result = result.filter((t) => t.unitId === Number(unitFilter));
    }
    if (positionFilter) {
      result = result.filter((t) => t.employeePosition === positionFilter);
    }
    return result;
  }, [allTrainings, searchFilter, statusFilter, unitFilter, positionFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTrainings) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [allTrainings]);

  const uniquePositions = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTrainings) {
      if (t.employeePosition) set.add(t.employeePosition);
    }
    return Array.from(set).sort();
  }, [allTrainings]);

  // ── Selection helpers ──
  const allFilteredSelected =
    filteredTrainings.length > 0 &&
    filteredTrainings.every((t) => selectedIds.has(t.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTrainings.map((t) => t.id)));
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTrainings = useMemo(
    () => filteredTrainings.filter((t) => selectedIds.has(t.id)),
    [filteredTrainings, selectedIds],
  );

  // ── Mutations ──
  const createMutation = useCreateTraining();
  const updateMutation = useUpdateTraining();
  const deleteMutation = useDeleteTraining();

  const invalidateData = async () => {
    await queryClient.invalidateQueries({
      queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, apiFilters),
    });
  };

  const openNewTraining = () => {
    setEditingTraining(null);
    setForm({ ...getDefaultTrainingForm(), title: trainingTitle });
    setDialogOpen(true);
  };

  const openEditTraining = (training: OrganizationTraining) => {
    setEditingTraining(training);
    setForm({
      employeeId: String(training.employeeId),
      title: training.title,
      description: training.description || "",
      objective: training.objective || "",
      institution: training.institution || "",
      targetCompetencyName: training.targetCompetencyName || "",
      targetCompetencyType:
        training.targetCompetencyType ||
        CreateTrainingBodyTargetCompetencyTypeValues.habilidade,
      targetCompetencyLevel: training.targetCompetencyLevel || 0,
      evaluationMethod: training.evaluationMethod || "",
      renewalMonths: training.renewalMonths || 0,
      workloadHours: training.workloadHours || 0,
      completionDate: training.completionDate || "",
      expirationDate: training.expirationDate || "",
      status: training.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const targetEmployeeId = Number(form.employeeId);
    const payload = {
      title: form.title,
      description: form.description || undefined,
      objective: form.objective || undefined,
      institution: form.institution || undefined,
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
    };

    try {
      if (editingTraining) {
        await updateMutation.mutateAsync({
          orgId: orgId ?? 0,
          empId: targetEmployeeId,
          trainId: editingTraining.id,
          data: payload,
        });
      } else {
        await createMutation.mutateAsync({
          orgId: orgId ?? 0,
          empId: targetEmployeeId,
          data: { ...payload, status: form.status },
        });
      }
      await invalidateData();
      setDialogOpen(false);
      setEditingTraining(null);
      setForm(getDefaultTrainingForm());
      toast({
        title: editingTraining ? "Treinamento atualizado" : "Treinamento criado",
      });
    } catch (error) {
      console.error("Failed to save training:", error);
      toast({
        title: "Erro ao salvar treinamento",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (training: OrganizationTraining) => {
    const confirmed = window.confirm(
      `Excluir o treinamento "${training.title}" de ${training.employeeName}?`,
    );
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync({
        orgId: orgId ?? 0,
        empId: training.employeeId,
        trainId: training.id,
      });
      await invalidateData();
      toast({ title: "Treinamento excluído" });
    } catch (error) {
      console.error("Failed to delete training:", error);
      toast({
        title: "Erro ao excluir treinamento",
        variant: "destructive",
      });
    }
  };

  // ── Bulk operations ──
  const handleBulkStatusChange = async () => {
    setBulkActionPending(true);
    try {
      for (const t of selectedTrainings) {
        await updateMutation.mutateAsync({
          orgId: orgId ?? 0,
          empId: t.employeeId,
          trainId: t.id,
          data: { status: bulkStatus as UpdateTrainingBodyStatus },
        });
      }
      await invalidateData();
      setSelectedIds(new Set());
      setBulkStatusDialogOpen(false);
      toast({ title: `Status atualizado para ${selectedTrainings.length} registros` });
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleBulkExpirationChange = async () => {
    if (!bulkExpiration) return;
    setBulkActionPending(true);
    try {
      for (const t of selectedTrainings) {
        await updateMutation.mutateAsync({
          orgId: orgId ?? 0,
          empId: t.employeeId,
          trainId: t.id,
          data: { expirationDate: bulkExpiration },
        });
      }
      await invalidateData();
      setSelectedIds(new Set());
      setBulkExpirationDialogOpen(false);
      toast({ title: `Validade atualizada para ${selectedTrainings.length} registros` });
    } catch {
      toast({ title: "Erro ao atualizar validade", variant: "destructive" });
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = window.confirm(
      `Excluir ${selectedTrainings.length} treinamento(s) selecionado(s)?`,
    );
    if (!confirmed) return;

    setBulkActionPending(true);
    try {
      for (const t of selectedTrainings) {
        await deleteMutation.mutateAsync({
          orgId: orgId ?? 0,
          empId: t.employeeId,
          trainId: t.id,
        });
      }
      await invalidateData();
      setSelectedIds(new Set());
      toast({ title: `${selectedTrainings.length} registros excluidos` });
    } catch {
      toast({ title: "Erro ao excluir registros", variant: "destructive" });
    } finally {
      setBulkActionPending(false);
    }
  };

  if (!orgId) return null;

  return (
    <>
      <div className="space-y-6">
        {/* Summary */}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {trainingTitle}
          </h2>
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {allTrainings.length} colaboradores
            </span>
            {(statusCounts["concluido"] ?? 0) > 0 && (
              <span className="font-medium text-emerald-600">
                {statusCounts["concluido"]} concluido
              </span>
            )}
            {(statusCounts["pendente"] ?? 0) > 0 && (
              <span className="font-medium text-amber-600">
                {statusCounts["pendente"]} pendente
              </span>
            )}
            {(statusCounts["vencido"] ?? 0) > 0 && (
              <span className="font-medium text-red-600">
                {statusCounts["vencido"]} vencido
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 h-9 text-[13px]"
              placeholder="Buscar por nome..."
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 text-[13px] w-36"
          >
            <option value="">Todos status</option>
            <option value="pendente">Pendente</option>
            <option value="concluido">Concluido</option>
            <option value="vencido">Vencido</option>
          </Select>
          <Select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="h-9 text-[13px] w-44"
          >
            <option value="">Todas unidades</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="h-9 text-[13px] w-44"
          >
            <option value="">Todos cargos</option>
            {uniquePositions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">
            Carregando...
          </div>
        ) : filteredTrainings.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">
              Nenhum colaborador encontrado
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  {canWriteEmployees && (
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAll}
                        className="rounded border-border text-primary cursor-pointer"
                      />
                    </th>
                  )}
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
                    Status
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    Eficacia
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    Validade
                  </th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTrainings.map((training) => {
                  const isSelected = selectedIds.has(training.id);
                  return (
                    <tr
                      key={training.id}
                      className={`border-b border-border/40 last:border-0 transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-secondary/30"}`}
                    >
                      {canWriteEmployees && (
                        <td className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(training.id)}
                            className="rounded border-border text-primary cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Link
                          href={`/organizacao/colaboradores/${training.employeeId}`}
                        >
                          <p className="text-[13px] font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
                            {training.employeeName}
                          </p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">
                        {training.employeePosition || "---"}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">
                        {training.unitName || "---"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            TRAINING_STATUS_BADGE_VARIANT[training.status] ||
                            "secondary"
                          }
                        >
                          {TRAINING_STATUS_LABELS[training.status] ||
                            training.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {training.effectivenessStatus ? (
                          <Badge
                            variant={
                              EFFECTIVENESS_STATUS_BADGE_VARIANT[
                                training.effectivenessStatus
                              ] || "outline"
                            }
                          >
                            {
                              EFFECTIVENESS_STATUS_LABELS[
                                training.effectivenessStatus
                              ]
                            }
                          </Badge>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">
                            ---
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">
                        {training.expirationDate || "---"}
                      </td>
                      <td className="px-4 py-3">
                        <TooltipProvider delayDuration={200}>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => setHistoryTraining(training)}
                                >
                                  <History className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Historico</TooltipContent>
                            </Tooltip>
                            {canWriteEmployees && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() =>
                                        openEditTraining(training)
                                      }
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={() =>
                                        void handleDelete(training)
                                      }
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Excluir</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                          </div>
                        </TooltipProvider>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && canWriteEmployees && createPortal(
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-lg backdrop-blur-xl">
            <span className="px-2 text-[13px] font-medium text-foreground">
              {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
            </span>
            <div className="mx-1 h-5 w-px bg-border" />
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-[13px]"
                    onClick={() => setBulkStatusDialogOpen(true)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Status
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Alterar status</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-[13px]"
                    onClick={() => setBulkExpirationDialogOpen(true)}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Validade
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Alterar validade</TooltipContent>
              </Tooltip>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleBulkDelete()}
                    disabled={bulkActionPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Excluir selecionados</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Limpar selecao</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Bulk status dialog ── */}
      <Dialog
        open={bulkStatusDialogOpen}
        onOpenChange={setBulkStatusDialogOpen}
        title="Alterar status"
        description={`Alterar o status de ${selectedIds.size} treinamento(s)`}
      >
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Novo status
          </Label>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="mt-1 h-10 text-[13px]"
          >
            <option value="pendente">Pendente</option>
            <option value="concluido">Concluido</option>
            <option value="vencido">Vencido</option>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleBulkStatusChange()}
            disabled={bulkActionPending}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Bulk expiration dialog ── */}
      <Dialog
        open={bulkExpirationDialogOpen}
        onOpenChange={setBulkExpirationDialogOpen}
        title="Alterar validade"
        description={`Alterar a validade de ${selectedIds.size} treinamento(s)`}
      >
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Nova validade
          </Label>
          <Input
            type="date"
            value={bulkExpiration}
            onChange={(e) => setBulkExpiration(e.target.value)}
            className="mt-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBulkExpirationDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleBulkExpirationChange()}
            disabled={bulkActionPending || !bulkExpiration}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Edit / Create dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingTraining(null);
            setForm(getDefaultTrainingForm());
          }
        }}
        title={editingTraining ? "Editar treinamento" : "Atribuir treinamento"}
        description="Registro organizacional de treinamento"
        size="xl"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Colaborador *
            </Label>
            <Select
              value={form.employeeId}
              onChange={(event) =>
                setForm({ ...form, employeeId: event.target.value })
              }
              className="mt-1 h-10 text-[13px]"
            >
              <option value="">Selecionar colaborador</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Titulo *
            </Label>
            <Input
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              Descricao
            </Label>
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              className="mt-1"
              rows={3}
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Status
            </Label>
            <Select
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as CreateTrainingBodyStatus,
                })
              }
              className="mt-1 h-10 text-[13px]"
            >
              <option value="pendente">Pendente</option>
              <option value="concluido">Concluido</option>
              <option value="vencido">Vencido</option>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Data de conclusao
            </Label>
            <Input
              type="date"
              value={form.completionDate}
              onChange={(event) =>
                setForm({ ...form, completionDate: event.target.value })
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
              onChange={(event) =>
                setForm({ ...form, expirationDate: event.target.value })
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Carga horaria (horas)
            </Label>
            <Input
              type="number"
              value={form.workloadHours || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  workloadHours: Number(event.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialogOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              !form.employeeId ||
              !form.title ||
              createMutation.isPending ||
              updateMutation.isPending
            }
          >
            {editingTraining ? "Salvar" : "Atribuir"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── History dialog ── */}
      <Dialog
        open={!!historyTraining}
        onOpenChange={(open) => {
          if (!open) setHistoryTraining(null);
        }}
        title="Historico de eficacia"
        description={
          historyTraining
            ? historyTraining.title
            : "Historico do treinamento"
        }
        size="lg"
      >
        {historyTraining?.latestEffectivenessReview ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Ultima avaliacao</p>
              <p className="mt-1">
                {historyTraining.latestEffectivenessReview.isEffective
                  ? "Eficaz"
                  : "Ineficaz"}{" "}
                em {historyTraining.latestEffectivenessReview.evaluationDate}
              </p>
              {historyTraining.latestEffectivenessReview.comments ? (
                <p className="mt-2">
                  {historyTraining.latestEffectivenessReview.comments}
                </p>
              ) : null}
              {historyTraining.latestEffectivenessReview.attachments
                ?.length ? (
                <div className="mt-3">
                  <ProfileItemAttachmentsField
                    attachments={mapRecordAttachmentItems(
                      historyTraining.latestEffectivenessReview.attachments,
                    )}
                    emptyText=""
                    accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este treinamento ainda nao possui avaliacao de eficacia registrada.
          </p>
        )}
      </Dialog>
    </>
  );
}

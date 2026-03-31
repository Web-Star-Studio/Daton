import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrganizationTrainings,
  useListEmployeeCompetencyGaps,
  useListEmployees,
  useListUnits,
  useListDepartments,
  useListPositions,
  useListPositionCompetencyRequirements,
  useCreatePositionCompetencyRequirement,
  useUpdatePositionCompetencyRequirement,
  useDeletePositionCompetencyRequirement,
  useListPositionCompetencyMatrixRevisions,
  useCreateTraining,
  useUpdateTraining,
  useDeleteTraining,
  getListOrganizationTrainingsQueryKey,
  getListEmployeeCompetencyGapsQueryKey,
  getListDepartmentsQueryKey,
  getListPositionsQueryKey,
  getListPositionCompetencyRequirementsQueryKey,
  getListPositionCompetencyMatrixRevisionsQueryKey,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  CreateTrainingBodyStatus as CreateTrainingBodyStatusValues,
  CreateTrainingBodyTargetCompetencyType as CreateTrainingBodyTargetCompetencyTypeValues,
} from "@workspace/api-client-react";
import type {
  CreateTrainingBodyStatus,
  CreateTrainingBodyTargetCompetencyType,
  EmployeeCompetencyGap,
  EmployeeRecordAttachment,
  EmployeeTraining,
  Employee,
  ListOrganizationTrainingsEffectivenessStatus,
  ListOrganizationTrainingsStatus,
  OrganizationTraining,
  Position,
  PositionCompetencyMatrixRevision,
  PositionCompetencyRequirement,
  UpdateTrainingBodyStatus,
} from "@workspace/api-client-react";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ArrowLeft,
  BookCheck,
  Building2,
  ChevronRight,
  GraduationCap,
  History,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Target,
  Trash2,
  Users,
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

const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  formacao: "Formacao",
  experiencia: "Experiencia",
  habilidade: "Habilidade",
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

type RequirementForm = {
  competencyName: string;
  competencyType: PositionCompetencyRequirement["competencyType"];
  requiredLevel: number;
  notes: string;
  sortOrder: number;
};

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

function getDefaultRequirementForm(): RequirementForm {
  return {
    competencyName: "",
    competencyType: "habilidade",
    requiredLevel: 3,
    notes: "",
    sortOrder: 0,
  };
}

function TrainingDialog({
  open,
  onOpenChange,
  employees,
  value,
  onChange,
  onSubmit,
  pending,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  value: TrainingAdminForm;
  onChange: (value: TrainingAdminForm) => void;
  onSubmit: () => Promise<void>;
  pending?: boolean;
  title: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Registro organizacional de treinamento"
      size="xl"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Colaborador *
          </Label>
          <Select
            value={value.employeeId}
            onChange={(event) =>
              onChange({ ...value, employeeId: event.target.value })
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
            value={value.title}
            onChange={(event) =>
              onChange({ ...value, title: event.target.value })
            }
            className="mt-1"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            Descricao
          </Label>
          <Textarea
            value={value.description}
            onChange={(event) =>
              onChange({ ...value, description: event.target.value })
            }
            className="mt-1"
            rows={3}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            Objetivo
          </Label>
          <Textarea
            value={value.objective}
            onChange={(event) =>
              onChange({ ...value, objective: event.target.value })
            }
            className="mt-1"
            rows={3}
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Instituicao
          </Label>
          <Input
            value={value.institution}
            onChange={(event) =>
              onChange({ ...value, institution: event.target.value })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Carga horaria
          </Label>
          <Input
            type="number"
            value={value.workloadHours}
            onChange={(event) =>
              onChange({ ...value, workloadHours: Number(event.target.value) })
            }
            className="mt-1"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            Competencia-alvo
          </Label>
          <Input
            value={value.targetCompetencyName}
            onChange={(event) =>
              onChange({ ...value, targetCompetencyName: event.target.value })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Tipo da competencia
          </Label>
          <Select
            value={value.targetCompetencyType}
            onChange={(event) =>
              onChange({
                ...value,
                targetCompetencyType: event.target
                  .value as CreateTrainingBodyTargetCompetencyType,
              })
            }
            className="mt-1 h-10 text-[13px]"
          >
            <option
              value={CreateTrainingBodyTargetCompetencyTypeValues.formacao}
            >
              Formacao
            </option>
            <option
              value={CreateTrainingBodyTargetCompetencyTypeValues.experiencia}
            >
              Experiencia
            </option>
            <option
              value={CreateTrainingBodyTargetCompetencyTypeValues.habilidade}
            >
              Habilidade
            </option>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Nivel-alvo
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            value={value.targetCompetencyLevel}
            onChange={(event) =>
              onChange({
                ...value,
                targetCompetencyLevel: Number(event.target.value),
              })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Metodo de avaliacao
          </Label>
          <Input
            value={value.evaluationMethod}
            onChange={(event) =>
              onChange({ ...value, evaluationMethod: event.target.value })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Renovacao (meses)
          </Label>
          <Input
            type="number"
            value={value.renewalMonths}
            onChange={(event) =>
              onChange({ ...value, renewalMonths: Number(event.target.value) })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Status
          </Label>
          <Select
            value={value.status}
            onChange={(event) =>
              onChange({
                ...value,
                status: event.target.value as CreateTrainingBodyStatus,
              })
            }
            className="mt-1 h-10 text-[13px]"
          >
            <option value={CreateTrainingBodyStatusValues.pendente}>
              Pendente
            </option>
            <option value={CreateTrainingBodyStatusValues.concluido}>
              Concluido
            </option>
            <option value={CreateTrainingBodyStatusValues.vencido}>
              Vencido
            </option>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Conclusao
          </Label>
          <Input
            type="date"
            value={value.completionDate}
            onChange={(event) =>
              onChange({ ...value, completionDate: event.target.value })
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
            value={value.expirationDate}
            onChange={(event) =>
              onChange({ ...value, expirationDate: event.target.value })
            }
            className="mt-1"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!value.employeeId || !value.title || pending}
          onClick={() => void onSubmit()}
        >
          Salvar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function RequirementDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
  pending,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: RequirementForm;
  onChange: (value: RequirementForm) => void;
  onSubmit: () => Promise<void>;
  pending?: boolean;
  title: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Matriz de competencia por cargo"
      size="lg"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            Competencia *
          </Label>
          <Input
            value={value.competencyName}
            onChange={(event) =>
              onChange({ ...value, competencyName: event.target.value })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Tipo
          </Label>
          <Select
            value={value.competencyType}
            onChange={(event) =>
              onChange({
                ...value,
                competencyType: event.target
                  .value as RequirementForm["competencyType"],
              })
            }
            className="mt-1 h-10 text-[13px]"
          >
            <option value="formacao">Formacao</option>
            <option value="experiencia">Experiencia</option>
            <option value="habilidade">Habilidade</option>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Nivel requerido
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            value={value.requiredLevel}
            onChange={(event) =>
              onChange({ ...value, requiredLevel: Number(event.target.value) })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Ordem
          </Label>
          <Input
            type="number"
            value={value.sortOrder}
            onChange={(event) =>
              onChange({ ...value, sortOrder: Number(event.target.value) })
            }
            className="mt-1"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            Notas
          </Label>
          <Textarea
            value={value.notes}
            onChange={(event) =>
              onChange({ ...value, notes: event.target.value })
            }
            className="mt-1"
            rows={4}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!value.competencyName || pending}
          onClick={() => void onSubmit()}
        >
          Salvar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export default function ColaboradoresTreinamentosPage() {
  const { user } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = user?.organizationId;
  const canWriteEmployees = canWriteModule("employees");
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [activeTab, setActiveTab] = useState("treinamentos");
  const [search, setSearch] = useState("");
  const [unitId, setUnitId] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState<ListOrganizationTrainingsStatus | "">(
    "",
  );
  const [effectivenessStatus, setEffectivenessStatus] = useState<
    ListOrganizationTrainingsEffectivenessStatus | ""
  >("");
  const [expiringWithinDays, setExpiringWithinDays] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  const [historyTraining, setHistoryTraining] =
    useState<OrganizationTraining | null>(null);
  const [editingTraining, setEditingTraining] =
    useState<OrganizationTraining | null>(null);
  const [trainingForm, setTrainingForm] = useState<TrainingAdminForm>(
    getDefaultTrainingForm(),
  );
  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] =
    useState<PositionCompetencyRequirement | null>(null);
  const [requirementForm, setRequirementForm] = useState<RequirementForm>(
    getDefaultRequirementForm(),
  );
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [trainingPage, setTrainingPage] = useState(1);

  const trainingFilters = useMemo(
    () => ({
      page: trainingPage,
      pageSize: 500,
      search: search || undefined,
      unitId: unitId ? Number(unitId) : undefined,
      department: department || undefined,
      position: position || undefined,
      status: status || undefined,
      expiringWithinDays: expiringWithinDays
        ? Number(expiringWithinDays)
        : undefined,
      effectivenessStatus: effectivenessStatus || undefined,
    }),
    [
      department,
      effectivenessStatus,
      expiringWithinDays,
      position,
      search,
      status,
      trainingPage,
      unitId,
    ],
  );

  // Reset training page to 1 when filters change
  useEffect(() => {
    setTrainingPage(1);
  }, [
    search,
    unitId,
    department,
    position,
    status,
    effectivenessStatus,
    expiringWithinDays,
  ]);

  const gapFilters = useMemo(
    () => ({
      page: 1,
      pageSize: 100,
      search: search || undefined,
      unitId: unitId ? Number(unitId) : undefined,
      department: department || undefined,
      position: position || undefined,
      criticalOnly: criticalOnly || undefined,
    }),
    [criticalOnly, department, position, search, unitId],
  );

  const { data: trainingsResult, isLoading: trainingsLoading } =
    useListOrganizationTrainings(orgId ?? 0, trainingFilters, {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId ?? 0,
          trainingFilters,
        ),
      },
    });
  const trainings = trainingsResult?.data ?? [];
  const trainingsPagination = trainingsResult?.pagination;
  const trainingTotal = trainingsPagination?.total ?? 0;
  const trainingTotalPages = trainingsPagination?.totalPages ?? 0;

  type TrainingGroup = {
    title: string;
    trainings: typeof trainings;
    statusCounts: Record<string, number>;
  };

  const trainingGroups = useMemo<TrainingGroup[]>(() => {
    const map = new Map<string, typeof trainings>();
    for (const t of trainings) {
      const key = t.title;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([title, items]) => ({
      title,
      trainings: items,
      statusCounts: items.reduce(
        (acc, t) => {
          acc[t.status] = (acc[t.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    }));
  }, [trainings]);

  const { data: gapsResult, isLoading: gapsLoading } =
    useListEmployeeCompetencyGaps(orgId ?? 0, gapFilters, {
      query: {
        enabled: !!orgId,
        queryKey: getListEmployeeCompetencyGapsQueryKey(orgId ?? 0, gapFilters),
      },
    });
  const gaps = gapsResult?.data ?? [];
  const { data: employeesResult } = useListEmployees(orgId ?? 0, {
    page: 1,
    pageSize: 100,
  });
  const employees = employeesResult?.data ?? [];
  const { data: units = [] } = useListUnits(orgId ?? 0);
  const { data: departments = [] } = useListDepartments(orgId ?? 0, {
    query: {
      enabled: !!orgId,
      queryKey: getListDepartmentsQueryKey(orgId ?? 0),
    },
  });
  const { data: positions = [] } = useListPositions(orgId ?? 0, {
    query: { enabled: !!orgId, queryKey: getListPositionsQueryKey(orgId ?? 0) },
  });
  const selectedPosition =
    positions.find((item) => item.id === Number(selectedPositionId)) || null;
  const { data: requirements = [] } = useListPositionCompetencyRequirements(
    orgId ?? 0,
    Number(selectedPositionId || 0),
    {
      query: {
        enabled: !!orgId && !!selectedPositionId,
        queryKey: getListPositionCompetencyRequirementsQueryKey(
          orgId ?? 0,
          Number(selectedPositionId || 0),
        ),
      },
    },
  );
  const { data: revisions = [] } = useListPositionCompetencyMatrixRevisions(
    orgId ?? 0,
    Number(selectedPositionId || 0),
    {
      query: {
        enabled: !!orgId && !!selectedPositionId && revisionsOpen,
        queryKey: getListPositionCompetencyMatrixRevisionsQueryKey(
          orgId ?? 0,
          Number(selectedPositionId || 0),
        ),
      },
    },
  );

  const createTrainingMutation = useCreateTraining();
  const updateTrainingMutation = useUpdateTraining();
  const deleteTrainingMutation = useDeleteTraining();
  const createRequirementMutation = useCreatePositionCompetencyRequirement();
  const updateRequirementMutation = useUpdatePositionCompetencyRequirement();
  const deleteRequirementMutation = useDeletePositionCompetencyRequirement();

  usePageTitle("Treinamentos");

  useEffect(() => {
    if (!selectedPositionId && positions[0]?.id) {
      setSelectedPositionId(String(positions[0].id));
    }
  }, [positions, selectedPositionId]);

  const invalidateTrainingData = async (targetEmployeeId?: number) => {
    await queryClient.invalidateQueries({
      queryKey: getListOrganizationTrainingsQueryKey(
        orgId ?? 0,
        trainingFilters,
      ),
    });
    await queryClient.invalidateQueries({
      queryKey: getListEmployeesQueryKey(orgId ?? 0),
    });
    await queryClient.invalidateQueries({
      queryKey: getListEmployeeCompetencyGapsQueryKey(orgId ?? 0, gapFilters),
    });
    if (targetEmployeeId) {
      await queryClient.invalidateQueries({
        queryKey: getGetEmployeeQueryKey(orgId ?? 0, targetEmployeeId),
      });
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <Link href="/organizacao/colaboradores">
        <HeaderActionButton
          variant="outline"
          size="sm"
          className="cursor-pointer"
          label="Voltar"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
        />
      </Link>
      {canWriteEmployees && activeTab === "treinamentos" ? (
        <HeaderActionButton
          size="sm"
          onClick={() => {
            setEditingTraining(null);
            setTrainingForm(getDefaultTrainingForm());
            setTrainingDialogOpen(true);
          }}
          label="Novo treinamento"
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Novo treinamento
        </HeaderActionButton>
      ) : null}
      {canWriteEmployees && activeTab === "matriz" ? (
        <HeaderActionButton
          size="sm"
          disabled={!selectedPositionId}
          onClick={() => {
            setEditingRequirement(null);
            setRequirementForm(getDefaultRequirementForm());
            setRequirementDialogOpen(true);
          }}
          label="Novo requisito"
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Novo requisito
        </HeaderActionButton>
      ) : null}
    </div>
  );

  useHeaderActions(headerActions);

  const openEditTraining = (training: OrganizationTraining) => {
    setEditingTraining(training);
    setTrainingForm({
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
    setTrainingDialogOpen(true);
  };

  const handleSubmitTraining = async () => {
    const targetEmployeeId = Number(trainingForm.employeeId);

    if (editingTraining) {
      await updateTrainingMutation.mutateAsync({
        orgId: orgId ?? 0,
        empId: targetEmployeeId,
        trainId: editingTraining.id,
        data: {
          title: trainingForm.title,
          description: trainingForm.description || undefined,
          objective: trainingForm.objective || undefined,
          institution: trainingForm.institution || undefined,
          targetCompetencyName: trainingForm.targetCompetencyName || undefined,
          targetCompetencyType: trainingForm.targetCompetencyName
            ? trainingForm.targetCompetencyType
            : undefined,
          targetCompetencyLevel: trainingForm.targetCompetencyName
            ? trainingForm.targetCompetencyLevel
            : undefined,
          evaluationMethod: trainingForm.evaluationMethod || undefined,
          renewalMonths: trainingForm.renewalMonths || undefined,
          workloadHours: trainingForm.workloadHours || undefined,
          completionDate: trainingForm.completionDate || undefined,
          expirationDate: trainingForm.expirationDate || undefined,
          status: trainingForm.status as UpdateTrainingBodyStatus,
        },
      });
    } else {
      await createTrainingMutation.mutateAsync({
        orgId: orgId ?? 0,
        empId: targetEmployeeId,
        data: {
          title: trainingForm.title,
          description: trainingForm.description || undefined,
          objective: trainingForm.objective || undefined,
          institution: trainingForm.institution || undefined,
          targetCompetencyName: trainingForm.targetCompetencyName || undefined,
          targetCompetencyType: trainingForm.targetCompetencyName
            ? trainingForm.targetCompetencyType
            : undefined,
          targetCompetencyLevel: trainingForm.targetCompetencyName
            ? trainingForm.targetCompetencyLevel
            : undefined,
          evaluationMethod: trainingForm.evaluationMethod || undefined,
          renewalMonths: trainingForm.renewalMonths || undefined,
          workloadHours: trainingForm.workloadHours || undefined,
          completionDate: trainingForm.completionDate || undefined,
          expirationDate: trainingForm.expirationDate || undefined,
          status: trainingForm.status,
        },
      });
    }

    await invalidateTrainingData(targetEmployeeId);
    setTrainingDialogOpen(false);
    setEditingTraining(null);
    setTrainingForm(getDefaultTrainingForm());
  };

  const handleDeleteTraining = async (training: OrganizationTraining) => {
    await deleteTrainingMutation.mutateAsync({
      orgId: orgId ?? 0,
      empId: training.employeeId,
      trainId: training.id,
    });
    await invalidateTrainingData(training.employeeId);
  };

  const openEditRequirement = (requirement: PositionCompetencyRequirement) => {
    setEditingRequirement(requirement);
    setRequirementForm({
      competencyName: requirement.competencyName,
      competencyType: requirement.competencyType,
      requiredLevel: requirement.requiredLevel,
      notes: requirement.notes || "",
      sortOrder: requirement.sortOrder,
    });
    setRequirementDialogOpen(true);
  };

  const handleSubmitRequirement = async () => {
    const posId = Number(selectedPositionId);
    if (!posId) return;

    if (editingRequirement) {
      await updateRequirementMutation.mutateAsync({
        orgId: orgId ?? 0,
        posId,
        requirementId: editingRequirement.id,
        data: {
          competencyName: requirementForm.competencyName,
          competencyType: requirementForm.competencyType,
          requiredLevel: requirementForm.requiredLevel,
          notes: requirementForm.notes || undefined,
          sortOrder: requirementForm.sortOrder,
        },
      });
    } else {
      await createRequirementMutation.mutateAsync({
        orgId: orgId ?? 0,
        posId,
        data: {
          competencyName: requirementForm.competencyName,
          competencyType: requirementForm.competencyType,
          requiredLevel: requirementForm.requiredLevel,
          notes: requirementForm.notes || undefined,
          sortOrder: requirementForm.sortOrder,
        },
      });
    }

    await queryClient.invalidateQueries({
      queryKey: getListPositionCompetencyRequirementsQueryKey(
        orgId ?? 0,
        posId,
      ),
    });
    await queryClient.invalidateQueries({
      queryKey: getListPositionCompetencyMatrixRevisionsQueryKey(
        orgId ?? 0,
        posId,
      ),
    });
    await queryClient.invalidateQueries({
      queryKey: getListEmployeeCompetencyGapsQueryKey(orgId ?? 0, gapFilters),
    });
    setRequirementDialogOpen(false);
    setEditingRequirement(null);
    setRequirementForm(getDefaultRequirementForm());
  };

  const handleDeleteRequirement = async (requirementId: number) => {
    const posId = Number(selectedPositionId);
    if (!posId) return;
    await deleteRequirementMutation.mutateAsync({
      orgId: orgId ?? 0,
      posId,
      requirementId,
    });
    await queryClient.invalidateQueries({
      queryKey: getListPositionCompetencyRequirementsQueryKey(
        orgId ?? 0,
        posId,
      ),
    });
    await queryClient.invalidateQueries({
      queryKey: getListPositionCompetencyMatrixRevisionsQueryKey(
        orgId ?? 0,
        posId,
      ),
    });
    await queryClient.invalidateQueries({
      queryKey: getListEmployeeCompetencyGapsQueryKey(orgId ?? 0, gapFilters),
    });
  };

  const openGapTrainingShortcut = (gap: EmployeeCompetencyGap) => {
    const params = new URLSearchParams({
      tab: "treinamentos",
      createTraining: "1",
      trainingTitle: `Plano para ${gap.competencyName}`,
      objective: `Fechar a lacuna da competencia ${gap.competencyName} exigida para o cargo.`,
      targetCompetencyName: gap.competencyName,
      targetCompetencyType: gap.competencyType,
      targetCompetencyLevel: String(gap.requiredLevel),
      evaluationMethod: "Avaliar eficacia em campo",
    });
    navigate(
      `/organizacao/colaboradores/${gap.employeeId}?${params.toString()}`,
    );
  };

  if (!orgId) return null;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9 h-9 text-[13px]"
              placeholder="Colaborador, treinamento ou cargo"
            />
          </div>
          <Select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className="h-9 text-[13px] w-44"
          >
            <option value="">Todas as unidades</option>
            {units.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className="h-9 text-[13px] w-44"
          >
            <option value="">Todos departamentos</option>
            {departments.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            className="h-9 text-[13px] w-44"
          >
            <option value="">Todos os cargos</option>
            {positions.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </Select>
          {activeTab === "treinamentos" && (
            <>
              <Select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as ListOrganizationTrainingsStatus | "",
                  )
                }
                className="h-9 text-[13px] w-36"
              >
                <option value="">Todos status</option>
                <option value="pendente">Pendente</option>
                <option value="concluido">Concluido</option>
                <option value="vencido">Vencido</option>
              </Select>
              <Select
                value={effectivenessStatus}
                onChange={(event) =>
                  setEffectivenessStatus(
                    event.target.value as
                      | ListOrganizationTrainingsEffectivenessStatus
                      | "",
                  )
                }
                className="h-9 text-[13px] w-40"
              >
                <option value="">Toda eficacia</option>
                <option value="pending">Pendente</option>
                <option value="effective">Eficaz</option>
                <option value="ineffective">Ineficaz</option>
              </Select>
              <Input
                type="number"
                placeholder="Vence em (dias)"
                value={expiringWithinDays}
                onChange={(event) => setExpiringWithinDays(event.target.value)}
                className="h-9 text-[13px] w-36"
              />
            </>
          )}
        </div>

        {activeTab === "treinamentos" && trainingsResult?.stats && (
          <div className="grid grid-cols-5 gap-4">
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-xs font-medium text-muted-foreground">Total</p>
              <p className="mt-0.5 text-xl font-semibold text-foreground">
                {trainingsResult.stats.total}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-xs font-medium text-muted-foreground">
                Concluido
              </p>
              <p className="mt-0.5 text-xl font-semibold text-emerald-600">
                {trainingsResult.stats.concluido}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-xs font-medium text-muted-foreground">
                Pendente
              </p>
              <p className="mt-0.5 text-xl font-semibold text-amber-600">
                {trainingsResult.stats.pendente}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-xs font-medium text-muted-foreground">
                Vencido
              </p>
              <p className="mt-0.5 text-xl font-semibold text-red-600">
                {trainingsResult.stats.vencido}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md">
              <p className="text-xs font-medium text-muted-foreground">
                Eficacia pendente
              </p>
              <p className="mt-0.5 text-xl font-semibold text-sky-600">
                {trainingsResult.stats.effectivenessPending}
              </p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="treinamentos">Treinamentos</TabsTrigger>
            <TabsTrigger value="lacunas">Lacunas</TabsTrigger>
          </TabsList>

          <TabsContent value="treinamentos" className="space-y-4">
            {trainingsLoading ? (
              <div className="py-16 text-center text-[13px] text-muted-foreground">
                Carregando treinamentos...
              </div>
            ) : trainingGroups.length === 0 ? (
              /* ── Empty state ── */
              <div className="py-16 text-center">
                <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-[13px] text-muted-foreground">
                  Nenhum treinamento encontrado
                </p>
              </div>
            ) : (
              <>
                {/* ── Training groups list ── */}
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Treinamento
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Colaboradores
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Concluido
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Pendente
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                          Vencido
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainingGroups.map((group) => (
                        <tr
                          key={group.title}
                          className="border-b border-border/40 last:border-0 transition-colors hover:bg-secondary/30"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/organizacao/colaboradores/treinamentos/${encodeURIComponent(group.title)}`}
                              className="group flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              aria-label={`Ver detalhes do treinamento ${group.title}`}
                            >
                              <p className="text-[13px] font-medium text-foreground group-hover:text-foreground">
                                {group.title}
                              </p>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                              <Users className="h-3.5 w-3.5" />
                              {group.trainings.length}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-emerald-600 font-medium">
                            {group.statusCounts["concluido"] || 0}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-amber-600 font-medium">
                            {group.statusCounts["pendente"] || 0}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-red-600 font-medium">
                            {group.statusCounts["vencido"] || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {trainingTotalPages > 1 && (
                  <PaginationControls
                    page={trainingPage}
                    pageSize={trainingFilters.pageSize ?? 500}
                    total={trainingTotal}
                    totalPages={trainingTotalPages}
                    onPageChange={setTrainingPage}
                  />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="lacunas" className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={criticalOnly}
                  onChange={(event) => setCriticalOnly(event.target.checked)}
                />
                Mostrar apenas lacunas criticas
              </label>
            </div>

            {gapsLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Carregando lacunas...
              </div>
            ) : gaps.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                <Target className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma lacuna aberta para os filtros informados.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {gaps.map((gap) => (
                  <div
                    key={`${gap.employeeId}-${gap.competencyName}-${gap.competencyType}`}
                    className={cn(
                      "rounded-2xl border px-5 py-4",
                      gap.critical
                        ? "border-red-200 bg-red-50/60"
                        : "border-border/60 bg-card",
                    )}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {gap.employeeName}
                          </p>
                          {gap.critical ? (
                            <span className="rounded-full border border-red-200 bg-red-100 px-2 py-1 text-[11px] font-medium text-red-700">
                              Critica
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {gap.employeePosition || "Sem cargo"}
                          {gap.employeeDepartment
                            ? ` · ${gap.employeeDepartment}`
                            : ""}
                          {gap.unitName ? ` · ${gap.unitName}` : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full bg-secondary px-2 py-1">
                            Competencia: {gap.competencyName}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-1">
                            Tipo:{" "}
                            {COMPETENCY_TYPE_LABELS[gap.competencyType] ||
                              gap.competencyType}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-1">
                            Requerido {gap.requiredLevel}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-1">
                            Atual {gap.acquiredLevel}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-1">
                            Gap {gap.gapLevel}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-1">
                            Treinamentos relacionados {gap.relatedTrainingCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/organizacao/colaboradores/${gap.employeeId}?tab=competencias`}
                        >
                          <Button type="button" variant="outline" size="sm">
                            <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                            Abrir competencia
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openGapTrainingShortcut(gap)}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Criar treinamento
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <TrainingDialog
        open={trainingDialogOpen}
        onOpenChange={(open) => {
          setTrainingDialogOpen(open);
          if (!open) {
            setEditingTraining(null);
            setTrainingForm(getDefaultTrainingForm());
          }
        }}
        employees={employees}
        value={trainingForm}
        onChange={setTrainingForm}
        onSubmit={handleSubmitTraining}
        pending={
          createTrainingMutation.isPending || updateTrainingMutation.isPending
        }
        title={editingTraining ? "Editar treinamento" : "Novo treinamento"}
      />

      <RequirementDialog
        open={requirementDialogOpen}
        onOpenChange={(open) => {
          setRequirementDialogOpen(open);
          if (!open) {
            setEditingRequirement(null);
            setRequirementForm(getDefaultRequirementForm());
          }
        }}
        value={requirementForm}
        onChange={setRequirementForm}
        onSubmit={handleSubmitRequirement}
        pending={
          createRequirementMutation.isPending ||
          updateRequirementMutation.isPending
        }
        title={editingRequirement ? "Editar requisito" : "Novo requisito"}
      />

      <Dialog
        open={!!historyTraining}
        onOpenChange={(open) => {
          if (!open) setHistoryTraining(null);
        }}
        title="Historico de eficacia"
        description={
          historyTraining ? historyTraining.title : "Historico do treinamento"
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
              {historyTraining.latestEffectivenessReview.attachments?.length ? (
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
            <p className="text-sm text-muted-foreground">
              Para registrar novas avaliacoes de eficacia, abra o treinamento no
              detalhe do colaborador.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este treinamento ainda nao possui avaliacao de eficacia registrada.
          </p>
        )}
      </Dialog>

      <Drawer open={revisionsOpen} onOpenChange={setRevisionsOpen}>
        <DrawerContent className="mx-auto max-w-4xl">
          <DrawerHeader>
            <DrawerTitle>Revisoes da matriz</DrawerTitle>
            <DrawerDescription>
              {selectedPosition
                ? `Historico do cargo ${selectedPosition.name}`
                : "Historico de revisoes"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto px-4 pb-6">
            {revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma revisao registrada para este cargo.
              </p>
            ) : (
              revisions.map((revision: PositionCompetencyMatrixRevision) => (
                <div
                  key={revision.id}
                  className="rounded-2xl border border-border/60 bg-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      Revisao {revision.revisionNumber}
                    </span>
                    {revision.createdAt ? (
                      <span className="text-xs text-muted-foreground">
                        {revision.createdAt}
                      </span>
                    ) : null}
                    {revision.createdByName ? (
                      <span className="text-xs text-muted-foreground">
                        · {revision.createdByName}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {revision.snapshot.map((item) => (
                      <div
                        key={`${revision.id}-${item.id}`}
                        className="rounded-lg border border-border/50 px-3 py-2 text-xs"
                      >
                        <p className="font-medium text-foreground">
                          {item.competencyName}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {COMPETENCY_TYPE_LABELS[item.competencyType] ||
                            item.competencyType}{" "}
                          · nivel {item.requiredLevel}
                        </p>
                        {item.notes ? (
                          <p className="mt-1 text-muted-foreground">
                            {item.notes}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

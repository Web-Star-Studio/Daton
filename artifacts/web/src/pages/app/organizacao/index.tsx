import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { DialogStepTabs } from "@/components/ui/dialog-step-tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Pencil,
  RotateCcw,
  Search,
  ChevronRight,
  Building2,
  Upload,
  FileText,
  RefreshCw,
  SkipForward,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import * as XLSX from "xlsx";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import {
  GOAL_LABELS,
  MATURITY_LABELS,
  SECTOR_LABELS,
  SIZE_LABELS,
} from "@/lib/organization-onboarding";
import {
  useListUnits,
  useCreateUnit,
  useDeleteUnit,
  getListUnitsQueryKey,
  useListDepartments,
  useCreateDepartment,
  useDeleteDepartment,
  useUpdateDepartment,
  getListDepartmentsQueryKey,
  useListPositions,
  useCreatePosition,
  useDeletePosition,
  useBulkDeletePositions,
  useUpdatePosition,
  useImportPositions,
  getListPositionsQueryKey,
  useGetOrganization,
  useUpdateOrganization,
  useResetOrganizationOnboarding,
  getGetOrganizationQueryKey,
  type CreateUnitBody,
  type CreateUnitBodyType,
  type ImportResult,
  type CreatePositionBody,
} from "@workspace/api-client-react";

export type OrganizationSection =
  | "visao-geral"
  | "unidades"
  | "departamentos"
  | "cargos";

type UnitFormData = {
  name: string;
  code: string;
  type: string;
  cnpj: string;
  status: string;
  cep: string;
  address: string;
  streetNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  phone: string;
};

type SimpleFormData = {
  name: string;
  description: string;
};

type DepartmentFormData = {
  name: string;
  description: string;
  unitIds: number[];
};

type PositionFormData = {
  name: string;
  description: string;
  education: string;
  experience: string;
  requirements: string;
  responsibilities: string;
  level: string;
  minSalary: string;
  maxSalary: string;
};

type OrganizacaoPageProps = {
  section?: OrganizationSection;
} & Record<string, unknown>;

export default function OrganizacaoPage({
  section = "visao-geral",
}: OrganizacaoPageProps = {}) {
  const { organization, login } = useAuth();
  const { isOrgAdmin, canWriteModule } = usePermissions();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const activeTab = section;
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const { data: units, isLoading: unitsLoading } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });
  const createUnitMut = useCreateUnit();
  const deleteUnitMut = useDeleteUnit();
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitStep, setUnitStep] = useState(0);
  const [maxReachedUnitStep, setMaxReachedUnitStep] = useState(0);
  const unitForm = useForm<UnitFormData>({
    defaultValues: {
      name: "",
      code: "",
      type: "filial",
      cnpj: "",
      status: "ativa",
      cep: "",
      address: "",
      streetNumber: "",
      neighborhood: "",
      city: "",
      state: "",
      country: "Brasil",
      phone: "",
    },
  });

  // Units search, filters, selection
  const [unitSearch, setUnitSearch] = useState("");
  const [unitTypeFilter, setUnitTypeFilter] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [isDeletingUnits, setIsDeletingUnits] = useState(false);
  const [confirmDeleteUnitsOpen, setConfirmDeleteUnitsOpen] = useState(false);

  const sortedFilteredUnits = useMemo(() => {
    if (!units) return [];
    let filtered = [...units];
    if (unitSearch) {
      const q = unitSearch.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.code && u.code.toLowerCase().includes(q)),
      );
    }
    if (unitTypeFilter) filtered = filtered.filter((u) => u.type === unitTypeFilter);
    if (unitStatusFilter) filtered = filtered.filter((u) => u.status === unitStatusFilter);
    // Sede always first
    filtered.sort((a, b) => {
      if (a.type === "sede" && b.type !== "sede") return -1;
      if (a.type !== "sede" && b.type === "sede") return 1;
      return 0;
    });
    return filtered;
  }, [units, unitSearch, unitTypeFilter, unitStatusFilter]);

  const allUnitIds = useMemo(() => sortedFilteredUnits.map((u) => u.id), [sortedFilteredUnits]);
  const allUnitsSelected = allUnitIds.length > 0 && allUnitIds.every((id) => selectedUnitIds.has(id));

  const toggleAllUnits = () => {
    if (allUnitsSelected) setSelectedUnitIds(new Set());
    else setSelectedUnitIds(new Set(allUnitIds));
  };

  const toggleOneUnit = (id: number) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const executeBulkDeleteUnits = async () => {
    setIsDeletingUnits(true);
    try {
      for (const id of selectedUnitIds) {
        try { await deleteUnitMut.mutateAsync({ orgId: orgId!, unitId: id }); } catch {}
      }
      queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId!) });
      setSelectedUnitIds(new Set());
    } finally {
      setIsDeletingUnits(false);
      setConfirmDeleteUnitsOpen(false);
    }
  };

  useEffect(() => { setSelectedUnitIds(new Set()); }, [unitSearch, unitTypeFilter, unitStatusFilter]);

  const { data: departments, isLoading: deptsLoading } = useListDepartments(
    orgId!,
    {
      query: { queryKey: getListDepartmentsQueryKey(orgId!), enabled: !!orgId },
    },
  );
  const createDeptMut = useCreateDepartment();
  const updateDeptMut = useUpdateDepartment();
  const deleteDeptMut = useDeleteDepartment();
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [deptStep, setDeptStep] = useState(0);
  const [maxReachedDeptStep, setMaxReachedDeptStep] = useState(0);
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const deptForm = useForm<DepartmentFormData>({
    defaultValues: { name: "", description: "", unitIds: [] },
  });

  const { data: positions, isLoading: posLoading } = useListPositions(orgId!, {
    query: { queryKey: getListPositionsQueryKey(orgId!), enabled: !!orgId },
  });
  const createPosMut = useCreatePosition();
  const updatePosMut = useUpdatePosition();
  const deletePosMut = useDeletePosition();
  const bulkDeletePosMut = useBulkDeletePositions();
  const [selectedPosIds, setSelectedPosIds] = useState<Set<number>>(new Set());
  const [isDeletingPositions, setIsDeletingPositions] = useState(false);
  const [confirmDeletePosOpen, setConfirmDeletePosOpen] = useState(false);
  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [editingPosId, setEditingPosId] = useState<number | null>(null);
  const [posStep, setPosStep] = useState(0);
  const emptyPosForm: PositionFormData = {
    name: "",
    description: "",
    education: "",
    experience: "",
    requirements: "",
    responsibilities: "",
    level: "",
    minSalary: "",
    maxSalary: "",
  };
  const posForm = useForm<PositionFormData>({ defaultValues: emptyPosForm });
  const importPosMut = useImportPositions();
  const [posImportOpen, setPosImportOpen] = useState(false);
  const [posImportStep, setPosImportStep] = useState<1 | 2>(1);
  const [posImportResult, setPosImportResult] = useState<ImportResult | null>(null);
  const [posImportPreview, setPosImportPreview] = useState<{ total: number; newCount: number; existingCount: number; existingNames: string[] } | null>(null);
  const [posPendingFile, setPosPendingFile] = useState<File | null>(null);
  const [posParsedData, setPosParsedData] = useState<CreatePositionBody[]>([]);
  const [posConflictStrategy, setPosConflictStrategy] = useState<"skip" | "update">("skip");

  const allPosIds = useMemo(() => (positions ?? []).map((p) => p.id), [positions]);
  const allPosSelected = allPosIds.length > 0 && allPosIds.every((id) => selectedPosIds.has(id));

  const toggleAllPositions = () => {
    if (allPosSelected) setSelectedPosIds(new Set());
    else setSelectedPosIds(new Set(allPosIds));
  };

  const toggleOnePosition = (id: number) => {
    setSelectedPosIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const executeBulkDeletePositions = async () => {
    setIsDeletingPositions(true);
    try {
      await bulkDeletePosMut.mutateAsync({
        orgId: orgId!,
        data: { ids: Array.from(selectedPosIds) },
      });
      queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId!) });
      setSelectedPosIds(new Set());
    } finally {
      setIsDeletingPositions(false);
      setConfirmDeletePosOpen(false);
    }
  };

  const { data: orgData } = useGetOrganization(orgId!, {
    query: { queryKey: getGetOrganizationQueryKey(orgId!), enabled: !!orgId },
  });
  const updateOrgMut = useUpdateOrganization();
  const resetOnboardingMut = useResetOrganizationOnboarding();
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [orgForm, setOrgForm] = useState({
    name: "",
    tradeName: "",
    legalIdentifier: "",
    stateRegistration: "",
    openingDate: "",
    statusOperacional: "ativa",
  });

  React.useEffect(() => {
    if (orgData) {
      setOrgForm({
        name: orgData.name || "",
        tradeName: orgData.tradeName || "",
        legalIdentifier: orgData.legalIdentifier || "",
        stateRegistration: orgData.stateRegistration || "",
        openingDate: orgData.openingDate || "",
        statusOperacional: orgData.statusOperacional || "ativa",
      });
    }
  }, [orgData]);

  const handleSaveOrg = async () => {
    if (!orgId) return;
    await updateOrgMut.mutateAsync({
      orgId,
      data: {
        name: orgForm.name,
        tradeName: orgForm.tradeName || null,
        legalIdentifier: orgForm.legalIdentifier || null,
        stateRegistration: orgForm.stateRegistration || null,
        openingDate: orgForm.openingDate || null,
        statusOperacional: orgForm.statusOperacional || null,
      },
    });
    queryClient.invalidateQueries({
      queryKey: getGetOrganizationQueryKey(orgId),
    });
    setIsEditingOrg(false);
  };

  const sede = units?.find((u) => u.type === "sede");

  const headerActions = useMemo(() => {
    switch (activeTab) {
      case "visao-geral":
        if (!isOrgAdmin) return null;
        if (isEditingOrg) return null;
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!orgId) return;
                if (
                  !confirm(
                    "Tem certeza que deseja refazer o onboarding? Você será redirecionado para o fluxo inicial.",
                  )
                )
                  return;
                try {
                  const response = await resetOnboardingMut.mutateAsync({
                    orgId,
                  });
                  login(response.token);
                  navigate("/onboarding/organizacao");
                } catch (error: unknown) {
                  const message =
                    (error as { data?: { error?: string } })?.data?.error ||
                    "Não foi possível reiniciar o onboarding.";
                  toast({
                    title: "Falha ao reiniciar onboarding",
                    description: message,
                    variant: "destructive",
                  });
                }
              }}
              isLoading={resetOnboardingMut.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Refazer onboarding
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditingOrg(true)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar
            </Button>
          </div>
        );
      case "unidades":
        if (!canWriteModule("units")) return null;
        // Unit bulk actions moved to floating bar at bottom
        return (
          <Button
            size="sm"
            onClick={() => {
              setUnitStep(0);
              setMaxReachedUnitStep(0);
              unitForm.reset();
              setUnitDialogOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nova Unidade
          </Button>
        );
      case "departamentos":
        if (!canWriteModule("departments")) return null;
        return (
          <Button
            size="sm"
            onClick={() => {
              setDeptStep(0);
              setMaxReachedDeptStep(0);
              setEditingDeptId(null);
              deptForm.reset({ name: "", description: "", unitIds: [] });
              setDeptDialogOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Departamento
          </Button>
        );
      case "cargos":
        if (!canWriteModule("positions")) return null;
        // Position bulk actions moved to floating bar at bottom
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPosImportOpen(true)}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Importar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingPosId(null);
                posForm.reset(emptyPosForm);
                setPosStep(0);
                setPosDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo Cargo
            </Button>
          </div>
        );
    }
  }, [
    activeTab,
    canWriteModule,
    isEditingOrg,
    isDeletingUnits,
    isOrgAdmin,
    login,
    navigate,
    orgId,
    queryClient,
    resetOnboardingMut,
    selectedUnitIds,
  ]);
  useHeaderActions(headerActions);

  if (!orgId) return null;

  const onUnitSubmit = async (data: UnitFormData) => {
    const body: CreateUnitBody = {
      name: data.name,
      type: data.type as CreateUnitBodyType,
      code: data.code || undefined,
      cnpj: data.cnpj || undefined,
      status: data.status as "ativa" | "inativa",
      cep: data.cep || undefined,
      address: data.address || undefined,
      streetNumber: data.streetNumber || undefined,
      neighborhood: data.neighborhood || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      country: data.country || undefined,
      phone: data.phone || undefined,
    };
    await createUnitMut.mutateAsync({ orgId, data: body });
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
    setUnitDialogOpen(false);
    setUnitStep(0);
    setMaxReachedUnitStep(0);
    unitForm.reset();
  };

  const handleDeleteUnit = async (e: React.MouseEvent, unitId: number) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja remover esta unidade?")) return;
    await deleteUnitMut.mutateAsync({ orgId, unitId });
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
  };

  const onDeptSubmit = async (data: DepartmentFormData) => {
    const payload = {
      name: data.name,
      description: data.description || undefined,
      unitIds: data.unitIds,
    };
    if (editingDeptId) {
      await updateDeptMut.mutateAsync({ orgId, deptId: editingDeptId, data: payload });
    } else {
      await createDeptMut.mutateAsync({ orgId, data: payload });
    }
    queryClient.invalidateQueries({
      queryKey: getListDepartmentsQueryKey(orgId),
    });
    setDeptDialogOpen(false);
    setDeptStep(0);
    setMaxReachedDeptStep(0);
    setEditingDeptId(null);
    deptForm.reset();
  };

  const changeUnitStep = async (targetStep: number) => {
    const boundedTarget = Math.max(0, Math.min(targetStep, 2));

    if (boundedTarget > unitStep) {
      const fieldsByStep: Array<Array<keyof UnitFormData>> = [
        ["name", "code", "type", "status"],
        ["cnpj", "phone", "country"],
        ["cep", "address", "streetNumber", "neighborhood", "city", "state"],
      ];
      const valid = await unitForm.trigger(fieldsByStep[unitStep]);
      if (!valid) return;
    }

    setUnitStep(boundedTarget);
    setMaxReachedUnitStep((current) => Math.max(current, boundedTarget));
  };

  const changeDeptStep = async (targetStep: number) => {
    const boundedTarget = Math.max(0, Math.min(targetStep, 1));

    if (boundedTarget > deptStep) {
      const valid = await deptForm.trigger(["name", "description"]);
      if (!valid) return;
    }

    setDeptStep(boundedTarget);
    setMaxReachedDeptStep((current) => Math.max(current, boundedTarget));
  };

  const onPosSubmit = async (data: PositionFormData) => {
    const payload = {
      name: data.name,
      description: data.description || undefined,
      education: data.education || undefined,
      experience: data.experience || undefined,
      requirements: data.requirements || undefined,
      responsibilities: data.responsibilities || undefined,
      level: data.level || undefined,
      minSalary: data.minSalary ? parseInt(data.minSalary, 10) : undefined,
      maxSalary: data.maxSalary ? parseInt(data.maxSalary, 10) : undefined,
    };
    if (editingPosId) {
      await updatePosMut.mutateAsync({
        orgId,
        posId: editingPosId,
        data: payload,
      });
    } else {
      await createPosMut.mutateAsync({ orgId, data: payload });
    }
    queryClient.invalidateQueries({
      queryKey: getListPositionsQueryKey(orgId),
    });
    setPosDialogOpen(false);
    setEditingPosId(null);
    posForm.reset();
  };

  // --- Position import helpers ---
  const POSITION_COLUMN_MAP: Record<string, string> = {
    titulo: "name",
    título: "name",
    nome: "name",
    descricao: "description",
    descrição: "description",
    "escolaridade exigida": "education",
    escolaridade: "education",
    "experiência (anos)": "experience",
    "experiencia (anos)": "experience",
    experiência: "experience",
    experiencia: "experience",
    requisitos: "requirements",
    responsabilidades: "responsibilities",
    nivel: "level",
    nível: "level",
    "salário mínimo": "minSalary",
    "salario minimo": "minSalary",
    "salário máximo": "maxSalary",
    "salario maximo": "maxSalary",
  };

  function parsePositionXlsx(data: ArrayBuffer): CreatePositionBody[] {
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const results: CreatePositionBody[] = [];

    for (const row of rows) {
      const mapped: Record<string, unknown> = {};
      for (const [rawCol, rawVal] of Object.entries(row)) {
        const normalized = rawCol.trim().toLowerCase();
        const fieldName = POSITION_COLUMN_MAP[normalized];
        if (fieldName && rawVal != null && String(rawVal).trim() !== "") {
          mapped[fieldName] = rawVal;
        }
      }
      const name = String(mapped.name || "").trim();
      if (!name) continue;

      const requirements = mapped.requirements
        ? String(mapped.requirements).split(/[;\n]/).map((s: string) => s.trim()).filter(Boolean).join("\n")
        : undefined;

      results.push({
        name,
        description: mapped.description ? String(mapped.description).trim() : undefined,
        education: mapped.education ? String(mapped.education).trim() : undefined,
        experience: mapped.experience ? String(mapped.experience).trim() : undefined,
        requirements,
        responsibilities: mapped.responsibilities ? String(mapped.responsibilities).trim() : undefined,
        level: mapped.level ? String(mapped.level).trim() : undefined,
        minSalary: mapped.minSalary ? parseInt(String(mapped.minSalary), 10) || undefined : undefined,
        maxSalary: mapped.maxSalary ? parseInt(String(mapped.maxSalary), 10) || undefined : undefined,
      });
    }
    return results;
  }

  function analyzePositionImport(parsed: CreatePositionBody[], existing: { name: string }[]) {
    const existingSet = new Set(existing.map((p) => p.name.trim().toLowerCase()));
    const existingNames: string[] = [];
    let newCount = 0;
    let existingCount = 0;
    for (const p of parsed) {
      if (existingSet.has(p.name.trim().toLowerCase())) {
        existingCount++;
        if (existingNames.length < 10) existingNames.push(p.name);
      } else {
        newCount++;
      }
    }
    return { total: parsed.length, newCount, existingCount, existingNames };
  }

  const onPosFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result as ArrayBuffer;
      const parsed = parsePositionXlsx(data);
      setPosParsedData(parsed);
      const preview = analyzePositionImport(parsed, positions || []);
      setPosImportPreview(preview);
      setPosPendingFile(file);
    };
    reader.readAsArrayBuffer(file);
  };

  const onConfirmPosImport = async () => {
    if (!orgId || posParsedData.length === 0) return;
    const result = await importPosMut.mutateAsync({
      orgId,
      data: { positions: posParsedData, conflictStrategy: posConflictStrategy },
    });
    setPosImportResult(result as ImportResult);
    queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) });
  };

  const resetPosImport = () => {
    setPosImportResult(null);
    setPosImportPreview(null);
    setPosPendingFile(null);
    setPosParsedData([]);
    setPosConflictStrategy("skip");
    setPosImportStep(1);
    setPosImportOpen(false);
  };

  return (
    <>
      {activeTab === "visao-geral" && (
        <div className="space-y-10">
          {/* Dados Cadastrais */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Dados Cadastrais
            </h3>
            {isEditingOrg ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Razão Social</Label>
                  <Input
                    value={orgForm.name}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input
                    value={orgForm.legalIdentifier}
                    onChange={(e) =>
                      setOrgForm((f) => ({
                        ...f,
                        legalIdentifier: e.target.value,
                      }))
                    }
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div>
                  <Label>Nome Fantasia</Label>
                  <Input
                    value={orgForm.tradeName}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, tradeName: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Data de Abertura</Label>
                  <Input
                    value={orgForm.openingDate}
                    onChange={(e) =>
                      setOrgForm((f) => ({ ...f, openingDate: e.target.value }))
                    }
                    placeholder="AAAA-MM-DD"
                  />
                </div>
                <div>
                  <Label>Inscrição Estadual</Label>
                  <Input
                    value={orgForm.stateRegistration}
                    onChange={(e) =>
                      setOrgForm((f) => ({
                        ...f,
                        stateRegistration: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Status Operacional</Label>
                  <Select
                    value={orgForm.statusOperacional}
                    onChange={(e) =>
                      setOrgForm((f) => ({
                        ...f,
                        statusOperacional: e.target.value,
                      }))
                    }
                  >
                    <option value="ativa">Ativa</option>
                    <option value="inativa">Inativa</option>
                  </Select>
                </div>
                <div className="col-span-3 flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingOrg(false);
                      if (orgData)
                        setOrgForm({
                          name: orgData.name || "",
                          tradeName: orgData.tradeName || "",
                          legalIdentifier: orgData.legalIdentifier || "",
                          stateRegistration: orgData.stateRegistration || "",
                          openingDate: orgData.openingDate || "",
                          statusOperacional:
                            orgData.statusOperacional || "ativa",
                        });
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveOrg}
                    isLoading={updateOrgMut.isPending}
                    disabled={!orgForm.name}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Razão Social
                  </p>
                  <p className="text-[14px] text-foreground">
                    {orgData?.name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    CNPJ
                  </p>
                  <p className="text-[14px] text-foreground">
                    {orgData?.legalIdentifier || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Nome Fantasia
                  </p>
                  <p className="text-[14px] text-foreground">
                    {orgData?.tradeName || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Data de Abertura
                  </p>
                  <p className="text-[14px] text-foreground">
                    {orgData?.openingDate || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Inscrição Estadual
                  </p>
                  <p className="text-[14px] text-foreground">
                    {orgData?.stateRegistration || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                    Status Operacional
                  </p>
                  <p className="text-[14px] text-foreground">
                    {orgData?.statusOperacional === "ativa"
                      ? "Ativa"
                      : orgData?.statusOperacional === "inativa"
                        ? "Inativa"
                        : "—"}
                    {orgData?.statusOperacional === "ativa" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-2" />
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Perfil da Empresa (onboarding data) */}
          {orgData?.onboardingData?.companyProfile &&
            (() => {
              const profile = orgData.onboardingData.companyProfile;
              return (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
                    Perfil da Empresa
                  </h3>
                  <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                        Setor
                      </p>
                      <p className="text-[14px] text-foreground">
                        {profile.sector === "other" && profile.customSector
                          ? profile.customSector
                          : (SECTOR_LABELS[profile.sector] ?? profile.sector)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                        Porte
                      </p>
                      <p className="text-[14px] text-foreground">
                        {SIZE_LABELS[profile.size] ?? profile.size}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                        Maturidade
                      </p>
                      <p className="text-[14px] text-foreground">
                        {MATURITY_LABELS[profile.maturityLevel] ??
                          profile.maturityLevel}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-2.5">
                        Objetivos
                      </p>
                      {profile.goals.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {profile.goals.map((goal) => (
                            <span
                              key={goal}
                              className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-3 py-1 text-[12px] text-foreground"
                            >
                              {GOAL_LABELS[goal] ?? goal}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[14px] text-muted-foreground">—</p>
                      )}
                    </div>
                    {profile.currentChallenges.length > 0 && (
                      <div className="col-span-3">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-2.5">
                          Desafios Atuais
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {profile.currentChallenges.map((challenge) => (
                            <span
                              key={challenge}
                              className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-3 py-1 text-[12px] text-foreground"
                            >
                              {challenge}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* Dados Fiscais e Cadastrais */}
          {orgData &&
            (orgData.taxRegime ||
              orgData.primaryCnae ||
              orgData.municipalRegistration) && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
                  Dados Fiscais
                </h3>
                <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                  {orgData.taxRegime && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                        Regime Tributário
                      </p>
                      <p className="text-[14px] text-foreground">
                        {orgData.taxRegime}
                      </p>
                    </div>
                  )}
                  {orgData.primaryCnae && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                        CNAE Principal
                      </p>
                      <p className="text-[14px] text-foreground">
                        {orgData.primaryCnae}
                      </p>
                    </div>
                  )}
                  {orgData.municipalRegistration && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
                        Inscrição Municipal
                      </p>
                      <p className="text-[14px] text-foreground">
                        {orgData.municipalRegistration}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Sede Principal */}
          {sede && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
                Sede Principal
              </h3>
              <div className="bg-muted/30 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-br from-slate-200 to-slate-300 h-40 relative">
                  <div className="absolute bottom-4 left-4 bg-card rounded-xl shadow-sm p-4 max-w-xs">
                    <p className="text-[14px] font-semibold text-foreground">
                      {sede.name}
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {sede.city && sede.state
                        ? `${sede.city}, ${sede.state}`
                        : "Localização não informada"}
                      {sede.country ? `, ${sede.country}` : ""}
                    </p>
                    {(sede.address || sede.neighborhood) && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {[sede.address, sede.streetNumber]
                          .filter(Boolean)
                          .join(", ")}
                        {sede.neighborhood
                          ? ` \u2022 ${sede.neighborhood}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "unidades" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                placeholder="Buscar por nome ou código..."
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                className="pl-9 h-9 text-[13px]"
              />
            </div>
            <Select
              value={unitTypeFilter}
              onChange={(e) => setUnitTypeFilter(e.target.value)}
              className="h-9 text-[13px] w-36"
            >
              <option value="">Todos os tipos</option>
              <option value="sede">Sede</option>
              <option value="filial">Filial</option>
            </Select>
            <Select
              value={unitStatusFilter}
              onChange={(e) => setUnitStatusFilter(e.target.value)}
              className="h-9 text-[13px] w-36"
            >
              <option value="">Todos os status</option>
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
            </Select>
          </div>

          {unitsLoading ? (
            <div className="text-center py-16 text-[13px] text-muted-foreground">Carregando unidades...</div>
          ) : sortedFilteredUnits.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-[13px] text-muted-foreground">Nenhuma unidade encontrada</p>
              {canWriteModule("units") && !unitSearch && !unitTypeFilter && !unitStatusFilter && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setUnitStep(0);
                    setMaxReachedUnitStep(0);
                    unitForm.reset();
                    setUnitDialogOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Adicionar Unidade
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={allUnitsSelected}
                        onChange={toggleAllUnits}
                        className="rounded border-border text-primary cursor-pointer"
                        disabled={!canWriteModule("units") || sortedFilteredUnits.length === 0}
                      />
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Código</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Localização</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredUnits.map((unit) => {
                    const isSelected = selectedUnitIds.has(unit.id);
                    return (
                      <tr
                        key={unit.id}
                        className={cn(
                          "border-b border-border/40 last:border-0 transition-colors",
                          isSelected ? "bg-primary/5" : "hover:bg-secondary/30",
                        )}
                      >
                        <td className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOneUnit(unit.id)}
                            className="rounded border-border text-primary cursor-pointer"
                            disabled={!canWriteModule("units")}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            onClick={() => navigate(`/organizacao/unidades/${unit.id}`)}
                            className="text-[13px] font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
                          >
                            {unit.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">{unit.code || "—"}</td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {unit.city && unit.state ? `${unit.city}, ${unit.state}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={unit.type === "sede" ? "default" : "secondary"} className="uppercase text-[10px]">
                            {unit.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                            unit.status === "ativa"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-gray-50 text-gray-500 border-gray-200",
                          )}>
                            {unit.status === "ativa" ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span onClick={() => navigate(`/organizacao/unidades/${unit.id}`)} className="cursor-pointer">
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "departamentos" && (
        deptsLoading ? (
          <div className="text-center py-12 text-muted-foreground text-[13px]">Carregando...</div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Descrição</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {departments?.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground text-[13px]">
                      Nenhum departamento cadastrado.
                    </td>
                  </tr>
                )}
                {departments?.map((dept) => {
                  const deptUnits = (dept.unitIds || [])
                    .map((uid: number) => units?.find((u) => u.id === uid))
                    .filter(Boolean);
                  return (
                    <tr
                      key={dept.id}
                      className={cn(
                        "border-b border-border/40 last:border-0 transition-colors",
                        canWriteModule("departments") ? "hover:bg-secondary/30 cursor-pointer" : "",
                      )}
                      onClick={() => {
                        if (!canWriteModule("departments")) return;
                        setEditingDeptId(dept.id);
                        deptForm.reset({
                          name: dept.name,
                          description: dept.description || "",
                          unitIds: dept.unitIds || [],
                        });
                        setDeptStep(0);
                        setMaxReachedDeptStep(0);
                        setDeptDialogOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 text-[13px] font-medium text-foreground">{dept.name}</td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">{dept.description || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {deptUnits.length === 0 && <span className="text-[13px] text-muted-foreground">—</span>}
                          {deptUnits.map((u) => (
                            <Badge key={u!.id} variant="secondary" className="text-[11px]">
                              {u!.code || u!.name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === "cargos" &&
        (posLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Carregando...
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {canWriteModule("positions") && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allPosSelected}
                        onChange={toggleAllPositions}
                        className="rounded border-border text-primary cursor-pointer"
                        disabled={!positions || positions.length === 0}
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Título
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Escolaridade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Experiência
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions?.length === 0 && (
                  <tr>
                    <td
                      colSpan={canWriteModule("positions") ? 4 : 3}
                      className="px-6 py-12 text-center text-muted-foreground text-[13px]"
                    >
                      Nenhum cargo cadastrado.
                    </td>
                  </tr>
                )}
                {positions?.map((pos) => {
                  const isSelected = selectedPosIds.has(pos.id);
                  return (
                    <tr
                      key={pos.id}
                      className={cn(
                        "transition-colors",
                        isSelected ? "bg-primary/5" : "",
                        canWriteModule("positions")
                          ? "hover:bg-muted/50 cursor-pointer"
                          : "",
                      )}
                      onClick={() => {
                        if (!canWriteModule("positions")) return;
                        setEditingPosId(pos.id);
                        posForm.reset({
                          name: pos.name,
                          description: pos.description || "",
                          education: pos.education || "",
                          experience: pos.experience || "",
                          requirements: pos.requirements || "",
                          responsibilities: pos.responsibilities || "",
                          level: pos.level || "",
                          minSalary: pos.minSalary ? String(pos.minSalary) : "",
                          maxSalary: pos.maxSalary ? String(pos.maxSalary) : "",
                        });
                        setPosStep(0);
                        setPosDialogOpen(true);
                      }}
                    >
                      {canWriteModule("positions") && (
                        <td className="px-3 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOnePosition(pos.id)}
                            className="rounded border-border text-primary cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="text-[13px] font-medium text-foreground">
                          {pos.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[13px] text-muted-foreground">
                        {pos.education || "—"}
                      </td>
                      <td className="px-6 py-4 text-[13px] text-muted-foreground">
                        {pos.experience || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      <Dialog
        open={unitDialogOpen}
        onOpenChange={(open) => {
          setUnitDialogOpen(open);
          if (!open) {
            setUnitStep(0);
            setMaxReachedUnitStep(0);
            unitForm.reset();
          }
        }}
        title="Nova Unidade"
        description={
          [
            "Cadastre os dados básicos da unidade.",
            "Informe os dados de contato e identificação.",
            "Preencha o endereço da unidade.",
          ][unitStep]
        }
        size="lg"
      >
        <form onSubmit={unitForm.handleSubmit(onUnitSubmit)}>
          <DialogStepTabs
            steps={["Básico", "Contato", "Endereço"]}
            step={unitStep}
            onStepChange={(nextStep) => {
              void changeUnitStep(nextStep);
            }}
            maxAccessibleStep={maxReachedUnitStep}
          />

          {unitStep === 0 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <Label htmlFor="unit-name">Nome</Label>
                <Input
                  id="unit-name"
                  {...unitForm.register("name", { required: true })}
                  placeholder="Ex: Filial Recife"
                />
              </div>
              <div>
                <Label htmlFor="unit-code">Código</Label>
                <Input
                  id="unit-code"
                  {...unitForm.register("code")}
                  placeholder="FIL-001"
                />
              </div>
              <div>
                <Label htmlFor="unit-type">Tipo</Label>
                <Select id="unit-type" {...unitForm.register("type")}>
                  <option value="sede">Sede</option>
                  <option value="filial">Filial</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="unit-status">Status</Label>
                <Select id="unit-status" {...unitForm.register("status")}>
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                </Select>
              </div>
            </div>
          )}

          {unitStep === 1 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <Label>CNPJ</Label>
                <Input
                  {...unitForm.register("cnpj")}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  {...unitForm.register("phone")}
                  placeholder="(00) 0000-0000"
                />
              </div>
              <div>
                <Label htmlFor="unit-country">País</Label>
                <Input
                  id="unit-country"
                  {...unitForm.register("country")}
                  placeholder="Brasil"
                />
              </div>
            </div>
          )}

          {unitStep === 2 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <Label>CEP</Label>
                <Input {...unitForm.register("cep")} placeholder="00000-000" />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input
                  {...unitForm.register("address")}
                  placeholder="Rua, Avenida..."
                />
              </div>
              <div>
                <Label>Número</Label>
                <Input {...unitForm.register("streetNumber")} placeholder="100" />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input
                  {...unitForm.register("neighborhood")}
                  placeholder="Centro"
                />
              </div>
              <div>
                <Label htmlFor="unit-city">Cidade</Label>
                <Input
                  id="unit-city"
                  {...unitForm.register("city")}
                  placeholder="São Paulo"
                />
              </div>
              <div>
                <Label htmlFor="unit-state">Estado (UF)</Label>
                <Input
                  id="unit-state"
                  {...unitForm.register("state")}
                  placeholder="SP"
                  maxLength={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {unitStep > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void changeUnitStep(unitStep - 1);
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
                  setUnitDialogOpen(false);
                  setUnitStep(0);
                  setMaxReachedUnitStep(0);
                  unitForm.reset();
                }}
              >
                Cancelar
              </Button>
            )}
            {unitStep < 2 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void changeUnitStep(unitStep + 1);
                }}
              >
                Próximo
              </Button>
            ) : (
              <Button type="submit" size="sm" isLoading={createUnitMut.isPending}>
                Salvar
              </Button>
            )}
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={confirmDeleteUnitsOpen} onOpenChange={setConfirmDeleteUnitsOpen} title="Confirmar Exclusão">
        <p className="text-sm text-muted-foreground mt-2">
          Tem certeza que deseja excluir {selectedUnitIds.size} unidade{selectedUnitIds.size > 1 ? "s" : ""}?
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDeleteUnitsOpen(false)}>Cancelar</Button>
          <Button type="button" variant="destructive" size="sm" onClick={executeBulkDeleteUnits} isLoading={isDeletingUnits}>Excluir</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={confirmDeletePosOpen} onOpenChange={setConfirmDeletePosOpen} title="Confirmar Exclusão">
        <p className="text-sm text-muted-foreground mt-2">
          Tem certeza que deseja excluir {selectedPosIds.size} cargo{selectedPosIds.size > 1 ? "s" : ""}?
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDeletePosOpen(false)}>Cancelar</Button>
          <Button type="button" variant="destructive" size="sm" onClick={executeBulkDeletePositions} isLoading={isDeletingPositions}>Excluir</Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={deptDialogOpen}
        onOpenChange={(open) => {
          setDeptDialogOpen(open);
          if (!open) {
            setDeptStep(0);
            setMaxReachedDeptStep(0);
            setEditingDeptId(null);
            deptForm.reset({ name: "", description: "", unitIds: [] });
          }
        }}
        title={editingDeptId ? "Editar Departamento" : "Novo Departamento"}
        description={
          [
            "Defina os dados principais do departamento.",
            "Selecione as unidades vinculadas ao departamento.",
          ][deptStep]
        }
        size="lg"
      >
        <form onSubmit={deptForm.handleSubmit(onDeptSubmit)}>
          <DialogStepTabs
            steps={["Básico", "Unidades"]}
            step={deptStep}
            onStepChange={(nextStep) => {
              void changeDeptStep(nextStep);
            }}
            maxAccessibleStep={maxReachedDeptStep}
          />

          {deptStep === 0 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <Label>Nome</Label>
                <Input
                  {...deptForm.register("name", { required: true })}
                  placeholder="Nome do departamento"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  {...deptForm.register("description")}
                  placeholder="Descrição (opcional)"
                />
              </div>
            </div>
          )}

          {deptStep === 1 && units && units.length > 0 && (
            <div className="mt-1">
              <Label>Unidades</Label>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Selecione as unidades onde este departamento está presente.
                </p>
                <button
                  type="button"
                  className="cursor-pointer text-xs text-primary hover:underline"
                  onClick={() => {
                    const currentIds = deptForm.getValues("unitIds") || [];
                    const allIds = units.map((unit) => unit.id);
                    const allSelected = allIds.every((id) => currentIds.includes(id));
                    deptForm.setValue("unitIds", allSelected ? [] : allIds);
                  }}
                >
                  {(() => {
                    const currentIds = deptForm.watch("unitIds") || [];
                    const allIds = units.map((unit) => unit.id);
                    return allIds.every((id) => currentIds.includes(id))
                      ? "Desmarcar todas"
                      : "Selecionar todas";
                  })()}
                </button>
              </div>
              <div className="grid max-h-48 grid-cols-2 gap-x-6 gap-y-1 overflow-y-auto rounded-lg border border-border/60 p-3">
                {units.map((unit) => {
                  const selectedIds = deptForm.watch("unitIds") || [];
                  const isChecked = selectedIds.includes(unit.id);
                  return (
                    <label
                      key={unit.id}
                      className="flex cursor-pointer items-center gap-2 py-1.5 text-[13px] transition-colors hover:text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const current = deptForm.getValues("unitIds") || [];
                          deptForm.setValue(
                            "unitIds",
                            e.target.checked
                              ? [...current, unit.id]
                              : current.filter((id) => id !== unit.id),
                          );
                        }}
                        className="cursor-pointer rounded border-border text-primary"
                      />
                      <span className="truncate">{unit.name}</span>
                      <Badge variant="secondary" className="ml-auto shrink-0 text-[9px]">
                        {unit.type}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            {deptStep > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void changeDeptStep(deptStep - 1);
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
                  setDeptDialogOpen(false);
                  setDeptStep(0);
                  setMaxReachedDeptStep(0);
                  setEditingDeptId(null);
                  deptForm.reset({ name: "", description: "", unitIds: [] });
                }}
              >
                Cancelar
              </Button>
            )}
            {deptStep < 1 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void changeDeptStep(deptStep + 1);
                }}
              >
                Próximo
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                isLoading={createDeptMut.isPending || updateDeptMut.isPending}
              >
                {editingDeptId ? "Atualizar" : "Salvar"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        open={posDialogOpen}
        onOpenChange={setPosDialogOpen}
        title={editingPosId ? "Editar Cargo" : "Novo Cargo"}
        description={["Informações básicas", "Descrição do cargo", "Requisitos", "Responsabilidades", "Informações adicionais"][posStep]}
        size="lg"
      >
        <form onSubmit={posForm.handleSubmit(onPosSubmit)}>
          <div className="flex items-center gap-1 mb-5">
            {["Básico", "Descrição", "Requisitos", "Responsabilidades", "Adicional"].map((label, i) => (
              <React.Fragment key={label}>
                {i > 0 && <div className="h-px flex-1 bg-border" />}
                <button
                  type="button"
                  onClick={() => setPosStep(i)}
                  className={cn(
                    "text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors whitespace-nowrap cursor-pointer",
                    posStep === i
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              </React.Fragment>
            ))}
          </div>

          {posStep === 0 && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <Label>Título *</Label>
                <Input
                  {...posForm.register("name", { required: true })}
                  placeholder="Título do cargo"
                />
              </div>
              <div>
                <Label>Escolaridade</Label>
                <Input
                  {...posForm.register("education")}
                  placeholder="Ex: Ensino Superior em Engenharia"
                />
              </div>
              <div>
                <Label>Tempo de experiência</Label>
                <Input
                  {...posForm.register("experience")}
                  placeholder="Ex: 2 anos na área"
                />
              </div>
            </div>
          )}

          {posStep === 1 && (
            <div>
              <Label>Descrição</Label>
              <Textarea
                {...posForm.register("description")}
                placeholder="Descrição detalhada do cargo..."
                rows={10}
                className="mt-1"
              />
            </div>
          )}

          {posStep === 2 && (
            <div>
              <Label>Requisitos</Label>
              <Textarea
                {...posForm.register("requirements")}
                placeholder="Requisitos do cargo..."
                rows={10}
                className="mt-1"
              />
            </div>
          )}

          {posStep === 3 && (
            <div>
              <Label>Responsabilidades</Label>
              <Textarea
                {...posForm.register("responsibilities")}
                placeholder="Responsabilidades do cargo..."
                rows={10}
                className="mt-1"
              />
            </div>
          )}

          {posStep === 4 && (
            <div className="grid grid-cols-3 gap-x-8 gap-y-5">
              <div>
                <Label>Nível</Label>
                <Input
                  {...posForm.register("level")}
                  placeholder="Ex: Operacional, Gerencial"
                />
              </div>
              <div>
                <Label>Salário Mínimo</Label>
                <Input
                  {...posForm.register("minSalary")}
                  type="number"
                  placeholder="Ex: 2500"
                />
              </div>
              <div>
                <Label>Salário Máximo</Label>
                <Input
                  {...posForm.register("maxSalary")}
                  type="number"
                  placeholder="Ex: 5000"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {posStep > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setPosStep(posStep - 1)}>
                Anterior
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setPosDialogOpen(false)}>
                Cancelar
              </Button>
            )}
            {posStep < 4 ? (
              <Button type="button" size="sm" onClick={() => setPosStep(posStep + 1)}>
                Próximo
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                isLoading={createPosMut.isPending || updatePosMut.isPending}
              >
                {editingPosId ? "Atualizar" : "Salvar"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        open={posImportOpen}
        onOpenChange={(open) => { if (!open) resetPosImport(); else setPosImportOpen(true); }}
        title="Importar Cargos"
        description="Importe cargos a partir de uma planilha Excel"
        size="lg"
      >
        <div className="space-y-4">
          {posImportResult ? (
            <div className="space-y-4 text-center py-4">
              <p className="text-lg font-semibold text-foreground">Importação concluída</p>
              <div className="grid grid-cols-4 gap-3 text-center text-[13px]">
                <div>
                  <p className="text-xl font-bold text-emerald-600">{posImportResult.created}</p>
                  <p className="text-muted-foreground">criados</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-blue-600">{posImportResult.updated}</p>
                  <p className="text-muted-foreground">atualizados</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-500">{posImportResult.skipped}</p>
                  <p className="text-muted-foreground">ignorados</p>
                </div>
                {(posImportResult.errors ?? 0) > 0 && (
                  <div>
                    <p className="text-xl font-bold text-red-600">{posImportResult.errors}</p>
                    <p className="text-red-600">erros</p>
                  </div>
                )}
              </div>
              {posImportResult.errorDetails && posImportResult.errorDetails.length > 0 && (
                <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 text-[12px] max-h-40 overflow-y-auto space-y-1">
                  <p className="font-semibold text-red-700 mb-1">Detalhes dos erros:</p>
                  {posImportResult.errorDetails.map((ed, i) => (
                    <p key={i} className="text-red-600">
                      <strong>Linha {(ed.index ?? 0) + 1}:</strong> {ed.title} — {ed.error}
                    </p>
                  ))}
                </div>
              )}
              <div className="text-center">
                <Button onClick={resetPosImport} className="mt-1">Fechar</Button>
              </div>
            </div>
          ) : posImportStep === 1 ? (
            <>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center bg-secondary/30">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-3">
                  Anexe um arquivo <strong>.xlsx</strong> ou <strong>.csv</strong>
                </p>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="max-w-[280px] mx-auto block"
                  onChange={onPosFileSelected}
                  disabled={importPosMut.isPending}
                />
              </div>
              {posPendingFile && (
                <p className="text-[13px] text-muted-foreground text-center">
                  Arquivo selecionado: <strong>{posPendingFile.name}</strong>
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={resetPosImport}>Cancelar</Button>
                <Button size="sm" onClick={() => setPosImportStep(2)} disabled={!posPendingFile || !posImportPreview}>
                  Continuar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="bg-secondary/50 border border-border rounded-xl p-4">
                  <p className="font-medium text-foreground mb-3">Análise da planilha</p>
                  <div className="grid grid-cols-2 gap-3 text-center text-[13px]">
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{posImportPreview?.newCount ?? 0}</p>
                      <p className="text-muted-foreground">novos</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-amber-600">{posImportPreview?.existingCount ?? 0}</p>
                      <p className="text-muted-foreground">já cadastrados</p>
                    </div>
                  </div>
                </div>

                {posImportPreview && posImportPreview.existingCount > 0 && (
                  <div className="space-y-2">
                    <p className="text-[13px] font-medium text-foreground">
                      {posImportPreview.existingCount} cargos já existem (identificados pelo nome). O que fazer com eles?
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPosConflictStrategy("skip")}
                        className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                          posConflictStrategy === "skip" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <SkipForward className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-[13px]">Ignorar</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Manter os dados atuais sem alteração</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPosConflictStrategy("update")}
                        className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                          posConflictStrategy === "update" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <RefreshCw className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-[13px]">Atualizar</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Sobrescrever com os dados da planilha</p>
                      </button>
                    </div>
                    {posImportPreview.existingNames.length > 0 && (
                      <details className="text-[12px] text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">
                          Ver exemplos de cargos já cadastrados ({posImportPreview.existingCount > 10 ? `mostrando 10 de ${posImportPreview.existingCount}` : posImportPreview.existingCount})
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                          {posImportPreview.existingNames.map((name, i) => (
                            <li key={i}>{name}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setPosImportStep(1)}>Voltar</Button>
                <Button
                  size="sm"
                  onClick={onConfirmPosImport}
                  disabled={!posPendingFile || !posImportPreview || posImportPreview.total === 0 || importPosMut.isPending}
                  isLoading={importPosMut.isPending}
                >
                  Importar ({posImportPreview?.total || 0})
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </Dialog>

      {/* Floating bulk action bars */}
      {hasMounted && activeTab === "unidades" && canWriteModule("units") && selectedUnitIds.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-lg backdrop-blur-xl">
              <span className="px-2 text-[13px] font-medium text-foreground">
                {selectedUnitIds.size} unidade{selectedUnitIds.size > 1 ? "s" : ""} selecionada{selectedUnitIds.size > 1 ? "s" : ""}
              </span>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDeleteUnitsOpen(true)}
                    disabled={isDeletingUnits}
                    aria-label="Excluir unidades selecionadas"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Excluir selecionadas</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setSelectedUnitIds(new Set())}
                    aria-label="Limpar seleção de unidades"
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
      {hasMounted && activeTab === "cargos" && canWriteModule("positions") && selectedPosIds.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-lg backdrop-blur-xl">
              <span className="px-2 text-[13px] font-medium text-foreground">
                {selectedPosIds.size} cargo{selectedPosIds.size > 1 ? "s" : ""} selecionado{selectedPosIds.size > 1 ? "s" : ""}
              </span>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDeletePosOpen(true)}
                    disabled={isDeletingPositions}
                    aria-label="Excluir cargos selecionados"
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
                    onClick={() => setSelectedPosIds(new Set())}
                    aria-label="Limpar seleção de cargos"
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

function SimpleTable({
  items,
  isLoading,
  entityName,
  canWrite,
  onEdit,
  onDelete,
}: {
  items:
    | Array<{ id: number; name: string; description?: string | null }>
    | undefined;
  isLoading: boolean;
  entityName: string;
  canWrite: boolean;
  onEdit: (item: {
    id: number;
    name: string;
    description?: string | null;
  }) => void;
  onDelete: (id: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Nome
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Descrição
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items?.length === 0 && (
            <tr>
              <td
                colSpan={2}
                className="px-6 py-12 text-center text-muted-foreground text-[13px]"
              >
                Nenhum {entityName} cadastrado.
              </td>
            </tr>
          )}
          {items?.map((item) => (
            <tr
              key={item.id}
              className={cn(
                "transition-colors",
                canWrite ? "hover:bg-muted/50 cursor-pointer" : "",
              )}
              onClick={() => canWrite && onEdit(item)}
            >
              <td className="px-6 py-4 text-[13px] font-medium text-foreground">
                {item.name}
              </td>
              <td className="px-6 py-4 text-[13px] text-muted-foreground">
                {item.description || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import React, { useState, useMemo } from "react";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Mail, X, Clock, CheckCircle2, XCircle, Shield, ShieldCheck, Eye, Settings2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListUnits, useCreateUnit, useDeleteUnit, getListUnitsQueryKey,
  useListDepartments, useCreateDepartment, useDeleteDepartment, useUpdateDepartment, getListDepartmentsQueryKey,
  useListPositions, useCreatePosition, useDeletePosition, useUpdatePosition, getListPositionsQueryKey,
  useGetOrganization, useUpdateOrganization, getGetOrganizationQueryKey,
  useListInvitations, useCreateInvitation, useRevokeInvitation, useDeleteInvitation, getListInvitationsQueryKey,
  useListOrgUsers, useUpdateUserRole, useUpdateUserModules, getListOrgUsersQueryKey,
  type CreateUnitBody, type CreateUnitBodyType,
} from "@workspace/api-client-react";

type Tab = "visao-geral" | "unidades" | "departamentos" | "cargos" | "usuarios";

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

type PositionFormData = {
  name: string;
  description: string;
  education: string;
  experience: string;
  requirements: string;
  responsibilities: string;
};

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Admin Plataforma",
  org_admin: "Admin Organização",
  operator: "Operador",
  analyst: "Analista",
};

const MODULE_LABELS: Record<string, string> = {
  documents: "Documentos",
  legislations: "Legislações",
  employees: "Colaboradores",
  units: "Unidades",
  departments: "Departamentos",
  positions: "Cargos",
};

const ALL_MODULES = ["documents", "legislations", "employees", "units", "departments", "positions"];

export default function OrganizacaoPage() {
  const { organization, user: currentUser } = useAuth();
  const { isOrgAdmin, canWrite, hasModuleAccess } = usePermissions();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("visao-geral");

  const { data: units, isLoading: unitsLoading } = useListUnits(orgId!, { query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId } });
  const createUnitMut = useCreateUnit();
  const deleteUnitMut = useDeleteUnit();
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const unitForm = useForm<UnitFormData>({
    defaultValues: {
      name: "", code: "", type: "filial", cnpj: "", status: "ativa",
      cep: "", address: "", streetNumber: "", neighborhood: "",
      city: "", state: "", country: "Brasil", phone: "",
    }
  });

  const { data: departments, isLoading: deptsLoading } = useListDepartments(orgId!, { query: { queryKey: getListDepartmentsQueryKey(orgId!), enabled: !!orgId } });
  const createDeptMut = useCreateDepartment();
  const updateDeptMut = useUpdateDepartment();
  const deleteDeptMut = useDeleteDepartment();
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const deptForm = useForm<SimpleFormData>({ defaultValues: { name: "", description: "" } });

  const { data: positions, isLoading: posLoading } = useListPositions(orgId!, { query: { queryKey: getListPositionsQueryKey(orgId!), enabled: !!orgId } });
  const createPosMut = useCreatePosition();
  const updatePosMut = useUpdatePosition();
  const deletePosMut = useDeletePosition();
  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [editingPosId, setEditingPosId] = useState<number | null>(null);
  const emptyPosForm: PositionFormData = { name: "", description: "", education: "", experience: "", requirements: "", responsibilities: "" };
  const posForm = useForm<PositionFormData>({ defaultValues: emptyPosForm });

  const { data: orgData } = useGetOrganization(orgId!, { query: { queryKey: getGetOrganizationQueryKey(orgId!), enabled: !!orgId } });
  const updateOrgMut = useUpdateOrganization();
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [orgForm, setOrgForm] = useState({
    name: "", nomeFantasia: "", cnpj: "", inscricaoEstadual: "", dataFundacao: "", statusOperacional: "ativa",
  });

  const { data: invitationsData, isLoading: invitationsLoading } = useListInvitations({ query: { queryKey: getListInvitationsQueryKey(), enabled: activeTab === "usuarios" } });
  const createInviteMut = useCreateInvitation();
  const revokeInviteMut = useRevokeInvitation();
  const deleteInviteMut = useDeleteInvitation();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<number>>(new Set());

  const { data: orgUsersData, isLoading: orgUsersLoading } = useListOrgUsers(orgId!, { query: { queryKey: getListOrgUsersQueryKey(orgId!), enabled: !!orgId && activeTab === "usuarios" } });
  const updateRoleMut = useUpdateUserRole();
  const updateModulesMut = useUpdateUserModules();
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: number; name: string; email: string; role: string; modules: string[] } | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editModules, setEditModules] = useState<string[]>([]);

  React.useEffect(() => {
    if (orgData) {
      setOrgForm({
        name: orgData.name || "",
        nomeFantasia: orgData.nomeFantasia || "",
        cnpj: orgData.cnpj || "",
        inscricaoEstadual: orgData.inscricaoEstadual || "",
        dataFundacao: orgData.dataFundacao || "",
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
        nomeFantasia: orgForm.nomeFantasia || null,
        cnpj: orgForm.cnpj || null,
        inscricaoEstadual: orgForm.inscricaoEstadual || null,
        dataFundacao: orgForm.dataFundacao || null,
        statusOperacional: orgForm.statusOperacional || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey(orgId) });
    setIsEditingOrg(false);
  };

  const sede = units?.find((u) => u.type === "sede");

  const headerActions = useMemo(() => {
    switch (activeTab) {
      case "visao-geral":
        if (!canWrite) return null;
        return isEditingOrg ? null : (
          <Button size="sm" variant="outline" onClick={() => setIsEditingOrg(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Editar
          </Button>
        );
      case "unidades":
        if (!canWrite) return null;
        return (
          <Button size="sm" onClick={() => setUnitDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nova Unidade
          </Button>
        );
      case "departamentos":
        if (!canWrite) return null;
        return (
          <Button size="sm" onClick={() => { setEditingDeptId(null); deptForm.reset({ name: "", description: "" }); setDeptDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Departamento
          </Button>
        );
      case "cargos":
        if (!canWrite) return null;
        return (
          <Button size="sm" onClick={() => { setEditingPosId(null); posForm.reset(emptyPosForm); setPosDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Cargo
          </Button>
        );
      case "usuarios":
        if (!isOrgAdmin) return null;
        if (selectedInviteIds.size > 0) {
          const selectedInvites = invitationsData?.invitations?.filter(inv => selectedInviteIds.has(inv.id)) || [];
          const pendingIds = selectedInvites.filter(inv => inv.status === "pending").map(inv => inv.id);
          const deletableIds = selectedInvites.filter(inv => inv.status !== "pending").map(inv => inv.id);
          return (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">
                {selectedInviteIds.size} selecionado{selectedInviteIds.size > 1 ? "s" : ""}
              </span>
              {pendingIds.length > 0 && (
                <Button size="sm" variant="destructive" onClick={async () => {
                  for (const id of pendingIds) {
                    try { await revokeInviteMut.mutateAsync({ invitationId: id }); } catch {}
                  }
                  queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
                  setSelectedInviteIds(new Set());
                }} isLoading={revokeInviteMut.isPending}>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Revogar ({pendingIds.length})
                </Button>
              )}
              {deletableIds.length > 0 && (
                <Button size="sm" variant="destructive" onClick={async () => {
                  for (const id of deletableIds) {
                    try { await deleteInviteMut.mutateAsync({ invitationId: id }); } catch {}
                  }
                  queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
                  setSelectedInviteIds(new Set());
                }} isLoading={deleteInviteMut.isPending}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Excluir ({deletableIds.length})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setSelectedInviteIds(new Set())}>
                Cancelar
              </Button>
            </div>
          );
        }
        return (
          <Button size="sm" onClick={() => { setInviteEmail(""); setInviteError(""); setInviteDialogOpen(true); }}>
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Convidar Usuário
          </Button>
        );
    }
  }, [activeTab, isEditingOrg, selectedInviteIds, invitationsData, canWrite, isOrgAdmin]);
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
    unitForm.reset();
  };

  const handleDeleteUnit = async (e: React.MouseEvent, unitId: number) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja remover esta unidade?")) return;
    await deleteUnitMut.mutateAsync({ orgId, unitId });
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
  };

  const onDeptSubmit = async (data: SimpleFormData) => {
    if (editingDeptId) {
      await updateDeptMut.mutateAsync({ orgId, deptId: editingDeptId, data: { name: data.name, description: data.description || undefined } });
    } else {
      await createDeptMut.mutateAsync({ orgId, data: { name: data.name, description: data.description || undefined } });
    }
    queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey(orgId) });
    setDeptDialogOpen(false);
    setEditingDeptId(null);
    deptForm.reset();
  };

  const onPosSubmit = async (data: PositionFormData) => {
    const payload = {
      name: data.name,
      description: data.description || undefined,
      education: data.education || undefined,
      experience: data.experience || undefined,
      requirements: data.requirements || undefined,
      responsibilities: data.responsibilities || undefined,
    };
    if (editingPosId) {
      await updatePosMut.mutateAsync({ orgId, posId: editingPosId, data: payload });
    } else {
      await createPosMut.mutateAsync({ orgId, data: payload });
    }
    queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) });
    setPosDialogOpen(false);
    setEditingPosId(null);
    posForm.reset();
  };

  const allTabs: { key: Tab; label: string; module?: string }[] = [
    { key: "visao-geral", label: "Visão Geral" },
    { key: "unidades", label: "Unidades", module: "units" },
    { key: "departamentos", label: "Departamentos", module: "departments" },
    { key: "cargos", label: "Cargos", module: "positions" },
    { key: "usuarios", label: "Usuários" },
  ];
  const tabs = allTabs.filter(t => !t.module || hasModuleAccess(t.module as any));

  return (
    <>
      <div className="mb-6">
        <nav className="flex items-center gap-6 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedInviteIds(new Set()); }}
              className={cn(
                "relative pb-2.5 text-[13px] font-medium transition-colors duration-200 cursor-pointer hover:text-foreground",
                activeTab === tab.key
                  ? "text-foreground font-semibold after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-foreground after:rounded-full"
                  : "text-muted-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "visao-geral" && (
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Dados Cadastrais</h3>
            {isEditingOrg ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Razão Social</Label>
                  <Input value={orgForm.name} onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input value={orgForm.cnpj} onChange={(e) => setOrgForm((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <Label>Nome Fantasia</Label>
                  <Input value={orgForm.nomeFantasia} onChange={(e) => setOrgForm((f) => ({ ...f, nomeFantasia: e.target.value }))} />
                </div>
                <div>
                  <Label>Data de Fundação</Label>
                  <Input value={orgForm.dataFundacao} onChange={(e) => setOrgForm((f) => ({ ...f, dataFundacao: e.target.value }))} placeholder="DD/MM/AAAA" />
                </div>
                <div>
                  <Label>Inscrição Estadual</Label>
                  <Input value={orgForm.inscricaoEstadual} onChange={(e) => setOrgForm((f) => ({ ...f, inscricaoEstadual: e.target.value }))} />
                </div>
                <div>
                  <Label>Status Operacional</Label>
                  <Select value={orgForm.statusOperacional} onChange={(e) => setOrgForm((f) => ({ ...f, statusOperacional: e.target.value }))}>
                    <option value="ativa">Ativa</option>
                    <option value="inativa">Inativa</option>
                  </Select>
                </div>
                <div className="col-span-3 flex justify-end gap-3 pt-2">
                  <Button variant="outline" size="sm" onClick={() => { setIsEditingOrg(false); if (orgData) setOrgForm({ name: orgData.name || "", nomeFantasia: orgData.nomeFantasia || "", cnpj: orgData.cnpj || "", inscricaoEstadual: orgData.inscricaoEstadual || "", dataFundacao: orgData.dataFundacao || "", statusOperacional: orgData.statusOperacional || "ativa" }); }}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveOrg} isLoading={updateOrgMut.isPending} disabled={!orgForm.name}>
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-8 gap-y-5">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Razão Social</p>
                  <p className="text-[14px] font-medium text-foreground">{orgData?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">CNPJ</p>
                  <p className="text-[14px] font-medium text-foreground">{orgData?.cnpj || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Nome Fantasia</p>
                  <p className="text-[14px] font-medium text-foreground">{orgData?.nomeFantasia || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Data de Fundação</p>
                  <p className="text-[14px] font-medium text-foreground">{orgData?.dataFundacao || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Inscrição Estadual</p>
                  <p className="text-[14px] font-medium text-foreground">{orgData?.inscricaoEstadual || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Status Operacional</p>
                  <p className="text-[14px] font-medium text-foreground">
                    {orgData?.statusOperacional === "ativa" ? "Ativa" : orgData?.statusOperacional === "inativa" ? "Inativa" : "—"}
                    {orgData?.statusOperacional === "ativa" && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-2" />}
                  </p>
                </div>
              </div>
            )}
          </div>

          {sede && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Sede Principal</h3>
              <div className="bg-muted/30 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-br from-slate-200 to-slate-300 h-40 relative">
                  <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-sm p-4 max-w-xs">
                    <p className="text-[14px] font-semibold text-foreground">{sede.name}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {sede.city && sede.state ? `${sede.city}, ${sede.state}` : "Localização não informada"}{sede.country ? `, ${sede.country}` : ""}
                    </p>
                    {(sede.address || sede.neighborhood) && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {[sede.address, sede.streetNumber].filter(Boolean).join(", ")}
                        {sede.neighborhood ? ` \u2022 ${sede.neighborhood}` : ""}
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
        <>
          {unitsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando unidades...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {units?.map((unit) => (
                <div
                  key={unit.id}
                  onClick={() => navigate(`/app/organizacao/unidades/${unit.id}`)}
                  className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow group cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-[15px] font-semibold text-foreground">{unit.name}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant={unit.type === 'sede' ? 'default' : 'secondary'} className="uppercase text-[10px]">
                        {unit.type}
                      </Badge>
                      {canWrite && (
                        <button
                          onClick={(e) => handleDeleteUnit(e, unit.id)}
                          className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {unit.city && unit.state ? `${unit.city}, ${unit.state}` : 'Endereço não informado'}
                  </p>
                </div>
              ))}
              {units?.length === 0 && (
                <div className="col-span-full text-center py-12 bg-card rounded-xl border border-dashed border-border">
                  <p className="text-muted-foreground text-[13px]">Nenhuma unidade cadastrada.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "departamentos" && (
        <SimpleTable
          items={departments}
          isLoading={deptsLoading}
          entityName="departamento"
          onEdit={(item) => { setEditingDeptId(item.id); deptForm.reset({ name: item.name, description: item.description || "" }); setDeptDialogOpen(true); }}
          onDelete={async (id) => {
            if (!confirm("Tem certeza que deseja remover?")) return;
            await deleteDeptMut.mutateAsync({ orgId, deptId: id });
            queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey(orgId) });
          }}
        />
      )}

      {activeTab === "cargos" && (
        posLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Título</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Escolaridade</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Experiência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions?.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground text-[13px]">
                      Nenhum cargo cadastrado.
                    </td>
                  </tr>
                )}
                {positions?.map((pos) => (
                  <tr key={pos.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { setEditingPosId(pos.id); posForm.reset({ name: pos.name, description: pos.description || "", education: pos.education || "", experience: pos.experience || "", requirements: pos.requirements || "", responsibilities: pos.responsibilities || "" }); setPosDialogOpen(true); }}>
                    <td className="px-6 py-4">
                      <div className="text-[13px] font-medium text-foreground">{pos.name}</div>
                      {pos.description && <div className="text-xs text-muted-foreground mt-0.5">{pos.description}</div>}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-muted-foreground">{pos.education || "—"}</td>
                    <td className="px-6 py-4 text-[13px] text-muted-foreground">{pos.experience || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === "usuarios" && (
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Membros da Organização</h3>
            {orgUsersLoading ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cargo</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Módulos</th>
                      {isOrgAdmin && <th className="px-6 py-3 w-16" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(!orgUsersData?.users || orgUsersData.users.length === 0) && (
                      <tr>
                        <td colSpan={isOrgAdmin ? 5 : 4} className="px-6 py-12 text-center text-muted-foreground text-[13px]">
                          Nenhum usuário encontrado.
                        </td>
                      </tr>
                    )}
                    {orgUsersData?.users?.map((u) => {
                      const isSelf = u.id === currentUser?.id;
                      const isProtected = u.role === "org_admin" || u.role === "platform_admin";
                      return (
                        <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-foreground/5 text-foreground/60 flex items-center justify-center text-xs font-medium shrink-0">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-[13px] font-medium text-foreground">{u.name}</span>
                              {isSelf && <Badge variant="secondary" className="text-[10px]">Você</Badge>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-muted-foreground">{u.email}</td>
                          <td className="px-6 py-4">
                            <Badge variant={isProtected ? "default" : "outline"} className="text-[11px]">
                              {u.role === "org_admin" && <ShieldCheck className="h-3 w-3 mr-1" />}
                              {u.role === "operator" && <Shield className="h-3 w-3 mr-1" />}
                              {u.role === "analyst" && <Eye className="h-3 w-3 mr-1" />}
                              {ROLE_LABELS[u.role] || u.role}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            {isProtected ? (
                              <span className="text-[12px] text-muted-foreground">Acesso total</span>
                            ) : u.modules.length === 0 ? (
                              <span className="text-[12px] text-muted-foreground">Nenhum</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {u.modules.map(m => (
                                  <Badge key={m} variant="secondary" className="text-[10px]">
                                    {MODULE_LABELS[m] || m}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                          {isOrgAdmin && (
                            <td className="px-6 py-4">
                              {!isProtected && !isSelf && (
                                <button
                                  onClick={() => {
                                    setEditingUser({ id: u.id, name: u.name, email: u.email, role: u.role, modules: u.modules });
                                    setEditRole(u.role);
                                    setEditModules([...u.modules]);
                                    setPermDialogOpen(true);
                                  }}
                                  className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                  title="Configurar permissões"
                                >
                                  <Settings2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {isOrgAdmin && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Convites</h3>
              {invitationsLoading ? (
                <div className="text-center py-12 text-muted-foreground">Carregando...</div>
              ) : (
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={
                              !!invitationsData?.invitations?.length &&
                              invitationsData.invitations.every((inv) => selectedInviteIds.has(inv.id))
                            }
                            onChange={() => {
                              const all = invitationsData?.invitations ?? [];
                              if (all.length > 0 && all.every((inv) => selectedInviteIds.has(inv.id))) {
                                setSelectedInviteIds(new Set());
                              } else {
                                setSelectedInviteIds(new Set(all.map((inv) => inv.id)));
                              }
                            }}
                            className="rounded border-border text-primary cursor-pointer"
                            disabled={!invitationsData?.invitations?.length}
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Convidado por</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Enviado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(!invitationsData?.invitations || invitationsData.invitations.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-[13px]">
                            Nenhum convite enviado.
                          </td>
                        </tr>
                      )}
                      {invitationsData?.invitations?.map((inv) => {
                        const isSelected = selectedInviteIds.has(inv.id);
                        return (
                          <tr
                            key={inv.id}
                            className={cn(
                              "transition-colors",
                              isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                            )}
                          >
                            <td className="px-3 py-4 w-10">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedInviteIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(inv.id)) next.delete(inv.id);
                                    else next.add(inv.id);
                                    return next;
                                  });
                                }}
                                className="rounded border-border text-primary cursor-pointer"
                              />
                            </td>
                            <td className="px-6 py-4 text-[13px] font-medium text-foreground">{inv.email}</td>
                            <td className="px-6 py-4">
                              {inv.status === "pending" && (
                                <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                  <Clock className="h-3 w-3 mr-1" />Pendente
                                </Badge>
                              )}
                              {inv.status === "accepted" && (
                                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />Aceito
                                </Badge>
                              )}
                              {inv.status === "revoked" && (
                                <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                  <XCircle className="h-3 w-3 mr-1" />Revogado
                                </Badge>
                              )}
                              {inv.status === "expired" && (
                                <Badge variant="outline" className="text-muted-foreground border-border">
                                  <Clock className="h-3 w-3 mr-1" />Expirado
                                </Badge>
                              )}
                            </td>
                            <td className="px-6 py-4 text-[13px] text-muted-foreground">{inv.invitedByName}</td>
                            <td className="px-6 py-4 text-[13px] text-muted-foreground">
                              {new Date(inv.createdAt).toLocaleDateString("pt-BR")}
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
        </div>
      )}

      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen} title="Nova Unidade" description="Cadastre uma nova unidade organizacional." size="lg">
        <form onSubmit={unitForm.handleSubmit(onUnitSubmit)}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <Label>Nome</Label>
              <Input {...unitForm.register("name", { required: true })} placeholder="Ex: Filial Recife" />
            </div>
            <div>
              <Label>Código</Label>
              <Input {...unitForm.register("code")} placeholder="FIL-001" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select {...unitForm.register("type")}>
                <option value="sede">Sede</option>
                <option value="filial">Filial</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select {...unitForm.register("status")}>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
              </Select>
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input {...unitForm.register("cnpj")} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input {...unitForm.register("phone")} placeholder="(00) 0000-0000" />
            </div>
            <div>
              <Label>CEP</Label>
              <Input {...unitForm.register("cep")} placeholder="00000-000" />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input {...unitForm.register("address")} placeholder="Rua, Avenida..." />
            </div>
            <div>
              <Label>Número</Label>
              <Input {...unitForm.register("streetNumber")} placeholder="100" />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input {...unitForm.register("neighborhood")} placeholder="Centro" />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input {...unitForm.register("city")} placeholder="São Paulo" />
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Input {...unitForm.register("state")} placeholder="SP" maxLength={2} />
            </div>
            <div>
              <Label>País</Label>
              <Input {...unitForm.register("country")} placeholder="Brasil" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setUnitDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={createUnitMut.isPending}>Salvar</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen} title={editingDeptId ? "Editar Departamento" : "Novo Departamento"} description="Defina os departamentos da organização.">
        <form onSubmit={deptForm.handleSubmit(onDeptSubmit)}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <Label>Nome</Label>
              <Input {...deptForm.register("name", { required: true })} placeholder="Nome do departamento" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input {...deptForm.register("description")} placeholder="Descrição (opcional)" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setDeptDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={createDeptMut.isPending || updateDeptMut.isPending}>{editingDeptId ? "Atualizar" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={posDialogOpen} onOpenChange={setPosDialogOpen} title={editingPosId ? "Editar Cargo" : "Novo Cargo"} description="Defina os cargos e requisitos da organização." size="lg">
        <form onSubmit={posForm.handleSubmit(onPosSubmit)}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <Label>Título</Label>
              <Input {...posForm.register("name", { required: true })} placeholder="Título do cargo" />
            </div>
            <div>
              <Label>Escolaridade</Label>
              <Input {...posForm.register("education")} placeholder="Ex: Ensino Superior em Engenharia" />
            </div>
            <div>
              <Label>Tempo de experiência</Label>
              <Input {...posForm.register("experience")} placeholder="Ex: 2 anos na área" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input {...posForm.register("description")} placeholder="Descrição do cargo" />
            </div>
            <div className="col-span-2">
              <Label>Requisitos</Label>
              <Textarea {...posForm.register("requirements")} placeholder="Requisitos do cargo" rows={2} />
            </div>
            <div className="col-span-2">
              <Label>Responsabilidades</Label>
              <Textarea {...posForm.register("responsibilities")} placeholder="Responsabilidades do cargo" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setPosDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={createPosMut.isPending || updatePosMut.isPending}>{editingPosId ? "Atualizar" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} title="Convidar Usuário" description="Envie um convite por email para adicionar um novo usuário à organização.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setInviteError("");
            if (!inviteEmail.trim()) return;
            try {
              await createInviteMut.mutateAsync({ data: { email: inviteEmail.trim() } });
              setInviteEmail("");
              setInviteDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message :
                typeof err === "object" && err !== null && "data" in err
                  ? (err as { data?: { error?: string } }).data?.error
                  : undefined;
              setInviteError(message || "Erro ao enviar convite");
            }
          }}
        >
          <div>
            <Label>Email do convidado</Label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
              placeholder="colaborador@empresa.com"
              autoFocus
            />
          </div>
          {inviteError && (
            <p className="text-sm text-destructive mt-3">{inviteError}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setInviteDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={createInviteMut.isPending}>
              <Mail className="h-4 w-4 mr-1.5" />
              Enviar Convite
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen} title="Configurar Permissões" description={editingUser ? `Defina o cargo e módulos de ${editingUser.name}.` : ""}>
        {editingUser && (
          <div className="space-y-5">
            <div>
              <Label>Cargo</Label>
              <Select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                <option value="operator">Operador</option>
                <option value="analyst">Analista</option>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {editRole === "operator" ? "Pode visualizar e editar dados dos módulos atribuídos." : "Somente visualização dos módulos atribuídos."}
              </p>
            </div>
            <div>
              <Label>Módulos</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {ALL_MODULES.map(mod => (
                  <label key={mod} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={editModules.includes(mod)}
                      onChange={() => {
                        setEditModules(prev =>
                          prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
                        );
                      }}
                      className="rounded border-border text-primary"
                    />
                    <span className="text-[13px]">{MODULE_LABELS[mod] || mod}</span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setPermDialogOpen(false)}>Cancelar</Button>
              <Button
                size="sm"
                isLoading={updateRoleMut.isPending || updateModulesMut.isPending}
                onClick={async () => {
                  if (!orgId || !editingUser) return;
                  if (editRole !== editingUser.role) {
                    await updateRoleMut.mutateAsync({ orgId, userId: editingUser.id, data: { role: editRole as any } });
                  }
                  const modulesChanged = editModules.sort().join(",") !== [...editingUser.modules].sort().join(",");
                  if (modulesChanged) {
                    await updateModulesMut.mutateAsync({ orgId, userId: editingUser.id, data: { modules: editModules } });
                  }
                  queryClient.invalidateQueries({ queryKey: getListOrgUsersQueryKey(orgId) });
                  setPermDialogOpen(false);
                }}
              >
                Salvar
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </>
  );
}

function SimpleTable({
  items,
  isLoading,
  entityName,
  onEdit,
  onDelete,
}: {
  items: Array<{ id: number; name: string; description: string | null }> | undefined;
  isLoading: boolean;
  entityName: string;
  onEdit: (item: { id: number; name: string; description: string | null }) => void;
  onDelete: (id: number) => void;
}) {
  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descrição</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items?.length === 0 && (
            <tr>
              <td colSpan={2} className="px-6 py-12 text-center text-muted-foreground text-[13px]">
                Nenhum {entityName} cadastrado.
              </td>
            </tr>
          )}
          {items?.map((item) => (
            <tr key={item.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => onEdit(item)}>
              <td className="px-6 py-4 text-[13px] font-medium text-foreground">{item.name}</td>
              <td className="px-6 py-4 text-[13px] text-muted-foreground">{item.description || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

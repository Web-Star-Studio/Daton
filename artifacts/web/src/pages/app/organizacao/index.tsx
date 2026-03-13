import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListUnits, useCreateUnit, useDeleteUnit, getListUnitsQueryKey,
  useListDepartments, useCreateDepartment, useDeleteDepartment, useUpdateDepartment, getListDepartmentsQueryKey,
  useListPositions, useCreatePosition, useDeletePosition, useUpdatePosition, getListPositionsQueryKey,
  type CreateUnitBody, type CreateUnitBodyType,
} from "@workspace/api-client-react";

type Tab = "unidades" | "departamentos" | "cargos";

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

export default function OrganizacaoPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("unidades");

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

  const headerActions = (() => {
    switch (activeTab) {
      case "unidades":
        return (
          <Button size="sm" onClick={() => setUnitDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nova Unidade
          </Button>
        );
      case "departamentos":
        return (
          <Button size="sm" onClick={() => { setEditingDeptId(null); deptForm.reset({ name: "", description: "" }); setDeptDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Departamento
          </Button>
        );
      case "cargos":
        return (
          <Button size="sm" onClick={() => { setEditingPosId(null); posForm.reset(emptyPosForm); setPosDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Cargo
          </Button>
        );
    }
  })();

  const tabs: { key: Tab; label: string }[] = [
    { key: "unidades", label: "Unidades" },
    { key: "departamentos", label: "Departamentos" },
    { key: "cargos", label: "Cargos" },
  ];

  return (
    <AppLayout headerActions={headerActions}>
      <div className="border-b border-border mb-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "pb-2.5 text-[13px] font-medium border-b-2 transition-colors cursor-pointer",
                activeTab === tab.key
                  ? "border-[#007AFF] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

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
                      <button
                        onClick={(e) => handleDeleteUnit(e, unit.id)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Título</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Escolaridade</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Experiência</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground text-[13px]">
                      Nenhum cargo cadastrado.
                    </td>
                  </tr>
                )}
                {positions?.map((pos) => (
                  <tr key={pos.id} className="hover:bg-muted/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="text-[13px] font-medium text-foreground">{pos.name}</div>
                      {pos.description && <div className="text-xs text-muted-foreground mt-0.5">{pos.description}</div>}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-muted-foreground">{pos.education || "—"}</td>
                    <td className="px-6 py-4 text-[13px] text-muted-foreground">{pos.experience || "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingPosId(pos.id);
                            posForm.reset({
                              name: pos.name,
                              description: pos.description || "",
                              education: pos.education || "",
                              experience: pos.experience || "",
                              requirements: pos.requirements || "",
                              responsibilities: pos.responsibilities || "",
                            });
                            setPosDialogOpen(true);
                          }}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm("Tem certeza que deseja remover?")) return;
                            await deletePosMut.mutateAsync({ orgId, posId: pos.id });
                            queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) });
                          }}
                          className="text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen} title="Nova Unidade">
        <form onSubmit={unitForm.handleSubmit(onUnitSubmit)} className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome</Label>
              <Input {...unitForm.register("name", { required: true })} placeholder="Ex: Filial Recife" />
            </div>
            <div>
              <Label>Código</Label>
              <Input {...unitForm.register("code")} placeholder="FIL-001" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
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
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>CEP</Label>
              <Input {...unitForm.register("cep")} placeholder="00000-000" />
            </div>
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input {...unitForm.register("address")} placeholder="Rua, Avenida..." />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
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
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Estado (UF)</Label>
              <Input {...unitForm.register("state")} placeholder="SP" maxLength={2} />
            </div>
            <div>
              <Label>País</Label>
              <Input {...unitForm.register("country")} placeholder="Brasil" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input {...unitForm.register("phone")} placeholder="(00) 0000-0000" />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setUnitDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" isLoading={createUnitMut.isPending}>Salvar</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen} title={editingDeptId ? "Editar Departamento" : "Novo Departamento"}>
        <form onSubmit={deptForm.handleSubmit(onDeptSubmit)} className="space-y-5 mt-4">
          <div>
            <Label>Nome</Label>
            <Input {...deptForm.register("name", { required: true })} placeholder="Nome do departamento" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input {...deptForm.register("description")} placeholder="Descrição (opcional)" />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setDeptDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" isLoading={createDeptMut.isPending || updateDeptMut.isPending}>{editingDeptId ? "Atualizar" : "Salvar"}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={posDialogOpen} onOpenChange={setPosDialogOpen} title={editingPosId ? "Editar Cargo" : "Novo Cargo"}>
        <form onSubmit={posForm.handleSubmit(onPosSubmit)} className="space-y-5 mt-4">
          <div>
            <Label>Título</Label>
            <Input {...posForm.register("name", { required: true })} placeholder="Título do cargo" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea {...posForm.register("description")} placeholder="Descrição do cargo" rows={2} />
          </div>
          <div>
            <Label>Escolaridade</Label>
            <Input {...posForm.register("education")} placeholder="Ex: Ensino Superior em Engenharia" />
          </div>
          <div>
            <Label>Tempo de Experiência</Label>
            <Input {...posForm.register("experience")} placeholder="Ex: 2 anos na área" />
          </div>
          <div>
            <Label>Requisitos</Label>
            <Textarea {...posForm.register("requirements")} placeholder="Requisitos do cargo" rows={3} />
          </div>
          <div>
            <Label>Responsabilidades</Label>
            <Textarea {...posForm.register("responsibilities")} placeholder="Responsabilidades do cargo" rows={3} />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setPosDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" isLoading={createPosMut.isPending || updatePosMut.isPending}>{editingPosId ? "Atualizar" : "Salvar"}</Button>
          </div>
        </form>
      </Dialog>
    </AppLayout>
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
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descrição</th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items?.length === 0 && (
            <tr>
              <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground text-[13px]">
                Nenhum {entityName} cadastrado.
              </td>
            </tr>
          )}
          {items?.map((item) => (
            <tr key={item.id} className="hover:bg-muted/50 transition-colors group">
              <td className="px-6 py-4 text-[13px] font-medium text-foreground">{item.name}</td>
              <td className="px-6 py-4 text-[13px] text-muted-foreground">{item.description || "—"}</td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(item)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

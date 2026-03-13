import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

function UnidadesTab({ orgId }: { orgId: number }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: units, isLoading } = useListUnits(orgId, { query: { queryKey: getListUnitsQueryKey(orgId), enabled: !!orgId } });
  const createUnitMut = useCreateUnit();
  const deleteUnitMut = useDeleteUnit();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const form = useForm<UnitFormData>({
    defaultValues: {
      name: "", code: "", type: "filial", cnpj: "", status: "ativa",
      cep: "", address: "", streetNumber: "", neighborhood: "",
      city: "", state: "", country: "Brasil", phone: "",
    }
  });

  const onSubmit = async (data: UnitFormData) => {
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
    setIsDialogOpen(false);
    form.reset();
  };

  const handleDelete = async (e: React.MouseEvent, unitId: number) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja remover esta unidade?")) return;
    await deleteUnitMut.mutateAsync({ orgId, unitId });
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
  };

  return (
    <>
      <div className="flex justify-end mb-6">
        <Button size="sm" onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nova Unidade
        </Button>
      </div>

      {isLoading ? (
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
                    onClick={(e) => handleDelete(e, unit.id)}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} title="Nova Unidade">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome</Label>
              <Input {...form.register("name", { required: true })} placeholder="Ex: Filial Recife" />
            </div>
            <div>
              <Label>Código</Label>
              <Input {...form.register("code")} placeholder="FIL-001" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select {...form.register("type")}>
                <option value="sede">Sede</option>
                <option value="filial">Filial</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select {...form.register("status")}>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
              </Select>
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input {...form.register("cnpj")} placeholder="00.000.000/0000-00" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>CEP</Label>
              <Input {...form.register("cep")} placeholder="00000-000" />
            </div>
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input {...form.register("address")} placeholder="Rua, Avenida..." />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Número</Label>
              <Input {...form.register("streetNumber")} placeholder="100" />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input {...form.register("neighborhood")} placeholder="Centro" />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input {...form.register("city")} placeholder="São Paulo" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Estado (UF)</Label>
              <Input {...form.register("state")} placeholder="SP" maxLength={2} />
            </div>
            <div>
              <Label>País</Label>
              <Input {...form.register("country")} placeholder="Brasil" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input {...form.register("phone")} placeholder="(00) 0000-0000" />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" isLoading={createUnitMut.isPending}>Salvar</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function SimpleListTab({
  orgId,
  items,
  isLoading,
  entityName,
  queryKey,
  onCreateSubmit,
  onUpdateSubmit,
  onDelete,
  isCreating,
}: {
  orgId: number;
  items: Array<{ id: number; name: string; description: string | null }> | undefined;
  isLoading: boolean;
  entityName: string;
  queryKey: readonly string[];
  onCreateSubmit: (data: SimpleFormData) => Promise<void>;
  onUpdateSubmit: (id: number, data: SimpleFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  isCreating: boolean;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const form = useForm<SimpleFormData>({ defaultValues: { name: "", description: "" } });

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset({ name: "", description: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (item: { id: number; name: string; description: string | null }) => {
    setEditingId(item.id);
    form.reset({ name: item.name, description: item.description || "" });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (data: SimpleFormData) => {
    if (editingId) {
      await onUpdateSubmit(editingId, data);
    } else {
      await onCreateSubmit(data);
    }
    setIsDialogOpen(false);
    form.reset();
    setEditingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm(`Tem certeza que deseja remover?`)) return;
    await onDelete(id);
  };

  return (
    <>
      <div className="flex justify-end mb-6">
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Novo {entityName}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
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
                    Nenhum {entityName.toLowerCase()} cadastrado.
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
                        onClick={() => handleOpenEdit(item)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, item.id)}
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
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editingId ? `Editar ${entityName}` : `Novo ${entityName}`}
      >
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5 mt-4">
          <div>
            <Label>Nome</Label>
            <Input {...form.register("name", { required: true })} placeholder={`Nome do ${entityName.toLowerCase()}`} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input {...form.register("description")} placeholder="Descrição (opcional)" />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" isLoading={isCreating}>{editingId ? "Atualizar" : "Salvar"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export default function OrganizacaoPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("unidades");

  const { data: departments, isLoading: deptsLoading } = useListDepartments(orgId!, { query: { queryKey: getListDepartmentsQueryKey(orgId!), enabled: !!orgId } });
  const createDeptMut = useCreateDepartment();
  const updateDeptMut = useUpdateDepartment();
  const deleteDeptMut = useDeleteDepartment();

  const { data: positions, isLoading: posLoading } = useListPositions(orgId!, { query: { queryKey: getListPositionsQueryKey(orgId!), enabled: !!orgId } });
  const createPosMut = useCreatePosition();
  const updatePosMut = useUpdatePosition();
  const deletePosMut = useDeletePosition();

  if (!orgId) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "unidades", label: "Unidades" },
    { key: "departamentos", label: "Departamentos" },
    { key: "cargos", label: "Cargos" },
  ];

  return (
    <AppLayout>
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

      {activeTab === "unidades" && <UnidadesTab orgId={orgId} />}

      {activeTab === "departamentos" && (
        <SimpleListTab
          orgId={orgId}
          items={departments}
          isLoading={deptsLoading}
          entityName="Departamento"
          queryKey={getListDepartmentsQueryKey(orgId) as unknown as readonly string[]}
          onCreateSubmit={async (data) => {
            await createDeptMut.mutateAsync({ orgId, data: { name: data.name, description: data.description || undefined } });
            queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey(orgId) });
          }}
          onUpdateSubmit={async (id, data) => {
            await updateDeptMut.mutateAsync({ orgId, deptId: id, data: { name: data.name, description: data.description || undefined } });
            queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey(orgId) });
          }}
          onDelete={async (id) => {
            await deleteDeptMut.mutateAsync({ orgId, deptId: id });
            queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey(orgId) });
          }}
          isCreating={createDeptMut.isPending || updateDeptMut.isPending}
        />
      )}

      {activeTab === "cargos" && (
        <SimpleListTab
          orgId={orgId}
          items={positions}
          isLoading={posLoading}
          entityName="Cargo"
          queryKey={getListPositionsQueryKey(orgId) as unknown as readonly string[]}
          onCreateSubmit={async (data) => {
            await createPosMut.mutateAsync({ orgId, data: { name: data.name, description: data.description || undefined } });
            queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) });
          }}
          onUpdateSubmit={async (id, data) => {
            await updatePosMut.mutateAsync({ orgId, posId: id, data: { name: data.name, description: data.description || undefined } });
            queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) });
          }}
          onDelete={async (id) => {
            await deletePosMut.mutateAsync({ orgId, posId: id });
            queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) });
          }}
          isCreating={createPosMut.isPending || updatePosMut.isPending}
        />
      )}
    </AppLayout>
  );
}

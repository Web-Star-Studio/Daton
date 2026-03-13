import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListUnits, useCreateUnit, useDeleteUnit, getListUnitsQueryKey, type CreateUnitBody, type CreateUnitBodyType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";

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

export default function UnidadesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: units, isLoading } = useListUnits(orgId!, { query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId } });
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
    if (!orgId) return;
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
    if (!orgId || !confirm("Tem certeza que deseja remover esta unidade?")) return;
    await deleteUnitMut.mutateAsync({ orgId, unitId });
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
  };

  if (!orgId) return null;

  const headerActions = (
    <Button onClick={() => setIsDialogOpen(true)}>
      <Plus className="w-4 h-4 mr-2" />
      Nova Unidade
    </Button>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <p className="text-[13px] text-muted-foreground mb-8">Gerencie as sedes e filiais da sua empresa.</p>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando unidades...</div>
      ) : units?.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-[13px]">Nenhuma unidade cadastrada.</p>
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unidade</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Localização</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identificação</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {units?.map((unit) => (
                <tr
                  key={unit.id}
                  onClick={() => navigate(`/app/organizacao/unidades/${unit.id}`)}
                  className="border-b border-border/60 hover:bg-muted/20 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <span className="text-[13px] font-medium text-foreground">{unit.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[13px] text-muted-foreground font-medium">
                      {unit.city && unit.state ? `${unit.city}, ${unit.state}` : 'Não informada'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[13px] font-semibold text-foreground">{unit.code || '—'}</span>
                    {unit.cnpj && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{unit.cnpj}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[13px] text-foreground">
                      {unit.status === 'ativa' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => handleDelete(e, unit.id)}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={createUnitMut.isPending}>Salvar</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </AppLayout>
  );
}

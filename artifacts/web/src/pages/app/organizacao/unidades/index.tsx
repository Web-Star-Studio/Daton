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
import { Badge } from "@/components/ui/badge";
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

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={createUnitMut.isPending}>Salvar</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </AppLayout>
  );
}

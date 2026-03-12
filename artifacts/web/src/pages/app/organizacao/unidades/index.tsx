import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListUnits, useCreateUnit, useDeleteUnit, getListUnitsQueryKey, type CreateUnitBody, type CreateUnitBodyType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Building, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";

export default function UnidadesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  
  const { data: units, isLoading } = useListUnits(orgId!, { query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId } });
  const createUnitMut = useCreateUnit();
  const deleteUnitMut = useDeleteUnit();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const form = useForm({
    defaultValues: { name: "", type: "filial", city: "", state: "" }
  });

  const onSubmit = async (data: { name: string; type: string; city: string; state: string }) => {
    if (!orgId) return;
    const body: CreateUnitBody = {
      name: data.name,
      type: data.type as CreateUnitBodyType,
      city: data.city || undefined,
      state: data.state || undefined,
    };
    await createUnitMut.mutateAsync({ orgId, data: body });
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
    setIsDialogOpen(false);
    form.reset();
  };

  const handleDelete = async (unitId: number) => {
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
      <p className="text-muted-foreground mb-6">Gerencie as sedes e filiais da sua empresa.</p>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando unidades...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {units?.map((unit) => (
            <Card key={unit.id} className="p-6 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 text-primary rounded-xl">
                  <Building className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={unit.type === 'sede' ? 'default' : 'secondary'} className="uppercase">
                    {unit.type}
                  </Badge>
                  <button 
                    onClick={() => handleDelete(unit.id)}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">{unit.name}</h3>
              <div className="flex items-center text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 mr-1.5" />
                {unit.city && unit.state ? `${unit.city}, ${unit.state}` : 'Endereço não informado'}
              </div>
            </Card>
          ))}
          {units?.length === 0 && (
            <div className="col-span-full text-center py-12 bg-card rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground">Nenhuma unidade cadastrada.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} title="Nova Unidade">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div>
            <Label>Nome da Unidade</Label>
            <Input {...form.register("name", { required: true })} placeholder="Ex: Matriz São Paulo" />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select {...form.register("type")}>
              <option value="sede">Sede</option>
              <option value="filial">Filial</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cidade</Label>
              <Input {...form.register("city")} placeholder="São Paulo" />
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Input {...form.register("state")} placeholder="SP" maxLength={2} />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" isLoading={createUnitMut.isPending}>Salvar</Button>
          </div>
        </form>
      </Dialog>
    </AppLayout>
  );
}

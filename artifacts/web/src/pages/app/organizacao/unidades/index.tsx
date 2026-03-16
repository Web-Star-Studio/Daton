import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions } from "@/contexts/LayoutContext";
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const allSelectableIds = useMemo(() => units?.map((u) => u.id) ?? [], [units]);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.has(id));

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
        try { await deleteUnitMut.mutateAsync({ orgId: orgId!, unitId: id }); } catch {}
      }
      queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId!) });
      setSelectedIds(new Set());
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };
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

  const headerActions = useMemo(() => {
    if (selectedIds.size > 0) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">
            {selectedIds.size} selecionad{selectedIds.size > 1 ? "as" : "a"}
          </span>
          <Button size="sm" variant="destructive" onClick={() => setConfirmDeleteOpen(true)} isLoading={isDeleting}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Excluir ({selectedIds.size})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
            Cancelar
          </Button>
        </div>
      );
    }
    return (
      <Button size="sm" onClick={() => setIsDialogOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Nova Unidade
      </Button>
    );
  }, [selectedIds.size, isDeleting]);

  useHeaderActions(headerActions);

  if (!orgId) return null;

  return (
    <>
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
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="accent-primary h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unidade</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Localização</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identificação</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {units?.map((unit) => (
                <tr
                  key={unit.id}
                  onClick={() => navigate(`/organizacao/unidades/${unit.id}`)}
                  className="border-b border-border/60 hover:bg-muted/20 transition-colors cursor-pointer group"
                >
                  <td className="px-3 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(unit.id)}
                      onChange={() => toggleOne(unit.id)}
                      className="accent-primary h-4 w-4 cursor-pointer"
                    />
                  </td>
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

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} title="Confirmar Exclusão">
        <p className="text-sm text-muted-foreground mt-2">
          Tem certeza que deseja excluir {selectedIds.size} unidade{selectedIds.size > 1 ? "s" : ""}?
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDeleteOpen(false)}>Cancelar</Button>
          <Button type="button" variant="destructive" size="sm" onClick={executeBulkDelete} isLoading={isDeleting}>Excluir</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

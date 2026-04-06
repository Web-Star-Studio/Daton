import { useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageTitle, usePageSubtitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useEmployeeMultiPicker } from "@/hooks/use-employee-multi-picker";
import {
  useListAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  getListAssetsQueryKey,
  useListUnits,
  type Asset,
  type CreateAssetBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";

const CRITICALITY_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const CRITICALITY_COLORS: Record<string, string> = {
  alta: "bg-red-100 text-red-700 border-red-200",
  media: "bg-yellow-100 text-yellow-700 border-yellow-200",
  baixa: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  em_manutencao: "Em manutenção",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-100 text-green-700 border-green-200",
  inativo: "bg-gray-100 text-gray-600 border-gray-200",
  em_manutencao: "bg-orange-100 text-orange-700 border-orange-200",
};

type AssetForm = {
  name: string;
  assetType: string;
  criticality: string;
  status: string;
  location: string;
  impactedProcess: string;
  responsibleId: number | null;
  description: string;
  unitId: string;
};

const defaultForm = (): AssetForm => ({
  name: "",
  assetType: "",
  criticality: "media",
  status: "ativo",
  location: "",
  impactedProcess: "",
  responsibleId: null,
  description: "",
  unitId: "",
});

export default function AtivosPage() {
  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization!.id;
  const queryClient = useQueryClient();
  const canWrite = canWriteModule("assets");

  usePageTitle("Ativos");
  usePageSubtitle("Cadastro de ativos críticos de infraestrutura (ISO 9001:2015 §7.1.3)");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState<AssetForm>(defaultForm());
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");

  const { data: assets = [], isLoading } = useListAssets(orgId);
  const { data: units = [] } = useListUnits(orgId);
  const employeePicker = useEmployeeMultiPicker({ orgId, selectedIds: form.responsibleId ? [form.responsibleId] : [] });
  const createMut = useCreateAsset();
  const updateMut = useUpdateAsset();
  const deleteMut = useDeleteAsset();

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        icon={<Plus className="h-4 w-4" />}
        label="Novo Ativo"
        onClick={() => {
          setEditingAsset(null);
          setForm(defaultForm());
          setDialogOpen(true);
        }}
      />
    ) : null,
  );

  const filtered = assets.filter((a) => {
    if (unitFilter && String(a.unitId ?? "") !== unitFilter) return false;
    if (criticalityFilter && a.criticality !== criticalityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.assetType.toLowerCase().includes(q) ||
        (a.impactedProcess ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  function openEdit(asset: Asset) {
    setEditingAsset(asset);
    setForm({
      name: asset.name,
      assetType: asset.assetType,
      criticality: asset.criticality,
      status: asset.status,
      location: asset.location ?? "",
      impactedProcess: asset.impactedProcess ?? "",
      responsibleId: asset.responsibleId ?? null,
      description: asset.description ?? "",
      unitId: asset.unitId != null ? String(asset.unitId) : "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const body: CreateAssetBody = {
      name: form.name,
      assetType: form.assetType,
      criticality: form.criticality as CreateAssetBody["criticality"],
      status: form.status as CreateAssetBody["status"],
      location: form.location || null,
      impactedProcess: form.impactedProcess || null,
      responsibleId: form.responsibleId ?? null,
      description: form.description || null,
      unitId: form.unitId ? Number(form.unitId) : null,
    };

    try {
      if (editingAsset) {
        await updateMut.mutateAsync({ orgId, assetId: editingAsset.id, data: body });
        toast({ title: "Ativo atualizado" });
      } else {
        await createMut.mutateAsync({ orgId, data: body });
        toast({ title: "Ativo cadastrado" });
      }
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      setDialogOpen(false);
    } catch {
      toast({ title: "Erro ao salvar ativo", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ orgId, assetId: deleteTarget.id });
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      toast({ title: "Ativo removido" });
    } catch {
      toast({ title: "Erro ao remover ativo", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, tipo ou processo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="w-48"
        >
          <option value="">Todas as unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          value={criticalityFilter}
          onChange={(e) => setCriticalityFilter(e.target.value)}
          className="w-40"
        >
          <option value="">Todas as criticidades</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {search || unitFilter || criticalityFilter
              ? "Nenhum ativo encontrado para os filtros selecionados."
              : "Nenhum ativo cadastrado."}
          </p>
          {canWrite && !search && (
            <Button
              size="sm"
              onClick={() => {
                setEditingAsset(null);
                setForm(defaultForm());
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Cadastrar ativo
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Processo impactado</TableHead>
              <TableHead>Criticidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Responsável</TableHead>
              {canWrite && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((asset) => {
              const unit = units.find((u) => u.id === asset.unitId);
              return (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell>{asset.assetType}</TableCell>
                  <TableCell>{unit?.name ?? "—"}</TableCell>
                  <TableCell>{asset.impactedProcess ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={CRITICALITY_COLORS[asset.criticality]}
                    >
                      {CRITICALITY_LABELS[asset.criticality] ?? asset.criticality}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[asset.status]}
                    >
                      {STATUS_LABELS[asset.status] ?? asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{asset.responsibleName ?? "—"}</TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(asset)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(asset)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit dialog */}
      {dialogOpen &&
        createPortal(
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (!open) setDialogOpen(false);
            }}
            title={editingAsset ? "Editar ativo" : "Novo ativo"}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Nome *</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Compressor de ar"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo *</Label>
                  <Input
                    required
                    value={form.assetType}
                    onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))}
                    placeholder="Ex: Equipamento, Veículo, Instalação"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Criticidade</Label>
                  <Select
                    value={form.criticality}
                    onChange={(e) => setForm((f) => ({ ...f, criticality: e.target.value }))}
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Status operacional</Label>
                  <Select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="em_manutencao">Em manutenção</option>
                    <option value="inativo">Inativo</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Unidade</Label>
                  <Select
                    value={form.unitId}
                    onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
                  >
                    <option value="">Nenhuma</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Localização</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Ex: Galpão A, Sala de servidores"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Processo impactado</Label>
                  <Input
                    value={form.impactedProcess}
                    onChange={(e) => setForm((f) => ({ ...f, impactedProcess: e.target.value }))}
                    placeholder="Ex: Produção, Logística"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Responsável</Label>
                  <Select
                    value={form.responsibleId != null ? String(form.responsibleId) : ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        responsibleId: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Nenhum</option>
                    {employeePicker.options.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Descrição</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Informações adicionais sobre o ativo"
                  rows={3}
                />
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
                  type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {editingAsset ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>,
          document.body,
        )}

      {/* Delete confirmation dialog */}
      {deleteTarget &&
        createPortal(
          <Dialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
            title="Remover ativo"
          >
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja remover o ativo{" "}
              <strong>{deleteTarget.name}</strong>? Esta ação não pode ser
              desfeita.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMut.isPending}
              >
                Remover
              </Button>
            </DialogFooter>
          </Dialog>,
          document.body,
        )}
    </div>
  );
}

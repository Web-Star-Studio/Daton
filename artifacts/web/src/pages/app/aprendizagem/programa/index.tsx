import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAnnualProgram,
  useCreateAnnualProgramItem,
  useUpdateAnnualProgramItem,
  useDeleteAnnualProgramItem,
  getListAnnualProgramQueryKey,
  useListTrainingCatalog,
  getListTrainingCatalogQueryKey,
  useListUnits,
  useCreateTrainingClass,
  useListOrgUsers,
  getListOrgUsersQueryKey,
} from "@workspace/api-client-react";
import type { AnnualProgramItem } from "@workspace/api-client-react";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SearchableSelect,
  toNameOptions,
} from "@/components/ui/searchable-select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

const MODALITIES = ["Presencial", "EAD", "Híbrido", "Externo"];
const MONTHS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const STATUS_BADGE: Record<string, string> = {
  planejada: "bg-amber-50 text-amber-700",
  em_andamento: "bg-blue-50 text-blue-700",
  realizada: "bg-green-50 text-green-700",
  cancelada: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

type ItemForm = {
  year: string;
  catalogItemId: string;
  unitId: string;
  plannedMonth: string;
  modality: string;
  plannedQuantity: string;
  responsible: string;
  status: string;
};

const CURRENT_YEAR = new Date().getFullYear();

const emptyForm = (): ItemForm => ({
  year: String(CURRENT_YEAR),
  catalogItemId: "",
  unitId: "",
  plannedMonth: "1",
  modality: "Presencial",
  plannedQuantity: "",
  responsible: "",
  status: "planejada",
});

export default function ProgramaAnualPage() {
  usePageTitle("Programa anual de treinamento");
  const { user } = useAuth();
  const orgId = user?.organizationId;

  // Responsável: picker de usuários da org (permite digitar externo).
  const usersQuery = useListOrgUsers(orgId ?? 0, {
    query: {
      enabled: !!orgId,
      queryKey: getListOrgUsersQueryKey(orgId ?? 0),
    },
  });
  const userNames = useMemo(
    () => (usersQuery.data?.users ?? []).map((u) => u.name),
    [usersQuery.data],
  );
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [yearFilter, setYearFilter] = useState(String(CURRENT_YEAR));
  const [unitFilter, setUnitFilter] = useState("");
  const listParams = {
    year: yearFilter ? Number(yearFilter) : undefined,
    unitId: unitFilter ? Number(unitFilter) : undefined,
  };
  const { data: result, isLoading } = useListAnnualProgram(
    orgId ?? 0,
    listParams,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListAnnualProgramQueryKey(orgId ?? 0, listParams),
      },
    },
  );
  const items = result?.data ?? [];

  const { data: catalogResult } = useListTrainingCatalog(orgId ?? 0, undefined, {
    query: {
      enabled: !!orgId,
      queryKey: getListTrainingCatalogQueryKey(orgId ?? 0),
    },
  });
  const catalogItems = catalogResult?.data ?? [];
  const catalogTitle = useMemo(
    () => new Map(catalogItems.map((c) => [c.id, c.title])),
    [catalogItems],
  );
  const { data: units = [] } = useListUnits(orgId ?? 0);
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);

  const metrics = useMemo(() => {
    const by = (s: string) => items.filter((i) => i.status === s).length;
    return {
      total: items.length,
      realizada: by("realizada"),
      em_andamento: by("em_andamento"),
      planejada: by("planejada"),
    };
  }, [items]);

  const createMutation = useCreateAnnualProgramItem();
  const updateMutation = useUpdateAnnualProgramItem();
  const deleteMutation = useDeleteAnnualProgramItem();
  const createClassMutation = useCreateTrainingClass();

  const invalidate = () => {
    if (orgId)
      queryClient.invalidateQueries({
        queryKey: getListAnnualProgramQueryKey(orgId),
      });
  };

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ItemForm>(emptyForm());

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        size="sm"
        onClick={() => {
          setForm(emptyForm());
          setOpen(true);
        }}
        label="Adicionar item"
        icon={<Plus className="h-3.5 w-3.5" />}
      >
        Adicionar item
      </HeaderActionButton>
    ) : null,
  );

  const handleSave = async () => {
    if (!orgId || !form.catalogItemId || !form.year) return;
    await createMutation.mutateAsync({
      orgId,
      data: {
        year: Number(form.year),
        catalogItemId: Number(form.catalogItemId),
        unitId: form.unitId ? Number(form.unitId) : undefined,
        plannedMonth: form.plannedMonth ? Number(form.plannedMonth) : undefined,
        modality: form.modality || undefined,
        plannedQuantity: form.plannedQuantity
          ? Number(form.plannedQuantity)
          : undefined,
        responsible: form.responsible || undefined,
        status: form.status,
      },
    });
    invalidate();
    setOpen(false);
  };

  const handleCreateClass = async (item: AnnualProgramItem) => {
    if (!orgId) return;
    const month = item.plannedMonth ?? 1;
    const startDate = `${item.year}-${String(month).padStart(2, "0")}-01`;
    const turma = await createClassMutation.mutateAsync({
      orgId,
      data: {
        catalogItemId: item.catalogItemId,
        unitId: item.unitId ?? undefined,
        modality: item.modality ?? undefined,
        startDate,
      },
    });
    await updateMutation.mutateAsync({
      orgId,
      id: item.id,
      data: { classId: turma.id, status: "em_andamento" },
    });
    invalidate();
    toast({
      title: "Turma criada",
      description: "Item do programa vinculado e marcado como em andamento.",
    });
    navigate("/aprendizagem/turmas");
  };

  const handleDelete = async (item: AnnualProgramItem) => {
    if (!orgId) return;
    if (!window.confirm("Remover este item do programa?")) return;
    await deleteMutation.mutateAsync({ orgId, id: item.id });
    invalidate();
  };

  return (
    <div className="space-y-4">
      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total planejado" value={metrics.total} />
        <Metric label="Realizadas" value={metrics.realizada} accent="text-green-700" />
        <Metric label="Em andamento" value={metrics.em_andamento} accent="text-blue-700" />
        <Metric label="Planejadas" value={metrics.planejada} accent="text-amber-700" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="w-auto"
        >
          {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as filiais</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {items.length} item{items.length !== 1 ? "ns" : ""}
        </span>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhum item no programa{canWrite ? " — clique em “Adicionar item”." : "."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Treinamento</th>
                  <th className="px-4 py-2 font-medium">Filial</th>
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-4 py-2 font-medium">Modalidade</th>
                  <th className="px-4 py-2 font-medium">Qtd.</th>
                  <th className="px-4 py-2 font-medium">Responsável</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  {canWrite ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {catalogTitle.get(item.catalogItemId) ??
                        `#${item.catalogItemId}`}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {item.unitId ? (unitName.get(item.unitId) ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {item.plannedMonth ? MONTHS[item.plannedMonth - 1] : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {item.modality ?? "—"}
                    </td>
                    <td className="px-4 py-2">{item.plannedQuantity ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {item.responsible ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge className={STATUS_BADGE[item.status] ?? ""}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {item.classId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate("/aprendizagem/turmas")}
                            >
                              Ver turma
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => void handleCreateClass(item)}
                              disabled={createClassMutation.isPending}
                            >
                              Criar turma
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => void handleDelete(item)}
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adicionar item */}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Adicionar item ao programa"
        description="Treinamento planejado para o ano"
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Ano *">
            <Input
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
          </Field>
          <Field label="Treinamento *">
            <Select
              value={form.catalogItemId}
              onChange={(e) => setForm({ ...form, catalogItemId: e.target.value })}
            >
              <option value="">Selecione...</option>
              {catalogItems.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Filial">
            <Select
              value={form.unitId}
              onChange={(e) => setForm({ ...form, unitId: e.target.value })}
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mês previsto">
            <Select
              value={form.plannedMonth}
              onChange={(e) => setForm({ ...form, plannedMonth: e.target.value })}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Modalidade">
            <Select
              value={form.modality}
              onChange={(e) => setForm({ ...form, modality: e.target.value })}
            >
              {MODALITIES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Qtd. prevista">
            <Input
              type="number"
              value={form.plannedQuantity}
              onChange={(e) =>
                setForm({ ...form, plannedQuantity: e.target.value })
              }
            />
          </Field>
          <Field label="Responsável">
            <SearchableSelect
              value={form.responsible}
              onChange={(v) => setForm({ ...form, responsible: v })}
              options={toNameOptions(userNames, form.responsible)}
              onCreateOption={(v) => setForm({ ...form, responsible: v })}
              isLoading={usersQuery.isLoading}
              placeholder="Selecione um usuário…"
              searchPlaceholder="Buscar usuário ou digitar…"
              createOptionLabel={(input) => `Usar “${input}”`}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="planejada">Planejada</option>
              <option value="em_andamento">Em andamento</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={
              !form.catalogItemId || !form.year || createMutation.isPending
            }
          >
            Salvar item
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

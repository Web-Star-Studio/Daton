import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTrainingRequirements,
  useCreateTrainingRequirement,
  useUpdateTrainingRequirement,
  useDeleteTrainingRequirement,
  getListTrainingRequirementsQueryKey,
  useListPositions,
  getListPositionsQueryKey,
  useListUnits,
  useListEmployeePositionChanges,
  getListEmployeePositionChangesQueryKey,
} from "@workspace/api-client-react";
import { useAllTrainingCatalog } from "@/lib/training-catalog-client";
import {
  createRequirementsForPositions,
  describeBatchResult,
  resolveBatchOutcome,
} from "@/lib/training-requirements-batch";
import { normalizeForComparison } from "@/lib/position-requirements";
import { toast } from "@/hooks/use-toast";
import type {
  TrainingRequirement,
  EmployeePositionChange,
} from "@workspace/api-client-react";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

const DEADLINE_TYPES = [
  { value: "fixo", label: "Prazo fixo (dias após admissão)" },
  { value: "programa", label: "Via programa anual" },
  { value: "rh", label: "RH define" },
];
const DEADLINE_LABEL: Record<string, string> = {
  fixo: "Fixo",
  programa: "Via programa",
  rh: "RH define",
};
const RECURRENCES = [
  { value: "nao_repete", label: "Não se repete" },
  { value: "anual", label: "Anual" },
  { value: "bienal", label: "A cada 2 anos" },
  { value: "conforme_validade", label: "Conforme validade" },
];
const RECURRENCE_LABEL: Record<string, string> = Object.fromEntries(
  RECURRENCES.map((r) => [r.value, r.label]),
);

type RequirementForm = {
  positionIds: number[];
  catalogItemId: string;
  deadlineType: string;
  deadlineDays: string;
  scope: string;
  filialUnitIds: number[];
  recurrence: string;
  isCritical: boolean;
  norm: string;
  notes: string;
};

const EMPTY_FORM: RequirementForm = {
  positionIds: [],
  catalogItemId: "",
  deadlineType: "fixo",
  deadlineDays: "30",
  scope: "geral",
  filialUnitIds: [],
  recurrence: "nao_repete",
  isCritical: false,
  norm: "",
  notes: "",
};

export default function ObrigatoriedadesPage() {
  usePageTitle("Cronograma de obrigatoriedades");
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();

  const { data: result, isLoading } = useListTrainingRequirements(orgId ?? 0, undefined, {
    query: {
      enabled: !!orgId,
      queryKey: getListTrainingRequirementsQueryKey(orgId ?? 0),
    },
  });
  const requirements = result?.data ?? [];

  // Fase 6: histórico de mudanças de cargo (recálculo automático).
  const { data: positionChanges = [], isLoading: changesLoading } =
    useListEmployeePositionChanges(orgId ?? 0, {
      query: {
        enabled: !!orgId,
        queryKey: getListEmployeePositionChangesQueryKey(orgId ?? 0),
      },
    });

  const { data: positions = [], isLoading: positionsLoading } =
    useListPositions(orgId ?? 0, {
    query: { enabled: !!orgId, queryKey: getListPositionsQueryKey(orgId ?? 0) },
  });
  const { data: catalogResult, isLoading: catalogLoading } =
    useAllTrainingCatalog(orgId ?? 0, undefined, {
    query: { enabled: !!orgId },
  });
  const catalogItems = catalogResult?.data ?? [];
  const { data: units = [] } = useListUnits(orgId ?? 0);

  const positionName = useMemo(
    () => new Map(positions.map((p) => [p.id, p.name])),
    [positions],
  );
  const catalogTitle = useMemo(
    () => new Map(catalogItems.map((c) => [c.id, c.title])),
    [catalogItems],
  );
  const unitName = useMemo(
    () => new Map(units.map((u) => [u.id, u.name])),
    [units],
  );

  const positionOptions = useMemo(
    () => positions.map((p) => ({ value: p.id, label: p.name })),
    [positions],
  );

  const createMutation = useCreateTrainingRequirement();
  const updateMutation = useUpdateTrainingRequirement();
  const deleteMutation = useDeleteTrainingRequirement();
  const invalidate = () => {
    if (orgId)
      queryClient.invalidateQueries({
        queryKey: getListTrainingRequirementsQueryKey(orgId),
      });
  };

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RequirementForm>(EMPTY_FORM);
  // Parent-controlled search for the multi-cargo picker, so "Selecionar todos os
  // encontrados" acts on the filtered subset (ex.: digitar "ANALISTA" → todos os
  // analistas) em vez de todos os 174 cargos.
  const [cargoSearch, setCargoSearch] = useState("");

  const filteredPositionOptions = useMemo(() => {
    const term = normalizeForComparison(cargoSearch);
    if (!term) return positionOptions;
    return positionOptions.filter((o) =>
      normalizeForComparison(o.label).includes(term),
    );
  }, [positionOptions, cargoSearch]);

  // Filtros da matriz (fidelidade ao mockup: cargo / escopo / prazo)
  const [filterCargo, setFilterCargo] = useState("");
  const [filterEscopo, setFilterEscopo] = useState("");
  const [filterPrazo, setFilterPrazo] = useState("");

  const cargoOptions = useMemo(() => {
    const ids = Array.from(new Set(requirements.map((r) => r.positionId)));
    return ids
      .map((id) => ({ id, name: positionName.get(id) ?? `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [requirements, positionName]);

  const filtered = useMemo(
    () =>
      requirements.filter((r) => {
        if (filterCargo && String(r.positionId) !== filterCargo) return false;
        if (filterEscopo && r.scope !== filterEscopo) return false;
        if (filterPrazo && r.deadlineType !== filterPrazo) return false;
        return true;
      }),
    [requirements, filterCargo, filterEscopo, filterPrazo],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCargoSearch("");
    setOpen(true);
  };
  const openEdit = (r: TrainingRequirement) => {
    setEditingId(r.id);
    setCargoSearch("");
    setForm({
      positionIds: [r.positionId],
      catalogItemId: String(r.catalogItemId),
      deadlineType: r.deadlineType,
      deadlineDays: r.deadlineDays != null ? String(r.deadlineDays) : "",
      scope: r.scope,
      filialUnitIds: r.filialUnitIds ?? [],
      recurrence: r.recurrence,
      isCritical: r.isCritical,
      norm: r.norm ?? "",
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        size="sm"
        onClick={openCreate}
        label="Nova obrigatoriedade"
        icon={<Plus className="h-3.5 w-3.5" />}
      >
        Nova obrigatoriedade
      </HeaderActionButton>
    ) : null,
  );

  const handleSave = async () => {
    if (!orgId || form.positionIds.length === 0 || !form.catalogItemId) return;
    if (
      form.deadlineType === "fixo" &&
      (form.deadlineDays === "" ||
        Number.isNaN(Number(form.deadlineDays)) ||
        Number(form.deadlineDays) < 0)
    )
      return;
    // Tudo menos o cargo — o cargo varia por linha (uma obrigatoriedade por cargo).
    const baseData = {
      catalogItemId: Number(form.catalogItemId),
      deadlineType: form.deadlineType,
      deadlineDays:
        form.deadlineType === "fixo" && form.deadlineDays
          ? Number(form.deadlineDays)
          : null,
      scope: form.scope,
      filialUnitIds: form.scope === "filial" ? form.filialUnitIds : [],
      recurrence: form.recurrence,
      isCritical: form.isCritical,
      norm: form.norm || undefined,
      notes: form.notes || undefined,
    };

    if (editingId) {
      await updateMutation.mutateAsync({
        orgId,
        id: editingId,
        data: { positionId: form.positionIds[0], ...baseData },
      });
      invalidate();
      setOpen(false);
      return;
    }

    // Criação: uma obrigatoriedade por cargo selecionado. Duplicados (409) são
    // contados como "já existiam"; uma falha isolada não aborta o restante.
    const result = await createRequirementsForPositions(
      form.positionIds,
      (positionId) =>
        createMutation.mutateAsync({ orgId, data: { positionId, ...baseData } }),
    );
    invalidate();

    // Qualquer falha real (não-duplicado) mantém o diálogo aberto para retentar
    // os cargos que falharam — retentar é seguro (os já criados voltam como 409).
    const outcome = resolveBatchOutcome(result);
    toast({
      title: outcome.title,
      description: describeBatchResult(result),
      ...(outcome.destructive ? { variant: "destructive" as const } : {}),
    });
    if (outcome.close) setOpen(false);
  };

  const handleDelete = async (r: TrainingRequirement) => {
    if (!orgId) return;
    if (!window.confirm("Remover esta obrigatoriedade?")) return;
    await deleteMutation.mutateAsync({ orgId, id: r.id });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-blue-50/50 px-4 py-3 text-sm text-blue-900">
        Ao cadastrar ou mudar de cargo um colaborador, o sistema consulta estas
        regras e vincula automaticamente os treinamentos como pendentes — prazo
        fixo conta a partir da admissão; via programa/RH ficam sem data.
      </div>

      {requirements.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filterCargo}
            onChange={(e) => setFilterCargo(e.target.value)}
            className="w-auto"
          >
            <option value="">Todos os cargos</option>
            {cargoOptions.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={filterEscopo}
            onChange={(e) => setFilterEscopo(e.target.value)}
            className="w-auto"
          >
            <option value="">Todos os escopos</option>
            <option value="geral">Geral</option>
            <option value="filial">Filial</option>
          </Select>
          <Select
            value={filterPrazo}
            onChange={(e) => setFilterPrazo(e.target.value)}
            className="w-auto"
          >
            <option value="">Todos os prazos</option>
            {Object.entries(DEADLINE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Matriz de obrigatoriedades</h3>
          <Badge className="bg-muted text-muted-foreground">
            {filtered.length} regra{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {isLoading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">Carregando...</p>
        ) : requirements.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhuma obrigatoriedade cadastrada
            {canWrite ? " — clique em “Nova obrigatoriedade”." : "."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Cargo</th>
                  <th className="px-4 py-2 font-medium">Treinamento</th>
                  <th className="px-4 py-2 font-medium">Norma</th>
                  <th className="px-4 py-2 font-medium">Prazo / origem</th>
                  <th className="px-4 py-2 font-medium">Escopo</th>
                  <th className="px-4 py-2 font-medium">Recorrência</th>
                  <th className="px-4 py-2 font-medium">Crítico</th>
                  {canWrite ? <th className="px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canWrite ? 8 : 7}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma regra para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {positionName.get(r.positionId) ?? `#${r.positionId}`}
                    </td>
                    <td className="px-4 py-2">
                      {catalogTitle.get(r.catalogItemId) ?? `#${r.catalogItemId}`}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.norm ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge className="bg-blue-50 text-blue-700">
                        {DEADLINE_LABEL[r.deadlineType] ?? r.deadlineType}
                        {r.deadlineType === "fixo" && r.deadlineDays
                          ? ` · ${r.deadlineDays}d`
                          : ""}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.scope === "geral"
                        ? "Geral"
                        : `Filial: ${(r.filialUnitIds ?? [])
                            .map((id) => unitName.get(id) ?? `#${id}`)
                            .join(", ")}`}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {RECURRENCE_LABEL[r.recurrence] ?? r.recurrence}
                    </td>
                    <td className="px-4 py-2">
                      {r.isCritical ? (
                        <Badge className="bg-red-50 text-red-700">Sim</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => void handleDelete(r)}
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mudança de cargo — recálculo automático (Fase 6) */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">
            Mudança de cargo — recálculo automático
          </h3>
        </div>
        <div className="border-b bg-blue-50/50 px-4 py-3 text-xs text-blue-900">
          Ao mudar o cargo de um colaborador, o sistema revincula
          automaticamente os treinamentos obrigatórios do novo cargo —
          aproveitando os já concluídos e sem remover o histórico.
        </div>
        {changesLoading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            Carregando...
          </p>
        ) : positionChanges.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhuma mudança de cargo registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Colaborador</th>
                  <th className="px-4 py-2 font-medium">Cargo anterior</th>
                  <th className="px-4 py-2 font-medium">Novo cargo</th>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">
                    Treinamentos vinculados
                  </th>
                </tr>
              </thead>
              <tbody>
                {positionChanges.map((c: EmployeePositionChange) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{c.employeeName}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.previousPosition || "—"}
                    </td>
                    <td className="px-4 py-2">{c.newPosition || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-2">
                      <Badge className="bg-blue-50 text-blue-700">
                        {c.trainingsGenerated} novo(s)
                      </Badge>
                      {c.trainingsReused > 0 ? (
                        <Badge className="ml-1 bg-muted text-muted-foreground">
                          {c.trainingsReused} aproveitado(s)
                        </Badge>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editingId ? "Editar obrigatoriedade" : "Nova obrigatoriedade"}
        description="Regra de treinamento obrigatório por cargo"
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={editingId ? "Cargo *" : "Cargos *"}>
            {editingId ? (
              <SearchableSelect
                value={
                  form.positionIds[0] != null ? String(form.positionIds[0]) : ""
                }
                onChange={(v) =>
                  setForm({ ...form, positionIds: v ? [Number(v)] : [] })
                }
                options={positions.map((p) => ({
                  value: String(p.id),
                  label: p.name,
                }))}
                isLoading={positionsLoading}
                placeholder="Selecione o cargo..."
                searchPlaceholder="Buscar cargo..."
                emptyMessage="Nenhum cargo cadastrado."
              />
            ) : (
              <SearchableMultiSelect
                options={filteredPositionOptions}
                selected={form.positionIds}
                onToggle={(id) =>
                  setForm((f) => ({
                    ...f,
                    positionIds: f.positionIds.includes(id)
                      ? f.positionIds.filter((x) => x !== id)
                      : [...f.positionIds, id],
                  }))
                }
                onSearchValueChange={setCargoSearch}
                onToggleAll={
                  filteredPositionOptions.length > 0
                    ? () => {
                        const ids = filteredPositionOptions.map((o) => o.value);
                        setForm((f) => {
                          const allSelected = ids.every((id) =>
                            f.positionIds.includes(id),
                          );
                          return {
                            ...f,
                            positionIds: allSelected
                              ? f.positionIds.filter((id) => !ids.includes(id))
                              : Array.from(
                                  new Set([...f.positionIds, ...ids]),
                                ),
                          };
                        });
                      }
                    : undefined
                }
                selectAllLabel={
                  cargoSearch.trim()
                    ? `Selecionar todos os ${filteredPositionOptions.length} encontrados`
                    : "Selecionar todos os cargos"
                }
                disabled={positionsLoading}
                placeholder="Selecione um ou mais cargos..."
                searchPlaceholder="Buscar cargo..."
                emptyMessage="Nenhum cargo encontrado."
              />
            )}
          </Field>
          <Field label="Treinamento *">
            <SearchableSelect
              value={form.catalogItemId}
              onChange={(v) => setForm({ ...form, catalogItemId: v })}
              options={catalogItems.map((c) => ({
                value: String(c.id),
                label: c.title,
              }))}
              isLoading={catalogLoading}
              placeholder="Selecione o treinamento..."
              searchPlaceholder="Buscar treinamento..."
              emptyMessage="Nenhum treinamento no catálogo."
            />
          </Field>
          <Field label="Tipo de prazo *">
            <Select
              value={form.deadlineType}
              onChange={(e) =>
                setForm({ ...form, deadlineType: e.target.value })
              }
            >
              {DEADLINE_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          {form.deadlineType === "fixo" ? (
            <Field label="Prazo em dias *">
              <Input
                type="number"
                value={form.deadlineDays}
                onChange={(e) =>
                  setForm({ ...form, deadlineDays: e.target.value })
                }
              />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Escopo">
            <Select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
            >
              <option value="geral">Geral — todas as filiais</option>
              <option value="filial">Específico — filial(is)</option>
            </Select>
          </Field>
          {form.scope === "filial" ? (
            <Field label="Filial(is)">
              <select
                multiple
                value={form.filialUnitIds.map(String)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    filialUnitIds: Array.from(e.target.selectedOptions).map((o) =>
                      Number(o.value),
                    ),
                  })
                }
                className="h-20 w-full rounded-md border px-2 py-1 text-sm"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div />
          )}
          <Field label="Recorrência">
            <Select
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
            >
              {RECURRENCES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Norma de referência">
            <Input
              value={form.norm}
              onChange={(e) => setForm({ ...form, norm: e.target.value })}
              placeholder="Ex: ISO 39001 §7.2"
            />
          </Field>
          <label className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={form.isCritical}
              onChange={(e) =>
                setForm({ ...form, isCritical: e.target.checked })
              }
            />
            <span className="text-sm font-medium">
              Treinamento crítico (bloqueia operação se vencido)
            </span>
          </label>
          <Field label="Observação / justificativa" className="md:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={
              form.positionIds.length === 0 ||
              !form.catalogItemId ||
              (form.deadlineType === "fixo" &&
                (form.deadlineDays === "" ||
                  Number.isNaN(Number(form.deadlineDays)) ||
                  Number(form.deadlineDays) < 0)) ||
              createMutation.isPending ||
              updateMutation.isPending
            }
          >
            {editingId
              ? "Salvar obrigatoriedade"
              : form.positionIds.length > 1
                ? `Criar ${form.positionIds.length} obrigatoriedades`
                : "Salvar obrigatoriedade"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

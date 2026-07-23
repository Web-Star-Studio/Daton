import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useListTrainingClasses,
  useCreateTrainingClass,
  useAddTrainingClassParticipants,
  getListTrainingClassesQueryKey,
  useListUnits,
  useListUserOptions,
  getListUserOptionsQueryKey,
} from "@workspace/api-client-react";
import {
  useAllTrainingCatalog,
  selectPickerCatalogItems,
} from "@/lib/training-catalog-client";
import type { TrainingClass } from "@workspace/api-client-react";
import { formatKpiNumber } from "@/lib/kpi-client";
import { TrainingWorkloadInput } from "@/pages/app/aprendizagem/_components/carga-horaria";
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
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { formatClassUnitsLabel } from "@/pages/app/aprendizagem/_components/class-units";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { TurmaDetailPanel } from "./detail-panel";
import { EmployeePicker } from "./employee-picker";

const STATUS_BADGE: Record<string, string> = {
  agendada: "bg-amber-50 text-amber-700",
  em_andamento: "bg-blue-50 text-blue-700",
  realizada: "bg-green-50 text-green-700",
  cancelada: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  realizada: "Realizada",
  cancelada: "Cancelada",
};
const MODALITIES = ["Presencial", "EAD", "Híbrido", "Externo"];

type ClassForm = {
  catalogItemId: string;
  code: string;
  startDate: string;
  endDate: string;
  unitIds: number[];
  // Responsável pela TURMA (um só). Treino multi-filial é online: um instrutor
  // e um responsável pela turma inteira (decisão da cliente, 2026-07-23).
  responsibleUserId: string;
  location: string;
  instructor: string;
  modality: string;
  workloadHours: string;
  capacity: string;
  minScore: string;
  status: string;
};

const EMPTY_FORM: ClassForm = {
  catalogItemId: "",
  code: "",
  startDate: "",
  endDate: "",
  unitIds: [],
  responsibleUserId: "",
  location: "",
  instructor: "",
  modality: "Presencial",
  workloadHours: "",
  capacity: "20",
  minScore: "7",
  status: "agendada",
};

export default function TurmasPage() {
  usePageTitle("Gestão de turmas");
  const { user } = useAuth();
  const orgId = user?.organizationId;

  // Instrutor: picker de usuários com busca server-side (escala p/ orgs >100
  // usuários — #119; permite digitar externo). useListUserOptions é acessível a
  // não-admin.
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const userParams = {
    search: debouncedUserSearch || undefined,
    page: 1,
    pageSize: 100,
  };
  const usersQuery = useListUserOptions(orgId ?? 0, userParams, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId ?? 0, userParams),
    },
  });
  const userNames = useMemo(
    () => (usersQuery.data ?? []).map((u) => u.name),
    [usersQuery.data],
  );
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  // "Minhas turmas como responsável": filtra pelo usuário logado como
  // responsável de alguma filial (via training_class_units).
  const [mineOnly, setMineOnly] = useState(false);
  const listParams = {
    status: statusFilter || undefined,
    unitId: unitFilter ? Number(unitFilter) : undefined,
    responsibleUserId: mineOnly ? user?.id : undefined,
  };
  const { data: result, isLoading } = useListTrainingClasses(
    orgId ?? 0,
    listParams,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListTrainingClassesQueryKey(orgId ?? 0, listParams),
      },
    },
  );
  const classes = result?.data ?? [];

  const { data: catalogResult, isLoading: catalogLoading } =
    useAllTrainingCatalog(orgId ?? 0, undefined, {
      query: { enabled: !!orgId },
    });
  const catalogItems = catalogResult?.data ?? [];
  const catalogTitle = useMemo(
    () => new Map(catalogItems.map((c) => [c.id, c.title])),
    [catalogItems],
  );
  const { data: units = [], isLoading: unitsLoading } = useListUnits(
    orgId ?? 0,
  );
  const unitName = useMemo(
    () => new Map(units.map((u) => [u.id, u.name])),
    [units],
  );

  const invalidateList = () => {
    if (orgId)
      queryClient.invalidateQueries({
        queryKey: getListTrainingClassesQueryKey(orgId),
      });
  };

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // ─── Nova turma (stepper) ───────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  // Reseta as buscas dos pickers de usuário ao fechar (evita reabrir filtrado). #119
  useEffect(() => {
    if (!open) {
      setUserSearch("");
      setRespSearch("");
    }
  }, [open]);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);

  // Responsável pela turma: picker próprio (id do usuário), com busca
  // server-side independente da do instrutor — buscar um não pode filtrar o
  // outro. Só carrega no passo em que o campo aparece.
  const [respSearch, setRespSearch] = useState("");
  const debouncedRespSearch = useDebouncedValue(respSearch, 300);
  const respParams = {
    search: debouncedRespSearch || undefined,
    page: 1,
    pageSize: 100,
  };
  const respUsersQuery = useListUserOptions(orgId ?? 0, respParams, {
    query: {
      enabled: !!orgId && open && step === 2,
      queryKey: getListUserOptionsQueryKey(orgId ?? 0, respParams),
    },
  });
  // Nome do responsável já escolhido. Sem isso, limpar a busca (ou trocar de
  // página de usuários) tiraria a opção da lista e o campo voltaria ao
  // placeholder mesmo com alguém selecionado.
  const [pickedUserNames, setPickedUserNames] = useState<Record<number, string>>(
    {},
  );
  const respUserOptions = useMemo(() => {
    const byValue = new Map<string, string>();
    for (const u of respUsersQuery.data ?? []) byValue.set(String(u.id), u.name);
    for (const [id, name] of Object.entries(pickedUserNames)) {
      if (!byValue.has(id)) byValue.set(id, name);
    }
    return [...byValue].map(([value, label]) => ({ value, label }));
  }, [respUsersQuery.data, pickedUserNames]);

  const toggleFormUnit = (unitId: number) =>
    setForm((prev) =>
      prev.unitIds.includes(unitId)
        ? { ...prev, unitIds: prev.unitIds.filter((id) => id !== unitId) }
        : { ...prev, unitIds: [...prev.unitIds, unitId] },
    );

  const toggleAllFormUnits = () =>
    setForm((prev) => {
      const allSelected =
        units.length > 0 && units.every((u) => prev.unitIds.includes(u.id));
      return {
        ...prev,
        unitIds: allSelected ? [] : units.map((u) => u.id),
      };
    });

  const setTurmaResponsible = (value: string) => {
    if (value) {
      const name = respUserOptions.find((o) => o.value === value)?.label;
      if (name) setPickedUserNames((prev) => ({ ...prev, [Number(value)]: name }));
    }
    setForm((prev) => ({ ...prev, responsibleUserId: value }));
  };
  // Preview do treinamento selecionado no passo 1 (fidelidade ao mockup)
  const selectedCatalogItem = useMemo(
    () => catalogItems.find((c) => String(c.id) === form.catalogItemId) ?? null,
    [catalogItems, form.catalogItemId],
  );
  // Opções do picker: só ativos + o item já selecionado no form. O
  // catalogTitle (acima) continua com a lista inteira — é ele quem exibe o
  // nome do treinamento nas turmas já criadas (mesmo as de treinos arquivados).
  const catalogPickerOptions = useMemo(
    () => selectPickerCatalogItems(catalogItems, form.catalogItemId),
    [catalogItems, form.catalogItemId],
  );
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);

  const createMutation = useCreateTrainingClass();
  const addParticipantsMutation = useAddTrainingClassParticipants();

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSelectedEmployees([]);
    setStep(1);
    setOpen(true);
  };

  // Chegada do "Abrir turma" da ficha do catálogo: ?novaTurma=<catalogItemId>
  // abre o stepper já com o treinamento selecionado. Só dispara uma vez, e o
  // parâmetro sai da URL para um F5 (ou voltar) não reabrir o diálogo.
  // Espera `canWrite` em vez de consumir o parâmetro: as permissões podem
  // resolver depois do primeiro render, e consumir antes engoliria a intenção.
  const prefilledFromUrl = useRef(false);
  useEffect(() => {
    if (prefilledFromUrl.current || !canWrite) return;
    const raw = new URLSearchParams(window.location.search).get("novaTurma");
    if (!raw || !/^\d+$/.test(raw)) return;
    prefilledFromUrl.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    setForm({ ...EMPTY_FORM, catalogItemId: raw });
    setSelectedEmployees([]);
    setStep(1);
    setOpen(true);
  }, [canWrite]);

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        size="sm"
        onClick={openCreate}
        label="Nova turma"
        icon={<Plus className="h-3.5 w-3.5" />}
      >
        Nova turma
      </HeaderActionButton>
    ) : null,
  );

  const handleCreate = async () => {
    if (!orgId || !form.catalogItemId || !form.startDate) return;
    const created = await createMutation.mutateAsync({
      orgId,
      data: {
        catalogItemId: Number(form.catalogItemId),
        code: form.code || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        units: form.unitIds.map((unitId) => ({ unitId })),
        location: form.location || undefined,
        instructor: form.instructor || undefined,
        responsibleUserId: form.responsibleUserId
          ? Number(form.responsibleUserId)
          : undefined,
        modality: form.modality || undefined,
        workloadHours: form.workloadHours
          ? Number(form.workloadHours)
          : undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        minScore: form.minScore ? Number(form.minScore) : undefined,
        status: form.status,
      },
    });
    if (selectedEmployees.length > 0) {
      await addParticipantsMutation.mutateAsync({
        orgId,
        id: created.id,
        data: { employeeIds: selectedEmployees },
      });
    }
    invalidateList();
    setOpen(false);
    setSelectedId(created.id);
    toast({
      title: "Turma criada",
      description: `${selectedEmployees.length} participante(s) inscrito(s).`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as turmas</option>
          <option value="agendada">Agendada</option>
          <option value="em_andamento">Em andamento</option>
          <option value="realizada">Realizada</option>
          <option value="cancelada">Cancelada</option>
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
        <Button
          type="button"
          variant={mineOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setMineOnly((v) => !v)}
          aria-pressed={mineOnly}
          title="Mostrar apenas as turmas em que você é responsável por alguma filial"
        >
          Minhas como responsável
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {classes.length} turma{classes.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="rounded-xl border bg-card shadow-sm">
          {isLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : classes.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhuma turma{canWrite ? " — clique em “Nova turma”." : "."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Treinamento</th>
                  <th className="px-4 py-2 font-medium">Filial</th>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Inscritos</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c: TrainingClass) => {
                  const unitsLabel = formatClassUnitsLabel(c, unitName);
                  return (
                  <tr
                    key={c.id}
                    className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${
                      selectedId === c.id ? "bg-blue-50/50" : ""
                    }`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <td className="px-4 py-2 font-medium">
                      {catalogTitle.get(c.catalogItemId) ??
                        `#${c.catalogItemId}`}
                      {c.code ? ` — ${c.code}` : ""}
                    </td>
                    <td
                      className="px-4 py-2 text-muted-foreground"
                      title={unitsLabel.title}
                    >
                      {unitsLabel.text}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.startDate}
                      {c.endDate ? `–${c.endDate}` : ""}
                    </td>
                    <td className="px-4 py-2">{c.participantCount ?? 0}</td>
                    <td className="px-4 py-2">
                      <Badge className={STATUS_BADGE[c.status] ?? ""}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {selectedId ? (
          <TurmaDetailPanel
            orgId={orgId ?? 0}
            classId={selectedId}
            canWrite={canWrite}
            catalogTitle={catalogTitle}
            onChanged={invalidateList}
          />
        ) : (
          <div className="rounded-xl border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Selecione uma turma para ver presença, notas e evidências.
          </div>
        )}
      </div>

      {/* Nova turma — stepper */}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Nova turma"
        description={`Passo ${step} de 3`}
        size="lg"
      >
        {step === 1 ? (
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground">
              Treinamento (catálogo) *
            </Label>
            <SearchableSelect
              value={form.catalogItemId}
              onChange={(v) => setForm({ ...form, catalogItemId: v })}
              options={catalogPickerOptions.map((c) => ({
                value: String(c.id),
                label: c.title,
              }))}
              isLoading={catalogLoading}
              placeholder="Selecione o treinamento..."
              searchPlaceholder="Buscar treinamento..."
              emptyMessage="Nenhum treinamento no catálogo."
            />
            {selectedCatalogItem ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ["Categoria", selectedCatalogItem.category ?? null],
                      [
                        "Carga horária",
                        selectedCatalogItem.workloadHours
                          ? `${formatKpiNumber(selectedCatalogItem.workloadHours)}h`
                          : null,
                      ],
                      [
                        "Validade",
                        selectedCatalogItem.validityMonths
                          ? `${selectedCatalogItem.validityMonths} meses`
                          : "Sem validade",
                      ],
                      [
                        "Instrutor padrão",
                        selectedCatalogItem.defaultInstructor ?? null,
                      ],
                    ] as [string, string | null][]
                  ).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {label}
                      </div>
                      <div className="text-xs font-medium text-foreground">
                        {value || "—"}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedCatalogItem.objective ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedCatalogItem.objective}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Código">
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="Ex: T02"
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="agendada">Agendada</option>
                <option value="em_andamento">Em andamento</option>
              </Select>
            </Field>
            <Field label="Data de início *">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
              />
            </Field>
            <Field label="Data de término">
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </Field>
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Filiais
              </Label>
              <SearchableMultiSelect
                options={units.map((u) => ({ value: u.id, label: u.name }))}
                selected={form.unitIds}
                onToggle={toggleFormUnit}
                onToggleAll={toggleAllFormUnits}
                selectAllLabel={`Selecionar todas as filiais (${units.length})`}
                placeholder="Selecione as filiais..."
                searchPlaceholder="Buscar filial..."
                emptyMessage={
                  unitsLoading ? "Carregando..." : "Nenhuma filial cadastrada."
                }
                disabled={unitsLoading}
                renderSummary={(selected) =>
                  units.length > 0 && selected.length === units.length
                    ? `Todas as filiais (${selected.length})`
                    : selected.length === 1
                      ? selected[0].label
                      : `${selected.length} filiais selecionadas`
                }
              />
            </div>
            <Field label="Responsável pela turma">
              <SearchableSelect
                value={form.responsibleUserId}
                onChange={setTurmaResponsible}
                options={respUserOptions}
                searchValue={respSearch}
                onSearchChange={setRespSearch}
                isLoading={respUsersQuery.isLoading}
                placeholder="Sem responsável"
                searchPlaceholder="Buscar usuário…"
                emptyMessage="Nenhum usuário com conta. Cadastre em Configurações → Usuários."
              />
            </Field>
            <Field label="Local / sala">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Instrutor">
              <SearchableSelect
                value={form.instructor}
                onChange={(v) => setForm({ ...form, instructor: v })}
                options={toNameOptions(userNames, form.instructor)}
                onCreateOption={(v) => setForm({ ...form, instructor: v })}
                searchValue={userSearch}
                onSearchChange={setUserSearch}
                isLoading={usersQuery.isLoading}
                placeholder="Selecione um usuário…"
                searchPlaceholder="Buscar usuário ou digitar…"
                createOptionLabel={(input) => `Usar “${input}”`}
              />
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
            <Field label="Carga horária (h)">
              <TrainingWorkloadInput
                value={form.workloadHours}
                onChange={(v) => setForm({ ...form, workloadHours: v })}
              />
            </Field>
            <Field label="Vagas">
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </Field>
            <Field label="Nota mínima">
              <Input
                type="number"
                value={form.minScore}
                onChange={(e) => setForm({ ...form, minScore: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <EmployeePicker
            orgId={orgId ?? 0}
            enabled={open && step === 3}
            selected={selectedEmployees}
            onChange={setSelectedEmployees}
          />
        ) : null}

        <DialogFooter>
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              ← Voltar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !form.catalogItemId}
            >
              Próximo →
            </Button>
          ) : (
            <Button
              onClick={() => void handleCreate()}
              disabled={
                !form.catalogItemId ||
                !form.startDate ||
                createMutation.isPending
              }
            >
              Criar turma
            </Button>
          )}
        </DialogFooter>
      </Dialog>
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

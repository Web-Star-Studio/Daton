import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import {
  getListOrgUsersQueryKey,
  useListOrgUsers,
  useListUnits,
} from "@workspace/api-client-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SwotQuadrantDashboard } from "./_components/swot-quadrant-dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  calendarDateToStorageIso,
  todayCalendarDate,
  useCreateActionPlanWithInvalidation,
  type ActionPlanPriority,
} from "@/lib/action-plans-client";
import { useKpiObjectives } from "@/lib/kpi-client";
import {
  RELEVANCE_SCALE_LEGEND,
  SWOT_DECISION_LABELS,
  SWOT_DECISION_SHORT,
  SWOT_ENVIRONMENT_LABELS,
  SWOT_OBJECTIVE_SOURCE_LABELS,
  SWOT_PERSPECTIVES,
  SWOT_TYPE_LABELS,
  SWOT_TYPE_PLURAL,
  SWOT_TYPES,
  defaultEnvironmentFor,
  encodeObjectiveRef,
  parseObjectiveRef,
  performanceAxisLabel,
  performanceScaleLegend,
  type SwotScaleLegend,
  swotDecision,
  swotDecisionBadgeColor,
  swotResult,
  swotResultColor,
  swotTypeBadgeColor,
  swotTypeText,
  swotTypeTint,
  useCreateSwotFactorWithInvalidation,
  useDeleteSwotFactorWithInvalidation,
  useSwotFactors,
  useSwotObjectives,
  useUpdateSwotFactorWithInvalidation,
  type SwotEnvironment,
  type SwotFactor,
  type SwotFactorType,
} from "@/lib/swot-client";

/** Scroll sutil, nativo e discoverable (barra fina visível quando há overflow). */
const SWOT_SCROLL_CLS =
  "overflow-y-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border";

type Tab = "swot" | "fatores" | "objetivos";

const UNIT_ALL = "all";
const UNIT_CORP = "corp";

type FactorForm = {
  description: string;
  type: SwotFactorType;
  environment: SwotEnvironment;
  perspective: string;
  performance: number;
  relevance: number;
  objectiveRef: string; // "" = nenhum | "<source>:<id>" (ex.: "kpi:5")
  unitId: string; // "" = Corporativo
};

function blankFactorForm(): FactorForm {
  return {
    description: "",
    type: "strength",
    environment: defaultEnvironmentFor("strength"),
    perspective: "",
    performance: 3,
    relevance: 3,
    objectiveRef: "",
    unitId: "",
  };
}

type ActionForm = {
  title: string;
  responsibleUserId: string;
  dueDate: string;
  priority: ActionPlanPriority;
  description: string;
};

export default function OrganizacaoSwotPage() {
  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization!.id;
  const canWrite = canWriteModule("swot");

  usePageTitle("SWOT");
  usePageSubtitle("Análise de contexto — forças, fraquezas, oportunidades e ameaças (ISO 9001 §4.1)");

  const { data: factors = [], isLoading } = useSwotFactors(orgId);
  const { data: objectives = [] } = useSwotObjectives(orgId);
  const { data: kpiObjectives = [] } = useKpiObjectives(orgId);
  const { data: units = [] } = useListUnits(orgId);
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];

  const createFactor = useCreateSwotFactorWithInvalidation(orgId);
  const updateFactor = useUpdateSwotFactorWithInvalidation(orgId);
  const deleteFactor = useDeleteSwotFactorWithInvalidation(orgId);
  const createAction = useCreateActionPlanWithInvalidation(orgId);

  // Confirmação fluída e estilizada (substitui window.confirm).
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    action: () => Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  async function runConfirm() {
    if (!confirmState) return;
    setConfirming(true);
    try {
      await confirmState.action();
    } finally {
      setConfirming(false);
      setConfirmState(null);
    }
  }

  // Resolução unificada de objetivo por referência "<fonte>:<id>".
  const objectiveByRef = useMemo(() => {
    const m = new Map<string, { label: string; source: "swot" | "kpi" }>();
    const fmt = (code: string | null, name: string) => (code ? `${code} · ${name}` : name);
    for (const o of kpiObjectives) m.set(`kpi:${o.id}`, { label: fmt(o.code ?? null, o.name), source: "kpi" });
    for (const o of objectives) m.set(`swot:${o.id}`, { label: fmt(o.code ?? null, o.name), source: "swot" });
    return m;
  }, [kpiObjectives, objectives]);

  // Opções do seletor de objetivo, agrupadas por fonte.
  const objectiveOptions = useMemo(() => {
    const fmt = (code: string | null | undefined, name: string) => (code ? `${code} · ${name}` : name);
    return [
      { value: "", label: "Nenhum" },
      ...kpiObjectives.map((o) => ({ value: `kpi:${o.id}`, label: fmt(o.code, o.name) })),
    ];
  }, [kpiObjectives]);

  const unitNameById = useMemo(
    () => new Map(units.map((u) => [u.id, u.name])),
    [units],
  );

  const [tab, setTab] = useState<Tab>("swot");
  const [unitFilter, setUnitFilter] = useState<string>(UNIT_ALL);

  // ─── Unit filter applied to all views ──────────────────────────────────────
  const scoped = useMemo(() => {
    if (unitFilter === UNIT_ALL) return factors;
    if (unitFilter === UNIT_CORP) return factors.filter((f) => f.unitId === null);
    const id = Number(unitFilter);
    return factors.filter((f) => f.unitId === id);
  }, [factors, unitFilter]);

  const unitOptions = useMemo(
    () => [
      { value: UNIT_ALL, label: "Todas as unidades" },
      { value: UNIT_CORP, label: "Corporativo" },
      ...units.map((u) => ({ value: String(u.id), label: u.name })),
    ],
    [units],
  );

  // Perspectivas: padrão do SGI + as já cadastradas nos fatores.
  const perspectiveOptions = useMemo(() => {
    const used = factors.map((f) => f.perspective).filter((p): p is string => !!p);
    const all = [...new Set([...SWOT_PERSPECTIVES, ...used])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [{ value: "", label: "Nenhuma" }, ...all.map((p) => ({ value: p, label: p }))];
  }, [factors]);

  // ─── Factor dialog ──────────────────────────────────────────────────────────
  const [factorDialogOpen, setFactorDialogOpen] = useState(false);
  const [editingFactorId, setEditingFactorId] = useState<number | null>(null);
  const [factorForm, setFactorForm] = useState<FactorForm>(blankFactorForm());

  function openNewFactor() {
    setEditingFactorId(null);
    const form = blankFactorForm();
    if (unitFilter !== UNIT_ALL && unitFilter !== UNIT_CORP) form.unitId = unitFilter;
    setFactorForm(form);
    setFactorDialogOpen(true);
  }
  function openEditFactor(f: SwotFactor) {
    setEditingFactorId(f.id);
    setFactorForm({
      description: f.description,
      type: f.type,
      environment: f.environment,
      perspective: f.perspective ?? "",
      performance: f.performance,
      relevance: f.relevance,
      objectiveRef:
        f.objectiveSource && f.objectiveSourceId !== null
          ? encodeObjectiveRef(f.objectiveSource, f.objectiveSourceId)
          : "",
      unitId: f.unitId !== null ? String(f.unitId) : "",
    });
    setFactorDialogOpen(true);
  }
  async function saveFactor() {
    const description = factorForm.description.trim();
    if (!description) {
      toast({ title: "Informe a descrição do fator", variant: "destructive" });
      return;
    }
    const objRef = parseObjectiveRef(factorForm.objectiveRef);
    const data = {
      description,
      type: factorForm.type,
      environment: factorForm.environment,
      perspective: factorForm.perspective.trim() || null,
      performance: factorForm.performance,
      relevance: factorForm.relevance,
      objectiveSource: objRef?.source ?? null,
      objectiveSourceId: objRef?.id ?? null,
      unitId: factorForm.unitId ? Number(factorForm.unitId) : null,
    };
    try {
      if (editingFactorId !== null) {
        await updateFactor.mutateAsync({ orgId, factorId: editingFactorId, data });
        toast({ title: "Fator atualizado" });
      } else {
        await createFactor.mutateAsync({ orgId, data });
        toast({ title: "Fator criado" });
      }
      setFactorDialogOpen(false);
    } catch {
      toast({ title: "Não foi possível salvar o fator", variant: "destructive" });
    }
  }
  function removeFactor(f: SwotFactor) {
    setConfirmState({
      title: "Excluir fator?",
      description: (
        <>
          O fator “<span className="font-medium text-foreground">{f.description}</span>” será removido permanentemente.
        </>
      ),
      confirmLabel: "Excluir",
      action: async () => {
        try {
          await deleteFactor.mutateAsync({ orgId, factorId: f.id });
          toast({ title: "Fator excluído" });
        } catch {
          toast({ title: "Não foi possível excluir o fator", variant: "destructive" });
        }
      },
    });
  }

  // SWOT é consumidor puro de objetivos: criação/edição vive no módulo gerador
  // (Indicadores/KPI). A aba "Objetivos" abaixo é apenas leitura/agregação.

  // ─── Action dialog (origina uma ação no Plano de Ação) ──────────────────────
  const [actionFactor, setActionFactor] = useState<SwotFactor | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>({
    title: "",
    responsibleUserId: "",
    dueDate: "",
    priority: "high",
    description: "",
  });

  function openCreateAction(f: SwotFactor) {
    setActionFactor(f);
    setActionForm({
      title: f.description,
      responsibleUserId: "",
      dueDate: "",
      priority: "high",
      description: "",
    });
  }
  async function submitAction() {
    if (!actionFactor) return;
    const title = actionForm.title.trim();
    if (!title) {
      toast({ title: "Informe o título da ação", variant: "destructive" });
      return;
    }
    try {
      await createAction.mutateAsync({
        orgId,
        data: {
          sourceModule: "swot",
          sourceRef: { swotFactorId: actionFactor.id, swotFactorDescription: actionFactor.description },
          title,
          description: actionForm.description.trim() || null,
          priority: actionForm.priority,
          responsibleUserId: actionForm.responsibleUserId ? Number(actionForm.responsibleUserId) : null,
          dueDate: actionForm.dueDate ? calendarDateToStorageIso(actionForm.dueDate) : null,
          status: "open",
        },
      });
      setActionFactor(null);
      toast({ title: "Ação criada", description: "Disponível em Planos de Ação (origem: SWOT)." });
    } catch {
      toast({ title: "Não foi possível criar a ação", variant: "destructive" });
    }
  }

  useHeaderActions(
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setTab("objetivos")}>
        <Target className="h-4 w-4 mr-1.5" />
        Objetivos
      </Button>
      {canWrite && (
        <HeaderActionButton label="Novo fator" icon={<Plus className="h-4 w-4" />} onClick={openNewFactor} />
      )}
    </div>,
  );

  // ─── Derived data ───────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<SwotFactorType, number> = { strength: 0, weakness: 0, opportunity: 0, threat: 0 };
    for (const f of scoped) c[f.type] += 1;
    return c;
  }, [scoped]);

  const withResult = useMemo(
    () =>
      scoped.map((f) => ({
        ...f,
        result: swotResult(f.performance, f.relevance),
        decision: swotDecision(f.type, swotResult(f.performance, f.relevance)),
      })),
    [scoped],
  );

  const requerList = useMemo(
    () => withResult.filter((f) => f.decision === "requer").sort((a, b) => b.result - a.result),
    [withResult],
  );

  return (
    <div className="p-6 space-y-5">
      {/* Unit selector + tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-60">
          <SearchableSelect
            value={unitFilter}
            onChange={setUnitFilter}
            options={unitOptions}
            placeholder="Unidade"
            searchPlaceholder="Buscar unidade..."
          />
        </div>
        <div className="ml-auto flex gap-1 rounded-lg bg-muted p-1">
          {([
            ["swot", "Visão SWOT"],
            ["fatores", "Todos os fatores"],
            ["objetivos", "Objetivos"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === key
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : tab === "swot" ? (
        <SwotView
          counts={counts}
          withResult={withResult}
          requerList={requerList}
          objectiveByRef={objectiveByRef}
          unitNameById={unitNameById}
          onCreateAction={openCreateAction}
          onEdit={openEditFactor}
          canWrite={canWrite}
        />
      ) : tab === "fatores" ? (
        <FactorsTable
          rows={withResult}
          objectiveByRef={objectiveByRef}
          unitNameById={unitNameById}
          onEdit={openEditFactor}
          onDelete={removeFactor}
          onCreateAction={openCreateAction}
          canWrite={canWrite}
        />
      ) : (
        <ObjectivesPanel
          objectives={objectives}
          factors={withResult}
          objectiveByRef={objectiveByRef}
          canWrite={canWrite}
          onEditFactor={openEditFactor}
        />
      )}

      {/* ── Factor dialog ── */}
      <Dialog
        open={factorDialogOpen}
        onOpenChange={setFactorDialogOpen}
        title={editingFactorId !== null ? "Editar fator SWOT" : "Novo fator SWOT"}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição do fator</Label>
            <textarea
              value={factorForm.description}
              onChange={(e) => setFactorForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={factorForm.type}
              onChange={(e) => {
                const type = e.target.value as SwotFactorType;
                setFactorForm((f) => ({ ...f, type, environment: defaultEnvironmentFor(type) }));
              }}
            >
              {SWOT_TYPES.map((t) => (
                <option key={t} value={t}>{SWOT_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ambiente</Label>
            <Select
              value={factorForm.environment}
              onChange={(e) => setFactorForm((f) => ({ ...f, environment: e.target.value as SwotEnvironment }))}
            >
              {(Object.keys(SWOT_ENVIRONMENT_LABELS) as SwotEnvironment[]).map((env) => (
                <option key={env} value={env}>{SWOT_ENVIRONMENT_LABELS[env]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{performanceAxisLabel(factorForm.type)} <span className="text-muted-foreground font-normal">(1–4)</span></Label>
            <ScaleSelector
              value={factorForm.performance}
              onChange={(v) => setFactorForm((f) => ({ ...f, performance: v }))}
              legend={performanceScaleLegend(factorForm.type)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Relevância <span className="text-muted-foreground font-normal">(1–4)</span></Label>
            <ScaleSelector
              value={factorForm.relevance}
              onChange={(v) => setFactorForm((f) => ({ ...f, relevance: v }))}
              legend={RELEVANCE_SCALE_LEGEND}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Perspectiva</Label>
            <SearchableSelect
              value={factorForm.perspective}
              onChange={(v) => setFactorForm((f) => ({ ...f, perspective: v }))}
              options={perspectiveOptions}
              placeholder="Selecione a perspectiva"
              searchPlaceholder="Buscar perspectiva..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <SearchableSelect
              value={factorForm.unitId}
              onChange={(v) => setFactorForm((f) => ({ ...f, unitId: v }))}
              options={[{ value: "", label: "Corporativo" }, ...units.map((u) => ({ value: String(u.id), label: u.name }))]}
              placeholder="Corporativo"
              searchPlaceholder="Buscar unidade..."
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Objetivo estratégico</Label>
            <SearchableSelect
              value={factorForm.objectiveRef}
              onChange={(v) => setFactorForm((f) => ({ ...f, objectiveRef: v }))}
              options={objectiveOptions}
              placeholder="Selecione um objetivo"
              searchPlaceholder="Buscar objetivo (KPI ou SWOT)..."
              emptyMessage="Nenhum objetivo disponível"
            />
            <p className="text-[11px] text-muted-foreground">
              Objetivos vêm do KPI/Indicadores ou dos cadastrados na aba Objetivos do SWOT.
            </p>
          </div>
          {(() => {
            const result = swotResult(factorForm.performance, factorForm.relevance);
            const decision = swotDecision(factorForm.type, result);
            return (
              <div className="sm:col-span-2 flex items-center gap-3.5 rounded-lg border bg-muted/30 px-4 py-3">
                <div className="flex flex-col items-center">
                  <span className={cn("text-2xl font-semibold leading-none tabular-nums", swotResultColor(result))}>{result}</span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">resultado</span>
                </div>
                <div className="h-9 w-px bg-border" />
                <div className="min-w-0 flex-1">
                  <Badge variant="secondary" className={cn("text-[10px]", swotDecisionBadgeColor(decision))}>
                    {SWOT_DECISION_SHORT[decision]}
                  </Badge>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{SWOT_DECISION_LABELS[decision]}</p>
                </div>
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setFactorDialogOpen(false)}>Cancelar</Button>
          <Button onClick={saveFactor} disabled={createFactor.isPending || updateFactor.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Create-action dialog ── */}
      <Dialog
        open={actionFactor !== null}
        onOpenChange={(o) => { if (!o) setActionFactor(null); }}
        title="Nova ação para o fator"
        description="A ação será registrada no módulo Planos de Ação com origem SWOT."
      >
        {actionFactor && (
          <div className="mb-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className={cn("mr-2 text-[10px]", swotTypeBadgeColor(actionFactor.type))}>
              {SWOT_TYPE_LABELS[actionFactor.type]}
            </Badge>
            {actionFactor.description}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Título da ação</Label>
            <Input
              value={actionForm.title}
              onChange={(e) => setActionForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <SearchableSelect
              value={actionForm.responsibleUserId}
              onChange={(v) => setActionForm((f) => ({ ...f, responsibleUserId: v }))}
              options={[
                { value: "", label: "Sem responsável" },
                ...orgUsers.map((u) => ({ value: String(u.id), label: u.name })),
              ]}
              placeholder="Selecione um responsável"
              searchPlaceholder="Buscar usuário..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prazo</Label>
            <Input
              type="date"
              value={actionForm.dueDate}
              min={todayCalendarDate()}
              onChange={(e) => setActionForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select
              value={actionForm.priority}
              onChange={(e) => setActionForm((f) => ({ ...f, priority: e.target.value as ActionPlanPriority }))}
            >
              {(["high", "medium", "low"] as ActionPlanPriority[]).map((p) => (
                <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Como / recursos (opcional)</Label>
            <textarea
              value={actionForm.description}
              onChange={(e) => setActionForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setActionFactor(null)}>Cancelar</Button>
          <Button onClick={submitAction} disabled={createAction.isPending}>Criar ação</Button>
        </DialogFooter>
      </Dialog>

      {/* ── Confirmação de exclusão (popup estilizado) ── */}
      <ConfirmDialog
        open={confirmState !== null}
        onOpenChange={(o) => { if (!o) setConfirmState(null); }}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel ?? "Confirmar"}
        loading={confirming}
        onConfirm={runConfirm}
      />
    </div>
  );
}

// ─── Seletor de escala 1–4 (segmentado) ───────────────────────────────────────

function ScaleSelector({
  value,
  onChange,
  legend,
}: {
  value: number;
  onChange: (v: number) => void;
  legend: SwotScaleLegend[];
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {legend.map((s) => {
        const active = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-center transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground shadow-sm"
                : "border-input text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/50",
            )}
          >
            <span className={cn("text-base font-semibold leading-none", active && "text-primary")}>{s.value}</span>
            <span className="text-[10px] leading-tight">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Visão SWOT (quadrantes + requer ações) ────────────────────────────────────

type ScoredFactor = SwotFactor & { result: number; decision: ReturnType<typeof swotDecision> };

function SwotView({
  counts,
  withResult,
  requerList,
  objectiveByRef,
  unitNameById,
  onCreateAction,
  onEdit,
  canWrite,
}: {
  counts: Record<SwotFactorType, number>;
  withResult: ScoredFactor[];
  requerList: ScoredFactor[];
  objectiveByRef: Map<string, { label: string; source: "swot" | "kpi" }>;
  unitNameById: Map<number, string>;
  onCreateAction: (f: SwotFactor) => void;
  onEdit: (f: SwotFactor) => void;
  canWrite: boolean;
}) {
  const [detailType, setDetailType] = useState<SwotFactorType | null>(null);

  if (detailType) {
    return (
      <SwotQuadrantDashboard
        type={detailType}
        factors={withResult.filter((f) => f.type === detailType)}
        objectiveByRef={objectiveByRef}
        unitNameById={unitNameById}
        canWrite={canWrite}
        onBack={() => setDetailType(null)}
        onEdit={onEdit}
        onCreateAction={onCreateAction}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SWOT_TYPES.map((t) => (
          <div key={t} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full bg-current", swotTypeText(t))} />
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{SWOT_TYPE_PLURAL[t]}</span>
            </div>
            <div className={cn("mt-1.5 text-3xl font-semibold tabular-nums", swotTypeText(t))}>{counts[t]}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SWOT_TYPES.map((t) => {
          const all = withResult.filter((f) => f.type === t).sort((a, b) => b.result - a.result);
          return (
            <div
              key={t}
              role="button"
              tabIndex={0}
              onClick={() => setDetailType(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailType(t); }
              }}
              className={cn(
                "group cursor-pointer rounded-xl border p-4 outline-none transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                swotTypeTint(t),
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={cn("text-sm font-semibold", swotTypeText(t))}>{SWOT_TYPE_PLURAL[t]}</span>
                <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">{all.length}</span>
              </div>
              {all.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Nenhum fator cadastrado</p>
              ) : (
                // Lista rolável de TODOS os fatores; altura fixa (~4 linhas) p/ não crescer o card.
                // stopPropagation: rolar/clicar na lista não dispara a navegação do card.
                <ul
                  className={cn("max-h-[7.5rem] space-y-0.5 pr-1.5", SWOT_SCROLL_CLS)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {all.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-1">
                      <span className="min-w-0 flex-1 truncate text-sm" title={f.description}>{f.description}</span>
                      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", swotResultColor(f.result))}>{f.result}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex items-center justify-end border-t border-border/40 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5 font-medium text-foreground/70 transition-colors group-hover:text-foreground">
                  Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold">Fatores que requerem ações imediatas</h2>
          {requerList.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{requerList.length}</span>
          )}
        </div>
        {requerList.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum fator requer ações no momento.</p>
        ) : (
          <div className="space-y-2">
            {requerList.map((f) => {
              const objRef = f.objectiveSource && f.objectiveSourceId !== null
                ? `${f.objectiveSource}:${f.objectiveSourceId}`
                : null;
              const obj = objRef ? objectiveByRef.get(objRef) : null;
              return (
                <div
                  key={f.id}
                  className="flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:shadow-sm"
                >
                  <Badge variant="secondary" className={cn("mt-0.5 shrink-0 text-[10px]", swotTypeBadgeColor(f.type))}>
                    {SWOT_TYPE_LABELS[f.type]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug">{f.description}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span className={cn("font-semibold tabular-nums", swotResultColor(f.result))}>Resultado {f.result}</span>
                      {f.perspective && <span>· {f.perspective}</span>}
                      {obj
                        ? <span>· {SWOT_OBJECTIVE_SOURCE_LABELS[obj.source]}: {obj.label}</span>
                        : objRef && <span className="italic">· objetivo removido</span>}
                    </div>
                  </div>
                  {canWrite && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => onCreateAction(f)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Criar ação
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Todos os fatores (tabela + filtros) ───────────────────────────────────────

function FactorsTable({
  rows,
  objectiveByRef,
  unitNameById,
  onEdit,
  onDelete,
  onCreateAction,
  canWrite,
}: {
  rows: ScoredFactor[];
  objectiveByRef: Map<string, { label: string; source: "swot" | "kpi" }>;
  unitNameById: Map<number, string>;
  onEdit: (f: SwotFactor) => void;
  onDelete: (f: SwotFactor) => void;
  onCreateAction: (f: SwotFactor) => void;
  canWrite: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [decisionFilter, setDecisionFilter] = useState<string>("");
  const [perspectiveFilter, setPerspectiveFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const perspectives = useMemo(
    () => [...new Set(rows.map((r) => r.perspective).filter((p): p is string => !!p))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false;
      if (decisionFilter && r.decision !== decisionFilter) return false;
      if (perspectiveFilter && r.perspective !== perspectiveFilter) return false;
      if (q && !r.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, typeFilter, decisionFilter, perspectiveFilter, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
          <option value="">Todos os tipos</option>
          {SWOT_TYPES.map((t) => <option key={t} value={t}>{SWOT_TYPE_LABELS[t]}</option>)}
        </Select>
        <Select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)} className="w-44">
          <option value="">Todas as decisões</option>
          <option value="requer">Requer ações</option>
          <option value="positivo">Já positivo</option>
          <option value="irrelevante">Irrelevante</option>
        </Select>
        <Select value={perspectiveFilter} onChange={(e) => setPerspectiveFilter(e.target.value)} className="w-44">
          <option value="">Todas as perspectivas</option>
          {perspectives.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar fator..." className="pl-8" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Descrição</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-3 py-2.5 font-medium">Unidade</th>
              <th className="px-3 py-2.5 font-medium">Perspectiva</th>
              <th className="px-3 py-2.5 text-center font-medium">Perf.</th>
              <th className="px-3 py-2.5 text-center font-medium">Relev.</th>
              <th className="px-3 py-2.5 text-center font-medium">Result.</th>
              <th className="px-3 py-2.5 font-medium">Decisão</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Nenhum fator encontrado.</td></tr>
            ) : (
              filtered.map((f) => {
                const objRef = f.objectiveSource && f.objectiveSourceId !== null
                  ? `${f.objectiveSource}:${f.objectiveSourceId}`
                  : null;
                const obj = objRef ? objectiveByRef.get(objRef) : null;
                return (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2 max-w-[260px]">
                      <div className="truncate" title={f.description}>{f.description}</div>
                      {obj
                        ? <div className="truncate text-[11px] text-muted-foreground">{SWOT_OBJECTIVE_SOURCE_LABELS[obj.source]} · {obj.label}</div>
                        : objRef && <div className="truncate text-[11px] italic text-muted-foreground">objetivo removido</div>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={cn("text-[10px]", swotTypeBadgeColor(f.type))}>{SWOT_TYPE_LABELS[f.type]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{f.unitId !== null ? (unitNameById.get(f.unitId) ?? "—") : "Corporativo"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{f.perspective ?? "—"}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{f.performance}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{f.relevance}</td>
                    <td className={cn("px-3 py-2 text-center font-medium tabular-nums", swotResultColor(f.result))}>{f.result}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={cn("text-[10px]", swotDecisionBadgeColor(f.decision))}>{SWOT_DECISION_SHORT[f.decision]}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {canWrite && (
                        <div className="flex justify-end gap-1">
                          {f.decision === "requer" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Criar ação" onClick={() => onCreateAction(f)}>
                              <ClipboardList className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => onEdit(f)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => onDelete(f)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Objetivos ─────────────────────────────────────────────────────────────────

function ObjectivesPanel({
  objectives,
  factors,
  objectiveByRef,
  canWrite,
  onEditFactor,
}: {
  objectives: { id: number; code: string | null; name: string }[];
  factors: ScoredFactor[];
  objectiveByRef: Map<string, { label: string; source: "swot" | "kpi" }>;
  canWrite: boolean;
  onEditFactor: (f: SwotFactor) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Fatores agrupados por objetivo (referência "<fonte>:<id>"), ordenados por resultado.
  const factorsByRef = useMemo(() => {
    const m = new Map<string, ScoredFactor[]>();
    for (const f of factors) {
      if (f.objectiveSource && f.objectiveSourceId !== null) {
        const ref = `${f.objectiveSource}:${f.objectiveSourceId}`;
        const arr = m.get(ref) ?? [];
        arr.push(f);
        m.set(ref, arr);
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => b.result - a.result);
    return m;
  }, [factors]);

  // Objetivos do KPI (Indicadores) EM USO pelos fatores — geridos no módulo de origem.
  const kpiInUse = useMemo(() => {
    const out: { ref: string; label: string; count: number }[] = [];
    for (const [ref, arr] of factorsByRef) {
      if (!ref.startsWith("kpi:")) continue;
      out.push({ ref, label: objectiveByRef.get(ref)?.label ?? "(objetivo removido)", count: arr.length });
    }
    return out.sort((a, b) => b.count - a.count);
  }, [factorsByRef, objectiveByRef]);

  const isEmpty = kpiInUse.length === 0 && objectives.length === 0;

  // Linha de objetivo: clicável → expande os fatores associados.
  function renderRow(refKey: string, label: string, code: string | null, count: number) {
    const isOpen = expanded === refKey;
    const rows = factorsByRef.get(refKey) ?? [];
    return (
      <div key={refKey}>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setExpanded((c) => (c === refKey ? null : refKey))}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
          {code && <Badge variant="secondary" className="text-[10px]">{code}</Badge>}
          <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{count} fator(es)</span>
        </button>
        {isOpen && (
          <div className="border-t bg-muted/20">
            {rows.length === 0 ? (
              <p className="py-3 pl-10 pr-4 text-xs text-muted-foreground">Nenhum fator vinculado.</p>
            ) : (
              <ul>
                {rows.map((f) => {
                  const inner = (
                    <>
                      <Badge variant="secondary" className={cn("shrink-0 text-[10px]", swotTypeBadgeColor(f.type))}>
                        {SWOT_TYPE_LABELS[f.type]}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm" title={f.description}>{f.description}</span>
                      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", swotResultColor(f.result))}>{f.result}</span>
                    </>
                  );
                  return (
                    <li key={f.id}>
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => onEditFactor(f)}
                          title="Editar fator"
                          className="flex w-full items-center gap-2.5 py-2 pl-10 pr-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2.5 py-2 pl-10 pr-4">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isEmpty ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum objetivo em uso ainda. Vincule um objetivo (do módulo Indicadores) ao criar ou editar um fator.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Módulo: Indicadores (KPI) — somente leitura, geridos lá. */}
          {kpiInUse.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500/70" />
                <h3 className="text-sm font-semibold">Indicadores (KPI)</h3>
                <span className="text-xs text-muted-foreground">{kpiInUse.length} em uso · clique para ver os fatores</span>
              </div>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {kpiInUse.map((o) => renderRow(o.ref, o.label, null, o.count))}
              </div>
            </section>
          )}

          {/* Módulo: SWOT (objetivos próprios — legado). */}
          {objectives.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                <h3 className="text-sm font-semibold">SWOT (legado)</h3>
                <span className="text-xs text-muted-foreground">{objectives.length} · objetivos próprios antigos</span>
              </div>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {objectives.map((o) => renderRow(`swot:${o.id}`, o.name, o.code, factorsByRef.get(`swot:${o.id}`)?.length ?? 0))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

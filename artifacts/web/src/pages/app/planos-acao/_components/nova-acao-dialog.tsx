import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getListOrgUsersQueryKey, useListOrgUsers } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  ACTION_PLAN_PRIORITY_LABELS,
  ACTION_TYPE_LABELS,
  SOURCE_MODULE_LABELS,
  calendarDateToStorageIso,
  gutScore,
  priorityFromGut,
  useActiveAnalysisMethods,
  useCreateActionPlanWithInvalidation,
  type ActionPlanPriority,
  type ActionPlanSourceModule,
  type ActionPlanSourceRef,
  type ActionPlanType,
} from "@/lib/action-plans-client";
import { emptyAnalysisData } from "./analises/registry";
import type { ActionPlanAnalysis, AnalysisMethodKey } from "./analises/types";
import { GutInput } from "./gut-input";
import {
  DEFAULT_MANUAL_ORIGIN,
  MANUAL_ORIGIN_OPTIONS,
  actionTypeForManualOrigin,
  type ManualOriginModule,
} from "./manual-origin";

const TYPE_OPTIONS: ActionPlanType[] = ["corrective", "preventive", "improvement"];
const PRIORITY_OPTIONS: ActionPlanPriority[] = ["high", "medium", "low"];

/** An origin-bound creation context (NC, risk, audit finding, etc.). When
 * omitted, the user picks the origin from the "Origem" listbox (defaults to
 * `improvement`). */
export type ActionSource = {
  sourceModule: ActionPlanSourceModule;
  sourceRef: ActionPlanSourceRef;
  originLabel?: string;
  defaultTitle?: string;
  defaultDescription?: string;
};

type FormState = {
  title: string;
  description: string;
  /** Origem escolhida pelo usuário — só usada quando a ação nasce no módulo (sem `source`). */
  manualOrigin: ManualOriginModule;
  actionType: ActionPlanType;
  priority: ActionPlanPriority;
  responsibleUserId: string;
  dueDate: string;
  gut: { gravity: number | null; urgency: number | null; tendency: number | null };
  analysisKeys: AnalysisMethodKey[];
};

function initialForm(source?: ActionSource): FormState {
  return {
    title: source?.defaultTitle ?? "",
    description: source?.defaultDescription ?? "",
    manualOrigin: DEFAULT_MANUAL_ORIGIN,
    actionType: source ? "corrective" : actionTypeForManualOrigin(DEFAULT_MANUAL_ORIGIN),
    priority: "medium",
    responsibleUserId: "",
    dueDate: "",
    gut: { gravity: null, urgency: null, tendency: null },
    analysisKeys: [],
  };
}

export function NovaAcaoDialog({
  orgId,
  open,
  onOpenChange,
  source,
}: {
  orgId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: ActionSource;
}) {
  const [, setLocation] = useLocation();
  const createPlan = useCreateActionPlanWithInvalidation(orgId);
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];
  const { data: ativas = [] } = useActiveAnalysisMethods(orgId);

  const [form, setForm] = useState<FormState>(() => initialForm(source));

  // Reset (and re-prefill from origin) each time the dialog opens.
  useEffect(() => {
    if (open) setForm(initialForm(source));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pré-marca as tratativas que o admin definiu como padrão da empresa. Reexecuta quando o
  // catálogo chega (ele carrega depois do primeiro render do diálogo) — mas SÓ então, não a
  // cada edição do form: `useActiveAnalysisMethods` refiltra (novo array) a cada render deste
  // componente, então depender do array em si reaplicaria os defaults (apagando a escolha do
  // usuário) a cada tecla digitada. Uma assinatura estável (join das chaves-padrão) é o que
  // muda de verdade quando o catálogo chega/muda.
  const defaultAnalysisKeys = ativas.filter((m) => m.isDefault).map((m) => m.key);
  const defaultAnalysisKeysSignature = defaultAnalysisKeys.join(",");
  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, analysisKeys: defaultAnalysisKeys }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAnalysisKeysSignature]);

  async function submit() {
    if (!form.title.trim()) {
      toast({ title: "Informe o título do plano de ação", variant: "destructive" });
      return;
    }
    const sourceModule = source?.sourceModule ?? form.manualOrigin;
    const sourceRef: ActionPlanSourceRef =
      source?.sourceRef ?? (form.description.trim() ? { manualContext: form.description.trim() } : {});
    try {
      const created = await createPlan.mutateAsync({
        orgId,
        data: {
          sourceModule,
          sourceRef,
          actionType: form.actionType,
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          responsibleUserId: form.responsibleUserId ? Number(form.responsibleUserId) : null,
          dueDate: form.dueDate ? calendarDateToStorageIso(form.dueDate) : null,
          gutGravity: form.gut.gravity,
          gutUrgency: form.gut.urgency,
          gutTendency: form.gut.tendency,
          // O cast é o mesmo (e inevitável) de `Tratativas.adicionar`: `.map` sobre chaves
          // heterogêneas produz `{ key, data }[]` largo, não a união discriminada por elemento.
          analyses: form.analysisKeys.map((key) => ({ key, data: emptyAnalysisData(key) }) as ActionPlanAnalysis),
          status: "open",
        },
      });
      toast({ title: "Plano de ação criado" });
      onOpenChange(false);
      setLocation(`/planos-acao/${created.id}`);
    } catch (err) {
      toast({ title: "Erro ao criar plano de ação", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  const originName = source ? (source.originLabel ?? SOURCE_MODULE_LABELS[source.sourceModule] ?? source.sourceModule) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={source ? "Criar plano de ação" : "Novo plano de ação"} description="Detalhe as tratativas, as ações e a eficácia na ficha." size="lg">
      <div className="max-h-[65vh] space-y-3 overflow-auto pr-1">
        {originName && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem</span>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">{SOURCE_MODULE_LABELS[source!.sourceModule] ?? source!.sourceModule}</Badge>
            <span className="truncate text-sm font-medium">{originName}</span>
          </div>
        )}
        {!source && (
          <div className="space-y-1.5">
            <Label htmlFor="nova-acao-origem">Origem *</Label>
            <Select
              id="nova-acao-origem"
              value={form.manualOrigin}
              onChange={(e) => {
                const manualOrigin = e.target.value as ManualOriginModule;
                setForm((f) => ({ ...f, manualOrigin, actionType: actionTypeForManualOrigin(manualOrigin) }));
              }}
            >
              {MANUAL_ORIGIN_OPTIONS.map((o) => (
                <option key={o} value={o}>{SOURCE_MODULE_LABELS[o]}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="nova-acao-titulo">Título *</Label>
          <Input id="nova-acao-titulo" autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Revisar EPIs na linha de produção" />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição do problema</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Contexto / problema constatado" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="nova-acao-tipo">Tipo</Label>
            <Select id="nova-acao-tipo" value={form.actionType} onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as ActionPlanType }))}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as ActionPlanPriority }))}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ponto focal</Label>
            <SearchableSelect
              value={form.responsibleUserId}
              onChange={(v) => setForm((f) => ({ ...f, responsibleUserId: v }))}
              options={orgUsers.map((u) => ({ value: String(u.id), label: u.name }))}
              placeholder="Selecione"
              searchPlaceholder="Buscar usuário..."
              emptyMessage="Nenhum usuário encontrado"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prazo</Label>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Priorização GUT (opcional)</Label>
          <div className="rounded-lg border bg-muted/20 p-3">
            <GutInput
              value={form.gut}
              onChange={(gut) => {
                const suggested = priorityFromGut(gutScore(gut.gravity, gut.urgency, gut.tendency));
                setForm((f) => ({ ...f, gut, priority: suggested ?? f.priority }));
              }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tratativas</Label>
          <p className="text-xs text-muted-foreground">
            Os métodos de análise que este plano vai usar. Dá para mudar depois na ficha.
          </p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/20 p-2">
            {ativas.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40"
              >
                <Checkbox
                  checked={form.analysisKeys.includes(m.key)}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      analysisKeys: checked
                        ? [...f.analysisKeys, m.key]
                        : f.analysisKeys.filter((key) => key !== m.key),
                    }))
                  }
                />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createPlan.isPending}>Cancelar</Button>
        <Button onClick={submit} disabled={createPlan.isPending || !form.title.trim()}>
          {createPlan.isPending ? "Criando..." : "Criar plano de ação"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

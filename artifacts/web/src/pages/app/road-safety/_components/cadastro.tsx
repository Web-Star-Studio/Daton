import { useEffect, useMemo, useState } from "react";
import { IdCard, Loader2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useListOrgUsers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select } from "@/components/ui/select";
import { useKpiIndicators } from "@/lib/kpi-client";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CONTROL_STATUSES,
  CONTROL_STATUS_LABELS,
  FACTOR_ORIGINS,
  FACTOR_TYPES,
  FACTOR_TYPE_LABELS,
  MONITORING_FORMS,
  MONITORING_FORM_LABELS,
  NORM_ITEMS,
  ORIGIN_LABELS,
  PERIODICITIES,
  PERIODICITY_LABELS,
  useCreateFactorWithInvalidation,
  useRoadSafetyFactors,
  useUpdateFactorWithInvalidation,
  type ControlStatus,
  type FactorType,
  type Periodicity,
  type WithCurrentDiagnosis,
} from "@/lib/road-safety-client";
import { RelevanceBadge } from "./badges";
import { CriarAcaoButton } from "@/pages/app/planos-acao/_components/criar-acao-button";

type CadastroScreenProps = {
  orgId: number;
  factorId: number | null;
  onSaved: () => void;
  onCancel: () => void;
};

type FormData = {
  type: FactorType;
  origin: string;
  normItem: string;
  isAdditional: boolean;
  name: string;
  analysis: string;
  currentDiagnosis: string;
  monitoringForm: string;
  kpiIndicatorId: string;
  periodicity: Periodicity;
  measureUnit: string;
  goal: string;
  responsibleUserId: string;
  monitoringDetail: string;
  gutGravity: number;
  gutUrgency: number;
  gutTendency: number;
  existingControls: string;
  controlStatus: ControlStatus;
  reviewDeadline: string;
  actionPlanRef: string;
};

const emptyForm = (): FormData => ({
  type: "intermediate",
  origin: "",
  normItem: "",
  isAdditional: false,
  name: "",
  analysis: "",
  currentDiagnosis: "",
  monitoringForm: "indicator",
  kpiIndicatorId: "",
  periodicity: "monthly",
  measureUnit: "",
  goal: "",
  responsibleUserId: "",
  monitoringDetail: "",
  gutGravity: 3,
  gutUrgency: 3,
  gutTendency: 3,
  existingControls: "",
  controlStatus: "scheduled",
  reviewDeadline: "",
  actionPlanRef: "",
});

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof IdCard;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex items-center gap-2 border-b pb-2.5">
        <Icon
          className="h-4 w-4 text-blue-600 dark:text-blue-400"
          aria-hidden
        />
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function CadastroScreen({
  orgId,
  factorId,
  onSaved,
  onCancel,
}: CadastroScreenProps) {
  const { data: factors = [] } = useRoadSafetyFactors(orgId);
  const { data: orgUsersData } = useListOrgUsers(orgId);
  const orgUsers = orgUsersData?.users ?? [];
  const { data: indicators = [], isLoading: loadingIndicators } =
    useKpiIndicators(orgId);
  const indicatorOptions = useMemo(
    () =>
      indicators.map((i) => ({
        value: String(i.id),
        label: i.unit ? `${i.name} · ${i.unit}` : i.name,
      })),
    [indicators],
  );

  const createFactor = useCreateFactorWithInvalidation(orgId);
  const updateFactor = useUpdateFactorWithInvalidation(orgId);

  const editing = factorId !== null;
  const factor = useMemo(
    () =>
      factorId !== null
        ? (factors.find((f) => f.id === factorId) ?? null)
        : null,
    [factors, factorId],
  );

  const [form, setForm] = useState<FormData>(emptyForm());

  // Prefill when an existing factor is opened; reset to defaults for a new FD.
  useEffect(() => {
    if (factorId === null) {
      setForm(emptyForm());
      return;
    }
    if (!factor) return;
    setForm({
      type: factor.type as FactorType,
      origin: factor.origin ?? "",
      normItem: factor.normItem ?? "",
      isAdditional: factor.isAdditional,
      name: factor.name,
      analysis: factor.analysis ?? "",
      currentDiagnosis: (factor as WithCurrentDiagnosis).currentDiagnosis ?? "",
      monitoringForm: factor.monitoringForm ?? "",
      kpiIndicatorId:
        factor.kpiIndicatorId != null ? String(factor.kpiIndicatorId) : "",
      periodicity: factor.periodicity as Periodicity,
      measureUnit: factor.measureUnit ?? "",
      goal: factor.goal != null ? String(factor.goal) : "",
      responsibleUserId:
        factor.responsibleUserId != null
          ? String(factor.responsibleUserId)
          : "",
      monitoringDetail: factor.monitoringDetail ?? "",
      gutGravity: factor.gutGravity,
      gutUrgency: factor.gutUrgency,
      gutTendency: factor.gutTendency,
      existingControls: factor.existingControls ?? "",
      controlStatus: factor.controlStatus as ControlStatus,
      reviewDeadline: factor.reviewDeadline ?? "",
      actionPlanRef: factor.actionPlanRef ?? "",
    });
  }, [factorId, factor]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const gutScore = form.gutGravity * form.gutUrgency * form.gutTendency;
  const saving = createFactor.isPending || updateFactor.isPending;
  const linkedToIndicator =
    form.monitoringForm === "indicator" && form.kpiIndicatorId !== "";

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Informe o fator de desempenho", variant: "destructive" });
      return;
    }
    const payload = {
      type: form.type,
      origin: form.origin || null,
      normItem: form.normItem || null,
      isAdditional: form.isAdditional,
      name: form.name.trim(),
      analysis: form.analysis || null,
      currentDiagnosis: form.currentDiagnosis || null,
      monitoringForm: form.monitoringForm || null,
      kpiIndicatorId: form.kpiIndicatorId ? Number(form.kpiIndicatorId) : null,
      periodicity: form.periodicity,
      measureUnit: form.measureUnit || null,
      goal: form.goal.trim() ? Number(form.goal) : null,
      responsibleUserId: form.responsibleUserId
        ? Number(form.responsibleUserId)
        : null,
      monitoringDetail: form.monitoringDetail || null,
      gutGravity: form.gutGravity,
      gutUrgency: form.gutUrgency,
      gutTendency: form.gutTendency,
      existingControls: form.existingControls || null,
      controlStatus: form.controlStatus,
      reviewDeadline: form.reviewDeadline || null,
      actionPlanRef: form.actionPlanRef || null,
    };
    try {
      if (editing && factorId !== null) {
        await updateFactor.mutateAsync({ orgId, factorId, data: payload });
        toast({ title: "Fator de desempenho atualizado" });
      } else {
        await createFactor.mutateAsync({ orgId, data: payload });
        toast({ title: "Fator de desempenho cadastrado" });
      }
      onSaved();
    } catch {
      toast({
        title: "Erro ao salvar o fator de desempenho",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {editing
              ? `Editar ${factor?.code ?? "fator"}`
              : "Cadastro de fator de desempenho"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Configure um FD da Segurança Viária — válido para qualquer segmento.
          </p>
        </div>
        {editing && factor && (
          <CriarAcaoButton
            orgId={orgId}
            source={{
              sourceModule: "road_safety",
              sourceRef: { roadSafetyFactorId: factor.id },
              defaultTitle: factor.code
                ? `${factor.code} — ${factor.name}`
                : factor.name,
              originLabel: factor.code ?? factor.name,
            }}
            label="Criar plano de ação"
            variant="outline"
            size="sm"
          />
        )}
      </div>

      <Block icon={IdCard} title="Bloco A — Identificação do fator">
        <Field label="Código">
          <Input
            value={editing ? (factor?.code ?? "—") : "Gerado ao salvar"}
            disabled
            className="bg-muted/50 text-muted-foreground"
          />
        </Field>
        <Field label="Tipo do fator">
          <Select
            value={form.type}
            onChange={(e) => set("type", e.target.value as FactorType)}
          >
            {FACTOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {FACTOR_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Origem do fator">
          <Select
            value={form.origin}
            onChange={(e) => set("origin", e.target.value)}
          >
            <option value="">Selecione</option>
            {FACTOR_ORIGINS.map((o) => (
              <option key={o} value={o}>
                {ORIGIN_LABELS[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vínculo com item da norma">
          <Select
            value={form.normItem}
            onChange={(e) => set("normItem", e.target.value)}
          >
            <option value="">Sem vínculo normativo</option>
            {NORM_ITEMS.map((n) => (
              <option key={n.code} value={n.code}>
                {n.code} — {n.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fator de desempenho" full>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: Uso de dispositivo de bloqueio por alcoolemia"
          />
        </Field>
        <Field label="Análise / Justificativa" full>
          <Textarea
            value={form.analysis}
            onChange={(e) => set("analysis", e.target.value)}
            placeholder="Descreva como e por que este fator impacta a segurança viária da organização..."
          />
        </Field>
        <Field label="Diagnóstico atual" full>
          <Textarea
            value={form.currentDiagnosis}
            onChange={(e) => set("currentDiagnosis", e.target.value)}
            placeholder="Estado atual do fator — o diagnóstico que embasa a análise GUT..."
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-blue-600"
            checked={form.isAdditional}
            onChange={(e) => set("isAdditional", e.target.checked)}
          />
          <span className="text-[13px] text-foreground">
            FD adicional (fora da lista normativa)
          </span>
        </label>
      </Block>

      <Block icon={SlidersHorizontal} title="Bloco B — Monitoramento">
        <Field label="Forma de monitoramento">
          <Select
            value={form.monitoringForm}
            onChange={(e) => set("monitoringForm", e.target.value)}
          >
            <option value="">Selecione</option>
            {MONITORING_FORMS.map((m) => (
              <option key={m} value={m}>
                {MONITORING_FORM_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        {form.monitoringForm === "indicator" ? (
          <Field label="Indicador vinculado" full>
            <SearchableSelect
              value={form.kpiIndicatorId}
              onChange={(v) => set("kpiIndicatorId", v)}
              options={indicatorOptions}
              placeholder="Selecione um indicador do módulo Indicadores"
              searchPlaceholder="Buscar indicador..."
              isLoading={loadingIndicators}
              emptyMessage={
                indicators.length === 0
                  ? "Nenhum indicador cadastrado no módulo Indicadores."
                  : "Nenhum indicador encontrado"
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Vinculado: o valor atual, a unidade e a meta deste fator passam a
              vir do indicador. O lançamento manual fica desabilitado.
            </p>
          </Field>
        ) : null}
        <Field label="Periodicidade">
          <Select
            value={form.periodicity}
            onChange={(e) => set("periodicity", e.target.value as Periodicity)}
          >
            {PERIODICITIES.map((p) => (
              <option key={p} value={p}>
                {PERIODICITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unidade de medida">
          <Input
            value={form.measureUnit}
            onChange={(e) => set("measureUnit", e.target.value)}
            placeholder={
              linkedToIndicator ? "Vem do indicador" : "Ex: %, un, km, hora"
            }
            disabled={linkedToIndicator}
            className={cn(
              linkedToIndicator && "bg-muted/50 text-muted-foreground",
            )}
          />
        </Field>
        <Field label="Meta do período">
          <Input
            type="number"
            value={form.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder={linkedToIndicator ? "Vem do indicador" : "Ex: 100"}
            disabled={linkedToIndicator}
            className={cn(
              linkedToIndicator && "bg-muted/50 text-muted-foreground",
            )}
          />
        </Field>
        <Field label="Responsável">
          <Select
            value={form.responsibleUserId}
            onChange={(e) => set("responsibleUserId", e.target.value)}
          >
            <option value="">Selecione um responsável</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Detalhamento do monitoramento" full>
          <Textarea
            value={form.monitoringDetail}
            onChange={(e) => set("monitoringDetail", e.target.value)}
            placeholder="Descreva como o indicador será medido e a fonte dos dados..."
          />
        </Field>
      </Block>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center gap-2 border-b pb-2.5">
          <SlidersHorizontal
            className="h-4 w-4 text-blue-600 dark:text-blue-400"
            aria-hidden
          />
          <h3 className="text-[13px] font-semibold text-foreground">
            Bloco D — Análise GUT
          </h3>
        </div>
        <div className="space-y-4">
          {(
            [
              ["Gravidade", "gutGravity"],
              ["Urgência", "gutUrgency"],
              ["Tendência", "gutTendency"],
            ] as const
          ).map(([label, key]) => (
            <div
              key={key}
              className="grid grid-cols-[110px_1fr_36px] items-center gap-3"
            >
              <span className="text-[13px] font-medium text-foreground">
                {label}
              </span>
              <Slider
                value={[form[key]]}
                min={1}
                max={5}
                step={1}
                onValueChange={([v]) => set(key, v)}
              />
              <span className="text-center text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {form[key]}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <div>
              <div className="text-xs text-muted-foreground">
                Resultado GUT (G × U × T)
              </div>
              <div className="text-2xl font-semibold tabular-nums text-foreground">
                {gutScore}
              </div>
            </div>
            <RelevanceBadge
              score={gutScore}
              withScore={false}
              className="px-3.5 py-1 text-xs"
            />
          </div>
        </div>
      </section>

      <Block icon={ShieldCheck} title="Bloco E — Controles e ações">
        <Field label="Controles existentes" full>
          <Textarea
            value={form.existingControls}
            onChange={(e) => set("existingControls", e.target.value)}
            placeholder="Descreva os controles operacionais aplicados a este fator..."
          />
        </Field>
        <Field label="Status do controle">
          <Select
            value={form.controlStatus}
            onChange={(e) =>
              set("controlStatus", e.target.value as ControlStatus)
            }
          >
            {CONTROL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTROL_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prazo de revisão">
          <Input
            type="date"
            value={form.reviewDeadline}
            onChange={(e) => set("reviewDeadline", e.target.value)}
          />
        </Field>
        <Field label="Nº ação no plano de gestão">
          <Input
            value={form.actionPlanRef}
            onChange={(e) => set("actionPlanRef", e.target.value)}
            placeholder="Ex: AC-2025-047"
          />
        </Field>
      </Block>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {editing ? "Salvar alterações" : "Salvar Fator de Desempenho"}
        </Button>
      </div>
    </div>
  );
}

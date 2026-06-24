import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardCheck, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  maxPeriodNumber,
  periodLabel,
  useCreateCriticalReview,
  useCriticalReviews,
  useDeleteCriticalReview,
  useUpdateCriticalReview,
  type CriticalReview,
  type CriticalReviewPeriodKind,
  type CriticalReviewStatus,
} from "@/lib/critical-reviews-client";
import { CriarAcaoButton } from "@/pages/app/planos-acao/_components/criar-acao-button";
import { AcoesVinculadas } from "@/pages/app/planos-acao/_components/acoes-vinculadas";

const CURRENT_YEAR = new Date().getFullYear();

const PERIOD_KIND_LABELS: Record<CriticalReviewPeriodKind, string> = {
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

// Entradas da análise crítica — ISO 9001/14001/39001 · §9.3.2
const INPUT_TOPICS: { key: string; label: string; hint: string }[] = [
  {
    key: "previous_actions",
    label: "Ações de análises críticas anteriores",
    hint: "Situação das ações decididas nas RACs anteriores.",
  },
  {
    key: "context_changes",
    label: "Mudanças no contexto",
    hint: "Mudanças em questões externas e internas relevantes ao Sistema de Gestão.",
  },
  {
    key: "performance",
    label: "Desempenho do Sistema de Gestão",
    hint: "Indicadores, não conformidades e ações corretivas, auditorias, satisfação do cliente, processos, fornecedores.",
  },
  {
    key: "resources",
    label: "Suficiência de recursos",
    hint: "Recursos disponíveis frente aos necessários.",
  },
  {
    key: "risk_actions",
    label: "Ações para riscos e oportunidades",
    hint: "Eficácia das ações tomadas para abordar riscos e oportunidades.",
  },
  {
    key: "improvement_opportunities",
    label: "Oportunidades de melhoria",
    hint: "Oportunidades identificadas no período.",
  },
];

// Saídas / decisões da análise crítica — ISO 9001/14001/39001 · §9.3.3
const OUTPUT_TOPICS: { key: string; label: string; hint: string }[] = [
  {
    key: "improvements",
    label: "Oportunidades de melhoria",
    hint: "Melhorias decididas pela direção.",
  },
  {
    key: "sgi_changes",
    label: "Mudanças no Sistema de Gestão",
    hint: "Necessidade de mudanças no sistema de gestão.",
  },
  {
    key: "resource_needs",
    label: "Necessidade de recursos",
    hint: "Recursos a serem providos.",
  },
];

const STATUS_BADGE: Record<CriticalReviewStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  completed: {
    label: "Concluída",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
};

type FormState = {
  periodKind: CriticalReviewPeriodKind;
  year: number;
  periodNumber: number;
  reviewDate: string;
  participants: string;
  status: CriticalReviewStatus;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
};

function blankForm(): FormState {
  return {
    periodKind: "quarterly",
    year: CURRENT_YEAR,
    periodNumber: 1,
    reviewDate: "",
    participants: "",
    status: "draft",
    inputs: {},
    outputs: {},
  };
}

function formFromReview(r: CriticalReview): FormState {
  return {
    periodKind: r.periodKind,
    year: r.year,
    periodNumber: r.periodNumber,
    reviewDate: r.reviewDate ?? "",
    participants: r.participants ?? "",
    status: r.status,
    inputs: { ...r.inputs },
    outputs: { ...r.outputs },
  };
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "Sem data definida";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const fieldLabel =
  "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export function RacScreen() {
  const { organization } = useAuth();
  const orgId = organization!.id;

  usePageTitle("Análise Crítica pela Direção");
  usePageSubtitle("RAC — relatório periódico · ISO 9001 · 14001 · 39001 · §9.3");

  const { data: reviews = [], isLoading } = useCriticalReviews(orgId);
  const createReview = useCreateCriticalReview(orgId);
  const updateReview = useUpdateCriticalReview(orgId);
  const deleteReview = useDeleteCriticalReview(orgId);

  const [editing, setEditing] = useState<CriticalReview | "new" | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);

  useEffect(() => {
    if (editing === "new") setForm(blankForm());
    else if (editing) setForm(formFromReview(editing));
  }, [editing]);

  const saving = createReview.isPending || updateReview.isPending;

  async function handleSave() {
    const body = {
      periodKind: form.periodKind,
      year: form.year,
      periodNumber: form.periodKind === "annual" ? 1 : form.periodNumber,
      reviewDate: form.reviewDate || null,
      status: form.status,
      participants: form.participants.trim() || null,
      inputs: form.inputs,
      outputs: form.outputs,
    };
    try {
      if (editing === "new") {
        await createReview.mutateAsync(body);
        toast({ title: "Análise crítica criada" });
      } else if (editing) {
        await updateReview.mutateAsync({ id: editing.id, body });
        toast({ title: "Análise crítica atualizada" });
      }
      setEditing(null);
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (editing === "new" || !editing) return;
    if (
      !window.confirm(
        "Excluir esta análise crítica? Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    try {
      await deleteReview.mutateAsync(editing.id);
      toast({ title: "Análise crítica excluída" });
      setEditing(null);
    } catch (err) {
      toast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  // ─── Editor view ───────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="space-y-4 p-6">
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para a lista
        </button>

        <div className="max-w-3xl space-y-4">
          {/* Identificação */}
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <h3 className="text-[13px] font-semibold text-foreground">
              Identificação
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className={fieldLabel}>Periodicidade</label>
                <Select
                  value={form.periodKind}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      periodKind: e.target.value as CriticalReviewPeriodKind,
                      periodNumber: 1,
                    }))
                  }
                >
                  {(
                    Object.keys(PERIOD_KIND_LABELS) as CriticalReviewPeriodKind[]
                  ).map((k) => (
                    <option key={k} value={k}>
                      {PERIOD_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </div>
              {form.periodKind !== "annual" ? (
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabel}>
                    {form.periodKind === "semiannual" ? "Semestre" : "Trimestre"}
                  </label>
                  <Select
                    value={String(form.periodNumber)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        periodNumber: Number(e.target.value),
                      }))
                    }
                  >
                    {Array.from(
                      { length: maxPeriodNumber(form.periodKind) },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={String(n)}>
                        {periodLabel(form.periodKind, n)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <label className={fieldLabel}>Ano</label>
                <Input
                  type="number"
                  value={String(form.year)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      year: Number(e.target.value) || CURRENT_YEAR,
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={fieldLabel}>Data da reunião</label>
                <Input
                  type="date"
                  value={form.reviewDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reviewDate: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={fieldLabel}>Status</label>
                <Select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value as CriticalReviewStatus,
                    }))
                  }
                >
                  <option value="draft">Rascunho</option>
                  <option value="completed">Concluída</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabel}>Participantes</label>
              <Input
                value={form.participants}
                onChange={(e) =>
                  setForm((f) => ({ ...f, participants: e.target.value }))
                }
                placeholder="Direção e demais participantes da reunião"
              />
            </div>
          </div>

          {/* Entradas — §9.3.2 */}
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <h3 className="text-[13px] font-semibold text-foreground">
              Entradas da análise crítica{" "}
              <span className="font-normal text-muted-foreground">· §9.3.2</span>
            </h3>
            {INPUT_TOPICS.map((topic) => (
              <div key={topic.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground">
                  {topic.label}
                </label>
                <p className="text-[11px] text-muted-foreground">{topic.hint}</p>
                <Textarea
                  value={form.inputs[topic.key] ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      inputs: { ...f.inputs, [topic.key]: e.target.value },
                    }))
                  }
                  placeholder="Análise do tópico..."
                />
              </div>
            ))}
          </div>

          {/* Saídas — §9.3.3 */}
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <h3 className="text-[13px] font-semibold text-foreground">
              Saídas e decisões da direção{" "}
              <span className="font-normal text-muted-foreground">· §9.3.3</span>
            </h3>
            {OUTPUT_TOPICS.map((topic) => (
              <div key={topic.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground">
                  {topic.label}
                </label>
                <p className="text-[11px] text-muted-foreground">{topic.hint}</p>
                <Textarea
                  value={form.outputs[topic.key] ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      outputs: { ...f.outputs, [topic.key]: e.target.value },
                    }))
                  }
                  placeholder="Decisão / encaminhamento..."
                />
              </div>
            ))}
            {editing && editing !== "new" ? (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="text-[11px] text-muted-foreground">
                  Transforme estas decisões em planos de ação rastreáveis:
                </span>
                <AcoesVinculadas orgId={orgId} sourceModule="rac" refId={editing.id} />
                <CriarAcaoButton
                  orgId={orgId}
                  source={{
                    sourceModule: "rac",
                    sourceRef: {
                      criticalReviewId: editing.id,
                      racLabel: `${periodLabel(editing.periodKind, editing.periodNumber)} · ${editing.year}`,
                    },
                    defaultTitle: `Ação — Análise Crítica ${editing.year}`,
                    originLabel: `${periodLabel(editing.periodKind, editing.periodNumber)} · ${editing.year}`,
                  }}
                  label="Criar plano de ação"
                  variant="outline"
                  size="sm"
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Salve a análise crítica para gerar planos de ação a partir das decisões.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            {editing !== "new" ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={deleteReview.isPending}
              >
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salvar análise crítica
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {reviews.length} análise{reviews.length !== 1 ? "s" : ""} crítica
          {reviews.length !== 1 ? "s" : ""} registrada
          {reviews.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova Análise Crítica
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhuma análise crítica registrada. A RAC é a revisão periódica do Sistema de Gestão
          pela direção (ISO §9.3).
        </div>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setEditing(r)}
                className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/15 hover:bg-muted/40"
              >
                <ClipboardCheck
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-foreground">
                    {periodLabel(r.periodKind, r.periodNumber)} · {r.year}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDateBR(r.reviewDate)}
                    {r.createdByUserName ? ` · ${r.createdByUserName}` : ""}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    STATUS_BADGE[r.status].cls,
                  )}
                >
                  {STATUS_BADGE[r.status].label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

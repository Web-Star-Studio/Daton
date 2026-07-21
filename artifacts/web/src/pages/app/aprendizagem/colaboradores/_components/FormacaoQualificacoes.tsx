import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Pencil,
  Plus,
  XCircle,
} from "lucide-react";
import type {
  EmployeeCompetencyConformance,
  EmployeeCompetencyConformanceRequirementsItem,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { compareEducation } from "../_lib/ficha-derivations";

// Tipo de um item de `conformance.requirements` — reexportado com nome curto
// porque é a interface que a Task 5 (wiring de evidência) consome via
// `onAttachEvidence`/`onEditEvidence`.
export type RequirementRow = EmployeeCompetencyConformanceRequirementsItem;

// Botão discreto de ação usado nas linhas `gap` e `nao_classificado` — não
// herda o tom (emerald/red/muted) da linha de propósito: é uma ação neutra
// de "abrir formulário", não um veredito.
function EvidenceButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-card/70 px-2 py-1 text-[10px] font-medium text-foreground/80 transition-colors hover:bg-card hover:text-foreground"
    >
      <Plus className="h-3 w-3" />
      Evidência
    </button>
  );
}

// Mesmo motor de apresentação do bloco "Conformidade do Cargo" em [id].tsx
// (CompetenciasTab): três estados por requisito — "atende" (✓), "gap" (✗) e
// "nao_classificado" (cinza neutro, NUNCA conta como lacuna). Extraído aqui
// para reuso no bloco "Formação e qualificações" da ficha reconstruída;
// nenhum cálculo novo é feito, só leitura de `conformance.requirements`.

function EscolaridadeRow({
  education,
  requiredEducation,
}: {
  education?: string | null;
  requiredEducation?: string | null;
}) {
  const veredito = compareEducation(education, requiredEducation);
  const tone =
    veredito === "atende" ? "atende" : veredito === "gap" ? "gap" : "neutro";

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 rounded-lg text-[12px]",
        tone === "atende" &&
          "bg-emerald-50 border border-emerald-200/60 dark:bg-emerald-500/10 dark:border-emerald-500/30",
        tone === "gap" &&
          "bg-red-50 border border-red-200/60 dark:bg-red-500/10 dark:border-red-500/30",
        tone === "neutro" && "bg-muted/40 border border-border/50",
      )}
    >
      <span
        className={cn(
          tone === "atende" && "text-emerald-900 dark:text-emerald-200",
          tone === "gap" && "text-red-900 dark:text-red-200",
          tone === "neutro" && "text-muted-foreground",
        )}
      >
        {veredito === "nao_informado" && "Não informado"}
        {veredito === "sem_requisito" && `Possui: ${education || "—"}`}
        {(veredito === "atende" || veredito === "gap") &&
          `Possui: ${education} · Requerido: ${requiredEducation}`}
      </span>
      {veredito === "atende" && (
        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 shrink-0 ml-3">
          Atende
        </span>
      )}
      {veredito === "gap" && (
        <span className="text-[11px] font-medium text-red-700 dark:text-red-300 shrink-0 ml-3">
          Gap
        </span>
      )}
    </div>
  );
}

export function FormacaoQualificacoes({
  education,
  requiredEducation,
  conformance,
  editable,
  onAttachEvidence,
  onEditEvidence,
}: {
  education?: string | null;
  requiredEducation?: string | null;
  conformance: EmployeeCompetencyConformance | null;
  // Quando ausente/false, o componente renderiza exatamente como antes (sem
  // botões) — a Task 5 é quem liga estas props a um fluxo de verdade.
  editable?: boolean;
  onAttachEvidence?: (req: RequirementRow) => void;
  onEditEvidence?: (req: RequirementRow) => void;
}) {
  const veredito = compareEducation(education, requiredEducation);
  const requirements = conformance?.requirements ?? [];
  const atendeItems = requirements.filter((r) => r.status === "atende");
  const gapItems = requirements.filter((r) => r.status === "gap");
  const naoClassificadoItems = requirements.filter(
    (r) => r.status === "nao_classificado",
  );
  const progressDenom = atendeItems.length + gapItems.length;
  const compliancePercent =
    progressDenom > 0
      ? Math.round((atendeItems.length / progressDenom) * 100)
      : 0;

  // "nao_classificado" NÃO é lacuna (invariante da Fase 1) — ele fica fora do
  // selo, da barra e do denominador. O selo vermelho só acende com lacuna real.
  const hasGaps = veredito === "gap" || gapItems.length > 0;
  // Selo verde só quando algo foi de fato avaliado (progressDenom > 0) e não
  // há lacuna — senão "Requisitos atendidos" é enganoso quando nada foi
  // avaliado ainda (ex.: cargo com requisitos só "nao_classificado").
  const isUnevaluated = !hasGaps && progressDenom === 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Formação e qualificações
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0",
            hasGaps
              ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
              : isUnevaluated
                ? "bg-muted text-muted-foreground"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
          )}
        >
          {hasGaps
            ? "Gaps encontrados"
            : isUnevaluated
              ? "Sem avaliação ainda"
              : "Requisitos atendidos"}
        </span>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Escolaridade
        </h4>
        <EscolaridadeRow
          education={education}
          requiredEducation={requiredEducation}
        />
      </div>

      <div className="space-y-2">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Competências do cargo
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Exigidas pelo cargo · anexe a evidência de cada uma
        </p>

        {conformance === null || requirements.length === 0 ? (
          <div className="bg-muted/20 border border-border/40 rounded-xl p-4 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Este cargo ainda não possui requisitos definidos.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {atendeItems.length}/{progressDenom} requisitos atendidos
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    compliancePercent >= 80
                      ? "text-emerald-600"
                      : compliancePercent >= 50
                        ? "text-amber-600"
                        : "text-red-600",
                  )}
                >
                  {compliancePercent}%
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    compliancePercent >= 80
                      ? "bg-emerald-500"
                      : compliancePercent >= 50
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${compliancePercent}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {requirements.map((item, idx) => {
                if (item.status === "nao_classificado") {
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px] bg-muted/40 border border-border/50"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate text-muted-foreground">
                          {item.competencyName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[11px] text-muted-foreground">
                          Não avaliável — treinamento não classificado
                        </span>
                        {editable && (
                          <EvidenceButton
                            onClick={() => onAttachEvidence?.(item)}
                          />
                        )}
                      </div>
                    </div>
                  );
                }
                const matched = item.status === "atende";
                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-[12px]",
                      matched
                        ? "bg-emerald-50 border border-emerald-200/60 dark:bg-emerald-500/10 dark:border-emerald-500/30"
                        : "bg-red-50 border border-red-200/60 dark:bg-red-500/10 dark:border-red-500/30",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {matched ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate",
                          matched
                            ? "text-emerald-900 dark:text-emerald-200"
                            : "text-red-900 dark:text-red-200",
                        )}
                      >
                        {item.competencyName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span
                        className={cn(
                          "text-[11px]",
                          matched
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-red-700 dark:text-red-300",
                        )}
                      >
                        Nível: {item.acquiredLevel}/{item.requiredLevel}
                      </span>
                      {/* Hint textual independente da ação: uma linha
                          atende+treinamento sempre mostra de onde veio a
                          prova, mesmo quando também existe um atestado
                          manual editável (lápis) ao lado. */}
                      {editable && matched && item.source === "treinamento" && (
                        <span className="truncate text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                          via treinamento
                          {item.evidence?.title
                            ? ` · ${item.evidence.title}`
                            : ""}
                        </span>
                      )}
                      {/* Roteamento por PRESENÇA de atestado manual, não por
                          status/fonte: existe `manualCompetencyId` => editar
                          (reabre PREENCHIDO, nunca em branco — mesmo numa
                          linha "gap" parcial ou "atende" via treinamento que
                          também tem atestado manual). */}
                      {editable && item.manualCompetencyId != null && (
                        <button
                          type="button"
                          onClick={() => onEditEvidence?.(item)}
                          aria-label="Editar evidência"
                          className={cn(
                            "inline-flex shrink-0 items-center justify-center rounded-md p-1 transition-colors",
                            matched
                              ? "text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                              : "text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-500/20",
                          )}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {editable &&
                        item.manualCompetencyId == null &&
                        !matched && (
                          <EvidenceButton
                            onClick={() => onAttachEvidence?.(item)}
                          />
                        )}
                    </div>
                  </div>
                );
              })}
            </div>

            {naoClassificadoItems.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {naoClassificadoItems.length}{" "}
                {naoClassificadoItems.length === 1
                  ? "requisito ainda não avaliável"
                  : "requisitos ainda não avaliáveis"}
                .
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { EmployeeCompetencyConformance } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { compareEducation } from "../_lib/ficha-derivations";

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
}: {
  education?: string | null;
  requiredEducation?: string | null;
  conformance: EmployeeCompetencyConformance | null;
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

  const hasGaps =
    veredito === "gap" ||
    gapItems.length > 0 ||
    naoClassificadoItems.length > 0;

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
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
          )}
        >
          {hasGaps ? "Gaps encontrados" : "Requisitos atendidos"}
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
                      <span className="text-[11px] text-muted-foreground shrink-0 ml-3">
                        Treinamento não classificado
                      </span>
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
                    <span
                      className={cn(
                        "text-[11px] shrink-0 ml-3",
                        matched
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-red-700 dark:text-red-300",
                      )}
                    >
                      Nível: {item.acquiredLevel}/{item.requiredLevel}
                    </span>
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

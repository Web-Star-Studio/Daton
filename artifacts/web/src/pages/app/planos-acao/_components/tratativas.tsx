import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ANALYSIS_REGISTRY, emptyAnalysisData, resumoAnalise, type Adaptador, type DataFor } from "./analises/registry";
import type { ActionPlanAnalysis, AnalysisMethodKey } from "./analises/types";

/**
 * Cards colapsáveis, um por tratativa (método de análise) adotada no plano. Cada
 * card despacha para o editor específico do método via `ANALYSIS_REGISTRY`
 * (Task 12) — esta tela não conhece a forma interna de nenhum método.
 */
export function Tratativas({
  analyses,
  onChange,
  /** Ativas do catálogo — o que se pode ADICIONAR. */
  metodosAtivos,
  /** Rótulo por chave, vindo do catálogo INTEIRO (incl. inativas) — displays = todas. */
  labelPorChave,
  readOnly = false,
}: {
  analyses: ActionPlanAnalysis[];
  onChange: (next: ActionPlanAnalysis[]) => void;
  metodosAtivos: Array<{ key: AnalysisMethodKey; label: string }>;
  labelPorChave: Map<string, string>;
  readOnly?: boolean;
}) {
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(analyses.map((a) => a.key)));
  const [aRemover, setARemover] = useState<AnalysisMethodKey | null>(null);

  const jaNoPlano = new Set(analyses.map((a) => a.key));
  const disponiveis = metodosAtivos.filter((m) => !jaNoPlano.has(m.key));

  const adicionar = (key: AnalysisMethodKey) => {
    onChange([...analyses, { key, data: emptyAnalysisData(key) } as ActionPlanAnalysis]);
    setAbertas((prev) => new Set(prev).add(key));
  };

  const remover = (key: AnalysisMethodKey) => {
    onChange(analyses.filter((a) => a.key !== key));
    setARemover(null);
  };

  const pedirRemocao = (analysis: ActionPlanAnalysis) => {
    // Só confirma se há trabalho para perder — remover uma tratativa em branco não merece fricção.
    if (resumoAnalise(analysis) === "Não preenchida") {
      remover(analysis.key);
      return;
    }
    setARemover(analysis.key);
  };

  return (
    <div className="space-y-2">
      {analyses.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          Nenhuma tratativa neste plano. Adicione o método de análise que a equipe vai usar.
        </p>
      )}

      {analyses.map((analysis) => {
        // Despacho dinâmico: indexar o registro por `analysis.key` (um `AnalysisMethodKey`
        // não-estreitado) devolveria a UNIÃO dos 8 adaptadores, cada um com um `Component`
        // de assinatura diferente — impossível de chamar sem cast. Este é o único cast do
        // arquivo; os 8 adaptadores em si seguem integralmente tipados.
        const { Component } = ANALYSIS_REGISTRY[analysis.key] as Adaptador<typeof analysis.key>;
        const aberta = abertas.has(analysis.key);
        const rotulo = labelPorChave.get(analysis.key) ?? analysis.key;
        const resumo = resumoAnalise(analysis);
        const noCatalogoAtivo = metodosAtivos.some((m) => m.key === analysis.key);

        return (
          <div key={analysis.key} className="rounded-xl border bg-card/60">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                onClick={() =>
                  setAbertas((prev) => {
                    const next = new Set(prev);
                    if (next.has(analysis.key)) next.delete(analysis.key);
                    else next.add(analysis.key);
                    return next;
                  })
                }
                aria-expanded={aberta}
              >
                {aberta ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="shrink-0 text-[13px] font-medium">{rotulo}</span>
                {/* Uma tratativa desativada no catálogo SEGUE editável aqui: o plano pode
                    tê-la adotado antes de a empresa desligá-la. */}
                {!noCatalogoAtivo && (
                  <Badge variant="neutral" className="shrink-0 text-[10px]">
                    Desativada no catálogo
                  </Badge>
                )}
                {!aberta && <span className="truncate text-[12px] text-muted-foreground">— {resumo}</span>}
              </button>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label={`Remover tratativa ${rotulo}`}
                  onClick={() => pedirRemocao(analysis)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {aberta && (
              <div className="border-t px-3 py-3">
                {/* Despacho dinâmico: o TS não consegue estreitar `Component` e `analysis.data`
                    para a MESMA chave num acesso indexado. O cast fica confinado a estas duas
                    linhas — os 8 adaptadores seguem integralmente tipados. */}
                <Component
                  data={analysis.data as DataFor<typeof analysis.key>}
                  readOnly={readOnly}
                  onChange={(data) =>
                    onChange(
                      analyses.map((a) => (a.key === analysis.key ? ({ key: a.key, data } as ActionPlanAnalysis) : a)),
                    )
                  }
                />
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && disponiveis.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar tratativa
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {disponiveis.map((m) => (
              <DropdownMenuItem key={m.key} onSelect={() => adicionar(m.key)}>
                {m.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        open={aRemover !== null}
        onOpenChange={(open) => {
          if (!open) setARemover(null);
        }}
        title="Remover tratativa?"
        description={
          aRemover
            ? `A análise registrada em "${labelPorChave.get(aRemover) ?? aRemover}" será apagada deste plano. Você pode restaurá-la depois pelo histórico de versões.`
            : undefined
        }
        confirmLabel="Remover"
        onConfirm={() => {
          if (aRemover) remover(aRemover);
        }}
      />
    </div>
  );
}

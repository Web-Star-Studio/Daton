/**
 * Tab "Corporativos" da página de Indicadores KPI.
 *
 * Estrutura:
 *
 * 1. JÁ CONFIGURADOS — Corporativos existentes renderizados com o
 *    `IndicatorCard` padrão (mesma sparkline + status + goal dos demais
 *    indicadores). Card inteiro clicável → abre `CorporateExploreSheet`
 *    com tabela mensal, lista de filhos, "quem falta reportar" por mês.
 *
 * 2. SUGESTÕES — agrupamentos detectados pelo backend (clusters
 *    filial-level com mesma estrutura). Click em "Criar Corporativo"
 *    abre o dialog de preview que cria o indicador + composição numa
 *    transação atômica.
 *
 * Composição manual (ferramenta avançada) é acessível pelo botão dentro
 * do drawer de exploração — não polui mais a lista principal.
 */
import { useMemo, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import {
  useListKpiRollupClusters,
  type KpiIndicator,
  type KpiRollupCluster,
  type KpiYearRow,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CORPORATE_UNIT_LABEL } from "@/lib/kpi-constants";
import { cn } from "@/lib/utils";
import { CreateCorporateFromClusterDialog } from "./create-corporate-from-cluster-dialog";
import { CorporateExploreSheet } from "./corporate-explore-sheet";
import { IndicatorCard } from "./indicator-card";

interface CorporateRollupsTabProps {
  orgId: number;
  year: number;
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
  onEditIndicator: (ind: KpiIndicator) => void;
  onDeleteIndicator: (ind: KpiIndicator) => void;
  onConfigureManually: (ind: KpiIndicator) => void;
  /** Troca pra aba "Lançar" focando num indicador (passa pelo KpiModulePage). */
  onOpenInLancar?: (indicatorId: number) => void;
}

export function CorporateRollupsTab({
  orgId,
  year,
  indicators,
  yearRows,
  onEditIndicator,
  onDeleteIndicator,
  onConfigureManually,
  onOpenInLancar,
}: CorporateRollupsTabProps) {
  const [activeCluster, setActiveCluster] = useState<KpiRollupCluster | null>(null);
  /** Corporativo aberto no drawer de exploração. */
  const [exploringIndicator, setExploringIndicator] = useState<KpiIndicator | null>(null);

  const { data: clustersData, isLoading: clustersLoading } = useListKpiRollupClusters(orgId);
  const clusters = clustersData?.clusters ?? [];

  // Corporativos já configurados (unit=Corporativo)
  const existingCorporates = useMemo(
    () =>
      indicators.filter(
        (ind) =>
          ind.unit?.trim().toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase(),
      ),
    [indicators],
  );

  return (
    <div className="space-y-6">
      {/* Já configurados */}
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Corporativos já configurados
            {existingCorporates.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({existingCorporates.length})
              </span>
            )}
          </h2>
        </header>
        {existingCorporates.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            Nenhum Corporativo configurado ainda. Use as sugestões abaixo para criar a partir
            de agrupamentos detectados, ou crie manualmente na aba "Por filial".
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {existingCorporates.map((ind) => {
              const yearRow = yearRows.find((r) => r.indicator.id === ind.id);
              return (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => setExploringIndicator(ind)}
                  className="block h-full w-full cursor-pointer text-left transition hover:translate-y-[-1px]"
                  title="Clique para explorar este Corporativo"
                >
                  <IndicatorCard
                    indicator={ind}
                    yearRow={yearRow}
                    onEdit={() => onEditIndicator(ind)}
                    onDelete={() => onDeleteIndicator(ind)}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Sugestões */}
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Sugestões — agrupamentos detectados
            {clusters.length > 0 && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({clusters.length})
              </span>
            )}
          </h2>
        </header>

        {clustersLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/20 py-8 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Analisando catálogo...
          </div>
        ) : clusters.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            Nenhum agrupamento detectado. Cadastre indicadores com mesma fórmula em filiais
            diferentes para o sistema sugerir Corporativos automaticamente.
          </p>
        ) : (
          <div className="space-y-2">
            {clusters.map((cluster) => (
              <ClusterSuggestionCard
                key={cluster.clusterKey}
                cluster={cluster}
                onCreate={() => setActiveCluster(cluster)}
              />
            ))}
          </div>
        )}
      </section>

      {activeCluster && (
        <CreateCorporateFromClusterDialog
          open={!!activeCluster}
          onClose={() => setActiveCluster(null)}
          onCreated={() => {
            // Lista atualiza automaticamente via React Query invalidation.
            setActiveCluster(null);
          }}
          orgId={orgId}
          cluster={activeCluster}
        />
      )}

      <CorporateExploreSheet
        open={!!exploringIndicator}
        onClose={() => setExploringIndicator(null)}
        orgId={orgId}
        indicator={exploringIndicator}
        year={year}
        onConfigureManually={(ind) => {
          setExploringIndicator(null);
          onConfigureManually(ind);
        }}
        onOpenInLancar={onOpenInLancar}
      />
    </div>
  );
}

// ─── ClusterSuggestionCard ────────────────────────────────────────────────

function ClusterSuggestionCard({
  cluster,
  onCreate,
}: {
  cluster: KpiRollupCluster;
  onCreate: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-3 transition",
        "hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700",
      )}
    >
      <div className="mt-0.5 shrink-0 rounded-md bg-indigo-50 p-1.5 dark:bg-indigo-950">
        <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">{cluster.proposedName}</h3>
          <span className="text-[11px] text-muted-foreground">
            detectado em {cluster.members.length} filia{cluster.members.length === 1 ? "l" : "is"}
          </span>
        </div>
        {/* Mostra o texto humano da medição (vem do primeiro membro do cluster).
            Antes mostrávamos a "shape" da fórmula com placeholders __VAR1__/__VAR2__,
            que é útil pra debug mas péssimo de ler. */}
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          {cluster.members[0]?.measurement}
        </p>
        <div className="flex flex-wrap gap-1">
          {cluster.members.slice(0, 6).map((m) => (
            <Badge
              key={m.indicatorId}
              variant="outline"
              className="px-1.5 py-0 text-[10px] font-normal text-foreground/70"
            >
              {m.unit ?? "—"}
            </Badge>
          ))}
          {cluster.members.length > 6 && (
            <span className="text-[10px] text-muted-foreground">+{cluster.members.length - 6}</span>
          )}
        </div>
      </div>
      <Button size="sm" variant="default" className="shrink-0" onClick={onCreate}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Criar Corporativo
      </Button>
    </div>
  );
}

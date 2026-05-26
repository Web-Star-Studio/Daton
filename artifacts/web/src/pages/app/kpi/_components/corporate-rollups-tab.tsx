/**
 * Tab "Corporativos" da página de Indicadores KPI.
 *
 * Layout:
 * ┌────────────────────────────────────────────────────────────┐
 * │ JÁ CONFIGURADOS — indicadores com unit=Corporativo já criados│
 * │   • [Card por Corporativo]                                  │
 * │     - Nome + badge "agrega N filiais"                       │
 * │     - Ações: editar / ver lançamentos / configurar manual   │
 * │                                                              │
 * │ SUGESTÕES — agrupamentos detectados ✨                        │
 * │   • [Card por cluster]                                       │
 * │     - Nome canônico proposto + N membros                     │
 * │     - Fórmula + Periodicidade                                │
 * │     - Botão "Criar Corporativo deste agrupamento" →          │
 * │       abre CreateCorporateFromClusterDialog (single-save)    │
 * │                                                              │
 * │ Se 0 sugestões e 0 corporativos: empty state explicando      │
 * └────────────────────────────────────────────────────────────┘
 *
 * Diferente da tab "Por filial" (vista padrão), aqui o user NÃO cria
 * Corporativos do zero — ele agrupa indicadores filial-level já
 * existentes. Pra criar um Corporativo "do zero" (sem cluster), ainda
 * dá pra fazer pela tab "Por filial" → Novo Indicador → unidade
 * Corporativo, e depois usar "Configurar composição manualmente" no
 * card. Mas esse caminho fica escondido pra não atrapalhar o fluxo
 * principal.
 */
import { useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import {
  useListKpiRollupClusters,
  type KpiIndicator,
  type KpiRollupCluster,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CORPORATE_UNIT_LABEL } from "@/lib/kpi-constants";
import { cn } from "@/lib/utils";
import { CreateCorporateFromClusterDialog } from "./create-corporate-from-cluster-dialog";

interface CorporateRollupsTabProps {
  orgId: number;
  indicators: KpiIndicator[];
  onEditIndicator: (ind: KpiIndicator) => void;
  onConfigureManually: (ind: KpiIndicator) => void;
}

export function CorporateRollupsTab({
  orgId,
  indicators,
  onEditIndicator,
  onConfigureManually,
}: CorporateRollupsTabProps) {
  const [activeCluster, setActiveCluster] = useState<KpiRollupCluster | null>(null);

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
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {existingCorporates.map((ind) => (
              <ExistingCorporateCard
                key={ind.id}
                indicator={ind}
                onEdit={() => onEditIndicator(ind)}
                onConfigureManually={() => onConfigureManually(ind)}
              />
            ))}
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
            // (O hook generated invalida o list de indicators + clusters por convenção)
            setActiveCluster(null);
          }}
          orgId={orgId}
          cluster={activeCluster}
        />
      )}
    </div>
  );
}

// ─── ExistingCorporateCard ────────────────────────────────────────────────

function ExistingCorporateCard({
  indicator,
  onEdit,
  onConfigureManually,
}: {
  indicator: KpiIndicator;
  onEdit: () => void;
  onConfigureManually: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 transition hover:border-foreground/15 hover:shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{indicator.name}</h3>
        <Badge variant="outline" className="shrink-0 border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[10px] font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
          rollup
        </Badge>
      </div>
      {indicator.measurement && (
        <p className="line-clamp-1 text-[11px] text-muted-foreground">{indicator.measurement}</p>
      )}
      <div className="mt-1 flex items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onEdit}>
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-muted-foreground"
          onClick={onConfigureManually}
          title="Ajustar composição manualmente (uso avançado)"
        >
          <Wand2 className="mr-1 h-3 w-3" />
          Composição manual
        </Button>
      </div>
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
        <p className="line-clamp-1 font-mono text-[11px] text-muted-foreground">
          fórmula: {cluster.formulaShape}
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

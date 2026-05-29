/**
 * Tab "Corporativos" da página de Indicadores KPI.
 *
 * Mostra os indicadores corporativos (unit="Corporativo") — KPIs da empresa
 * toda. Podem ser mantidos manualmente (com fórmula própria) ou agregar os
 * valores de indicadores das filiais. A criação é feita pelo botão "Novo
 * corporativo" no header da página (que troca conforme a aba ativa).
 */
import { useMemo } from "react";
import { type KpiIndicator, type KpiYearRow } from "@workspace/api-client-react";
import { CORPORATE_UNIT_LABEL } from "@/lib/kpi-constants";
import { IndicatorCard } from "./indicator-card";

interface CorporateRollupsTabProps {
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
  onEditIndicator: (ind: KpiIndicator) => void;
  onDeleteIndicator: (ind: KpiIndicator) => void;
}

export function CorporateRollupsTab({
  indicators,
  yearRows,
  onEditIndicator,
  onDeleteIndicator,
}: CorporateRollupsTabProps) {
  // Indicadores corporativos (unit=Corporativo)
  const corporates = useMemo(
    () =>
      indicators.filter(
        (ind) =>
          ind.unit?.trim().toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase(),
      ),
    [indicators],
  );

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold text-foreground">
          Indicadores corporativos
          {corporates.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({corporates.length})
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          KPIs da empresa toda — lançados diretamente ou agregando os valores
          de indicadores das filiais.
        </p>
      </header>

      {corporates.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
          Nenhum indicador corporativo. Use "Novo corporativo" (no topo) para
          agregar indicadores das filiais.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {corporates.map((ind) => {
            const yearRow = yearRows.find((r) => r.indicator.id === ind.id);
            return (
              <IndicatorCard
                key={ind.id}
                indicator={ind}
                yearRow={yearRow}
                onEdit={() => onEditIndicator(ind)}
                onDelete={() => onDeleteIndicator(ind)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

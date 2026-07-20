import type {
  OrganizationTraining,
  OrganizationTrainingStatus,
} from "@workspace/api-client-react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CatalogMeta } from "../_lib/catalog-meta";
import {
  formatDate,
  trainingDeadline,
  STATUS_BADGE,
  STATUS_LABEL,
} from "../_lib/format";

/** Tabela "Por colaborador" (também reusada pela aba "Por prazo") — mostra a
 *  Norma resolvida a partir do item de catálogo do treino (`catalogMeta`,
 *  ver `_lib/catalog-meta.ts`; treino sem `catalogItemId`, ou cujo item não
 *  está no mapa, mostra "—"). A criticidade NÃO vem do catálogo (que não tem
 *  `isCritical`) — vem da obrigatoriedade (`training_requirements.isCritical`)
 *  via `t.requirementId → requirementCriticalById`. Treino sem `requirementId`
 *  (ou cujo requisito não está no mapa) não é marcado como crítico. */
export function PorColaboradorTable({
  rows,
  catalogMeta,
  requirementCriticalById,
  loading,
  error,
  emptyLabel,
}: {
  rows: OrganizationTraining[];
  catalogMeta: Map<number, CatalogMeta>;
  requirementCriticalById: Map<number, boolean>;
  loading: boolean;
  error: boolean;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground">Carregando...</p>
    );
  }
  if (error) {
    return (
      <p className="px-4 py-8 text-center text-sm text-red-600">
        Não foi possível carregar os treinamentos.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Colaborador</th>
            <th className="px-4 py-2 font-medium">Cargo</th>
            <th className="px-4 py-2 font-medium">Filial</th>
            <th className="px-4 py-2 font-medium">Treinamento</th>
            <th className="px-4 py-2 font-medium">Norma</th>
            <th className="px-4 py-2 font-medium">Situação</th>
            <th className="px-4 py-2 font-medium">Vencimento</th>
            {/* Ícone + aria-label/title em vez de texto: o badge "Crítico" da
                linha é o único texto correspondente quando NENHUM treino é
                crítico (evita colidir com getByText(/Crítico/i) no teste). */}
            <th
              className="px-4 py-2 font-medium"
              title="Crítico"
              aria-label="Crítico"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const meta =
              t.catalogItemId != null
                ? catalogMeta.get(t.catalogItemId)
                : undefined;
            const normLabel = meta?.normLabels.length
              ? meta.normLabels.join(", ")
              : "—";
            const isCritical =
              t.requirementId != null &&
              requirementCriticalById.get(t.requirementId) === true;
            return (
              <tr
                key={t.id}
                className="border-b last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2 font-medium">{t.employeeName}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {t.employeePosition ?? "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {t.unitName ?? "—"}
                </td>
                <td className="px-4 py-2">{t.title}</td>
                <td className="px-4 py-2 text-muted-foreground">{normLabel}</td>
                <td className="px-4 py-2">
                  {/* Fallback: sem ele, um status fora do contrato (ex.: o
                      `em_andamento` histórico da carga) renderizava um badge
                      VAZIO — pior que mostrar o valor cru. */}
                  <Badge
                    className={cn(
                      "border",
                      STATUS_BADGE[t.status] ??
                        "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {STATUS_LABEL[t.status] ?? t.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatDate(trainingDeadline(t))}
                </td>
                <td className="px-4 py-2">
                  {isCritical ? (
                    <Badge className="border border-red-200 bg-red-50 text-red-700">
                      Crítico
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

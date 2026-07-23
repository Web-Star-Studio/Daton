import React, { useMemo } from "react";
import {
  useListTrainingClasses,
  getListTrainingClassesQueryKey,
  useListUnits,
  type TrainingClass,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { formatClassUnitsLabel } from "@/pages/app/aprendizagem/_components/class-units";

const STATUS_BADGE: Record<string, string> = {
  agendada: "bg-amber-50 text-amber-700",
  em_andamento: "bg-blue-50 text-blue-700",
  realizada: "bg-green-50 text-green-700",
  cancelada: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

/** "2026-07-20" → "20/07/2026". Datas vêm do backend como texto ISO simples
 *  (coluna `date`, sem fuso) — `new Date()` aqui deslocaria o dia. */
function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Histórico de turmas de um item do catálogo, exibido na ficha do treinamento.
 * O backend já filtra por `catalogItemId` na listagem de turmas — não há rota
 * nova envolvida.
 */
export function TurmasDoTreinamento({
  orgId,
  catalogItemId,
}: {
  orgId: number;
  catalogItemId: number;
}) {
  const params = { catalogItemId };
  const { data, isLoading } = useListTrainingClasses(orgId, params, {
    query: {
      enabled: !!orgId && !!catalogItemId,
      queryKey: getListTrainingClassesQueryKey(orgId, params),
    },
  });
  const { data: units = [] } = useListUnits(orgId);
  const unitName = useMemo(
    () => new Map(units.map((u) => [u.id, u.name])),
    [units],
  );

  const classes = data?.data ?? [];

  return (
    <div className="border-t pt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Turmas realizadas
      </h4>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando turmas...</p>
      ) : classes.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma turma registrada para este treinamento ainda.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b text-left uppercase text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Código</th>
                <th className="py-1.5 pr-3 font-medium">Data</th>
                <th className="py-1.5 pr-3 font-medium">Filial</th>
                <th className="py-1.5 pr-3 font-medium">Inscritos</th>
                <th className="py-1.5 pr-3 font-medium">Realizados</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c: TrainingClass) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-medium">
                    {c.code || `#${c.id}`}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {formatDate(c.startDate)}
                  </td>
                  <td
                    className="py-1.5 pr-3 text-muted-foreground"
                    title={formatClassUnitsLabel(c, unitName).title}
                  >
                    {formatClassUnitsLabel(c, unitName).text}
                  </td>
                  <td className="py-1.5 pr-3">{c.participantCount ?? 0}</td>
                  {/* "Realizados" = participantes aprovados. Numa turma ainda
                      agendada é legitimamente 0 — o badge de status ao lado
                      explica o porquê. */}
                  <td className="py-1.5 pr-3">{c.approvedCount ?? 0}</td>
                  <td className="py-1.5">
                    <Badge className={STATUS_BADGE[c.status] ?? ""}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

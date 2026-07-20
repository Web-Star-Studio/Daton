import { Link } from "wouter";
import type { TrainingClass } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, CLASS_STATUS_BADGE, CLASS_STATUS_LABEL } from "../_lib/format";

/** Tabela "Por turma" — Inscritos/Confirmados vêm sempre com valor (default 0
 *  quando ausentes); Realizados fica "—" quando a turma ainda não aconteceu
 *  (campo ausente/undefined no item, ver `confirmedCount`/`realizadoCount`
 *  adicionados na listagem de turmas). */
export function PorTurmaTable({
  classes,
  catalogTitleById,
  unitNameById,
  loading,
  error,
}: {
  classes: TrainingClass[];
  catalogTitleById: Map<number, string>;
  unitNameById: Map<number, string>;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground">Carregando...</p>
    );
  }
  if (error) {
    return (
      <p className="px-4 py-8 text-center text-sm text-red-600">
        Não foi possível carregar as turmas.
      </p>
    );
  }
  if (classes.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        Nenhuma turma encontrada para os filtros selecionados.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Turma</th>
            <th className="px-4 py-2 font-medium">Treinamento</th>
            <th className="px-4 py-2 font-medium">Data</th>
            <th className="px-4 py-2 font-medium">Filial</th>
            <th className="px-4 py-2 font-medium">Inscritos</th>
            <th className="px-4 py-2 font-medium">Confirmados</th>
            <th className="px-4 py-2 font-medium">Realizados</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="px-4 py-2 font-medium">{c.code ?? "—"}</td>
              <td className="px-4 py-2">
                {catalogTitleById.get(c.catalogItemId) ?? `#${c.catalogItemId}`}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {formatDate(c.startDate)}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {c.unitId ? (unitNameById.get(c.unitId) ?? "—") : "—"}
              </td>
              <td className="px-4 py-2 tabular-nums">{c.participantCount ?? 0}</td>
              <td className="px-4 py-2 tabular-nums">{c.confirmedCount ?? 0}</td>
              <td className="px-4 py-2 tabular-nums">{c.realizadoCount ?? "—"}</td>
              <td className="px-4 py-2">
                <Badge className={CLASS_STATUS_BADGE[c.status] ?? ""}>
                  {CLASS_STATUS_LABEL[c.status] ?? c.status}
                </Badge>
              </td>
              <td className="px-4 py-2 text-right">
                <Link
                  href="/aprendizagem/turmas"
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

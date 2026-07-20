// Export helpers — converte a lista já filtrada (aba ativa) da Gestão de
// treinamentos para Excel (xlsx). Padrão idêntico ao de
// `qualidade/regulatorios/_export.ts`: row-builders puros (testáveis) +
// função de escrita que chama `XLSX.writeFile` diretamente.

import * as XLSX from "xlsx";
import type {
  OrganizationTraining,
  OrganizationTrainingStatus,
  TrainingClass,
} from "@workspace/api-client-react";
import type { CatalogMeta } from "./_lib/catalog-meta";
import {
  formatDate,
  trainingDeadline,
  STATUS_LABEL,
  CLASS_STATUS_LABEL,
} from "./_lib/format";

function fileTimestamp(): string {
  // YYYY-MM-DD_HHMM — ordem alfabética cronológica ao arquivar.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Linhas da aba "Por colaborador"/"Por prazo". Norma vem do item de catálogo
 *  (`catalogMeta`); Crítico NÃO vem do catálogo — vem da obrigatoriedade
 *  (`training_requirements.isCritical`) via `t.requirementId`, igual à
 *  coluna homônima de `PorColaboradorTable`. */
export function buildColaboradorRows(
  rows: OrganizationTraining[],
  catalogMeta: Map<number, CatalogMeta>,
  requirementCriticalById: Map<number, boolean>,
): Record<string, string | number>[] {
  return rows.map((t) => {
    const meta =
      t.catalogItemId != null ? catalogMeta.get(t.catalogItemId) : undefined;
    const isCritical =
      t.requirementId != null &&
      requirementCriticalById.get(t.requirementId) === true;
    return {
      Colaborador: t.employeeName,
      Cargo: t.employeePosition ?? "",
      Filial: t.unitName ?? "",
      Treinamento: t.title,
      Norma: meta?.normLabels.join(", ") ?? "",
      Situação:
        STATUS_LABEL[t.status as OrganizationTrainingStatus] ?? t.status,
      Vencimento: formatDate(trainingDeadline(t)).replace("—", ""),
      Crítico: isCritical ? "Sim" : "Não",
    };
  });
}

/** Linhas da aba "Por turma". */
export function buildTurmaRows(
  classes: TrainingClass[],
  catalogTitleById: Map<number, string>,
  unitNameById: Map<number, string>,
): Record<string, string | number>[] {
  return classes.map((c) => ({
    Turma: c.code ?? "",
    Treinamento: catalogTitleById.get(c.catalogItemId) ?? `#${c.catalogItemId}`,
    Data: formatDate(c.startDate).replace("—", ""),
    Filial: c.unitId ? (unitNameById.get(c.unitId) ?? "") : "",
    Inscritos: c.participantCount ?? 0,
    Confirmados: c.confirmedCount ?? 0,
    Realizados: c.approvedCount ?? 0,
    Status: CLASS_STATUS_LABEL[c.status] ?? c.status,
  }));
}

/** Escreve o .xlsx com auto-largura de coluna (mesmo padrão do export de
 *  documentos regulatórios). Sem teste unitário — só delega pro `xlsx`. */
export function exportGestaoXlsx(
  view: "colaborador" | "turma",
  rows: Record<string, string | number>[],
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0] ?? {});
  ws["!cols"] = headers.map((h) => {
    const max = Math.max(
      h.length,
      ...rows.map((r) => String(r[h] ?? "").length),
    );
    return { wch: Math.min(max + 2, 50) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    ws,
    view === "turma" ? "Turmas" : "Colaboradores",
  );
  XLSX.writeFile(wb, `gestao-treinamentos_${fileTimestamp()}.xlsx`);
}

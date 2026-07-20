import type {
  OrganizationTraining,
  OrganizationTrainingStatus,
} from "@workspace/api-client-react";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Format a date-only ISO string (YYYY-MM-DD) as DD/MM/AA without UTC shift. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length === 3) {
    const d = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    );
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
    }
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** Vencimento efetivo de um treinamento (expiração, senão prazo). */
export function trainingDeadline(t: OrganizationTraining): string | null {
  return t.expirationDate ?? t.dueDate ?? null;
}

// ─── Badges ───────────────────────────────────────────────────────────────

// `Record<string, …>` e não `Record<OrganizationTrainingStatus, …>`: além dos
// status do contrato, a base tem registros históricos com `em_andamento`,
// vindos da carga do sistema antigo. Ele não é selecionável em lugar nenhum e
// não entra em contagem alguma — só precisa de rótulo para não aparecer cru
// (ou como badge vazio) na tela.
export const STATUS_BADGE: Record<string, string> = {
  pendente: "bg-blue-50 text-blue-700 border-blue-200",
  concluido: "bg-green-50 text-green-700 border-green-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
  // Neutro: ausência de obrigação, não é sucesso nem alerta.
  nao_aplicavel: "bg-muted text-muted-foreground border-border",
  // Legado da carga: não é estado do v2, só histórico.
  em_andamento: "bg-muted text-muted-foreground border-border",
};
export const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  vencido: "Vencido",
  nao_aplicavel: "Não aplicável",
  em_andamento: "Em andamento",
};

/** Badges de status de TURMA (distintos do status de treinamento acima). */
export const CLASS_STATUS_BADGE: Record<string, string> = {
  agendada: "bg-amber-50 text-amber-700",
  em_andamento: "bg-blue-50 text-blue-700",
  realizada: "bg-green-50 text-green-700",
  cancelada: "bg-muted text-muted-foreground",
};
export const CLASS_STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

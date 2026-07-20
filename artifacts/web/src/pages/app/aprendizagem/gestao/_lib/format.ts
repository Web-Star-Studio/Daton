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

export const STATUS_BADGE: Record<OrganizationTrainingStatus, string> = {
  pendente: "bg-blue-50 text-blue-700 border-blue-200",
  concluido: "bg-green-50 text-green-700 border-green-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
};
export const STATUS_LABEL: Record<OrganizationTrainingStatus, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  vencido: "Vencido",
};

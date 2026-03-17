export const GOVERNANCE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  overdue: "Vencido",
  archived: "Arquivado",
};

export function formatGovernanceDate(value?: string | null, withTime = false) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString(
      "pt-BR",
      withTime
        ? { dateStyle: "short", timeStyle: "short" }
        : { dateStyle: "short" },
    );
  } catch {
    return value;
  }
}

export function dateToIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

export function isoToDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

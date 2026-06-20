export const NORMA_OPTIONS = ["ISO 9001:2015", "ISO 14001:2015", "ISO 39001:2012"];

export const TYPE_COLORS: Record<string, string> = {
  manual: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  procedimento: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  instrucao: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  politica: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  formulario: "bg-slate-50 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  registro: "bg-slate-50 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  outro: "bg-muted text-foreground",
};

export function summarizeDocuments(docs: { status: string }[]) {
  const has = (...s: string[]) => docs.filter((d) => s.includes(d.status)).length;
  return {
    total: docs.length,
    vigentes: has("published", "approved", "distributed"),
    emRevisao: has("in_review"),
    rascunho: has("draft", "rejected"),
  };
}

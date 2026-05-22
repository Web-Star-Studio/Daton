import { useMemo, useState } from "react";
import { CheckCircle2, Download, ListChecks, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  FACTOR_TYPE_LABELS,
  NORM_ITEMS,
  gutRelevance,
  useRoadSafetyFactors,
} from "@/lib/road-safety-client";

type EvidenciaScreenProps = {
  orgId: number;
};

function startOfYearISO(): string {
  return `${new Date().getFullYear()}-01-01`;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EvidenciaScreen({ orgId }: EvidenciaScreenProps) {
  const { data: factors = [], isLoading } = useRoadSafetyFactors(orgId);

  const [periodStart, setPeriodStart] = useState(startOfYearISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [approver, setApprover] = useState("");

  const summary = useMemo(() => {
    let updated = 0;
    let extrema = 0;
    let intermediate = 0;
    let final = 0;
    let exposure = 0;
    for (const f of factors) {
      if (f.updatedThisMonth) updated += 1;
      if (gutRelevance(f.gutScore) === "extrema") extrema += 1;
      if (f.type === "intermediate") intermediate += 1;
      else if (f.type === "final") final += 1;
      else if (f.type === "exposure") exposure += 1;
    }
    return { total: factors.length, updated, extrema, intermediate, final, exposure };
  }, [factors]);

  const coveredItems = useMemo(() => {
    const set = new Set<string>();
    for (const f of factors) {
      if (f.normItem) set.add(f.normItem);
    }
    return set;
  }, [factors]);

  const summaryTiles = [
    { label: "Total de FDs", value: summary.total, tone: "" },
    { label: "FDs atualizados", value: summary.updated, tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Relevância extrema", value: summary.extrema, tone: "text-red-600 dark:text-red-400" },
    { label: `FDs tipo ${FACTOR_TYPE_LABELS.intermediate}`, value: summary.intermediate, tone: "" },
    { label: `FDs tipo ${FACTOR_TYPE_LABELS.final}`, value: summary.final, tone: "" },
    { label: `FDs tipo ${FACTOR_TYPE_LABELS.exposure}`, value: summary.exposure, tone: "" },
  ];

  return (
    <div className="space-y-4">
      {/* Report header */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              Relatório de Evidência para Auditoria
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ISO 39001 · Item 6.3 · Fatores de Desempenho da Segurança Viária
            </p>
          </div>
          <Button variant="outline" size="sm" disabled title="Exportação em breve">
            <Download className="mr-1.5 h-4 w-4" />
            Gerar PDF
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Período — início
            </label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Período — fim
            </label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Aprovador
            </label>
            <Input
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="Nome do responsável pela aprovação"
            />
          </div>
        </div>
      </div>

      {/* Executive summary */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Resumo executivo do período
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {summaryTiles.map((t) => (
            <div key={t.label} className="rounded-lg bg-muted/50 px-3 py-2.5 text-center">
              <div className={cn("text-xl font-semibold tabular-nums text-foreground", t.tone)}>
                {t.value}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Normative coverage */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cobertura normativa — itens 6.3 da ISO 39001
          </h3>
        </div>
        {isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Carregando...</p>
        ) : (
          <ul>
            {NORM_ITEMS.map((item, i) => {
              const covered = coveredItems.has(item.code);
              return (
                <li
                  key={item.code}
                  className={cn(
                    "flex items-center justify-between py-2 text-xs",
                    i < NORM_ITEMS.length - 1 && "border-b",
                  )}
                >
                  <span className="text-foreground">
                    {item.code} — {item.label}
                  </span>
                  {covered ? (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        Coberto
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">Sem FD vinculado</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

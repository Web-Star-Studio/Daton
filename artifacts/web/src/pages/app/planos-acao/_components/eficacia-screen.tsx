import { useMemo } from "react";
import { Check, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useActionPlans,
  useActionPlansSummary,
} from "@/lib/action-plans-client";
import { DashCard, MiniBars } from "./mini-charts";

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Deterministic, auditable criteria applied per action (no IA).
const CRITERIA = [
  "O indicador de verificação melhorou em relação ao 'antes'?",
  "A meta foi atingida após a ação?",
  "A não conformidade reincidiu no período monitorado?",
  "O risco residual foi reduzido?",
];

function Tile({ label, value, tone, bg }: { label: string; value: string; tone: string; bg: string }) {
  return (
    <div className={cn("rounded-xl px-4 py-3 text-center", bg)}>
      <div className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</div>
      <div className={cn("text-[11px]", tone)}>{label}</div>
    </div>
  );
}

export function EficaciaScreen({ orgId }: { orgId: number }) {
  const { data: s } = useActionPlansSummary(orgId);
  const { data: plans = [] } = useActionPlans(orgId);

  const counts = useMemo(() => {
    let effective = 0, ineffective = 0, pending = 0;
    for (const p of plans) {
      if (p.effectivenessResult === "effective") effective++;
      else if (p.effectivenessResult === "ineffective") ineffective++;
      else if (p.status === "completed") pending++;
    }
    return { effective, ineffective, pending, evaluated: effective + ineffective };
  }, [plans]);

  const rate = s?.effectivenessRatePct ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <DashCard title="Painel de eficácia">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Eficazes" value={String(counts.effective)} tone="text-emerald-700 dark:text-emerald-300" bg="bg-emerald-100 dark:bg-emerald-500/15" />
            <Tile label="Não eficazes" value={String(counts.ineffective)} tone="text-red-700 dark:text-red-300" bg="bg-red-100 dark:bg-red-500/15" />
            <Tile label="Aguardando" value={String(counts.pending)} tone="text-amber-700 dark:text-amber-300" bg="bg-amber-100 dark:bg-amber-500/15" />
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">Taxa de eficácia</span>
            <span className="text-lg font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
              {rate === null ? "—" : `${Math.round(rate)}%`}
            </span>
          </div>
        </DashCard>

        <DashCard title="Evolução da taxa de eficácia (6 meses)">
          <MiniBars items={(s?.effectivenessEvolution ?? []).map((e) => ({ label: MONTH_SHORT[e.month - 1] ?? String(e.month), value: e.ratePct }))} suffix="%" />
        </DashCard>
      </div>

      <DashCard title="Verificações automáticas (critérios)" action={<Target className="h-4 w-4 text-muted-foreground" />}>
        <p className="mb-3 text-xs text-muted-foreground">
          A eficácia é avaliada por critérios determinísticos e auditáveis (sem IA) na ficha de cada ação:
        </p>
        <ul className="space-y-2">
          {CRITERIA.map((c) => (
            <li key={c} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                <Check className="h-3 w-3" />
              </span>
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          O comparativo antes × depois e o veredito (Eficaz / Não eficaz) ficam registrados no log de auditoria da ação.
        </p>
      </DashCard>
    </div>
  );
}

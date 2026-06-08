import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ACTION_PLAN_STATUS_LABELS,
  useActionPlansSummary,
  type ActionPlanStatus,
} from "@/lib/action-plans-client";
import { DashCard } from "./mini-charts";

/** Normative requirements this module helps satisfy (informational mapping). */
const NORM_REQUIREMENTS: { code: string; requirement: string }[] = [
  { code: "ISO 9001:10.2", requirement: "Não conformidade e ação corretiva" },
  { code: "ISO 14001:10.2", requirement: "Não conformidade e ação corretiva (ambiental)" },
  { code: "ISO 45001:10.2", requirement: "Incidente, não conformidade e ação corretiva (SST)" },
  { code: "ISO 39001:10.2", requirement: "Melhoria — ação corretiva (segurança viária)" },
  { code: "ISO 9001:9.1", requirement: "Monitoramento, medição e análise (indicadores)" },
];

const STATUS_ORDER: ActionPlanStatus[] = ["open", "in_progress", "completed", "cancelled"];

export function AuditoriaScreen({ orgId }: { orgId: number }) {
  const { data: s } = useActionPlansSummary(orgId);

  const traceability = useMemo(() => {
    const total = s?.total ?? 0;
    const byStatus = s?.byStatus ?? {};
    return { total, byStatus };
  }, [s]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Módulo 100% auditável: cada ação registra criação, alterações, evidências, comentários e avaliação de eficácia
          com data, hora e responsável (veja o <strong>Histórico</strong> em cada ficha). Apto para certificação ISO.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashCard title="Requisitos normativos atendidos">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Norma</TableHead>
                <TableHead>Requisito</TableHead>
                <TableHead className="w-12 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {NORM_REQUIREMENTS.map((r) => (
                <TableRow key={r.code}>
                  <TableCell>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{r.code}</span>
                  </TableCell>
                  <TableCell className="text-sm">{r.requirement}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">✓</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DashCard>

        <DashCard title="Rastreabilidade do tratamento">
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">Total de ações registradas</div>
              <div className="text-2xl font-semibold tabular-nums">{traceability.total}</div>
            </div>
            <div className="space-y-1.5">
              {STATUS_ORDER.map((st) => (
                <div key={st} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{ACTION_PLAN_STATUS_LABELS[st]}</span>
                  <span className="tabular-nums">{traceability.byStatus[st] ?? 0}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              O log de auditoria por ação preserva o nome do autor mesmo após exclusão do usuário (snapshot).
            </p>
          </div>
        </DashCard>
      </div>
    </div>
  );
}

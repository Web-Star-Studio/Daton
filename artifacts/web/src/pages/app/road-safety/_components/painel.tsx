import { useMemo, useState } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  CONTROL_STATUSES,
  CONTROL_STATUS_LABELS,
  FACTOR_ORIGINS,
  FACTOR_TYPES,
  FACTOR_TYPE_LABELS,
  ORIGIN_LABELS,
  factorCurrentValue,
  factorGoalValue,
  factorMeasureUnit,
  formatDateOnly,
  gutRelevance,
  isLinkedToIndicator,
  useLinkedIndicators,
  useRoadSafetyFactors,
} from "@/lib/road-safety-client";
import { formatKpiValue } from "@/lib/kpi-client";
import {
  DiagnosisBadge,
  RelevanceBadge,
  StatusBadge,
  TypeBadge,
} from "./badges";

type PainelScreenProps = {
  orgId: number;
  onView: (id: number) => void;
  onLaunch: (id: number) => void;
  onNew: () => void;
};

function fmt(n: number | null | undefined, unit?: string | null): string {
  // Delega ao formatador central de KPI (moeda com R$, etc.).
  return formatKpiValue(n, unit);
}

type TileTone = "neutral" | "red" | "amber" | "green";
const TILE_VALUE: Record<TileTone, string> = {
  neutral: "text-foreground",
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
  green: "text-emerald-600 dark:text-emerald-400",
};

export function PainelScreen({
  orgId,
  onView,
  onLaunch,
  onNew,
}: PainelScreenProps) {
  const { data: factors = [], isLoading } = useRoadSafetyFactors(orgId);
  const currentYear = new Date().getFullYear();
  const linked = useLinkedIndicators(orgId, currentYear);

  const [typeFilter, setTypeFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [relevanceFilter, setRelevanceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const kpis = useMemo(() => {
    let extrema = 0;
    let staleCount = 0;
    let updatedCount = 0;
    for (const f of factors) {
      if (gutRelevance(f.gutScore) === "extrema") extrema += 1;
      if (f.updatedThisMonth) updatedCount += 1;
      else staleCount += 1;
    }
    return { total: factors.length, extrema, staleCount, updatedCount };
  }, [factors]);

  const filtered = useMemo(
    () =>
      factors.filter((f) => {
        if (typeFilter && f.type !== typeFilter) return false;
        if (originFilter && f.origin !== originFilter) return false;
        if (relevanceFilter && gutRelevance(f.gutScore) !== relevanceFilter)
          return false;
        if (statusFilter && f.controlStatus !== statusFilter) return false;
        return true;
      }),
    [factors, typeFilter, originFilter, relevanceFilter, statusFilter],
  );

  const tiles: { label: string; value: number; tone: TileTone }[] = [
    { label: "Total de FDs", value: kpis.total, tone: "neutral" },
    { label: "Relevância extrema", value: kpis.extrema, tone: "red" },
    { label: "Sem atualização", value: kpis.staleCount, tone: "amber" },
    { label: "Atualizados este mês", value: kpis.updatedCount, tone: "green" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border bg-card px-4 py-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t.label}
            </div>
            <div
              className={cn(
                "mt-1.5 text-[28px] font-semibold leading-none tabular-nums",
                TILE_VALUE[t.tone],
              )}
            >
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Todos os tipos</option>
          {FACTOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {FACTOR_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Toda origem</option>
          {FACTOR_ORIGINS.map((o) => (
            <option key={o} value={o}>
              {ORIGIN_LABELS[o]}
            </option>
          ))}
        </Select>
        <Select
          value={relevanceFilter}
          onChange={(e) => setRelevanceFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Toda relevância</option>
          <option value="baixa">Baixa</option>
          <option value="media">Média</option>
          <option value="alta">Alta</option>
          <option value="extrema">Extrema</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">Todo status</option>
          {CONTROL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONTROL_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : factors.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhum fator de desempenho cadastrado.{" "}
            <button
              type="button"
              onClick={onNew}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Cadastrar o primeiro
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhum fator encontrado com os filtros aplicados.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fator de Desempenho</TableHead>
                <TableHead>Indicador atual</TableHead>
                <TableHead>Meta</TableHead>
                <TableHead>Diagnóstico</TableHead>
                <TableHead>GUT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => {
                const alerting =
                  f.controlStatus === "non_conforming" ||
                  f.controlStatus === "overdue";
                const info =
                  f.kpiIndicatorId != null
                    ? (linked.get(f.kpiIndicatorId) ?? null)
                    : null;
                const unit = factorMeasureUnit(f, info);
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-semibold text-muted-foreground">
                      {f.code}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={f.type} />
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="flex items-start gap-1.5">
                        {alerting ? (
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500"
                            aria-label="Requer atenção"
                          />
                        ) : null}
                        <span className="font-medium text-foreground">
                          {f.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <div className="flex items-center gap-1.5">
                        {fmt(factorCurrentValue(f, info), unit)}
                        {isLinkedToIndicator(f) && info ? (
                          <Link2
                            className="h-3 w-3 shrink-0 text-blue-500"
                            aria-label={`Vinculado ao indicador ${info.name}`}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {fmt(factorGoalValue(f, info), unit)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <DiagnosisBadge
                          status={f.diagnosisStatus}
                          nextDate={f.nextDiagnosisDate ?? null}
                        />
                        {f.lastDiagnosis ? (
                          <p className="text-[11px] text-muted-foreground">
                            {formatDateOnly(f.lastDiagnosis.referenceDate)}
                            {f.lastDiagnosis.diagnosedByUserName
                              ? ` · ${f.lastDiagnosis.diagnosedByUserName}`
                              : ""}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Sem diagnóstico
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RelevanceBadge score={f.gutScore} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={f.controlStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onView(f.id)}
                        >
                          Ver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onLaunch(f.id)}
                        >
                          Lançar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

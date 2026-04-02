import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { YearPicker } from "@/components/ui/year-picker";
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
  MONTH_LABELS,
  PERIODICITY_LABELS,
  computeMonthlyStats,
  getTrafficLight,
  racColor,
  racLabel,
  trafficLightBarColor,
  trafficLightColor,
  trafficLightDotColor,
  useKpiYearData,
} from "@/lib/kpi-client";

const CURRENT_YEAR = new Date().getFullYear();

export default function KpiDashboardPage() {
  const { organization } = useAuth();
  const orgId = organization!.id;

  usePageTitle("Dashboard KPI");
  usePageSubtitle("Visualização e análise dos indicadores");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [unitFilter, setUnitFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: yearRows = [], isLoading } = useKpiYearData(orgId, year, unitFilter || undefined);

  const uniqueUnits = [...new Set(
    yearRows.map((r) => r.indicator.unit).filter(Boolean) as string[]
  )].sort();

  const selectedRow = yearRows.find((r) => r.yearConfig.id === selectedId) ?? yearRows[0] ?? null;

  function formatNumber(v: number | null | undefined, decimals = 2): string {
    if (v === null || v === undefined) return "—";
    return v % 1 === 0 ? v.toFixed(0) : v.toFixed(decimals);
  }

  const direction = selectedRow?.indicator.direction as "up" | "down" | undefined;
  const goal = selectedRow?.yearConfig.goal ?? null;

  const chartData = selectedRow
    ? MONTH_LABELS.map((label, idx) => ({
        label,
        value: selectedRow.monthlyValues[idx]?.value ?? null,
      }))
    : [];

  const stats = selectedRow
    ? computeMonthlyStats(
        selectedRow.monthlyValues.map((mv) => mv.value ?? null),
        goal,
        direction ?? "up",
      )
    : null;

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4 p-6">
      {/* Left panel */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <YearPicker value={year} onChange={setYear} />
          <Select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="">Todas as unidades</option>
            {uniqueUnits.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border bg-card">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Carregando...</div>
          ) : yearRows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum indicador configurado para {year}.
            </div>
          ) : (
            yearRows.map((row) => {
              const monthValues = row.monthlyValues.map((mv) => mv.value ?? null);
              const dir = row.indicator.direction as "up" | "down";
              const { average, overallStatus } = computeMonthlyStats(monthValues, row.yearConfig.goal, dir);
              const isSelected = (selectedRow?.yearConfig.id ?? yearRows[0]?.yearConfig.id) === row.yearConfig.id;

              return (
                <button
                  key={row.yearConfig.id}
                  onClick={() => setSelectedId(row.yearConfig.id)}
                  className={cn(
                    "w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors",
                    isSelected && "bg-muted",
                  )}
                >
                  <div className={cn("mt-1.5 h-2.5 w-2.5 rounded-full shrink-0", trafficLightDotColor(overallStatus))} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium leading-tight line-clamp-2">{row.indicator.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {row.indicator.unit ?? "Corporativo"}
                      {average != null && (
                        <span className="ml-1">· {formatNumber(average)} {row.indicator.measureUnit}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel */}
      {selectedRow ? (
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Header info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{selectedRow.indicator.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{selectedRow.indicator.measurement}</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {selectedRow.objective && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedRow.objective.code && <span className="font-medium mr-1">{selectedRow.objective.code}</span>}
                    {selectedRow.objective.name}
                  </Badge>
                )}
                {selectedRow.indicator.responsible && (
                  <Badge variant="outline" className="text-xs">👤 {selectedRow.indicator.responsible}</Badge>
                )}
                {selectedRow.yearConfig.goal != null && (
                  <Badge variant="outline" className="text-xs">
                    Meta: {formatNumber(selectedRow.yearConfig.goal)} {selectedRow.indicator.measureUnit}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {selectedRow.indicator.direction === "up" ? "↑ Maior é melhor" : "↓ Menor é melhor"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {PERIODICITY_LABELS[selectedRow.indicator.periodicity as keyof typeof PERIODICITY_LABELS] ?? selectedRow.indicator.periodicity}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("text-xs", selectedRow.feedStatus === "fed" ? "border-green-500 text-green-700" : "border-orange-500 text-orange-700")}
                >
                  {selectedRow.feedStatus === "fed" ? "✓ Alimentado" : "⚠ Vencido"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Evolução Mensal {year}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => {
                      const num = typeof value === "number" ? value : null;
                      return [
                        num != null ? `${formatNumber(num)} ${selectedRow.indicator.measureUnit ?? ""}` : "—",
                        "Valor",
                      ] as [string, string];
                    }}
                  />
                  {goal != null && (
                    <ReferenceLine
                      y={goal}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      label={{ value: `Meta: ${formatNumber(goal)}`, position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
                    />
                  )}
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, idx) => {
                      const status = getTrafficLight(entry.value, goal, direction ?? "up");
                      return <Cell key={idx} fill={trafficLightBarColor(status)} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Data table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dados Mensais</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {MONTH_LABELS.map((m) => (
                        <TableHead key={m} className="text-center text-xs px-2">{m}</TableHead>
                      ))}
                      <TableHead className="text-center text-xs px-2 font-semibold">Média</TableHead>
                      <TableHead className="text-center text-xs px-2 font-semibold">Acumulado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      {selectedRow.monthlyValues.map((mv, idx) => {
                        const status = getTrafficLight(mv.value ?? null, goal, direction ?? "up");
                        return (
                          <TableCell
                            key={idx}
                            className={cn("text-center text-xs px-2 py-2", status && trafficLightColor(status))}
                          >
                            {mv.value != null ? formatNumber(mv.value) : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center text-xs px-2 py-2 font-semibold">
                        {stats ? formatNumber(stats.average) : "—"}
                      </TableCell>
                      <TableCell className="text-center text-xs px-2 py-2 font-semibold">
                        {stats ? formatNumber(stats.accumulated) : "—"}
                      </TableCell>
                    </TableRow>
                    {goal != null && (
                      <TableRow className="bg-muted/30">
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <TableCell key={idx} className="text-center text-xs px-2 py-1 text-muted-foreground">
                            {formatNumber(goal)}
                          </TableCell>
                        ))}
                        <TableCell className="text-center text-xs px-2 py-1 text-muted-foreground font-medium" colSpan={2}>
                          Meta: {formatNumber(goal)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* RAC */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1.5">RAC 1° Semestre (Jan–Jun)</p>
                  <span className={cn("text-xs px-2 py-1 rounded-full font-medium", racColor(stats.rac1))}>
                    {racLabel(stats.rac1)}
                  </span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1.5">RAC 2° Semestre (Jul–Dez)</p>
                  <span className={cn("text-xs px-2 py-1 rounded-full font-medium", racColor(stats.rac2))}>
                    {racLabel(stats.rac2)}
                  </span>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {isLoading ? "Carregando..." : "Selecione um indicador na lista."}
        </div>
      )}
    </div>
  );
}

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatKpiNumberFixed, isCurrencyUnit } from "@/lib/kpi-client";
import type { CardStatus } from "./indicator-card";

const MONTH_ABBR = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/** Cor da linha de resultado conforme o semáforo do indicador. */
export const TREND_COLOR_BY_STATUS: Record<CardStatus, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  nodata: "#64748b",
};

/** Tick/tooltip compacto: número (com unidade curta colada quando não é moeda). */
function formatTick(value: number, measureUnit?: string | null): string {
  const formatted = formatKpiNumberFixed(value);
  // Moeda: mantém o eixo enxuto (só número) — "R$" colado/alargando ficaria feio;
  // a unidade fica no contexto (legenda/cabeçalho).
  if (isCurrencyUnit(measureUnit)) return formatted;
  return measureUnit && measureUnit.length <= 3
    ? `${formatted}${measureUnit}`
    : formatted;
}

type MonthlyTrendChartProps = {
  /** Série anual (12 posições, Jan→Dez); `null` = mês sem lançamento. */
  values: (number | null)[];
  /** Tolerância (meta) — vira a linha tracejada de referência. */
  goal: number | null;
  /** Semáforo do indicador — define a cor da linha de resultado. */
  status: CardStatus;
  measureUnit?: string | null;
  /** Altura da área do gráfico em px (não inclui a legenda). Padrão 128. */
  height?: number;
  /** Mês destacado (1–12) — liga o gráfico à seleção da grade de meses. */
  selectedMonth?: number | null;
  /** Mostra a legenda Resultado / Tolerância acima do gráfico. Padrão true. */
  showLegend?: boolean;
  /** Unidade exibida ao fim da legenda (ex.: descrição da unidade do indicador). */
  unit?: string | null;
  className?: string;
};

/**
 * Gráfico de evolução mensal de um indicador (gestão à vista): linha de
 * Resultado colorida pelo semáforo + linha tracejada de Tolerância. Reutilizado
 * no painel de evolução do dashboard e no histórico da tela de lançamento.
 */
export function MonthlyTrendChart({
  values,
  goal,
  status,
  measureUnit,
  height = 128,
  selectedMonth = null,
  showLegend = true,
  unit,
  className,
}: MonthlyTrendChartProps) {
  const data = useMemo(
    () =>
      values.map((v, i) => ({
        name: MONTH_ABBR[i],
        month: i + 1,
        value: v ?? null,
      })),
    [values],
  );

  const color = TREND_COLOR_BY_STATUS[status];
  const hasData = data.some((d) => d.value !== null);

  if (!hasData) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground/70",
          className,
        )}
        style={{ height }}
      >
        sem dados no ano
      </div>
    );
  }

  // Ponto destacado: só quando o mês selecionado tem valor lançado.
  const highlight =
    selectedMonth != null && data[selectedMonth - 1]?.value != null
      ? { name: MONTH_ABBR[selectedMonth - 1], value: data[selectedMonth - 1]!.value as number }
      : null;

  // Domínio do eixo Y fixado para SEMPRE incluir a tolerância — o domínio
  // automático do recharts considera só os valores lançados, então uma meta
  // fora dessa faixa (ex.: resultados ~0 e tolerância 0,5%) ficaria cortada e a
  // linha tracejada não apareceria. Base em 0 quando tudo é não-negativo
  // (mesmo visual do gráfico de referência, que começa em 0).
  const numeric = values.filter((v): v is number => v != null);
  const bounds = goal != null ? [...numeric, goal] : numeric;
  const lo0 = Math.min(...bounds);
  const hi0 = Math.max(...bounds);
  const pad = Math.max((hi0 - lo0) * 0.1, Math.abs(hi0) * 0.05, 0.0001);
  const yDomain: [number, number] = [lo0 >= 0 ? 0 : lo0 - pad, hi0 + pad];

  return (
    <div className={className}>
      {showLegend ? (
        <div className="mb-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-1 w-2.5 rounded"
              style={{ background: color }}
            />
            Resultado
          </span>
          {goal !== null ? (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-0 w-2.5 border-t-2 border-dashed"
                style={{ borderColor: "#ef4444" }}
              />
              Tolerância {formatTick(goal, measureUnit)}
            </span>
          ) : null}
          {unit ? (
            <span className="ml-auto truncate" title={unit}>
              {unit}
            </span>
          ) : null}
        </div>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke="rgba(148,163,184,0.18)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              interval={0}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              tickMargin={4}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={48}
              domain={yDomain}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => formatTick(v, measureUnit)}
              tickLine={false}
              axisLine={false}
            />
            {goal !== null ? (
              <ReferenceLine
                y={goal}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1.25}
                opacity={0.7}
              />
            ) : null}
            <Tooltip
              contentStyle={{
                background: "var(--popover, white)",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 6,
                fontSize: 11,
                padding: "4px 8px",
              }}
              labelStyle={{ fontWeight: 500 }}
              formatter={(value) => {
                const num = typeof value === "number" ? value : null;
                return [num === null ? "—" : formatTick(num, measureUnit), "Resultado"];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
            {highlight ? (
              <ReferenceDot
                x={highlight.name}
                y={highlight.value}
                r={5}
                fill={color}
                stroke="var(--card, #fff)"
                strokeWidth={2}
                isFront
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

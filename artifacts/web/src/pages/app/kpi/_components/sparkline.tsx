import { useMemo } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import type { CardStatus } from "./indicator-card";

type SparklineProps = {
  /** 12-month value array (nulls allowed). */
  values: (number | null)[];
  goal?: number | null;
  status: CardStatus;
  height?: number;
};

const COLOR_BY_STATUS: Record<CardStatus, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  nodata: "#94a3b8",
};

export function Sparkline({ values, goal, status, height = 32 }: SparklineProps) {
  const data = useMemo(
    () =>
      values.map((v, i) => ({
        m: i + 1,
        v: v === null || v === undefined ? null : v,
      })),
    [values],
  );

  const hasData = data.some((d) => d.v !== null);
  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground/70"
        style={{ height }}
      >
        sem dados no ano
      </div>
    );
  }

  const color = COLOR_BY_STATUS[status];
  const numeric = data.map((d) => d.v).filter((v): v is number => v !== null);
  const minV = Math.min(...numeric, ...(goal !== null && goal !== undefined ? [goal] : []));
  const maxV = Math.max(...numeric, ...(goal !== null && goal !== undefined ? [goal] : []));
  const padding = Math.max((maxV - minV) * 0.15, 0.0001);

  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <YAxis hide domain={[minV - padding, maxV + padding]} />
          {goal !== null && goal !== undefined ? (
            <ReferenceLine
              y={goal}
              stroke="#ef4444"
              strokeDasharray="2 3"
              strokeWidth={1}
              opacity={0.55}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            dot={{ r: 1.75, fill: color, strokeWidth: 0 }}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

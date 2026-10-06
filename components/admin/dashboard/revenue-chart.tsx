"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatINRShort, longDate, shortDate } from "@/lib/format";
import { formatINR } from "@/lib/money";

export interface DailyPoint {
  date: string;
  revenue: number;
  orders: number;
}

// Chart tokens (light surface; the owner panel is a light UI). Series slot 1 from the
// validated palette; recessive one-step-off-surface grid.
const SERIES = "#a8a29e";
const SERIES_TODAY = "#c25e3e";
const GRID = "#e5dfd7";
const INK_2 = "#78716c";

// Recharts clones this element and passes the hovered point in `payload`.
function DailyTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload: DailyPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DailyPoint;
  return (
    <div className="rounded-xl bg-[#1c1917] px-3 py-2 text-sm text-white shadow-lg">
      <p className="font-medium">{longDate(point.date)}</p>
      <p className="tabular-nums">{formatINR(point.revenue)}</p>
      <p className="text-white/70 tabular-nums">
        {point.orders} order{point.orders === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Daily sales as columns: one series, so no legend; the card title names it. */
export function RevenueChart({ data, today }: { data: DailyPoint[]; today: string }) {
  const barSize = Math.max(4, Math.min(24, Math.floor(640 / data.length) - 4));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fill: INK_2, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => formatINRShort(v)}
            tick={{ fill: INK_2, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip content={<DailyTooltip />} cursor={{ fill: "rgba(194,94,62,0.08)" }} />
          <Bar
            dataKey="revenue"
            name="Sales"
            maxBarSize={barSize}
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={500}
            shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: DailyPoint }) => {
              const { x = 0, y = 0, width = 0, height = 0, payload } = props;
              const r = Math.min(4, width / 2, height);
              const fill = payload?.date === today ? SERIES_TODAY : SERIES;
              // Rounded data end, square at the baseline.
              return <path d={`M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`} fill={fill} />;
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

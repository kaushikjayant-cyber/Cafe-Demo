"use client";

import { useState } from "react";

export interface HeatCell {
  dow: number; // ISO: 1 = Monday … 7 = Sunday
  hour: number;
  orders: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Sequential blue ramp (validated palette, steps 100 → 700): near-zero recedes to the surface.
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const EMPTY = "#f3f1ec";

function hourLabel(hour: number): string {
  return hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`;
}

/** When the cafe is busiest: orders by weekday and hour, one hue light → dark. */
export function PeakHoursHeatmap({ cells }: { cells: HeatCell[] }) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const hours = cells.length ? Array.from({ length: Math.max(...cells.map((c) => c.hour)) - Math.min(...cells.map((c) => c.hour)) + 1 }, (_, i) => Math.min(...cells.map((c) => c.hour)) + i) : [];
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const at = (dow: number, hour: number) => cells.find((c) => c.dow === dow && c.hour === hour)?.orders ?? 0;
  const color = (n: number) => (n === 0 ? EMPTY : RAMP[Math.min(RAMP.length - 1, Math.floor((n / max) * RAMP.length))]);
  const busiest = cells.reduce<HeatCell | null>((best, c) => (!best || c.orders > best.orders ? c : best), null);

  if (!cells.length) return <p className="py-10 text-center text-sm text-[var(--g-muted)]">No orders in this period yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-xs" aria-describedby="heatmap-summary">
          <thead>
            <tr>
              <th className="w-10" />
              {hours.map((h) => (
                <th key={h} scope="col" className="pb-1 font-normal text-[var(--g-muted)]">
                  {hourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, i) => (
              <tr key={day}>
                <th scope="row" className="pr-2 text-left font-normal text-[var(--g-muted)]">
                  {day}
                </th>
                {hours.map((h) => {
                  const n = at(i + 1, h);
                  return (
                    <td
                      key={h}
                      tabIndex={0}
                      aria-label={`${day} ${hourLabel(h)}: ${n} orders`}
                      onMouseEnter={() => setHover({ dow: i + 1, hour: h, orders: n })}
                      onFocus={() => setHover({ dow: i + 1, hour: h, orders: n })}
                      onMouseLeave={() => setHover(null)}
                      className="h-7 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[#1c1b18]"
                      style={{ background: color(n) }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--g-muted)]">
        <p id="heatmap-summary" aria-live="polite" className="min-h-4">
          {hover
            ? `${DAYS[hover.dow - 1]} ${hourLabel(hover.hour)}–${hourLabel((hover.hour + 1) % 24)}: ${hover.orders} orders`
            : busiest && `Busiest: ${DAYS[busiest.dow - 1]} around ${hourLabel(busiest.hour)} (${busiest.orders} orders)`}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          Fewer
          {RAMP.map((c) => (
            <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

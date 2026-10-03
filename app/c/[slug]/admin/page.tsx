import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/admin/admin-shell";
import { PeakHoursHeatmap, type HeatCell } from "@/components/admin/dashboard/heatmap";
import { RevenueChart, type DailyPoint } from "@/components/admin/dashboard/revenue-chart";
import { formatINRShort, percentChange, shortDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";
import { tenantHref } from "@/lib/tenant";

export const metadata: Metadata = { title: "Dashboard" };

interface Dashboard {
  today: string;
  days: number;
  today_stats: { revenue: number; orders: number };
  last_week_stats: { revenue: number; orders: number };
  period_stats: { revenue: number; orders: number };
  daily: DailyPoint[];
  top_items: { name: string; qty: number; revenue: number }[];
  slow_items: { name: string; qty: number }[];
  heatmap: HeatCell[];
  payment_mix: { method: string; revenue: number; orders: number }[];
  tables: { label: string; revenue: number; orders: number }[];
}

const RANGES = [7, 30, 90] as const;
const METHOD_LABEL: Record<string, string> = { online: "Online", upi_counter: "UPI at counter", cash: "Cash", card_counter: "Card at counter", unpaid: "Not yet paid" };
// Validated categorical slots 1-5, in fixed order (see the dataviz palette reference).
const METHOD_COLOR: Record<string, string> = { online: "#2a78d6", upi_counter: "#eb6834", cash: "#1baf7a", card_counter: "#eda100", unpaid: "#e87ba4" };
const METHOD_ORDER = ["online", "upi_counter", "cash", "card_counter", "unpaid"];

export default async function DashboardPage({ params, searchParams }: PageProps<"/c/[slug]/admin">) {
  const { slug } = await params;
  const { cafe, base } = await requireStaff(slug, ["owner", "manager"], "/admin");
  const requested = Number((await searchParams).days);
  const days = (RANGES as readonly number[]).includes(requested) ? requested : 30;

  const { data, error } = await (await createUserClient()).rpc("admin_dashboard", { p_cafe: cafe.id, p_days: days });
  if (error) throw error;
  const d = data as Dashboard;

  const avg = (s: { revenue: number; orders: number }) => (s.orders ? Math.round(s.revenue / s.orders) : 0);
  const mix = [...d.payment_mix].sort((a, b) => METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));
  const mixTotal = mix.reduce((sum, m) => sum + m.revenue, 0);
  const topMax = Math.max(1, ...d.top_items.map((i) => i.qty));
  const tableMax = Math.max(1, ...d.tables.map((t) => t.revenue));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Business day ${shortDate(d.today)} · today compared with the same time last week`}
        actions={
          <nav aria-label="Period" className="flex rounded-xl bg-[var(--g-soft)] p-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`${tenantHref(base, "/admin")}?days=${r}`}
                aria-current={r === days ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${r === days ? "bg-[var(--g-surface)] shadow-sm" : "text-[var(--g-muted)] hover:text-[var(--g-ink)]"}`}
              >
                {r} days
              </Link>
            ))}
          </nav>
        }
      />

      <section aria-label="Today" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile hero label="Sales today" value={formatINR(d.today_stats.revenue)} current={d.today_stats.revenue} previous={d.last_week_stats.revenue} />
        <StatTile label="Orders today" value={d.today_stats.orders.toLocaleString("en-IN")} current={d.today_stats.orders} previous={d.last_week_stats.orders} />
        <StatTile label="Average bill today" value={formatINR(avg(d.today_stats))} current={avg(d.today_stats)} previous={avg(d.last_week_stats)} />
        <StatTile label={`Sales, last ${days} days`} value={formatINRShort(d.period_stats.revenue)} note={`${d.period_stats.orders.toLocaleString("en-IN")} orders · avg ${formatINR(avg(d.period_stats))}`} />
      </section>

      <Card title="Daily sales" subtitle={`Last ${days} days · today in darker blue`}>
        <RevenueChart data={d.daily} today={d.today} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-[var(--g-muted)]">Show as a table</summary>
          <div className="mt-2 max-h-64 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[var(--g-surface)] text-[var(--g-muted)]">
                <tr>
                  <th className="py-1 font-medium">Day</th>
                  <th className="py-1 text-right font-medium">Orders</th>
                  <th className="py-1 text-right font-medium">Sales</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...d.daily].reverse().map((p) => (
                  <tr key={p.date} className="border-t border-[var(--g-line)]">
                    <td className="py-1">{shortDate(p.date)}</td>
                    <td className="py-1 text-right">{p.orders}</td>
                    <td className="py-1 text-right">{formatINR(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Best sellers" subtitle="By quantity sold">
          {d.top_items.length === 0 ? (
            <Empty />
          ) : (
            <ol className="flex flex-col gap-2.5">
              {d.top_items.map((item) => (
                <li key={item.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate">{item.name}</span>
                  <span className="h-4 rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${(item.qty / topMax) * 100}%` }} />
                  <span className="text-right text-[var(--g-muted)] tabular-nums">
                    {item.qty} · {formatINRShort(item.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {d.slow_items.length > 0 && (
            <div className="mt-5 rounded-xl bg-[var(--g-bg)] p-3 text-sm">
              <p className="font-medium">Selling slowly</p>
              <p className="mt-0.5 text-[var(--g-muted)]">
                {d.slow_items.map((s) => `${s.name} (${s.qty})`).join(" · ")}. Worth a promotion, a combo, or a spot off the menu.
              </p>
            </div>
          )}
        </Card>

        <Card title="Busiest hours" subtitle="Orders by day of the week and hour">
          <PeakHoursHeatmap cells={d.heatmap} />
        </Card>

        <Card title="How guests pay" subtitle={`Share of sales, last ${days} days`}>
          {mixTotal === 0 ? (
            <Empty />
          ) : (
            <>
              <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label="Share of sales by payment method">
                {mix.map((m) => (
                  <span key={m.method} style={{ width: `${(m.revenue / mixTotal) * 100}%`, background: METHOD_COLOR[m.method] ?? "#9a9790" }} />
                ))}
              </div>
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {mix.map((m) => (
                  <li key={m.method} className="flex items-center gap-2">
                    <span className="size-3 rounded-[3px]" style={{ background: METHOD_COLOR[m.method] ?? "#9a9790" }} aria-hidden />
                    <span className="flex-1">{METHOD_LABEL[m.method] ?? m.method}</span>
                    <span className="text-[var(--g-muted)] tabular-nums">{m.orders} orders</span>
                    <span className="w-24 text-right font-medium tabular-nums">{formatINRShort(m.revenue)}</span>
                    <span className="w-12 text-right text-[var(--g-muted)] tabular-nums">{Math.round((m.revenue / mixTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Sales by table" subtitle="Which tables earn the most">
          {d.tables.length === 0 ? (
            <Empty />
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {d.tables.slice(0, 8).map((t) => (
                <li key={t.label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
                  <span className="font-medium">{t.label}</span>
                  <span className="h-3 rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${(t.revenue / tableMax) * 100}%` }} />
                  <span className="text-right text-[var(--g-muted)] tabular-nums">
                    {formatINRShort(t.revenue)} · {t.orders}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="anim-rise flex min-w-0 flex-col gap-4 rounded-2xl bg-[var(--g-surface)] p-5 ring-1 ring-[var(--g-line)]">
      <div>
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--g-muted)]">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="py-10 text-center text-sm text-[var(--g-muted)]">No sales in this period yet.</p>;
}

/** Stat tile: label · value · change vs the same weekday last week (icon + text, never colour alone). */
function StatTile({ label, value, current, previous, note, hero }: { label: string; value: string; current?: number; previous?: number; note?: string; hero?: boolean }) {
  const change = current !== undefined && previous !== undefined ? percentChange(current, previous) : null;
  const tone = change === null || change === 0 ? "text-[var(--g-muted)]" : change > 0 ? "text-[#0a7a0a]" : "text-[#b42318]";
  const Icon = change === null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="anim-rise flex flex-col gap-1 rounded-2xl bg-[var(--g-surface)] p-5 ring-1 ring-[var(--g-line)]">
      <p className="text-sm text-[var(--g-muted)]">{label}</p>
      <p className={`font-semibold tracking-tight ${hero ? "text-4xl md:text-5xl" : "text-3xl"}`}>{value}</p>
      {note ? (
        <p className="text-sm text-[var(--g-muted)]">{note}</p>
      ) : (
        current !== undefined && (
          <p className={`flex items-center gap-1 text-sm ${tone}`}>
            <Icon className="size-4" aria-hidden />
            {change === null ? "No sales by this time last week" : `${change > 0 ? "+" : ""}${change}% vs this time last week`}
          </p>
        )
      )}
    </div>
  );
}

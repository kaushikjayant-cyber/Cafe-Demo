import { Download, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/admin/admin-shell";
import { ORDER_FILTERS, parseOrderQuery, queryOrders, refundedPaise, type OrderFilter } from "@/lib/data/admin-orders";
import { formatINRShort, shortDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { requireStaff } from "@/lib/staff-auth";
import { tenantHref } from "@/lib/tenant";

export const metadata: Metadata = { title: "Orders & bills" };

const PAGE_SIZE = 50;
const FILTER_LABEL: Record<OrderFilter, string> = { all: "All", paid: "Paid", unpaid: "Unpaid", refunded: "Refunded", cancelled: "Cancelled" };
const METHOD: Record<string, string> = { online: "Online", cash: "Cash", upi_counter: "UPI", card_counter: "Card" };

function statusChip(status: string, payment: string) {
  if (["cancelled", "rejected", "expired"].includes(status)) return { text: status === "expired" ? "Expired" : status === "rejected" ? "Rejected" : "Cancelled", tone: "bg-[var(--g-soft)] text-[var(--g-muted)]" };
  if (payment === "refunded") return { text: "Refunded", tone: "bg-violet-50 text-violet-800 ring-1 ring-violet-200" };
  if (payment === "partially_refunded") return { text: "Part refunded", tone: "bg-violet-50 text-violet-800 ring-1 ring-violet-200" };
  if (payment === "paid") return { text: "Paid", tone: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" };
  return { text: status === "pending_payment" ? "Awaiting payment" : "Unpaid", tone: "bg-amber-50 text-amber-900 ring-1 ring-amber-200" };
}

export default async function OrdersPage({ params, searchParams }: PageProps<"/c/[slug]/admin/orders">) {
  const { slug } = await params;
  const { cafe, base } = await requireStaff(slug, ["owner", "manager"], "/admin/orders");
  const q = parseOrderQuery(await searchParams, cafe);
  const { rows, total } = await queryOrders(cafe.id, q, { offset: (q.page - 1) * PAGE_SIZE, limit: PAGE_SIZE });

  const href = (patch: Partial<Record<"from" | "to" | "status" | "q" | "page", string>>) => {
    const next = new URLSearchParams({ from: q.from, to: q.to, status: q.filter, ...(q.search ? { q: q.search } : {}), ...patch });
    if (next.get("status") === "all") next.delete("status");
    if (next.get("page") === "1") next.delete("page");
    return `${tenantHref(base, "/admin/orders")}?${next}`;
  };
  const exportHref = `${tenantHref(base, "/admin/orders/export")}?${new URLSearchParams({ from: q.from, to: q.to, status: q.filter })}`;
  const sum = rows.filter((r) => r.payment_status !== "unpaid").reduce((s, r) => s + r.total_paise - refundedPaise(r), 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Orders & bills"
        description={`${total.toLocaleString("en-IN")} orders from ${shortDate(q.from)} to ${shortDate(q.to)}`}
        actions={
          <a
            href={exportHref}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--g-surface)] px-4 text-sm font-semibold ring-1 ring-[var(--g-line)] hover:ring-[var(--brand)]"
          >
            <Download className="size-4" /> Export CSV for GST
          </a>
        }
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--g-surface)] p-4 ring-1 ring-[var(--g-line)]" action={tenantHref(base, "/admin/orders")}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--g-muted)]">From</span>
          <input id="orders-from" type="date" name="from" defaultValue={q.from} className="h-10 rounded-lg bg-[var(--g-bg)] px-3 ring-1 ring-[var(--g-line)]" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--g-muted)]">To</span>
          <input id="orders-to" type="date" name="to" defaultValue={q.to} className="h-10 rounded-lg bg-[var(--g-bg)] px-3 ring-1 ring-[var(--g-line)]" />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="text-[var(--g-muted)]">Order # or invoice no.</span>
          <span className="flex h-10 items-center gap-2 rounded-lg bg-[var(--g-bg)] px-3 ring-1 ring-[var(--g-line)]">
            <Search className="size-4 text-[var(--g-muted)]" />
            <input id="orders-search" name="q" defaultValue={q.search} placeholder="e.g. 42 or BB/2627/000123" className="w-full bg-transparent outline-none" />
          </span>
        </label>
        {q.filter !== "all" && <input type="hidden" name="status" value={q.filter} />}
        <button type="submit" className="h-10 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-fg)]">
          Show orders
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter" className="flex flex-wrap gap-1 rounded-xl bg-[var(--g-soft)] p-1">
          {ORDER_FILTERS.map((f) => (
            <Link
              key={f}
              href={href({ status: f, page: "1" })}
              aria-current={f === q.filter ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${f === q.filter ? "bg-[var(--g-surface)] shadow-sm" : "text-[var(--g-muted)] hover:text-[var(--g-ink)]"}`}
            >
              {FILTER_LABEL[f]}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-[var(--g-muted)]">
          Collected on this page: <span className="font-semibold text-[var(--g-ink)]">{formatINRShort(sum)}</span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-[var(--g-surface)] ring-1 ring-[var(--g-line)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-[var(--g-line)] text-left text-[var(--g-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Table</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[var(--g-muted)]">
                  No orders match. Try a wider date range.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const chip = statusChip(row.status, row.payment_status);
              const time = new Intl.DateTimeFormat("en-IN", { timeZone: cafe.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(row.created_at));
              return (
                <tr key={row.id} className="border-b border-[var(--g-line)] last:border-0 hover:bg-[var(--g-bg)]">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {shortDate(row.business_date)} <span className="text-[var(--g-muted)]">{time}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={tenantHref(base, `/admin/orders/${row.id}`)} className="font-semibold text-[var(--brand)] hover:underline">
                      #{row.daily_no}
                    </Link>
                    {row.guest_name && <span className="ml-2 text-[var(--g-muted)]">{row.guest_name}</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{row.invoice_no ?? "—"}</td>
                  <td className="px-4 py-2.5">{row.tables?.label ?? "Counter"}</td>
                  <td className="px-4 py-2.5 text-[var(--g-muted)]">{row.payment_method ? METHOD[row.payment_method] ?? row.payment_method : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(row.total_paise)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.tone}`}>{chip.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-2 text-sm">
          {q.page > 1 && (
            <Link href={href({ page: String(q.page - 1) })} className="rounded-lg px-3 py-1.5 ring-1 ring-[var(--g-line)]">
              Newer
            </Link>
          )}
          <span className="text-[var(--g-muted)]">
            Page {q.page} of {pages}
          </span>
          {q.page < pages && (
            <Link href={href({ page: String(q.page + 1) })} className="rounded-lg px-3 py-1.5 ring-1 ring-[var(--g-line)]">
              Older
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

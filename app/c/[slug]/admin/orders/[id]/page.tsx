import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { RefundButton } from "@/components/admin/refund-button";
import { Bill, type BillOrder } from "@/components/bill";
import { PrintButton } from "@/components/print-button";
import { formatINR } from "@/lib/money";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";
import { tenantHref } from "@/lib/tenant";

export const metadata: Metadata = { title: "Order" };

interface Detail extends BillOrder {
  id: string;
  status: string;
  source: string;
  note: string | null;
  cancel_reason: string | null;
  placed_at: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  payments: { id: string; provider: string; status: string; amount_paise: number; rp_payment_id: string | null; created_at: string; refunds: { amount_paise: number; reason: string | null; created_at: string }[] }[];
}

const SELECT =
  "id, daily_no, invoice_no, paid_at, created_at, payment_method, payment_status, guest_name, subtotal_paise, tax_paise, cgst_paise, sgst_paise, " +
  "round_off_paise, total_paise, tax_rate_bp, prices_include_tax, gst_mode, status, source, note, cancel_reason, placed_at, accepted_at, ready_at, served_at, " +
  "tables(label), order_items(id, name_snapshot, qty, unit_price_paise, line_total_paise, options_snapshot, status), " +
  "payments(id, provider, status, amount_paise, rp_payment_id, created_at, refunds(amount_paise, reason, created_at))";

export default async function OrderDetailPage({ params }: PageProps<"/c/[slug]/admin/orders/[id]">) {
  const { slug, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { cafe, base } = await requireStaff(slug, ["owner", "manager"], "/admin/orders");

  const { data: order } = await (await createUserClient()).from("orders").select(SELECT).eq("id", id).eq("cafe_id", cafe.id).maybeSingle<Detail>();
  if (!order) notFound();

  const time = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { timeZone: cafe.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : null);
  const steps = [
    ["Placed", order.placed_at ?? order.created_at],
    ["Accepted", order.accepted_at],
    ["Ready", order.ready_at],
    ["Served", order.served_at],
    ["Paid", order.paid_at],
  ].filter(([, at]) => at) as [string, string][];
  const refundable = order.payments.some((p) => p.status === "captured" && p.amount_paise > p.refunds.reduce((s, r) => s + r.amount_paise, 0));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={tenantHref(base, "/admin/orders")} className="flex items-center gap-2 text-sm font-medium text-[var(--g-muted)] hover:text-[var(--g-ink)]">
          <ArrowLeft className="size-4" /> All orders
        </Link>
        {order.invoice_no && <PrintButton />}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
        <Bill cafe={cafe} order={order} />

        <div className="flex flex-col gap-4 print:hidden">
          <section className="rounded-2xl bg-[var(--g-surface)] p-5 ring-1 ring-[var(--g-line)]">
            <h2 className="font-heading text-lg font-bold">Order #{order.daily_no}</h2>
            <p className="text-sm text-[var(--g-muted)]">
              {order.source === "qr" ? "Ordered by QR" : "Taken by staff"} · status <span className="font-medium text-[var(--g-ink)]">{order.status.replace("_", " ")}</span>
            </p>
            {order.cancel_reason && <p className="mt-2 text-sm">Reason: {order.cancel_reason}</p>}
            {order.note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Note: {order.note}</p>}
            <ol className="mt-4 flex flex-col gap-1.5 text-sm">
              {steps.map(([label, at]) => (
                <li key={label} className="flex justify-between">
                  <span>{label}</span>
                  <span className="text-[var(--g-muted)] tabular-nums">{time(at)}</span>
                </li>
              ))}
            </ol>
          </section>

          {order.payments.length > 0 && (
            <section className="rounded-2xl bg-[var(--g-surface)] p-5 ring-1 ring-[var(--g-line)]">
              <h2 className="font-heading text-lg font-bold">Online payments</h2>
              <ul className="mt-3 flex flex-col gap-3 text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1 border-t border-[var(--g-line)] pt-3 first:border-0 first:pt-0">
                    <div className="flex justify-between">
                      <span className="font-medium">{formatINR(p.amount_paise)}</span>
                      <span className="text-[var(--g-muted)] capitalize">{p.status}</span>
                    </div>
                    <span className="font-mono text-xs text-[var(--g-muted)]">{p.rp_payment_id ?? "Not completed"}</span>
                    {p.refunds.map((r) => (
                      <span key={r.created_at} className="text-violet-800">
                        Refunded {formatINR(r.amount_paise)}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              {refundable && (
                <div className="mt-4">
                  <RefundButton orderId={order.id} label="Refund the online payment" />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

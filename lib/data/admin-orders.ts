import "server-only";

import { z } from "zod";

import { businessDate } from "@/lib/business-date";
import type { PublicCafe } from "@/lib/data/cafes";
import { createUserClient } from "@/lib/supabase/server";

// Filters shared by the orders list and its CSV export, read from the URL.

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ORDER_FILTERS = ["all", "paid", "unpaid", "refunded", "cancelled"] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export interface OrderQuery {
  from: string;
  to: string;
  filter: OrderFilter;
  search: string;
  page: number;
}

export function parseOrderQuery(params: Record<string, string | string[] | undefined>, cafe: Pick<PublicCafe, "timezone" | "day_starts_at">): OrderQuery {
  const one = (key: string) => (Array.isArray(params[key]) ? params[key]![0] : params[key]) ?? "";
  const today = businessDate(new Date(), cafe.timezone, cafe.day_starts_at.slice(0, 5));
  const weekAgo = new Date(`${today}T00:00:00Z`);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);

  let from = dateString.safeParse(one("from")).success ? one("from") : weekAgo.toISOString().slice(0, 10);
  let to = dateString.safeParse(one("to")).success ? one("to") : today;
  if (from > to) [from, to] = [to, from];
  const filter = (ORDER_FILTERS as readonly string[]).includes(one("status")) ? (one("status") as OrderFilter) : "all";
  const page = Math.max(1, Math.min(500, Number.parseInt(one("page"), 10) || 1));
  return { from, to, filter, search: one("q").trim().slice(0, 30), page };
}

export const ORDER_LIST_SELECT =
  "id, daily_no, business_date, created_at, paid_at, status, payment_status, payment_method, invoice_no, total_paise, " +
  "subtotal_paise, tax_paise, cgst_paise, sgst_paise, round_off_paise, prices_include_tax, guest_name, source, table_id, tables(label), " +
  "refunds:payments(refunds(amount_paise))";

export interface AdminOrderRow {
  id: string;
  daily_no: number;
  business_date: string;
  created_at: string;
  paid_at: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  invoice_no: string | null;
  total_paise: number;
  subtotal_paise: number;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  round_off_paise: number;
  prices_include_tax: boolean;
  guest_name: string | null;
  source: string;
  tables: { label: string } | null;
  refunds: { refunds: { amount_paise: number }[] }[];
}

/** GST taxable value: menu prices either include the tax or have it added on top. */
export function taxablePaise(row: Pick<AdminOrderRow, "subtotal_paise" | "tax_paise" | "prices_include_tax">): number {
  return row.prices_include_tax ? row.subtotal_paise - row.tax_paise : row.subtotal_paise;
}

export function refundedPaise(row: AdminOrderRow): number {
  return row.refunds.flatMap((p) => p.refunds).reduce((sum, r) => sum + r.amount_paise, 0);
}

/** Orders for the owner panel, read through RLS (staff of this cafe only). */
export async function queryOrders(cafeId: string, q: OrderQuery, range: { offset: number; limit: number }) {
  const supabase = await createUserClient();
  let query = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT, { count: "exact" })
    .eq("cafe_id", cafeId)
    .gte("business_date", q.from)
    .lte("business_date", q.to)
    .order("created_at", { ascending: false })
    .range(range.offset, range.offset + range.limit - 1);

  if (q.filter === "paid") query = query.eq("payment_status", "paid");
  if (q.filter === "unpaid") query = query.eq("payment_status", "unpaid").not("status", "in", "(cancelled,rejected,expired)");
  if (q.filter === "refunded") query = query.in("payment_status", ["refunded", "partially_refunded"]);
  if (q.filter === "cancelled") query = query.in("status", ["cancelled", "rejected", "expired"]);

  if (q.search) {
    const asNumber = Number.parseInt(q.search.replace(/^#/, ""), 10);
    query = /^#?\d+$/.test(q.search) ? query.eq("daily_no", asNumber) : query.ilike("invoice_no", `%${q.search.replace(/[%_]/g, "")}%`);
  }

  const { data, error, count } = await query.returns<AdminOrderRow[]>();
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

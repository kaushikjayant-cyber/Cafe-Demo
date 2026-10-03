import { NextResponse } from "next/server";

import { parseOrderQuery, queryOrders, refundedPaise, taxablePaise } from "@/lib/data/admin-orders";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { getStaffSession } from "@/lib/staff-auth";

const MAX_ROWS = 20_000;
const PAGE = 1000;
// A byte-order mark so Excel reads the file as UTF-8.
const BOM = String.fromCharCode(0xfeff);
const rupees = (paise: number) => (paise / 100).toFixed(2);

/** RFC 4180 field: quote when needed, and neutralise spreadsheet formulas (CSV injection). */
function field(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // Plain numbers (including negative round-offs) stay numbers; anything else that could
  // start a formula gets a leading quote.
  if (!/^-?\d+(\.\d+)?$/.test(text) && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// GET /admin/orders/export: the filtered orders as a CSV the accountant can use for GST
// returns: invoice number, date, taxable value, CGST, SGST, round off, total, refunds.
export async function GET(request: Request, ctx: RouteContext<"/c/[slug]/admin/orders/export">) {
  const { slug } = await ctx.params;
  const cafe = await getCafeByTenantKey(slug);
  if (!cafe) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const staff = await getStaffSession(cafe.id);
  if (!staff || !["owner", "manager"].includes(staff.role)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });

  const q = parseOrderQuery(Object.fromEntries(new URL(request.url).searchParams), cafe);
  // Supabase returns at most 1,000 rows per request, so read the range in pages.
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const page = await queryOrders(cafe.id, { ...q, page: 1 }, { offset, limit: PAGE });
    rows.push(...page.rows);
    if (page.rows.length < PAGE) break;
  }

  const time = new Intl.DateTimeFormat("en-GB", { timeZone: cafe.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const header = [
    "Invoice no", "Business date", "Time", "Order no", "Table", "Status", "Payment status", "Payment method",
    "Taxable value", "CGST", "SGST", "Round off", "Invoice total", "Refunded", "Net received",
  ];
  const lines = [...rows].reverse().map((r) => {
    const taxable = taxablePaise(r);
    const refunded = refundedPaise(r);
    const received = r.payment_status === "unpaid" ? 0 : r.total_paise - refunded;
    return [
      r.invoice_no, r.business_date, time.format(new Date(r.created_at)), r.daily_no, r.tables?.label ?? "Counter", r.status,
      r.payment_status, r.payment_method, rupees(taxable), rupees(r.cgst_paise), rupees(r.sgst_paise), rupees(r.round_off_paise),
      rupees(r.total_paise), rupees(refunded), rupees(received),
    ].map(field).join(",");
  });

  const csv = BOM + [header.map(field).join(","), ...lines].join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${cafe.slug}-orders-${q.from}-to-${q.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

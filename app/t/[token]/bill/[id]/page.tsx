import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Bill, type BillOrder } from "@/components/bill";
import { PrintButton } from "@/components/print-button";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { getGuestMenu } from "@/lib/data/menu";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your bill", robots: { index: false } };

const SELECT =
  "daily_no, invoice_no, paid_at, created_at, payment_method, payment_status, guest_name, subtotal_paise, tax_paise, " +
  "cgst_paise, sgst_paise, round_off_paise, total_paise, tax_rate_bp, prices_include_tax, gst_mode, table_id, " +
  "order_items(id, name_snapshot, qty, unit_price_paise, line_total_paise, options_snapshot, status)";

// The guest's own bill: readable only by the phone that placed the order (RLS).
export default async function GuestBillPage({ params }: PageProps<"/t/[token]/bill/[id]">) {
  const { token, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const menu = await getGuestMenu(token);
  const cafe = menu && (await getCafeByTenantKey(menu.cafe.slug));
  if (!menu || !cafe) notFound();

  const { data: row } = await (await createUserClient())
    .from("orders")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle<Omit<BillOrder, "tables"> & { table_id: string | null }>();
  // Guests can't read the tables list (it holds QR tokens), so the label comes from the server.
  const table = row?.table_id
    ? (await createAdminClient().from("tables").select("label").eq("id", row.table_id).eq("cafe_id", menu.cafe.id).maybeSingle()).data
    : null;
  const order: BillOrder | null = row ? { ...row, tables: table } : null;
  const base = `/t/${token}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 pb-12 print:p-0">
      <header className="flex items-center justify-between gap-3 print:hidden">
        <Link href={order ? `${base}/order/${id}` : base} aria-label="Back" className="grid size-10 place-items-center rounded-full hover:bg-[var(--g-soft)]">
          <ArrowLeft className="size-5" />
        </Link>
        {order?.invoice_no && <PrintButton />}
      </header>
      {!order ? (
        <p className="py-16 text-center text-[var(--g-muted)]">Bills can only be viewed on the phone that placed the order. Staff can print one for you.</p>
      ) : !order.invoice_no ? (
        <p className="py-16 text-center text-[var(--g-muted)]">Your bill will be ready here once the order is paid.</p>
      ) : (
        <div className="anim-rise">
          <Bill cafe={cafe} order={order} />
        </div>
      )}
    </main>
  );
}

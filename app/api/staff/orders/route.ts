import { NextResponse } from "next/server";
import { z } from "zod";

import { getMenuItems } from "@/lib/data/menu";
import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { computeBill } from "@/lib/money";
import { cartLineSchema, priceCart } from "@/lib/orders/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const schema = z.strictObject({
  tableId: z.uuid().nullable(), // null = counter / takeaway
  lines: z.array(cartLineSchema).min(1).max(40),
  note: z.string().trim().max(300).optional(),
  guestName: z.string().trim().max(40).optional(),
  idempotencyKey: z.uuid(),
});

// POST /api/staff/orders: a waiter or the counter takes an order for a guest who didn't scan (§5.5).
// It goes straight to the kitchen as accepted, to be paid at the counter.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: "NO_SESSION" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST", issues: z.flattenError(parsed.error) }, { status: 400 });
  const input = parsed.data;

  // The staff row (readable through RLS) decides which cafe this order is for.
  const { data: staff } = await (await createUserClient())
    .from("staff")
    .select("cafe_id, role, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (!staff?.active || !["owner", "manager", "cashier"].includes(staff.role)) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: cafe, error: cafeError } = await admin
    .from("cafes")
    .select("id, tax_rate_bp, prices_include_tax, gst_mode, status")
    .eq("id", staff.cafe_id)
    .single();
  if (cafeError) throw cafeError;
  if (cafe.status === "suspended") return NextResponse.json({ code: "SUSPENDED", message: "This cafe's account is paused." }, { status: 423 });

  if (input.tableId) {
    const { data: table } = await admin.from("tables").select("id").eq("id", input.tableId).eq("cafe_id", cafe.id).is("archived_at", null).maybeSingle();
    if (!table) return NextResponse.json({ code: "TABLE_NOT_FOUND" }, { status: 404 });
  }

  const { items } = await getMenuItems(cafe.id);
  const priced = priceCart(input.lines, items);
  if (!priced.ok) return NextResponse.json({ code: "CART_CHANGED", problems: priced.problems }, { status: 409 });

  const bill = computeBill({
    lines: priced.lines.map((l) => ({ unitPricePaise: l.unitPricePaise, qty: l.qty })),
    taxRateBp: cafe.tax_rate_bp,
    pricesIncludeTax: cafe.prices_include_tax,
    gstMode: cafe.gst_mode,
  });

  const { data, error } = await admin.rpc("place_order", {
    p: {
      cafe_id: cafe.id,
      table_id: input.tableId,
      source: "staff",
      customer_uid: null,
      guest_name: input.guestName ?? "",
      idempotency_key: input.idempotencyKey,
      status: "accepted",
      payment_method: null,
      subtotal_paise: bill.subtotalPaise,
      tax_paise: bill.taxPaise,
      cgst_paise: bill.cgstPaise,
      sgst_paise: bill.sgstPaise,
      round_off_paise: bill.roundOffPaise,
      total_paise: bill.totalPaise,
      note: input.note ?? "",
      lines: priced.lines.map((l) => ({
        item_id: l.itemId,
        name: l.name,
        unit_price_paise: l.unitPricePaise,
        qty: l.qty,
        options: l.options,
        line_total_paise: l.lineTotalPaise,
        note: l.note ?? "",
      })),
    },
  });
  if (error) throw error;
  const result = data as { order_id: string; daily_no: number; duplicate: boolean };
  return NextResponse.json({ orderId: result.order_id, dailyNo: result.daily_no, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
}

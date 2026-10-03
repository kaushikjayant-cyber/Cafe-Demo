import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { CANCELLABLE } from "@/lib/order-state";
import { gatewayForCafe } from "@/lib/payments/gateway";
import { GatewayError } from "@/lib/payments/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const schema = z.strictObject({
  orderId: z.uuid(),
  reason: z.string().trim().min(2).max(200),
});

// POST /api/staff/refunds: an owner or manager refunds an order's most recent online payment.
// A double payment (two charges for one order) gets its extra charge back and stays paid;
// otherwise the whole payment goes back and an order still in progress is cancelled.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: "NO_SESSION" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });

  const { data: staff } = await (await createUserClient()).from("staff").select("id, cafe_id, role, active").eq("user_id", userId).maybeSingle();
  if (!staff?.active || !["owner", "manager"].includes(staff.role)) {
    return NextResponse.json({ code: "FORBIDDEN", message: "Only an owner or manager can refund." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("id, cafe_id, status, daily_no").eq("id", parsed.data.orderId).eq("cafe_id", staff.cafe_id).maybeSingle();
  if (!order) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const { data: payments } = await admin
    .from("payments")
    .select("id, rp_payment_id, amount_paise, refunds(amount_paise)")
    .eq("order_id", order.id)
    .eq("status", "captured")
    .order("created_at", { ascending: false });
  const payment = payments
    ?.map((p) => ({ ...p, left: p.amount_paise - p.refunds.reduce((sum: number, r: { amount_paise: number }) => sum + r.amount_paise, 0) }))
    .find((p) => p.left > 0 && p.rp_payment_id);
  if (!payment) return NextResponse.json({ code: "NOTHING_TO_REFUND", message: "There's no online payment left to refund on this order." }, { status: 409 });

  const gateway = await gatewayForCafe(order.cafe_id);
  if (!gateway) return NextResponse.json({ code: "PAYMENT_UNAVAILABLE" }, { status: 422 });

  let refundId: string;
  try {
    refundId = (await gateway.refund(payment.rp_payment_id!, payment.left, { order_id: order.id, reason: parsed.data.reason })).id;
  } catch (error) {
    if (error instanceof GatewayError) return NextResponse.json({ code: "GATEWAY_ERROR", message: error.message }, { status: 502 });
    throw error;
  }

  const { data: updated, error } = await admin.rpc("record_refund", {
    p_payment: payment.id,
    p_rp_refund_id: refundId,
    p_amount: payment.left,
    p_reason: parsed.data.reason,
    p_staff: staff.id,
  });
  if (error) throw error;

  // Fully refunded and still being made: stop it.
  const result = updated as { payment_status: string; status: string };
  if (result.payment_status === "refunded" && CANCELLABLE.includes(result.status as never)) {
    await admin.rpc("transition_order", { p_order: order.id, p_from: result.status, p_to: "cancelled", p_reason: `Refunded: ${parsed.data.reason}` });
  }
  return NextResponse.json({ ok: true, refundedPaise: payment.left, paymentStatus: result.payment_status });
}

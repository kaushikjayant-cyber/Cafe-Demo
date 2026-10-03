import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { gatewayForCafe } from "@/lib/payments/gateway";
import { GatewayError, type CheckoutSession } from "@/lib/payments/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const schema = z.strictObject({ orderId: z.uuid() });
const PAYABLE = ["pending_payment", "placed", "accepted", "preparing", "ready", "served"];
const REUSE_MS = 20 * 60_000;

// POST /api/payments/create: open (or reuse) a gateway order for a guest's unpaid order [D-24].
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: "NO_SESSION" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });

  // Read through RLS: proves the order belongs to this guest. The amount comes from here.
  const { data: order } = await (await createUserClient())
    .from("orders")
    .select("id, cafe_id, daily_no, status, payment_status, total_paise")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (order.payment_status !== "unpaid") return NextResponse.json({ code: "ALREADY_PAID", message: "This order is already paid." }, { status: 409 });
  if (!PAYABLE.includes(order.status)) return NextResponse.json({ code: "ORDER_CLOSED", message: "This order can no longer be paid." }, { status: 409 });

  const gateway = await gatewayForCafe(order.cafe_id);
  if (!gateway) return NextResponse.json({ code: "PAYMENT_UNAVAILABLE", message: "Online payment isn't available here. Please pay at the counter." }, { status: 422 });

  const admin = createAdminClient();
  // Reuse an open attempt for the same amount, so retries don't pile up gateway orders.
  const { data: open } = await admin
    .from("payments")
    .select("rp_order_id, provider")
    .eq("order_id", order.id)
    .eq("status", "created")
    .eq("amount_paise", order.total_paise)
    .gte("created_at", new Date(Date.now() - REUSE_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // An attempt made with another gateway (e.g. before real keys were added) is not reused.
  let gatewayOrderId = open && open.provider === gateway.kind ? open.rp_order_id : null;
  if (!gatewayOrderId) {
    try {
      const created = await gateway.createOrder({ amountPaise: order.total_paise, receipt: order.id, notes: { order_id: order.id, daily_no: String(order.daily_no) } });
      gatewayOrderId = created.id;
    } catch (error) {
      if (error instanceof GatewayError) {
        return NextResponse.json({ code: "GATEWAY_ERROR", message: "The payment service isn't responding. Please try again or pay at the counter." }, { status: 502 });
      }
      throw error;
    }
    const { error } = await admin.from("payments").insert({
      cafe_id: order.cafe_id,
      order_id: order.id,
      provider: gateway.kind,
      rp_order_id: gatewayOrderId,
      amount_paise: order.total_paise,
    });
    if (error) throw error;
  }

  const session: CheckoutSession = { gateway: gateway.kind, keyId: gateway.keyId, gatewayOrderId, amountPaise: order.total_paise, currency: "INR" };
  return NextResponse.json({ ...session, dailyNo: order.daily_no });
}

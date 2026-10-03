import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { gatewayForCafe } from "@/lib/payments/gateway";
import { findAttempt } from "@/lib/payments/guest-payment";
import { handleWebhook } from "@/lib/payments/settle";
import { hmacHex } from "@/lib/payments/signatures";
import { simulatedSuccess, simulatedWebhookSecret } from "@/lib/payments/simulated";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.strictObject({
  gatewayOrderId: z.string().min(5).max(64),
  outcome: z.enum(["success", "fail", "closed"]),
});

// POST /api/payments/simulate: the simulated gateway's "bank". Only works for cafes whose
// gateway is the simulator (the demo cafe, or local development without keys).
//   success → returns a signed result, exactly like Razorpay's checkout handler
//   fail    → the attempt fails; the guest can retry or pay at the counter
//   closed  → the guest closed the tab after paying: only the signed webhook arrives (R8)
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: "NO_SESSION" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  const { gatewayOrderId, outcome } = parsed.data;

  const attempt = await findAttempt(gatewayOrderId);
  if (!attempt || attempt.orders?.customer_uid !== userId) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const gateway = await gatewayForCafe(attempt.cafe_id);
  if (gateway?.kind !== "simulated" || attempt.provider !== "simulated") return NextResponse.json({ code: "NOT_SIMULATED" }, { status: 404 });

  const admin = createAdminClient();
  if (outcome === "fail") {
    const { error } = await admin.rpc("record_payment_failure", { p_rp_order_id: gatewayOrderId, p_raw: { source: "simulated" } });
    if (error) throw error;
    return NextResponse.json({ failed: true, message: "Payment declined by the bank (simulated)." });
  }

  const result = simulatedSuccess(gatewayOrderId);
  // The simulator's "gateway record", read back by fetchPayment during verification.
  const { error } = await admin.from("payments").update({ raw: { simulated_payment_id: result.razorpay_payment_id } }).eq("rp_order_id", gatewayOrderId).eq("status", "created");
  if (error) throw error;

  if (outcome === "closed") {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: result.razorpay_payment_id, order_id: gatewayOrderId, amount: attempt.amount_paise, method: "upi" } } },
    });
    const webhook = await handleWebhook(attempt.cafe_id, body, hmacHex(body, simulatedWebhookSecret()));
    return NextResponse.json({ closed: true, webhook: webhook.result });
  }
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { gatewayForCafe } from "@/lib/payments/gateway";
import { findAttempt, RESULT_MESSAGE } from "@/lib/payments/guest-payment";
import { settleFromCheckout } from "@/lib/payments/settle";

const schema = z.strictObject({
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
});

// POST /api/payments/verify: the guest's checkout says it succeeded; confirm it with the gateway.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ code: "NO_SESSION" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  const { razorpay_order_id: gatewayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;

  const attempt = await findAttempt(gatewayOrderId);
  if (!attempt || attempt.orders?.customer_uid !== userId) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const gateway = await gatewayForCafe(attempt.cafe_id);
  if (!gateway) return NextResponse.json({ code: "PAYMENT_UNAVAILABLE" }, { status: 422 });

  const result = await settleFromCheckout(gateway, gatewayOrderId, paymentId, signature);
  if (result === "bad_signature" || result === "mismatch") {
    return NextResponse.json({ code: "VERIFICATION_FAILED", message: "We couldn't confirm this payment. If money left your account, the cafe will sort it out." }, { status: 400 });
  }
  return NextResponse.json({ result, orderId: attempt.order_id, message: RESULT_MESSAGE[result] });
}

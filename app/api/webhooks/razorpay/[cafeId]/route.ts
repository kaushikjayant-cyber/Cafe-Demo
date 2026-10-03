import { NextResponse } from "next/server";
import { z } from "zod";

import { handleWebhook } from "@/lib/payments/settle";

// POST /api/webhooks/razorpay/:cafeId: payment events signed with the cafe's webhook secret.
// Completes payments even if the guest closed the tab mid-checkout (R8). Idempotent.
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/razorpay/[cafeId]">) {
  const { cafeId } = await ctx.params;
  if (!z.uuid().safeParse(cafeId).success) return NextResponse.json({ ok: false }, { status: 404 });

  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text(); // the signature covers the exact bytes
  const outcome = await handleWebhook(cafeId, rawBody, signature);
  if (!outcome.ok) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, result: outcome.result });
}

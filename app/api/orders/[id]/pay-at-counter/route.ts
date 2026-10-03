import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

// POST /api/orders/:id/pay-at-counter: the guest gave up on paying online (payment failed,
// no UPI app...) and sends the order to the counter unpaid instead (§5.4).
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/pay-at-counter">) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (!(await currentUserId())) return NextResponse.json({ code: "NO_SESSION" }, { status: 401 });

  const { data: order } = await (await createUserClient()).from("orders").select("id, cafe_id, status").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (order.status !== "pending_payment") return NextResponse.json({ code: "NOT_PENDING", message: "This order is no longer waiting for payment." }, { status: 409 });

  const admin = createAdminClient();
  const { data: cafe } = await admin.from("cafes").select("allow_pay_at_counter").eq("id", order.cafe_id).single();
  if (!cafe?.allow_pay_at_counter) return NextResponse.json({ code: "NOT_ALLOWED", message: "This cafe only takes online payment." }, { status: 422 });

  const { error } = await admin.rpc("transition_order", { p_order: id, p_from: "pending_payment", p_to: "placed" });
  if (error) {
    if (error.message.includes("stale_transition")) return NextResponse.json({ code: "NOT_PENDING", message: "This order is no longer waiting for payment." }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}

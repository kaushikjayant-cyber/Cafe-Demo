import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

// POST /api/orders/:id/cancel: a guest cancels their own order before the cafe accepts it (§5.7).
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/cancel">) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (!(await currentUserId())) return NextResponse.json({ code: "NO_SESSION" }, { status: 401 });

  // Reading through RLS proves the order belongs to this guest.
  const supabase = await createUserClient();
  const { data: order } = await supabase.from("orders").select("id, status").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (order.status !== "placed") {
    return NextResponse.json(
      { code: "TOO_LATE", message: "The cafe has already started on this order. Please ask a member of staff." },
      { status: 409 },
    );
  }

  const { error } = await createAdminClient().rpc("transition_order", {
    p_order: id,
    p_from: "placed",
    p_to: "cancelled",
    p_reason: "Cancelled by guest",
  });
  if (error) {
    // stale_transition: the counter accepted it a moment ago.
    if (error.message.includes("stale_transition")) {
      return NextResponse.json(
        { code: "TOO_LATE", message: "The cafe has already started on this order. Please ask a member of staff." },
        { status: 409 },
      );
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}

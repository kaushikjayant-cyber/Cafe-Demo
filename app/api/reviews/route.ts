import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { LIMITS, rateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.strictObject({
  orderId: z.uuid(),
  rating: z.int().min(1).max(5),
  comment: z.string().trim().max(500).default(""),
  items: z.array(z.strictObject({ itemId: z.uuid(), liked: z.boolean() })).max(50).default([]),
});

const ERRORS: Record<string, { status: number; message: string }> = {
  order_not_found: { status: 404, message: "We couldn't find this order on this phone." },
  not_reviewable: { status: 409, message: "You can rate your order once it has been served." },
  already_reviewed: { status: 409, message: "You've already rated this order. Thank you!" },
};

// GET /api/reviews?orderId=…: has this phone already rated this order? (Guests can't read reviews.)
export async function GET(request: Request) {
  const orderId = z.uuid().safeParse(new URL(request.url).searchParams.get("orderId"));
  const customerUid = await currentUserId();
  if (!orderId.success || !customerUid) return NextResponse.json({ reviewed: false });

  const { data } = await createAdminClient()
    .from("reviews")
    .select("rating, orders!inner(customer_uid)")
    .eq("order_id", orderId.data)
    .eq("orders.customer_uid", customerUid)
    .maybeSingle<{ rating: number }>();
  return NextResponse.json({ reviewed: !!data, rating: data?.rating ?? null });
}

// POST /api/reviews: rate an order (§5.9). The database checks the order belongs to this phone.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });

  const customerUid = await currentUserId();
  if (!customerUid) return NextResponse.json({ code: "order_not_found", message: ERRORS.order_not_found.message }, { status: 404 });
  if (!rateLimiter.allow(`review:${customerUid}`, LIMITS.reviewsPerGuest)) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Please wait a moment and try again." }, { status: 429 });
  }

  const { error } = await createAdminClient().rpc("submit_review", {
    p_order: parsed.data.orderId,
    p_customer: customerUid,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment,
    p_items: parsed.data.items.map((i) => ({ item_id: i.itemId, liked: i.liked })),
  });
  if (error) {
    const known = Object.keys(ERRORS).find((code) => error.message.includes(code));
    if (known) return NextResponse.json({ code: known, message: ERRORS[known].message }, { status: ERRORS[known].status });
    throw error;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

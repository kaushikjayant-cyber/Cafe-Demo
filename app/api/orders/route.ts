import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { placeGuestOrder } from "@/lib/orders/place";
import { placeOrderSchema } from "@/lib/orders/validate";

// POST /api/orders: a guest places an order from a QR table [D-22].
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ code: "NO_SESSION", message: "Please reload the page and try again." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = placeOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_REQUEST", issues: z.flattenError(parsed.error) }, { status: 400 });
  }

  const result = await placeGuestOrder(parsed.data, userId);
  const { status, ...payload } = result;
  return NextResponse.json(payload, { status });
}

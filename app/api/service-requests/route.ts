import { NextResponse } from "next/server";
import { z } from "zod";

import { getGuestMenu } from "@/lib/data/menu";
import { currentUserId, isSameOrigin } from "@/lib/guest-auth";
import { LIMITS, rateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.strictObject({
  tableToken: z.string().regex(/^[a-z0-9]{10}$/),
  type: z.enum(["waiter", "bill"]),
});

// POST /api/service-requests: "Call waiter" / "Request bill" from a table (§5.8).
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });

  const menu = await getGuestMenu(parsed.data.tableToken);
  if (!menu || !menu.table.isActive || menu.cafe.status === "suspended") {
    return NextResponse.json({ code: "TABLE_NOT_FOUND", message: "Please ask a member of staff." }, { status: 404 });
  }

  // One of each kind per table every two minutes: a second tap just reassures the guest.
  if (!rateLimiter.allow(`service:${menu.table.id}:${parsed.data.type}`, LIMITS.serviceRequestPerTable)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { error } = await createAdminClient().from("service_requests").insert({
    cafe_id: menu.cafe.id,
    table_id: menu.table.id,
    type: parsed.data.type,
    customer_uid: await currentUserId(),
  });
  if (error) throw error;
  return NextResponse.json({ ok: true, duplicate: false }, { status: 201 });
}

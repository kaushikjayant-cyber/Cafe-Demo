import "server-only";

import { getGuestMenu } from "@/lib/data/menu";
import { orderingBlockedReason } from "@/lib/menu-types";
import { computeBill } from "@/lib/money";
import { LIMITS, rateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

import { priceCart, type CartProblem, type PlaceOrderInput } from "./validate";

export type PlaceOrderResult =
  | { ok: true; status: 201 | 200; orderId: string; dailyNo: number; orderStatus: string; duplicate: boolean }
  | { ok: false; status: 404; code: "TABLE_NOT_FOUND" }
  | { ok: false; status: 423; code: "ORDERING_CLOSED"; message: string }
  | { ok: false; status: 422; code: "PAYMENT_UNAVAILABLE"; message: string }
  | { ok: false; status: 409; code: "CART_CHANGED"; problems: CartProblem[] }
  | { ok: false; status: 429; code: "RATE_LIMITED"; message: string };

/** Validates and stores a guest's order [D-22]. All prices and totals come from the database. */
export async function placeGuestOrder(input: PlaceOrderInput, customerUid: string): Promise<PlaceOrderResult> {
  const menu = await getGuestMenu(input.tableToken);
  if (!menu) return { ok: false, status: 404, code: "TABLE_NOT_FOUND" };
  const { cafe, table } = menu;

  const blocked = orderingBlockedReason(cafe, table);
  if (blocked) return { ok: false, status: 423, code: "ORDERING_CLOSED", message: blocked };

  if (input.payChoice === "online" && !cafe.onlinePayments) {
    return { ok: false, status: 422, code: "PAYMENT_UNAVAILABLE", message: "Online payment isn't available here. Please pay at the counter." };
  }
  if (input.payChoice === "counter" && !cafe.allowPayAtCounter) {
    return { ok: false, status: 422, code: "PAYMENT_UNAVAILABLE", message: "This cafe only accepts online payment." };
  }

  const priced = priceCart(input.lines, menu.items);
  if (!priced.ok) return { ok: false, status: 409, code: "CART_CHANGED", problems: priced.problems };

  // A retry of an order we already have returns it unchanged, and must not count towards
  // the rate limit (a guest on flaky Wi-Fi tapping again is not spamming).
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("orders")
    .select("id, daily_no, status")
    .eq("cafe_id", cafe.id)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return { ok: true, status: 200, orderId: existing.id, dailyNo: existing.daily_no, orderStatus: existing.status, duplicate: true };
  }

  // Checked after validation so a rejected cart doesn't use up the guest's allowance.
  if (
    !rateLimiter.allow(`order:guest:${customerUid}`, LIMITS.ordersPerGuest) ||
    !rateLimiter.allow(`order:table:${table.id}`, LIMITS.ordersPerTable)
  ) {
    return { ok: false, status: 429, code: "RATE_LIMITED", message: "Too many orders in a short time. Please ask a member of staff." };
  }

  const bill = computeBill({
    lines: priced.lines.map((l) => ({ unitPricePaise: l.unitPricePaise, qty: l.qty })),
    taxRateBp: cafe.taxRateBp,
    pricesIncludeTax: cafe.pricesIncludeTax,
    gstMode: cafe.gstMode,
  });

  const { data, error } = await supabase.rpc("place_order", {
    p: {
      cafe_id: cafe.id,
      table_id: table.id,
      source: "qr",
      customer_uid: customerUid,
      guest_name: input.guestName ?? "",
      idempotency_key: input.idempotencyKey,
      // Online orders wait for payment and never reach the kitchen unpaid [D-24].
      status: input.payChoice === "online" ? "pending_payment" : "placed",
      payment_method: null,
      subtotal_paise: bill.subtotalPaise,
      tax_paise: bill.taxPaise,
      cgst_paise: bill.cgstPaise,
      sgst_paise: bill.sgstPaise,
      round_off_paise: bill.roundOffPaise,
      total_paise: bill.totalPaise,
      note: input.note ?? "",
      lines: priced.lines.map((l) => ({
        item_id: l.itemId,
        name: l.name,
        unit_price_paise: l.unitPricePaise,
        qty: l.qty,
        options: l.options,
        line_total_paise: l.lineTotalPaise,
        note: l.note ?? "",
      })),
    },
  });
  if (error) throw error;

  const result = data as { order_id: string; daily_no: number; status: string; duplicate: boolean };
  return {
    ok: true,
    status: result.duplicate ? 200 : 201,
    orderId: result.order_id,
    dailyNo: result.daily_no,
    orderStatus: result.status,
    duplicate: result.duplicate,
  };
}

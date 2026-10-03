import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { gatewayForCafe } from "./gateway";
import type { PaymentGateway } from "./types";

export type SettleResult = "paid" | "already_recorded" | "late_payment" | "double_payment" | "pending";

async function record(gatewayOrderId: string, paymentId: string, amountPaise: number, raw: unknown): Promise<SettleResult> {
  const { data, error } = await createAdminClient().rpc("record_online_payment", {
    p_rp_order_id: gatewayOrderId,
    p_rp_payment_id: paymentId,
    p_amount: amountPaise,
    p_raw: raw ?? null,
  });
  if (error) throw error;
  return (data as { result: SettleResult }).result;
}

/**
 * The browser reported a successful checkout. Trust nothing it sent: check the signature,
 * then ask the gateway what actually happened, and record only a captured payment for the
 * exact gateway order and amount we created [D-24].
 */
export async function settleFromCheckout(
  gateway: PaymentGateway,
  gatewayOrderId: string,
  paymentId: string,
  signature: string,
): Promise<SettleResult | "bad_signature" | "mismatch"> {
  if (!gateway.verifyCheckout(gatewayOrderId, paymentId, signature)) return "bad_signature";
  const payment = await gateway.fetchPayment(paymentId);
  if (payment.orderId !== gatewayOrderId) return "mismatch";
  // Authorised but not yet captured: the payment.captured webhook will finish it.
  if (payment.status !== "captured") return "pending";
  return record(gatewayOrderId, paymentId, payment.amountPaise, { method: payment.method, source: "checkout" });
}

interface WebhookEvent {
  event: string;
  payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; method?: string } } };
}

/** A signed event from the gateway. Returns false if the signature doesn't verify. */
export async function handleWebhook(cafeId: string, rawBody: string, signature: string): Promise<{ ok: boolean; result?: string }> {
  const gateway = await gatewayForCafe(cafeId);
  if (!gateway || !gateway.verifyWebhook(rawBody, signature)) return { ok: false };

  const event = JSON.parse(rawBody) as WebhookEvent;
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return { ok: true, result: "ignored" };

  // Only gateway orders we created for this cafe.
  const { data: known } = await createAdminClient().from("payments").select("id").eq("rp_order_id", payment.order_id).eq("cafe_id", cafeId).maybeSingle();
  if (!known) return { ok: true, result: "unknown_order" };

  if (event.event === "payment.captured" || event.event === "order.paid") {
    return { ok: true, result: await record(payment.order_id, payment.id, payment.amount, { method: payment.method, source: "webhook" }) };
  }
  if (event.event === "payment.failed") {
    const { error } = await createAdminClient().rpc("record_payment_failure", { p_rp_order_id: payment.order_id, p_raw: { source: "webhook" } });
    if (error) throw error;
    return { ok: true, result: "failed" };
  }
  return { ok: true, result: "ignored" };
}

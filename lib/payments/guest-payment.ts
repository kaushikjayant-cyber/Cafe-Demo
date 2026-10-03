import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** The payment attempt behind a gateway order, with the order it pays for. */
export async function findAttempt(gatewayOrderId: string) {
  const { data, error } = await createAdminClient()
    .from("payments")
    .select("id, cafe_id, order_id, amount_paise, status, provider, orders(customer_uid)")
    .eq("rp_order_id", gatewayOrderId)
    .maybeSingle<{
      id: string;
      cafe_id: string;
      order_id: string;
      amount_paise: number;
      status: string;
      provider: string;
      orders: { customer_uid: string | null } | null;
    }>();
  if (error) throw error;
  return data;
}

export const RESULT_MESSAGE: Record<string, string> = {
  paid: "Payment received. Thank you!",
  already_recorded: "Payment received. Thank you!",
  late_payment: "Payment received. Your order had timed out, so the cafe will confirm it with you.",
  double_payment: "This order was already paid. The cafe will refund the extra payment.",
  pending: "Your bank is still confirming the payment. This page will update when it's done.",
};

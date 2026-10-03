import "server-only";

import { randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

import { checkoutSignature, hmacHex, verifyCheckoutSignature, verifyWebhookSignature } from "./signatures";
import { GatewayError, type PaymentGateway } from "./types";

// A stand-in for Razorpay, used for the demo cafe (and local development) until real test
// keys are configured. It follows the same contract: gateway order ids, payment ids and
// HMAC signatures, so the verify/webhook/settle code paths are exactly the ones Razorpay uses.
// It moves no money and is never offered to a real (non-demo) cafe in production.

export const SIMULATED_KEY_ID = "sim_key";

function secret(label: string): string {
  const base = process.env.APP_ENCRYPTION_KEY;
  if (!base) throw new Error("APP_ENCRYPTION_KEY is required for the simulated gateway");
  return hmacHex(`simulated-gateway:${label}`, base);
}

export const simulatedKeySecret = () => secret("key");
export const simulatedWebhookSecret = () => secret("webhook");

const id = (prefix: string) => `${prefix}_sim${randomBytes(7).toString("hex")}`;

export function simulatedGateway(): PaymentGateway {
  return {
    kind: "simulated",
    keyId: SIMULATED_KEY_ID,

    async createOrder({ amountPaise }) {
      return { id: id("order"), amountPaise };
    },

    // The "gateway's record" of a simulated payment is the row the simulator wrote.
    async fetchPayment(paymentId) {
      const { data } = await createAdminClient()
        .from("payments")
        .select("rp_order_id, amount_paise, raw")
        .eq("raw->>simulated_payment_id", paymentId)
        .maybeSingle();
      if (!data) throw new GatewayError("Unknown simulated payment", 404);
      return { id: paymentId, orderId: data.rp_order_id, amountPaise: data.amount_paise, status: "captured", method: "upi" };
    },

    async refund() {
      return { id: id("rfnd") };
    },

    verifyCheckout: (orderId, paymentId, signature) => verifyCheckoutSignature(orderId, paymentId, signature, simulatedKeySecret()),
    verifyWebhook: (rawBody, signature) => verifyWebhookSignature(rawBody, signature, simulatedWebhookSecret()),
  };
}

/** What the simulated checkout returns to the browser on success, like Razorpay's handler. */
export function simulatedSuccess(gatewayOrderId: string) {
  const paymentId = id("pay");
  return {
    razorpay_order_id: gatewayOrderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: checkoutSignature(gatewayOrderId, paymentId, simulatedKeySecret()),
  };
}

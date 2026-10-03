import "server-only";

import { verifyCheckoutSignature, verifyWebhookSignature } from "./signatures";
import { GatewayError, type GatewayPayment, type PaymentGateway } from "./types";

const API = "https://api.razorpay.com/v1";

/** Razorpay over its REST API (no SDK needed). Each cafe uses its own account and keys. */
export function razorpayGateway(keyId: string, keySecret: string, webhookSecret: string | null): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: auth, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new GatewayError(body?.error?.description ?? `Razorpay request failed (${response.status})`, response.status);
    }
    return body as T;
  }

  return {
    kind: "razorpay",
    keyId,

    async createOrder({ amountPaise, receipt, notes }) {
      const order = await call<{ id: string; amount: number }>("/orders", {
        method: "POST",
        body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes }),
      });
      return { id: order.id, amountPaise: order.amount };
    },

    async fetchPayment(paymentId) {
      const p = await call<{ id: string; order_id: string; amount: number; status: GatewayPayment["status"]; method: string | null }>(
        `/payments/${encodeURIComponent(paymentId)}`,
      );
      return { id: p.id, orderId: p.order_id, amountPaise: p.amount, status: p.status, method: p.method };
    },

    async refund(paymentId, amountPaise, notes) {
      const r = await call<{ id: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount: amountPaise, notes }),
      });
      return { id: r.id };
    },

    verifyCheckout: (orderId, paymentId, signature) => verifyCheckoutSignature(orderId, paymentId, signature, keySecret),
    verifyWebhook: (rawBody, signature) => (webhookSecret ? verifyWebhookSignature(rawBody, signature, webhookSecret) : false),
  };
}

// Razorpay signature rules (also used, unchanged, by the simulated gateway).
// https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/#verify-payment-signature

import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Checkout success: HMAC-SHA256("<order_id>|<payment_id>", key secret). */
export function checkoutSignature(orderId: string, paymentId: string, secret: string): string {
  return hmacHex(`${orderId}|${paymentId}`, secret);
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  return safeEqualHex(signature, checkoutSignature(orderId, paymentId, secret));
}

/** Webhook: HMAC-SHA256(raw request body, webhook secret), sent as X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  return safeEqualHex(signature, hmacHex(rawBody, secret));
}

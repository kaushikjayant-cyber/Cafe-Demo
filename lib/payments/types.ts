export type GatewayKind = "razorpay" | "simulated";

export interface GatewayOrder {
  id: string;
  amountPaise: number;
}

export interface GatewayPayment {
  id: string;
  orderId: string;
  amountPaise: number;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string | null;
}

/** What the browser needs to open checkout. Never contains a secret. */
export interface CheckoutSession {
  gateway: GatewayKind;
  keyId: string;
  gatewayOrderId: string;
  amountPaise: number;
  currency: "INR";
}

export interface PaymentGateway {
  kind: GatewayKind;
  keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<GatewayOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<{ id: string }>;
  verifyCheckout(gatewayOrderId: string, paymentId: string, signature: string): boolean;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

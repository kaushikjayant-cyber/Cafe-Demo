"use client";

import { useCallback, useState } from "react";

import type { CheckoutSession } from "@/lib/payments/types";

export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export type PaymentPhase = "idle" | "starting" | "checkout" | "verifying";

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

let scriptPromise: Promise<RazorpayConstructor> | null = null;

/** Loads Razorpay's Checkout once, on demand, so guests who pay at the counter never download it. */
function loadRazorpay(): Promise<RazorpayConstructor> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve((window as unknown as { Razorpay: RazorpayConstructor }).Razorpay);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; body: T & { message?: string; code?: string } }> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}

interface Options {
  cafeName: string;
  brandColor: string;
  ensureSession: () => Promise<string>;
  /** Called once the server has confirmed (or is confirming) the payment. */
  onSettled: (message: string) => void;
}

/**
 * Pays one order online: asks the server for a checkout session, opens Razorpay (or the
 * simulated checkout for the demo), then has the server verify the result [D-24].
 * Nothing the browser reports is trusted until /api/payments/verify confirms it.
 */
export function usePayment({ cafeName, brandColor, ensureSession, onSettled }: Options) {
  const [phase, setPhase] = useState<PaymentPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<(CheckoutSession & { dailyNo: number }) | null>(null);

  const verify = useCallback(
    async (result: CheckoutResult) => {
      setPhase("verifying");
      try {
        const { ok, body } = await postJson<{ message: string }>("/api/payments/verify", result);
        if (ok) onSettled(body.message);
        else setError(body.message ?? "We couldn't confirm the payment. Please ask a member of staff.");
      } catch {
        setError("We couldn't confirm the payment yet. If money left your account, this page will update shortly.");
      } finally {
        setPhase("idle");
      }
    },
    [onSettled],
  );

  const pay = useCallback(
    async (orderId: string) => {
      setError(null);
      setPhase("starting");
      try {
        await ensureSession();
        const { ok, body } = await postJson<CheckoutSession & { dailyNo: number }>("/api/payments/create", { orderId });
        if (!ok) throw new Error(body.message ?? "We couldn't start the payment. Please try again.");

        if (body.gateway === "simulated") {
          setSimulated(body);
          setPhase("checkout");
          return;
        }

        const Razorpay = await loadRazorpay();
        const checkout = new Razorpay({
          key: body.keyId,
          order_id: body.gatewayOrderId,
          amount: body.amountPaise,
          currency: body.currency,
          name: cafeName,
          description: `Order #${body.dailyNo}`,
          theme: { color: brandColor },
          handler: (result: CheckoutResult) => void verify(result),
          modal: { ondismiss: () => setPhase("idle"), confirm_close: true },
        });
        checkout.on("payment.failed", (response) => setError(response.error?.description ?? "The payment didn't go through."));
        setPhase("checkout");
        checkout.open();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        setPhase("idle");
      }
    },
    [brandColor, cafeName, ensureSession, verify],
  );

  /** Outcome chosen in the simulated checkout. */
  const simulate = useCallback(
    async (outcome: "success" | "fail" | "closed") => {
      if (!simulated) return;
      const session = simulated;
      setSimulated(null);
      if (outcome === "success") {
        setPhase("verifying");
        const { ok, body } = await postJson<CheckoutResult>("/api/payments/simulate", { gatewayOrderId: session.gatewayOrderId, outcome });
        if (ok) await verify(body);
        else {
          setError(body.message ?? "The payment didn't go through.");
          setPhase("idle");
        }
        return;
      }
      const { body } = await postJson<{ message?: string }>("/api/payments/simulate", { gatewayOrderId: session.gatewayOrderId, outcome });
      if (outcome === "fail") setError(body.message ?? "The payment didn't go through.");
      setPhase("idle");
    },
    [simulated, verify],
  );

  const cancelSimulated = useCallback(() => {
    setSimulated(null);
    setPhase("idle");
  }, []);

  return { pay, phase, error, clearError: () => setError(null), simulated, simulate, cancelSimulated };
}

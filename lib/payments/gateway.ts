import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

import { razorpayGateway } from "./razorpay";
import { simulatedGateway } from "./simulated";
import type { GatewayKind, PaymentGateway } from "./types";

interface CafeKeys {
  is_demo: boolean;
  cafe_secrets: { razorpay_key_id: string | null; razorpay_key_secret_enc: string | null; razorpay_webhook_secret_enc: string | null } | null;
}

async function loadKeys(cafeId: string): Promise<CafeKeys | null> {
  const { data, error } = await createAdminClient()
    .from("cafes")
    .select("is_demo, cafe_secrets(razorpay_key_id, razorpay_key_secret_enc, razorpay_webhook_secret_enc)")
    .eq("id", cafeId)
    .maybeSingle<CafeKeys>();
  if (error) throw error;
  return data;
}

/**
 * Which gateway a cafe takes online payments through, without decrypting anything:
 *   1. the cafe's own Razorpay keys (every real cafe);
 *   2. the demo cafe: platform test keys from the environment, if set;
 *   3. the demo cafe or local development: the simulated gateway;
 *   otherwise none, and guests only see "Pay at counter".
 */
export function gatewayKind(keys: CafeKeys): GatewayKind | null {
  if (keys.cafe_secrets?.razorpay_key_id && keys.cafe_secrets.razorpay_key_secret_enc) return "razorpay";
  if (keys.is_demo && process.env.DEMO_RAZORPAY_KEY_ID && process.env.DEMO_RAZORPAY_KEY_SECRET) return "razorpay";
  if (keys.is_demo || process.env.NODE_ENV === "development") return "simulated";
  return null;
}

export async function onlinePaymentsAvailable(cafeId: string): Promise<boolean> {
  const keys = await loadKeys(cafeId);
  return !!keys && gatewayKind(keys) !== null;
}

export async function gatewayForCafe(cafeId: string): Promise<PaymentGateway | null> {
  const keys = await loadKeys(cafeId);
  if (!keys) return null;
  const kind = gatewayKind(keys);
  if (kind === "simulated") return simulatedGateway();
  if (kind !== "razorpay") return null;

  const secrets = keys.cafe_secrets;
  if (secrets?.razorpay_key_id && secrets.razorpay_key_secret_enc) {
    const key = serverEnv().APP_ENCRYPTION_KEY;
    return razorpayGateway(
      secrets.razorpay_key_id,
      decryptSecret(secrets.razorpay_key_secret_enc, key),
      secrets.razorpay_webhook_secret_enc ? decryptSecret(secrets.razorpay_webhook_secret_enc, key) : null,
    );
  }
  const env = serverEnv();
  return razorpayGateway(env.DEMO_RAZORPAY_KEY_ID!, env.DEMO_RAZORPAY_KEY_SECRET!, process.env.DEMO_RAZORPAY_WEBHOOK_SECRET || null);
}

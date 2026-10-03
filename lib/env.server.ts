import "server-only";

import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, "must be 32 bytes, base64-encoded"),
  PLATFORM_DOMAIN: z.string().min(1).default("localhost:3000"),
  DEMO_RAZORPAY_KEY_ID: z.string().optional(),
  DEMO_RAZORPAY_KEY_SECRET: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

let cached: z.infer<typeof serverSchema> | undefined;

export function serverEnv() {
  if (!cached) {
    const result = serverSchema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Missing or invalid server env vars. See .env.example.\n${z.prettifyError(result.error)}`);
    }
    cached = result.data;
  }
  return cached;
}

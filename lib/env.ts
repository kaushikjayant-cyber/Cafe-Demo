// Public (browser-safe) configuration. NEXT_PUBLIC_* values must be read with literal
// property access so Next.js can inline them into the client bundle.

import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_PLATFORM_NAME: z.string().min(1).default("Cafe QR"),
});

function readPublic() {
  return publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_PLATFORM_NAME: process.env.NEXT_PUBLIC_PLATFORM_NAME || undefined,
  });
}

/** True once Supabase keys are in .env.local; pages show setup help until then. */
export function isSupabaseConfigured(): boolean {
  return readPublic().success;
}

export function publicEnv() {
  const result = readPublic();
  if (!result.success) {
    throw new Error(`Missing or invalid public env vars. See .env.example.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function platformName(): string {
  return process.env.NEXT_PUBLIC_PLATFORM_NAME || "Cafe QR";
}

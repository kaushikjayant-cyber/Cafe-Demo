import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Never cached: every call must really check.
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3_000;

/**
 * GET /api/health: for Render's health check and UptimeRobot (§R12). 200 when the app can
 * reach its database, 503 when it can't. Public, so it says nothing private.
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "down" | "not_configured" = "not_configured";

  if (isSupabaseConfigured()) {
    try {
      const { error } = await createAdminClient()
        .from("cafes")
        .select("id", { head: true, count: "exact" })
        .limit(1)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      db = error ? "down" : "ok";
      if (error) console.error("health: database check failed", error.message);
    } catch (error) {
      db = "down";
      console.error("health: database unreachable", error);
    }
  }

  const ok = db === "ok";
  return NextResponse.json(
    { ok, db, latencyMs: Date.now() - started, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/** One shared browser client, so realtime channels and the session aren't duplicated. */
export function getBrowserClient(): SupabaseClient {
  if (!client) {
    const env = publicEnv();
    client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  }
  return client;
}

/**
 * Subscribes a Realtime channel only after the signed-in user's token is on the socket.
 *
 * Realtime checks RLS for postgres_changes with the token the channel joined with. On page
 * load the socket can join before the session (read from cookies) is attached, so the
 * channel would count as anonymous and RLS would silently drop every staff/guest event.
 * Returns a cleanup function for useEffect.
 */
export function subscribeWhenReady(build: (supabase: SupabaseClient) => RealtimeChannel): () => void {
  const supabase = getBrowserClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void supabase.realtime
    .setAuth() // resolves the current session's access token (or the publishable key)
    .catch(() => {})
    .then(() => {
      if (!cancelled) channel = build(supabase);
    });

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}

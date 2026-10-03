import "server-only";

import { createUserClient } from "@/lib/supabase/server";

/** The guest's anonymous Supabase user id from their session cookie, or null [D-21]. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

/** Rejects cross-site form posts to state-changing routes (CSRF). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

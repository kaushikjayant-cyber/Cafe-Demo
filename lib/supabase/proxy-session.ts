import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the staff session cookie before a protected page renders.
 * Only called for staff/admin/super paths, so guest menu loads skip the network round trip.
 */
export async function refreshSession(request: NextRequest, response: NextResponse): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
      },
    },
  });
  // getClaims validates the JWT and refreshes it when expired.
  await supabase.auth.getClaims();
}

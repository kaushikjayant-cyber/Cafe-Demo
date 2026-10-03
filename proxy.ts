import { NextResponse, type NextRequest } from "next/server";

import { refreshSession } from "@/lib/supabase/proxy-session";
import { routeRequest } from "@/lib/tenant";

// Pages that need a signed-in staff session refreshed before they render.
const PROTECTED = /^\/(?:c\/[^/]+\/(?:staff|kitchen|admin)|super)(?:\/|$)/;

export async function proxy(request: NextRequest) {
  const decision = routeRequest({
    host: request.headers.get("host") ?? "",
    pathname: request.nextUrl.pathname,
    platformDomain: process.env.PLATFORM_DOMAIN ?? "localhost:3000",
  });

  if (decision.action === "not_found") {
    return new NextResponse("Not found", { status: 404 });
  }

  // Forwarded to the app so links inside a cafe keep the right prefix (lib/tenant.ts tenantHref).
  const headers = new Headers(request.headers);
  headers.delete("x-tenant-base");
  headers.delete("x-tenant-key");
  if (decision.action === "rewrite" || decision.tenantKey) {
    headers.set("x-tenant-base", decision.tenantBase ?? "");
    headers.set("x-tenant-key", decision.tenantKey ?? "");
  }

  let effectivePath = request.nextUrl.pathname;
  let response: NextResponse;
  if (decision.action === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    effectivePath = decision.pathname;
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }

  if (PROTECTED.test(effectivePath)) {
    await refreshSession(request, response);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|map)$).*)"],
};

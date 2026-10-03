// Which cafe does a request belong to? [D-03, D-05]
//
//   bluebean.<platform>/menu     → rewrite to /c/bluebean/menu   (subdomain)
//   <platform>/c/bluebean/menu   → as is                        (path fallback, free tier)
//   order.bluebean.in/menu       → rewrite to /c/~order.bluebean.in/menu (custom domain)
//   any host /t/<token>          → as is; the token identifies the cafe
//
// Pure so it can be unit-tested; proxy.ts applies the result.

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Subdomains that can never be a cafe. "demo" is deliberately absent: it is the demo cafe. */
export const RESERVED_SLUGS = new Set([
  "www", "api", "app", "admin", "super", "static", "assets", "mail", "staff", "kitchen", "c", "t",
]);

/** Prefix that marks a custom domain in the [slug] route segment. Never valid in a slug. */
export const DOMAIN_MARKER = "~";

export type RouteDecision =
  | { action: "next"; tenantBase?: string; tenantKey?: string }
  | { action: "rewrite"; pathname: string; tenantBase: string; tenantKey: string }
  | { action: "not_found" };

export interface RouteInput {
  host: string;
  pathname: string;
  platformDomain: string;
}

function stripPort(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

function firstSegment(pathname: string): string {
  return pathname.split("/")[1] ?? "";
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function routeRequest({ host, pathname, platformDomain }: RouteInput): RouteDecision {
  const hostname = stripPort(host);
  const platform = stripPort(platformDomain);
  const segment = firstSegment(pathname);

  // Shared on every host: QR table links and API routes.
  if (segment === "t" || segment === "api") return { action: "next" };

  const isPlatformHost =
    hostname === platform || hostname === `www.${platform}` || hostname === "localhost" || hostname === "127.0.0.1";

  if (isPlatformHost) {
    if (segment !== "c") return { action: "next" };
    const slug = pathname.split("/")[2] ?? "";
    if (!isValidSlug(slug)) return { action: "not_found" };
    return { action: "next", tenantBase: `/c/${slug}`, tenantKey: slug };
  }

  // Tenant hosts must not reach platform-only routes or other cafes' paths.
  if (segment === "c" || segment === "super") return { action: "not_found" };

  let tenantKey: string;
  if (hostname.endsWith(`.${platform}`)) {
    const sub = hostname.slice(0, -(platform.length + 1));
    if (sub.includes(".") || !isValidSlug(sub)) return { action: "not_found" };
    tenantKey = sub;
  } else {
    if (!HOSTNAME_PATTERN.test(hostname)) return { action: "not_found" };
    tenantKey = DOMAIN_MARKER + hostname;
  }

  const rest = pathname === "/" ? "" : pathname;
  return { action: "rewrite", pathname: `/c/${tenantKey}${rest}`, tenantBase: "", tenantKey };
}

/** Builds a link inside the current cafe: "" + "/staff" or "/c/demo" + "/staff". */
export function tenantHref(tenantBase: string, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? tenantBase || "/" : `${tenantBase}${clean}`;
}

/** Parses the [slug] route segment back into a lookup. */
export function parseTenantKey(key: string): { slug: string } | { domain: string } | null {
  const decoded = decodeURIComponent(key);
  if (decoded.startsWith(DOMAIN_MARKER)) {
    const domain = decoded.slice(DOMAIN_MARKER.length);
    return HOSTNAME_PATTERN.test(domain) ? { domain } : null;
  }
  return isValidSlug(decoded) ? { slug: decoded } : null;
}

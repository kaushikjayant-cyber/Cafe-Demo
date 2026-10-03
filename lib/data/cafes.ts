import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseTenantKey } from "@/lib/tenant";

/** Columns safe to show on public pages. Plan, flags and secrets are deliberately excluded. */
const PUBLIC_CAFE_COLUMNS =
  "id, slug, name, logo_path, brand_color, timezone, day_starts_at, gst_mode, gstin, legal_name, " +
  "address, phone, email, fssai_no, tax_rate_bp, prices_include_tax, ordering_paused, pause_message, " +
  "opening_hours, allow_pay_at_counter, google_review_url, status, is_demo";

export interface PublicCafe {
  id: string;
  slug: string;
  name: string;
  logo_path: string | null;
  brand_color: string;
  timezone: string;
  day_starts_at: string;
  gst_mode: "none" | "regular";
  gstin: string | null;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  fssai_no: string | null;
  tax_rate_bp: number;
  prices_include_tax: boolean;
  ordering_paused: boolean;
  pause_message: string | null;
  opening_hours: Record<string, [string, string][]> | null;
  allow_pay_at_counter: boolean;
  google_review_url: string | null;
  status: "trial" | "active" | "grace" | "suspended";
  is_demo: boolean;
}

/** Resolves the [slug] route segment (a slug or ~custom.domain) to a cafe. Cached per request. */
export const getCafeByTenantKey = cache(async (key: string): Promise<PublicCafe | null> => {
  const parsed = parseTenantKey(key);
  if (!parsed) return null;

  const supabase = createAdminClient();
  let slug: string;
  if ("domain" in parsed) {
    const { data, error } = await supabase
      .from("cafe_domains")
      .select("cafes(slug)")
      .eq("domain", parsed.domain)
      .maybeSingle<{ cafes: { slug: string } | null }>();
    if (error) throw error;
    if (!data?.cafes) return null;
    slug = data.cafes.slug;
  } else {
    slug = parsed.slug;
  }

  const { data, error } = await supabase
    .from("cafes")
    .select(PUBLIC_CAFE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<PublicCafe>();
  if (error) throw error;
  return data;
});

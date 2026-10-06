import "server-only";

import { cache } from "react";

import { publicEnv } from "@/lib/env";
import { isOpenAt, type OpeningHours } from "@/lib/hours";
import { onlinePaymentsAvailable } from "@/lib/payments/gateway";
import type { Diet, GuestMenu, MenuCategory, MenuItem } from "@/lib/menu-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLE_TOKEN_PATTERN } from "@/lib/tokens";

export const MENU_IMAGE_BUCKET = "menu-images";

export function publicImageUrl(path: string | null): string | null {
  if (!path) return null;
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MENU_IMAGE_BUCKET}/${path}`;
}

interface TableRow {
  id: string;
  label: string;
  token: string;
  is_active: boolean;
  archived_at: string | null;
  cafes: {
    id: string;
    slug: string;
    name: string;
    logo_path: string | null;
    brand_color: string;
    timezone: string;
    gst_mode: "none" | "regular";
    tax_rate_bp: number;
    prices_include_tax: boolean;
    allow_pay_at_counter: boolean;
    ordering_paused: boolean;
    pause_message: string | null;
    opening_hours: OpeningHours | null;
    status: "trial" | "active" | "grace" | "suspended";
    is_demo: boolean;
    google_review_url: string | null;
  };
}

interface ItemRow {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_paise: number;
  image_path: string | null;
  diet: Diet | null;
  tags: string[];
  is_available: boolean;
  sold_out_until: string | null;
  option_groups: {
    id: string;
    name: string;
    min_select: number;
    max_select: number;
    sort: number;
    options: { id: string; name: string; price_delta_paise: number; is_available: boolean; sort: number }[];
  }[];
}

/**
 * The orderable menu of a cafe: visible, non-archived categories and items with their
 * option groups. Shared by guest pages and staff ordering. Cached per request.
 */
export const getMenuItems = cache(async (cafeId: string): Promise<{ categories: MenuCategory[]; items: MenuItem[] }> => {
  const supabase = createAdminClient();
  const [categories, items, insights, manualPairs, autoPairs] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("cafe_id", cafeId)
      .eq("is_visible", true)
      .is("archived_at", null)
      .order("sort"),
    supabase
      .from("menu_items")
      .select(
        "id, category_id, name, description, price_paise, image_path, diet, tags, is_available, sold_out_until, " +
          "option_groups(id, name, min_select, max_select, sort, options(id, name, price_delta_paise, is_available, sort))",
      )
      .eq("cafe_id", cafeId)
      .eq("is_visible", true)
      .is("archived_at", null)
      .order("sort")
      .returns<ItemRow[]>(),
    supabase.from("item_insights").select("item_id").eq("cafe_id", cafeId).eq("is_bestseller", true),
    supabase.from("item_pairings").select("item_id, paired_item_id").eq("cafe_id", cafeId).order("sort"),
    supabase.from("auto_pairings").select("item_id, paired_item_id").eq("cafe_id", cafeId).order("together", { ascending: false }),
  ]);
  if (categories.error) throw categories.error;
  if (items.error) throw items.error;
  // The upsell cache is a nice-to-have: a failure there must never break the menu.
  const bestsellers = new Set((insights.data ?? []).map((r) => r.item_id));
  const pairs = new Map<string, string[]>();
  for (const row of [...(manualPairs.data ?? []), ...(autoPairs.data ?? [])]) {
    const list = pairs.get(row.item_id) ?? [];
    if (!list.includes(row.paired_item_id)) list.push(row.paired_item_id);
    pairs.set(row.item_id, list);
  }

  const visibleCategories = new Set(categories.data.map((c) => c.id));
  const menuItems: MenuItem[] = items.data
    .filter((item) => visibleCategories.has(item.category_id))
    .map((item) => ({
      id: item.id,
      categoryId: item.category_id,
      name: item.name,
      description: item.description,
      pricePaise: item.price_paise,
      imageUrl: publicImageUrl(item.image_path),
      diet: item.diet,
      tags: bestsellers.has(item.id) && !item.tags.includes("bestseller") ? [...item.tags, "bestseller"] : item.tags,
      isAvailable: item.is_available,
      soldOutUntil: item.sold_out_until,
      groups: [...item.option_groups]
        .sort((a, b) => a.sort - b.sort)
        .map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.min_select,
          maxSelect: group.max_select,
          options: [...group.options]
            .sort((a, b) => a.sort - b.sort)
            .map((o) => ({ id: o.id, name: o.name, priceDeltaPaise: o.price_delta_paise, available: o.is_available })),
        })),
      pairs: pairs.get(item.id) ?? [],
    }));
  // Only pair with items that are actually on the menu, at most 3.
  const onMenu = new Set(menuItems.map((i) => i.id));
  for (const item of menuItems) item.pairs = item.pairs.filter((id) => onMenu.has(id)).slice(0, 3);

  return { categories: categories.data, items: menuItems };
});

/**
 * Everything a guest page needs for one QR table, or null if the token is unknown.
 * Read with the service role because guests can't read tables or cafes directly [D-06].
 * Cached per request so the layout and the order API share one lookup.
 */
export const getGuestMenu = cache(async (token: string): Promise<GuestMenu | null> => {
  if (!TABLE_TOKEN_PATTERN.test(token)) return null;
  const supabase = createAdminClient();

  const { data: table, error: tableError } = await supabase
    .from("tables")
    .select(
      "id, label, token, is_active, archived_at, cafes!inner(id, slug, name, logo_path, brand_color, timezone, " +
        "gst_mode, tax_rate_bp, prices_include_tax, allow_pay_at_counter, ordering_paused, pause_message, " +
        "opening_hours, status, is_demo, google_review_url)",
    )
    .eq("token", token)
    .maybeSingle<TableRow>();
  if (tableError) throw tableError;
  if (!table) return null;
  const cafe = table.cafes;

  const [{ categories, items: menuItems }, onlinePayments] = await Promise.all([getMenuItems(cafe.id), onlinePaymentsAvailable(cafe.id)]);

  return {
    cafe: {
      id: cafe.id,
      slug: cafe.slug,
      name: cafe.name,
      logoUrl: publicImageUrl(cafe.logo_path),
      brandColor: cafe.brand_color,
      timezone: cafe.timezone,
      gstMode: cafe.gst_mode,
      taxRateBp: cafe.tax_rate_bp,
      pricesIncludeTax: cafe.prices_include_tax,
      allowPayAtCounter: cafe.allow_pay_at_counter,
      onlinePayments,
      orderingPaused: cafe.ordering_paused,
      pauseMessage: cafe.pause_message,
      isOpen: isOpenAt(cafe.opening_hours, new Date(), cafe.timezone),
      status: cafe.status,
      isDemo: cafe.is_demo,
      googleReviewUrl: cafe.google_review_url,
    },
    table: { id: table.id, label: table.label, token: table.token, isActive: table.is_active && !table.archived_at },
    categories,
    items: menuItems,
  };
});

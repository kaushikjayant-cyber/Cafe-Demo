import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/admin-shell";
import { MenuManager, type AdminCategory, type AdminItem } from "@/components/admin/menu-manager";
import { publicImageUrl } from "@/lib/data/menu";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Menu" };

interface ItemRow {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_paise: number;
  image_path: string | null;
  diet: AdminItem["diet"];
  tags: string[];
  is_visible: boolean;
  is_available: boolean;
  sold_out_until: string | null;
  sort: number;
  option_groups: {
    id: string;
    name: string;
    min_select: number;
    max_select: number;
    sort: number;
    options: { id: string; name: string; price_delta_paise: number; sort: number }[];
  }[];
}

export default async function MenuPage({ params }: PageProps<"/c/[slug]/admin/menu">) {
  const { slug } = await params;
  const { cafe } = await requireStaff(slug, ["owner", "manager"], "/admin/menu");
  const supabase = await createUserClient();

  const [categories, items, pairings] = await Promise.all([
    supabase.from("categories").select("id, name, is_visible, sort").eq("cafe_id", cafe.id).is("archived_at", null).order("sort"),
    supabase
      .from("menu_items")
      .select(
        "id, category_id, name, description, price_paise, image_path, diet, tags, is_visible, is_available, sold_out_until, sort, " +
          "option_groups(id, name, min_select, max_select, sort, options(id, name, price_delta_paise, sort))",
      )
      .eq("cafe_id", cafe.id)
      .is("archived_at", null)
      .order("sort")
      .returns<ItemRow[]>(),
    supabase.from("item_pairings").select("item_id, paired_item_id").eq("cafe_id", cafe.id).order("sort"),
  ]);
  if (categories.error) throw categories.error;
  if (items.error) throw items.error;

  const pairsOf = (id: string) => (pairings.data ?? []).filter((p) => p.item_id === id).map((p) => p.paired_item_id);
  const adminItems: AdminItem[] = items.data.map((i) => ({
    pairs: pairsOf(i.id),
    id: i.id,
    categoryId: i.category_id,
    name: i.name,
    description: i.description ?? "",
    pricePaise: i.price_paise,
    imageUrl: publicImageUrl(i.image_path),
    diet: i.diet,
    tags: i.tags,
    isVisible: i.is_visible,
    soldOut: !i.is_available && (!i.sold_out_until || new Date(i.sold_out_until) > new Date()),
    groups: [...i.option_groups]
      .sort((a, b) => a.sort - b.sort)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.min_select,
        maxSelect: g.max_select,
        options: [...g.options].sort((a, b) => a.sort - b.sort).map((o) => ({ id: o.id, name: o.name, priceDeltaPaise: o.price_delta_paise })),
      })),
  }));
  const adminCategories: AdminCategory[] = categories.data.map((c) => ({ id: c.id, name: c.name, isVisible: c.is_visible }));

  return (
    <>
      <PageHeader title="Menu" description="Changes show on guests' phones straight away. Prices on past bills never change." />
      <MenuManager tenantKey={slug} categories={adminCategories} items={adminItems} />
    </>
  );
}

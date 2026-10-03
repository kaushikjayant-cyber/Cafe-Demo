import type { Metadata } from "next";

import { SetupNotice } from "@/components/setup-notice";
import { StockPanel, type StockItem } from "@/components/staff/stock-panel";
import { foregroundFor } from "@/lib/color";
import { isSupabaseConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stock", robots: { index: false } };

interface Row {
  id: string;
  name: string;
  is_available: boolean;
  sold_out_until: string | null;
  categories: { name: string; sort: number } | null;
  option_groups: { sort: number; options: { id: string; name: string; is_available: boolean; sort: number }[] }[];
}

export default async function StockPage({ params }: PageProps<"/c/[slug]/staff/stock">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { slug } = await params;
  const { cafe, staff, base } = await requireStaff(slug, ["owner", "manager", "cashier", "kitchen"], "/staff/stock");

  // Read as the staff member: RLS limits it to their cafe.
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, is_available, sold_out_until, sort, categories(name, sort), option_groups(sort, options(id, name, is_available, sort))")
    .eq("cafe_id", cafe.id)
    .is("archived_at", null)
    .order("sort")
    .returns<(Row & { sort: number })[]>();
  if (error) throw error;

  const items: StockItem[] = data
    .sort((a, b) => (a.categories?.sort ?? 0) - (b.categories?.sort ?? 0) || a.sort - b.sort)
    .map((row) => ({
      id: row.id,
      category: row.categories?.name ?? "Other",
      name: row.name,
      is_available: row.is_available,
      sold_out_until: row.sold_out_until,
      options: [...row.option_groups]
        .sort((a, b) => a.sort - b.sort)
        .flatMap((g) => [...g.options].sort((a, b) => a.sort - b.sort))
        .map(({ id, name, is_available }) => ({ id, name, is_available })),
    }));

  return (
    <div className="guest flex min-h-dvh flex-1 flex-col" style={{ "--brand": cafe.brand_color, "--brand-fg": foregroundFor(cafe.brand_color) } as React.CSSProperties}>
      <StockPanel
        tenantKey={slug}
        base={base}
        cafe={{ id: cafe.id, name: cafe.name, orderingPaused: cafe.ordering_paused, pauseMessage: cafe.pause_message, timezone: cafe.timezone }}
        staff={{ displayName: staff.displayName, role: staff.role }}
        items={items}
      />
    </div>
  );
}

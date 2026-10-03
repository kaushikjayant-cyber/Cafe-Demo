import type { Metadata } from "next";

import { SetupNotice } from "@/components/setup-notice";
import { OrderPad } from "@/components/staff/order-pad";
import { foregroundFor } from "@/lib/color";
import { getMenuItems } from "@/lib/data/menu";
import { isSupabaseConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New order", robots: { index: false } };

export default async function NewOrderPage({ params }: PageProps<"/c/[slug]/staff/new">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { slug } = await params;
  const { cafe, staff, base } = await requireStaff(slug, ["owner", "manager", "cashier"], "/staff/new");

  const [{ categories, items }, tables] = await Promise.all([
    getMenuItems(cafe.id),
    createUserClient().then((supabase) =>
      supabase.from("tables").select("id, label").eq("cafe_id", cafe.id).eq("is_active", true).is("archived_at", null).order("sort"),
    ),
  ]);
  if (tables.error) throw tables.error;

  return (
    <div className="guest flex min-h-dvh flex-1 flex-col" style={{ "--brand": cafe.brand_color, "--brand-fg": foregroundFor(cafe.brand_color) } as React.CSSProperties}>
      <OrderPad
        tenantKey={slug}
        base={base}
        cafe={{
          id: cafe.id,
          name: cafe.name,
          orderingPaused: cafe.ordering_paused,
          pauseMessage: cafe.pause_message,
          taxRateBp: cafe.tax_rate_bp,
          pricesIncludeTax: cafe.prices_include_tax,
          gstMode: cafe.gst_mode,
        }}
        staff={{ displayName: staff.displayName, role: staff.role }}
        categories={categories}
        items={items}
        tables={tables.data}
      />
    </div>
  );
}

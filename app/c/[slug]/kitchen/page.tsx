import type { Metadata } from "next";

import { SetupNotice } from "@/components/setup-notice";
import { KitchenBoard } from "@/components/staff/kitchen-board";
import { foregroundFor } from "@/lib/color";
import { isSupabaseConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Kitchen", robots: { index: false } };

export default async function KitchenPage({ params }: PageProps<"/c/[slug]/kitchen">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { slug } = await params;
  const { cafe, staff, base } = await requireStaff(slug, ["owner", "manager", "cashier", "kitchen"], "/kitchen");

  return (
    <div className="guest kds flex min-h-dvh flex-1 flex-col" style={{ "--brand": cafe.brand_color, "--brand-fg": foregroundFor(cafe.brand_color) } as React.CSSProperties}>
      <KitchenBoard
        tenantKey={slug}
        base={base}
        cafe={{ id: cafe.id, name: cafe.name, orderingPaused: cafe.ordering_paused, pauseMessage: cafe.pause_message }}
        staff={{ displayName: staff.displayName, role: staff.role }}
      />
    </div>
  );
}

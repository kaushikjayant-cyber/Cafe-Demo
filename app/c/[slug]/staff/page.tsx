import type { Metadata } from "next";

import { CounterBoard } from "@/components/staff/counter-board";
import { SetupNotice } from "@/components/setup-notice";
import { foregroundFor } from "@/lib/color";
import { isSupabaseConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Orders", robots: { index: false } };

export default async function CounterPage({ params }: PageProps<"/c/[slug]/staff">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { slug } = await params;
  const { cafe, staff, base } = await requireStaff(slug, ["owner", "manager", "cashier"], "/staff");

  return (
    <div className="guest flex min-h-dvh flex-1 flex-col" style={{ "--brand": cafe.brand_color, "--brand-fg": foregroundFor(cafe.brand_color) } as React.CSSProperties}>
      <CounterBoard
        tenantKey={slug}
        base={base}
        cafe={{ id: cafe.id, name: cafe.name, orderingPaused: cafe.ordering_paused, pauseMessage: cafe.pause_message }}
        staff={{ displayName: staff.displayName, role: staff.role }}
      />
    </div>
  );
}

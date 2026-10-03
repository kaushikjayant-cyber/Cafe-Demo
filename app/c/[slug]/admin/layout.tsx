import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { SetupNotice } from "@/components/setup-notice";
import { foregroundFor } from "@/lib/color";
import { isSupabaseConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/staff-auth";

export const metadata: Metadata = { title: { template: "%s · Owner panel", default: "Owner panel" }, robots: { index: false } };

// Owner panel: owners and managers. Owner-only pages check again themselves, and every
// action checks permissions on the server (and RLS checks them again in the database).
export default async function AdminLayout({ children, params }: LayoutProps<"/c/[slug]/admin">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { slug } = await params;
  const { cafe, staff, base } = await requireStaff(slug, ["owner", "manager"], "/admin");

  return (
    <div className="guest flex min-h-dvh flex-1" style={{ "--brand": cafe.brand_color, "--brand-fg": foregroundFor(cafe.brand_color) } as React.CSSProperties}>
      <AdminShell tenantKey={slug} base={base} cafeName={cafe.name} staff={{ displayName: staff.displayName, role: staff.role }}>
        {children}
      </AdminShell>
    </div>
  );
}

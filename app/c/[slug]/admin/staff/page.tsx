import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/admin-shell";
import { StaffManager } from "@/components/admin/staff-manager";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";
import { tenantHref } from "@/lib/tenant";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage({ params }: PageProps<"/c/[slug]/admin/staff">) {
  const { slug } = await params;
  const { cafe, staff, base } = await requireStaff(slug, ["owner"], "/admin/staff");
  // RLS lets owners and managers read their cafe's staff list.
  const { data, error } = await (await createUserClient())
    .from("staff")
    .select("id, display_name, username, role, active, created_at")
    .eq("cafe_id", cafe.id)
    .order("created_at");
  if (error) throw error;

  return (
    <>
      <PageHeader title="Staff" description={`Logins for your team. They sign in at ${tenantHref(base, "/login")} with their username and password.`} />
      <StaffManager
        tenantKey={slug}
        me={staff.staffId}
        members={data.map((m) => ({ id: m.id, name: m.display_name, username: m.username, role: m.role, active: m.active }))}
      />
    </>
  );
}

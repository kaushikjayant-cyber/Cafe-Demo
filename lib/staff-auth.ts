import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getCafeByTenantKey, type PublicCafe } from "@/lib/data/cafes";
import type { StaffRole } from "@/lib/order-state";
import { createUserClient } from "@/lib/supabase/server";
import { tenantHref } from "@/lib/tenant";

export interface StaffSession {
  staffId: string;
  userId: string;
  role: StaffRole;
  displayName: string;
}

export interface StaffContext {
  cafe: PublicCafe;
  staff: StaffSession;
  /** Prefix for links inside this cafe: "" on a subdomain, "/c/<slug>" in path mode. */
  base: string;
}

/** Link prefix for the current cafe, as set by proxy.ts. */
export async function tenantBase(tenantKey: string): Promise<string> {
  const fromProxy = (await headers()).get("x-tenant-base");
  return fromProxy ?? `/c/${tenantKey}`;
}

/** The signed-in staff member's membership in this cafe, or null. */
export const getStaffSession = cache(async (cafeId: string): Promise<StaffSession | null> => {
  const supabase = await createUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  // RLS lets a user read their own staff row.
  const { data } = await supabase
    .from("staff")
    .select("id, role, display_name, active")
    .eq("user_id", userId)
    .eq("cafe_id", cafeId)
    .maybeSingle();
  if (!data || !data.active) return null;
  return { staffId: data.id, userId, role: data.role, displayName: data.display_name };
});

/** Where each role lands after signing in. */
export function homeFor(role: StaffRole): string {
  return role === "kitchen" ? "/kitchen" : role === "owner" ? "/admin" : "/staff";
}

/**
 * Guards a staff page: unknown cafe → 404, signed out → login, wrong role → their home.
 * Pages must still check permissions on every action; this only decides what to render.
 */
export async function requireStaff(tenantKey: string, roles: StaffRole[], path: string): Promise<StaffContext> {
  const cafe = await getCafeByTenantKey(tenantKey);
  if (!cafe) redirect("/");
  const base = await tenantBase(tenantKey);
  const staff = await getStaffSession(cafe.id);
  if (!staff) redirect(`${tenantHref(base, "/login")}?next=${encodeURIComponent(path)}`);
  if (!roles.includes(staff.role)) redirect(tenantHref(base, homeFor(staff.role)));
  return { cafe, staff, base };
}

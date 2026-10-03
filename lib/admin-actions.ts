import "server-only";

import { getCafeByTenantKey, type PublicCafe } from "@/lib/data/cafes";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffRole } from "@/lib/order-state";
import { getStaffSession, type StaffSession } from "@/lib/staff-auth";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export class ActionError extends Error {}

/**
 * Every owner-panel action starts here: the page may have rendered for an owner, but the
 * request could come from anywhere, so the role is checked again on each call.
 */
export async function adminContext(tenantKey: string, roles: StaffRole[] = ["owner", "manager"]): Promise<{ cafe: PublicCafe; staff: StaffSession }> {
  const cafe = await getCafeByTenantKey(tenantKey);
  if (!cafe) throw new ActionError("This cafe doesn't exist.");
  const staff = await getStaffSession(cafe.id);
  if (!staff || !roles.includes(staff.role)) throw new ActionError("You don't have permission to do that.");
  return { cafe, staff };
}

/** Turns thrown errors into a message for the form; unexpected ones are logged, not shown. */
export async function run<T>(task: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    if (error instanceof ActionError) return { ok: false, error: error.message };
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("forbidden")) return { ok: false, error: "You don't have permission to do that." };
    console.error(error);
    return { ok: false, error: "That didn't save. Please try again." };
  }
}

/** Writes to the audit trail (§7). Users can read it but never write it, so this uses the service role. */
export async function logActivity(entry: {
  cafeId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}): Promise<void> {

  const { error } = await createAdminClient().from("activity_log").insert({
    cafe_id: entry.cafeId,
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  if (error) console.error("activity log write failed", error);
}

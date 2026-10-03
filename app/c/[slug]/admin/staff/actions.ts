"use server";

import { z } from "zod";

import { ActionError, adminContext, logActivity, run, type ActionResult } from "@/lib/admin-actions";
import { staffEmail, USERNAME_PATTERN } from "@/lib/staff-email";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["manager", "cashier", "kitchen"] as const;
const password = z.string().min(8, "Use at least 8 characters for the password.").max(72);

const newStaffSchema = z.object({
  displayName: z.string().trim().min(1, "Enter their name.").max(40),
  username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN, "Usernames are 3–32 lowercase letters, numbers, dots or dashes."),
  role: z.enum(ROLES),
  password,
});

/** Staff management is owner-only: it creates and controls logins (service role, after the role check). */
export async function addStaff(tenantKey: string, input: z.input<typeof newStaffSchema>): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff: owner } = await adminContext(tenantKey, ["owner"]);
    const parsed = newStaffSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0].message);
    const { displayName, username, role } = parsed.data;

    const admin = createAdminClient();
    const { data: taken } = await admin.from("staff").select("id").eq("cafe_id", cafe.id).eq("username", username).maybeSingle();
    if (taken) throw new ActionError(`The username “${username}” is already in use here.`);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: staffEmail(cafe.slug, username),
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw new ActionError(error.message.includes("already") ? `The username “${username}” is already in use.` : "Couldn't create the login. Please try again.");

    const { error: staffError } = await admin.from("staff").insert({ cafe_id: cafe.id, user_id: created.user.id, display_name: displayName, username, role });
    if (staffError) {
      await admin.auth.admin.deleteUser(created.user.id); // don't leave an orphan login behind
      throw staffError;
    }
    await logActivity({ cafeId: cafe.id, actorId: owner.userId, action: "staff_added", entity: "staff", entityId: username, after: { role } });
    return undefined;
  });
}

async function staffRow(cafeId: string, staffId: string) {
  const { data } = await createAdminClient().from("staff").select("id, user_id, role, active, username").eq("id", z.uuid().parse(staffId)).eq("cafe_id", cafeId).maybeSingle();
  if (!data) throw new ActionError("That person isn't on your staff list.");
  return data;
}

export async function resetStaffPassword(tenantKey: string, staffId: string, newPassword: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff: owner } = await adminContext(tenantKey, ["owner"]);
    const parsed = password.safeParse(newPassword);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0].message);
    const row = await staffRow(cafe.id, staffId);
    const { error } = await createAdminClient().auth.admin.updateUserById(row.user_id, { password: parsed.data });
    if (error) throw error;
    await logActivity({ cafeId: cafe.id, actorId: owner.userId, action: "staff_password_reset", entity: "staff", entityId: row.username });
    return undefined;
  });
}

export async function setStaffRole(tenantKey: string, staffId: string, role: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff: owner } = await adminContext(tenantKey, ["owner"]);
    const newRole = z.enum(ROLES).parse(role);
    const row = await staffRow(cafe.id, staffId);
    if (row.role === "owner") throw new ActionError("The owner's role can't be changed here.");
    const { error } = await createAdminClient().from("staff").update({ role: newRole }).eq("id", row.id);
    if (error) throw error;
    await logActivity({ cafeId: cafe.id, actorId: owner.userId, action: "staff_role_changed", entity: "staff", entityId: row.username, before: { role: row.role }, after: { role: newRole } });
    return undefined;
  });
}

/**
 * Turning someone off stops them at once: staff.active is checked by every page, RPC and RLS
 * policy, and the login is banned so their session can't refresh.
 */
export async function setStaffActive(tenantKey: string, staffId: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff: owner } = await adminContext(tenantKey, ["owner"]);
    const row = await staffRow(cafe.id, staffId);
    if (row.user_id === owner.userId) throw new ActionError("You can't turn off your own login.");
    if (row.role === "owner") throw new ActionError("Owner logins are managed by your platform provider.");
    const admin = createAdminClient();
    const { error } = await admin.from("staff").update({ active }).eq("id", row.id);
    if (error) throw error;
    const { error: banError } = await admin.auth.admin.updateUserById(row.user_id, { ban_duration: active ? "none" : "876000h" });
    if (banError) throw banError;
    await logActivity({ cafeId: cafe.id, actorId: owner.userId, action: active ? "staff_reactivated" : "staff_deactivated", entity: "staff", entityId: row.username });
    return undefined;
  });
}

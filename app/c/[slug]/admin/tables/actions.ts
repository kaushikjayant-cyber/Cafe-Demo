"use server";

import { z } from "zod";

import { ActionError, adminContext, logActivity, run, type ActionResult } from "@/lib/admin-actions";
import { createUserClient } from "@/lib/supabase/server";
import { newTableToken } from "@/lib/tokens";

const label = z.string().trim().min(1, "Give the table a name, like T13 or Patio 2.").max(20, "Keep table names under 20 characters.");

async function insertWithFreshToken(cafeId: string, tableLabel: string, sort: number) {
  const supabase = await createUserClient();
  // Tokens are random; on the rare clash with an existing token, draw again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("tables").insert({ cafe_id: cafeId, label: tableLabel, token: newTableToken(), sort });
    if (!error) return;
    if (error.code !== "23505" || !error.message.includes("token")) throw error;
  }
  throw new ActionError("Couldn't create a unique QR code. Please try again.");
}

export async function addTable(tenantKey: string, name: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const parsed = label.safeParse(name);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0].message);
    const supabase = await createUserClient();
    const { data: existing } = await supabase.from("tables").select("label, sort").eq("cafe_id", cafe.id).is("archived_at", null);
    if (existing?.some((t) => t.label.toLowerCase() === parsed.data.toLowerCase())) throw new ActionError(`There's already a table called ${parsed.data}.`);
    await insertWithFreshToken(cafe.id, parsed.data, Math.max(0, ...(existing ?? []).map((t) => t.sort)) + 1);
    return undefined;
  });
}

/** Adds T1…Tn style tables after the highest numbered one (for setting up a new cafe quickly). */
export async function addTables(tenantKey: string, count: number): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const n = z.int().min(1).max(50).parse(count);
    const supabase = await createUserClient();
    const { data: existing } = await supabase.from("tables").select("label, sort").eq("cafe_id", cafe.id).is("archived_at", null);
    let next = Math.max(0, ...(existing ?? []).map((t) => Number(/^T(\d+)$/i.exec(t.label)?.[1] ?? 0))) + 1;
    let sort = Math.max(0, ...(existing ?? []).map((t) => t.sort));
    for (let i = 0; i < n; i++) await insertWithFreshToken(cafe.id, `T${next++}`, ++sort);
    return undefined;
  });
}

export async function renameTable(tenantKey: string, tableId: string, name: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const parsed = label.safeParse(name);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0].message);
    const { error } = await (await createUserClient()).from("tables").update({ label: parsed.data }).eq("id", z.uuid().parse(tableId)).eq("cafe_id", cafe.id);
    if (error) throw error;
    return undefined;
  });
}

export async function setTableActive(tenantKey: string, tableId: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const { error } = await (await createUserClient()).from("tables").update({ is_active: active }).eq("id", z.uuid().parse(tableId)).eq("cafe_id", cafe.id);
    if (error) throw error;
    return undefined;
  });
}

/** A new QR code for the table. The old printed code stops working at once (e.g. if it was misused). */
export async function replaceTableQr(tenantKey: string, tableId: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff } = await adminContext(tenantKey);
    const supabase = await createUserClient();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from("tables").update({ token: newTableToken() }).eq("id", z.uuid().parse(tableId)).eq("cafe_id", cafe.id);
      if (!error) {
        await logActivity({ cafeId: cafe.id, actorId: staff.userId, action: "table_qr_replaced", entity: "table", entityId: tableId });
        return undefined;
      }
      if (error.code !== "23505") throw error;
    }
    throw new ActionError("Couldn't create a unique QR code. Please try again.");
  });
}

/** Removes the table. Its past orders keep their table name; its QR code stops working. */
export async function removeTable(tenantKey: string, tableId: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const { error } = await (await createUserClient())
      .from("tables")
      .update({ archived_at: new Date().toISOString(), is_active: false })
      .eq("id", z.uuid().parse(tableId))
      .eq("cafe_id", cafe.id);
    if (error) throw error;
    return undefined;
  });
}

"use server";

import { ActionError, adminContext, run, type ActionResult } from "@/lib/admin-actions";
import { createAdminClient } from "@/lib/supabase/admin";

/** Demo cafes only: wipe visitors' orders and regenerate 60 days of history up to now. */
export async function resetDemo(tenantKey: string): Promise<ActionResult<number>> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    if (!cafe.is_demo) throw new ActionError("Only the demo cafe can be reset.");
    const { data, error } = await createAdminClient().rpc("reset_demo_cafe", { p_cafe: cafe.id });
    if (error) {
      if (error.message.includes("reset_too_soon")) throw new ActionError("The demo was just reset. Try again in a couple of minutes.");
      throw error;
    }
    return data as number;
  });
}

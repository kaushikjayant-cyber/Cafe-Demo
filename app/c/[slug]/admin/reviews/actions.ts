"use server";

import { z } from "zod";

import { ActionError, adminContext, logActivity, run, type ActionResult } from "@/lib/admin-actions";
import { createUserClient } from "@/lib/supabase/server";

/** Hide an abusive review from the list. It still counts in the averages (§5.9). */
export async function setReviewHidden(tenantKey: string, reviewId: string, hidden: boolean): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff } = await adminContext(tenantKey);
    if (!z.uuid().safeParse(reviewId).success) throw new ActionError("That review doesn't exist.");
    const { data, error } = await (await createUserClient())
      .from("reviews")
      .update({ is_hidden: hidden })
      .eq("id", reviewId)
      .eq("cafe_id", cafe.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ActionError("That review doesn't exist.");
    await logActivity({ cafeId: cafe.id, actorId: staff.userId, action: hidden ? "review_hidden" : "review_shown", entity: "review", entityId: reviewId });
    return undefined;
  });
}

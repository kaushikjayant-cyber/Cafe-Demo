"use server";

import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { z } from "zod";

import { ActionError, adminContext, logActivity, run, type ActionResult } from "@/lib/admin-actions";
import { encryptSecret } from "@/lib/crypto";
import { MENU_IMAGE_BUCKET, publicImageUrl } from "@/lib/data/menu";
import { serverEnv } from "@/lib/env.server";
import { WEEKDAYS } from "@/lib/hours";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

// Every settings change is owner-only. Cafe columns are written through RLS (column grants
// keep plan/status/AMC out of reach); payment keys go to cafe_secrets with the service role.

function issue(error: z.ZodError) {
  return new ActionError(error.issues[0]?.message ?? "Please check the form.");
}

async function updateCafe(tenantKey: string, patch: Record<string, unknown>, action: string) {
  const { cafe, staff } = await adminContext(tenantKey, ["owner"]);
  const { error } = await (await createUserClient()).from("cafes").update(patch).eq("id", cafe.id);
  if (error) {
    if (error.message.includes("gstin")) throw new ActionError("That GSTIN doesn't look right. It's 15 characters, like 29ABCDE1234F1Z5.");
    throw error;
  }
  await logActivity({ cafeId: cafe.id, actorId: staff.userId, action, entity: "cafe", entityId: cafe.id, after: patch });
}

const brandingSchema = z.object({
  name: z.string().trim().min(1, "Enter the cafe's name.").max(80),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
});

export async function saveBranding(tenantKey: string, input: z.input<typeof brandingSchema>): Promise<ActionResult> {
  return run(async () => {
    const parsed = brandingSchema.safeParse(input);
    if (!parsed.success) throw issue(parsed.error);
    await updateCafe(tenantKey, parsed.data, "settings_branding");
    return undefined;
  });
}

export async function uploadLogo(tenantKey: string, form: FormData): Promise<ActionResult<string>> {
  return run(async () => {
    const { cafe, staff } = await adminContext(tenantKey, ["owner"]);
    const file = form.get("logo");
    if (!(file instanceof File) || !file.type.startsWith("image/")) throw new ActionError("Please choose an image.");
    if (file.size > 6 * 1024 * 1024) throw new ActionError("That image is over 6 MB.");
    let image: Buffer;
    try {
      image = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
    } catch {
      throw new ActionError("We couldn't read that image. Please try a PNG or JPG.");
    }
    const path = `${cafe.id}/logo-${randomBytes(4).toString("hex")}.webp`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from(MENU_IMAGE_BUCKET).upload(path, image, { contentType: "image/webp", cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    const { error } = await (await createUserClient()).from("cafes").update({ logo_path: path }).eq("id", cafe.id);
    if (error) throw error;
    if (cafe.logo_path) await admin.storage.from(MENU_IMAGE_BUCKET).remove([cafe.logo_path]);
    await logActivity({ cafeId: cafe.id, actorId: staff.userId, action: "settings_logo", entity: "cafe", entityId: cafe.id });
    return publicImageUrl(path)!;
  });
}

const optional = (max: number) => z.string().trim().max(max).transform((v) => v || null);

const businessSchema = z.object({
  legal_name: optional(120),
  address: optional(300),
  phone: optional(20),
  email: z.union([z.literal(""), z.email("That email doesn't look right.")]).transform((v) => v || null),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "That GSTIN doesn't look right. It's 15 characters, like 29ABCDE1234F1Z5.")
    .transform((v) => v || null),
  fssai_no: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{14}$/.test(v), "FSSAI licence numbers are 14 digits.")
    .transform((v) => v || null),
  invoice_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, "Use 1–4 letters or numbers for the invoice prefix."),
  gst_mode: z.enum(["regular", "none"]),
  tax_rate_bp: z.int().min(0).max(2800),
  prices_include_tax: z.boolean(),
});

export async function saveBusiness(tenantKey: string, input: z.input<typeof businessSchema>): Promise<ActionResult> {
  return run(async () => {
    const parsed = businessSchema.safeParse(input);
    if (!parsed.success) throw issue(parsed.error);
    if (parsed.data.gst_mode === "regular" && !parsed.data.gstin) throw new ActionError("Enter your GSTIN to charge GST, or choose “Not registered for GST”.");
    await updateCafe(tenantKey, parsed.data, "settings_business");
    return undefined;
  });
}

const time = z.string().regex(/^\d{2}:\d{2}$/);
const orderingSchema = z.object({
  // Days left out are closed (a fully keyed z.record would demand all seven).
  opening_hours: z.partialRecord(z.enum(WEEKDAYS), z.array(z.tuple([time, time])).max(3)).nullable(),
  day_starts_at: time,
  accept_mode: z.enum(["auto_paid", "manual_all"]),
  allow_pay_at_counter: z.boolean(),
  google_review_url: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Paste the full review link, starting with https://")
    .transform((v) => v || null),
});

export async function saveOrdering(tenantKey: string, input: z.input<typeof orderingSchema>): Promise<ActionResult> {
  return run(async () => {
    const parsed = orderingSchema.safeParse(input);
    if (!parsed.success) throw issue(parsed.error);
    await updateCafe(tenantKey, parsed.data, "settings_ordering");
    return undefined;
  });
}

const keysSchema = z.object({
  key_id: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/, "The Key ID starts with rzp_live_ or rzp_test_."),
  key_secret: z.string().trim().max(128),
  webhook_secret: z.string().trim().max(128),
});

/**
 * Stores the cafe's own Razorpay keys, encrypted [D-37]. Blank secret fields keep the saved
 * ones, so the owner can change one value without re-typing the others.
 */
export async function savePaymentKeys(tenantKey: string, input: z.input<typeof keysSchema>): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff } = await adminContext(tenantKey, ["owner"]);
    const parsed = keysSchema.safeParse(input);
    if (!parsed.success) throw issue(parsed.error);
    const admin = createAdminClient();
    const { data: existing } = await admin.from("cafe_secrets").select("razorpay_key_secret_enc").eq("cafe_id", cafe.id).maybeSingle();
    if (!parsed.data.key_secret && !existing?.razorpay_key_secret_enc) throw new ActionError("Enter the Key Secret from Razorpay.");

    const key = serverEnv().APP_ENCRYPTION_KEY;
    const patch: Record<string, string> = { cafe_id: cafe.id, razorpay_key_id: parsed.data.key_id, updated_at: new Date().toISOString() };
    if (parsed.data.key_secret) patch.razorpay_key_secret_enc = encryptSecret(parsed.data.key_secret, key);
    if (parsed.data.webhook_secret) patch.razorpay_webhook_secret_enc = encryptSecret(parsed.data.webhook_secret, key);
    const { error } = await admin.from("cafe_secrets").upsert(patch, { onConflict: "cafe_id" });
    if (error) throw error;
    // Never log secrets: only which key is now in use.
    await logActivity({ cafeId: cafe.id, actorId: staff.userId, action: "settings_payment_keys", entity: "cafe", entityId: cafe.id, after: { key_id: parsed.data.key_id } });
    return undefined;
  });
}

export async function removePaymentKeys(tenantKey: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe, staff } = await adminContext(tenantKey, ["owner"]);
    const { error } = await createAdminClient().from("cafe_secrets").delete().eq("cafe_id", cafe.id);
    if (error) throw error;
    await logActivity({ cafeId: cafe.id, actorId: staff.userId, action: "settings_payment_keys_removed", entity: "cafe", entityId: cafe.id });
    return undefined;
  });
}

"use server";

import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { z } from "zod";

import { ActionError, adminContext, run, type ActionResult } from "@/lib/admin-actions";
import { MENU_IMAGE_BUCKET, publicImageUrl } from "@/lib/data/menu";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const optionSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Every option needs a name.").max(60),
  price_delta_paise: z.int().min(-100_000).max(1_000_000),
});

const groupSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Every option group needs a name.").max(60),
    min_select: z.int().min(0).max(20),
    max_select: z.int().min(1).max(20),
    options: z.array(optionSchema).min(1, "Every option group needs at least one option.").max(30),
  })
  .refine((g) => g.min_select <= g.max_select, "“Choose at least” can't be more than “choose up to”.")
  .refine((g) => g.min_select <= g.options.length, "A group can't require more choices than it has options.");

const itemSchema = z.object({
  id: z.uuid().optional(),
  category_id: z.uuid(),
  name: z.string().trim().min(1, "Give the item a name.").max(80),
  description: z.string().trim().max(300),
  price_paise: z.int("Enter a price like 190 or 190.50.").min(0).max(10_000_000),
  diet: z.enum(["veg", "nonveg", "egg", "vegan", ""]),
  tags: z.array(z.enum(["spicy", "new", "bestseller", "jain"])).max(4),
  is_visible: z.boolean(),
  groups: z.array(groupSchema).max(10),
});
export type ItemInput = z.input<typeof itemSchema>;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form.";
}

export async function saveItem(tenantKey: string, input: ItemInput): Promise<ActionResult<string>> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(firstIssue(parsed.error));
    const { data, error } = await (await createUserClient()).rpc("save_menu_item", { p: { ...parsed.data, cafe_id: cafe.id } });
    if (error) throw error;
    return data as string;
  });
}

export async function archiveItem(tenantKey: string, itemId: string): Promise<ActionResult> {
  return run(async () => {
    await adminContext(tenantKey);
    const { error } = await (await createUserClient()).rpc("archive_menu_item", { p_item: z.uuid().parse(itemId) });
    if (error) throw error;
    return undefined;
  });
}

export async function setItemVisible(tenantKey: string, itemId: string, visible: boolean): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const { error } = await (await createUserClient()).from("menu_items").update({ is_visible: visible }).eq("id", z.uuid().parse(itemId)).eq("cafe_id", cafe.id);
    if (error) throw error;
    return undefined;
  });
}

// CATEGORIES ---------------------------------------------------------------------------

export async function saveCategory(tenantKey: string, input: { id?: string; name: string }): Promise<ActionResult<{ id: string; name: string }>> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const name = z.string().trim().min(1, "Give the category a name.").max(60).safeParse(input.name);
    if (!name.success) throw new ActionError(firstIssue(name.error));
    const supabase = await createUserClient();
    if (input.id) {
      const { error } = await supabase.from("categories").update({ name: name.data }).eq("id", z.uuid().parse(input.id)).eq("cafe_id", cafe.id);
      if (error) throw error;
      return { id: input.id, name: name.data };
    }
    const { data: last } = await supabase.from("categories").select("sort").eq("cafe_id", cafe.id).order("sort", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("categories")
      .insert({ cafe_id: cafe.id, name: name.data, sort: (last?.sort ?? 0) + 1 })
      .select("id, name")
      .single();
    if (error) throw error;
    return data;
  });
}

export async function setCategoryVisible(tenantKey: string, categoryId: string, visible: boolean): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const { error } = await (await createUserClient()).from("categories").update({ is_visible: visible }).eq("id", z.uuid().parse(categoryId)).eq("cafe_id", cafe.id);
    if (error) throw error;
    return undefined;
  });
}

/** Moves a category one place up or down by swapping sort positions with its neighbour. */
export async function moveCategory(tenantKey: string, categoryId: string, direction: "up" | "down"): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const supabase = await createUserClient();
    const { data: all, error } = await supabase.from("categories").select("id, sort").eq("cafe_id", cafe.id).is("archived_at", null).order("sort");
    if (error) throw error;
    const ordered = all.map((c, i) => ({ ...c, sort: i + 1 })); // normalise gaps/duplicates first
    const index = ordered.findIndex((c) => c.id === categoryId);
    const swap = index + (direction === "up" ? -1 : 1);
    if (index < 0 || swap < 0 || swap >= ordered.length) return undefined;
    [ordered[index].sort, ordered[swap].sort] = [ordered[swap].sort, ordered[index].sort];
    for (const c of ordered) {
      const { error: updateError } = await supabase.from("categories").update({ sort: c.sort }).eq("id", c.id).eq("cafe_id", cafe.id);
      if (updateError) throw updateError;
    }
    return undefined;
  });
}

export async function archiveCategory(tenantKey: string, categoryId: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const supabase = await createUserClient();
    const id = z.uuid().parse(categoryId);
    const { count } = await supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("category_id", id).is("archived_at", null);
    if (count) throw new ActionError("Move or delete the items in this category first.");
    const { error } = await supabase.from("categories").update({ archived_at: new Date().toISOString(), is_visible: false }).eq("id", id).eq("cafe_id", cafe.id);
    if (error) throw error;
    return undefined;
  });
}

// PHOTOS -------------------------------------------------------------------------------

const MAX_UPLOAD = 6 * 1024 * 1024;

/** Re-encodes any photo to a 1200px WebP (strips EXIF and anything else hidden in the file). */
async function toWebp(file: File): Promise<Buffer> {
  if (!file.type.startsWith("image/")) throw new ActionError("Please choose a photo (JPG, PNG, WebP or HEIC).");
  if (file.size > MAX_UPLOAD) throw new ActionError("That photo is over 6 MB. Please choose a smaller one.");
  try {
    return await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // respect the phone's orientation, then drop the metadata
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    throw new ActionError("We couldn't read that photo. Please try a JPG or PNG.");
  }
}

export async function uploadItemPhoto(tenantKey: string, itemId: string, form: FormData): Promise<ActionResult<string>> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const id = z.uuid().parse(itemId);
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Please choose a photo.");
    const image = await toWebp(file);

    const supabase = await createUserClient();
    const { data: item } = await supabase.from("menu_items").select("image_path").eq("id", id).eq("cafe_id", cafe.id).maybeSingle();
    if (!item) throw new ActionError("This item no longer exists.");

    const path = `${cafe.id}/${id}-${randomBytes(4).toString("hex")}.webp`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from(MENU_IMAGE_BUCKET).upload(path, image, { contentType: "image/webp", cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    const { error } = await supabase.from("menu_items").update({ image_path: path }).eq("id", id).eq("cafe_id", cafe.id);
    if (error) throw error;
    if (item.image_path) await admin.storage.from(MENU_IMAGE_BUCKET).remove([item.image_path]);
    return publicImageUrl(path)!;
  });
}

export async function removeItemPhoto(tenantKey: string, itemId: string): Promise<ActionResult> {
  return run(async () => {
    const { cafe } = await adminContext(tenantKey);
    const supabase = await createUserClient();
    const { data: item } = await supabase.from("menu_items").select("image_path").eq("id", z.uuid().parse(itemId)).eq("cafe_id", cafe.id).maybeSingle();
    if (!item?.image_path) return undefined;
    const { error } = await supabase.from("menu_items").update({ image_path: null }).eq("id", itemId).eq("cafe_id", cafe.id);
    if (error) throw error;
    await createAdminClient().storage.from(MENU_IMAGE_BUCKET).remove([item.image_path]);
    return undefined;
  });
}

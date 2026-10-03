"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getCafeByTenantKey } from "@/lib/data/cafes";
import { RateLimiter } from "@/lib/rate-limit";
import { homeFor, tenantBase } from "@/lib/staff-auth";
import { loginEmail } from "@/lib/staff-email";
import { createUserClient } from "@/lib/supabase/server";
import { tenantHref } from "@/lib/tenant";

export interface LoginState {
  error: string | null;
}

const attempts = new RateLimiter();
const LOGIN_LIMIT = { max: 8, windowMs: 15 * 60_000 };
const GENERIC_ERROR = "That username or password isn't right.";

/** Only allow redirects to a staff page inside this cafe. */
function safeNext(next: string | null): string | null {
  return next && /^\/(staff|kitchen|admin)(\/[\w-]*)*$/.test(next) ? next : null;
}

export async function signIn(tenantKey: string, _state: LoginState, form: FormData): Promise<LoginState> {
  const identifier = String(form.get("identifier") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "") || null);

  const cafe = await getCafeByTenantKey(tenantKey);
  if (!cafe) return { error: "This cafe doesn't exist." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!attempts.allow(`login:${ip}:${cafe.id}`, LOGIN_LIMIT)) {
    return { error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  const email = loginEmail(cafe.slug, identifier);
  if (!email || password.length < 6) return { error: GENERIC_ERROR };

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: GENERIC_ERROR };

  // A valid account that doesn't work at this cafe must not stay signed in here.
  const { data: staff } = await supabase
    .from("staff")
    .select("role, active")
    .eq("user_id", data.user.id)
    .eq("cafe_id", cafe.id)
    .maybeSingle();
  if (!staff?.active) {
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR };
  }

  const base = await tenantBase(tenantKey);
  redirect(tenantHref(base, next ?? homeFor(staff.role)));
}

export async function signOut(tenantKey: string): Promise<void> {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect(tenantHref(await tenantBase(tenantKey), "/login"));
}

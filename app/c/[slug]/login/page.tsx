import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SetupNotice } from "@/components/setup-notice";
import { LoginForm } from "@/components/staff/login-form";
import { foregroundFor } from "@/lib/color";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { DEMO_PASSWORD, DEMO_STAFF } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/env";
import { getStaffSession, homeFor, tenantBase } from "@/lib/staff-auth";
import { tenantHref } from "@/lib/tenant";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function LoginPage({ params, searchParams }: PageProps<"/c/[slug]/login">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { slug } = await params;
  const cafe = await getCafeByTenantKey(slug);
  if (!cafe) notFound();

  const staff = await getStaffSession(cafe.id);
  if (staff) redirect(tenantHref(await tenantBase(slug), homeFor(staff.role)));

  const next = (await searchParams).next;
  return (
    <main className="guest flex min-h-dvh flex-1 items-center justify-center px-4 py-10" style={{ "--brand": cafe.brand_color, "--brand-fg": foregroundFor(cafe.brand_color) } as React.CSSProperties}>
      <div className="anim-rise flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-[var(--brand)] font-heading text-2xl font-bold text-[var(--brand-fg)]">
            {cafe.name.slice(0, 1)}
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">{cafe.name}</h1>
            <p className="text-sm text-[var(--g-muted)]">Staff sign in</p>
          </div>
        </div>
        <LoginForm
          tenantKey={slug}
          next={typeof next === "string" ? next : ""}
          demo={cafe.is_demo ? { password: DEMO_PASSWORD, accounts: DEMO_STAFF.map(({ username, displayName }) => ({ username, displayName })) } : null}
        />
      </div>
    </main>
  );
}

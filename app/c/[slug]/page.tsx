import { ChefHat, ClipboardList, LayoutDashboard, QrCode } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LegalLinks } from "@/components/legal-page";
import { SetupNotice } from "@/components/setup-notice";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { isSupabaseConfigured } from "@/lib/env";
import { tenantBase } from "@/lib/staff-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantHref } from "@/lib/tenant";

// The cafe's public home page (its "website" for Razorpay's merchant check): who they are,
// how to reach them, and links to their policies. Guests order by scanning a table QR.
export default async function CafeHome({ params }: PageProps<"/c/[slug]">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { slug } = await params;
  const cafe = await getCafeByTenantKey(slug);
  if (!cafe) notFound();
  const base = await tenantBase(slug);

  // Demo cafe only: a launcher, so a prospect can try every role without printed QR codes.
  // Real cafes never expose table links here (guests reach a table only through its QR).
  const tables = cafe.is_demo
    ? ((
        await createAdminClient()
          .from("tables")
          .select("label, token")
          .eq("cafe_id", cafe.id)
          .eq("is_active", true)
          .is("archived_at", null)
          .order("sort")
          .limit(6)
      ).data ?? [])
    : [];
  const roles = [
    { href: tenantHref(base, "/login?next=/staff"), icon: ClipboardList, title: "Counter", text: "Live orders, payments, table requests. Sign in as Arjun." },
    { href: tenantHref(base, "/login?next=/kitchen"), icon: ChefHat, title: "Kitchen", text: "Tickets to cook, in order. Sign in as Kitchen." },
    { href: tenantHref(base, "/login?next=/admin"), icon: LayoutDashboard, title: "Owner panel", text: "Sales, menu, reviews, QR codes. Sign in as Riya." },
  ];

  return (
    <main className="guest flex min-h-dvh flex-1 flex-col" style={{ "--brand": cafe.brand_color } as React.CSSProperties}>
      <div className="anim-rise mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-3 px-5 py-12">
        <p className="text-sm font-medium tracking-wide text-[var(--brand)] uppercase">{cafe.is_demo ? "Demo cafe" : "Welcome"}</p>
        <h1 className="font-heading text-4xl font-bold tracking-tight">{cafe.name}</h1>
        {cafe.address && <p className="text-[var(--g-muted)]">{cafe.address}</p>}
        <p className="mt-2 text-lg">Scan the QR code on your table to see the menu, order and pay from your phone.</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {cafe.phone && (
            <>
              <dt className="text-[var(--g-muted)]">Phone</dt>
              <dd>{cafe.phone}</dd>
            </>
          )}
          {cafe.email && (
            <>
              <dt className="text-[var(--g-muted)]">Email</dt>
              <dd>{cafe.email}</dd>
            </>
          )}
          {cafe.gstin && (
            <>
              <dt className="text-[var(--g-muted)]">GSTIN</dt>
              <dd className="font-mono">{cafe.gstin}</dd>
            </>
          )}
        </dl>

        {cafe.is_demo && (
          <section aria-labelledby="try-title" className="mt-8 flex flex-col gap-5 border-t border-[var(--g-line)] pt-8">
            <div>
              <p className="label-caps text-[var(--g-accent)]">Try the demo</p>
              <h2 id="try-title" className="mt-1 font-heading text-2xl">
                Pick a table, or step behind the counter
              </h2>
              <p className="mt-1 text-sm text-[var(--g-muted)]">Open the counter in one window and a table in another to watch orders arrive live.</p>
            </div>
            {tables.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <QrCode className="size-4" /> Order as a guest (same as scanning the table&apos;s QR)
                </h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {tables.map((t) => (
                    <li key={t.token}>
                      <Link
                        href={`/t/${t.token}`}
                        className="flex h-12 items-center justify-center rounded border border-[var(--g-line)] bg-[var(--g-surface)] font-semibold transition-colors hover:border-[var(--g-ink)]"
                      >
                        {t.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="grid gap-2 sm:grid-cols-3">
              {roles.map(({ href, icon: Icon, title, text }) => (
                <li key={title}>
                  <Link
                    href={href}
                    className="flex h-full flex-col gap-1.5 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-4 transition-colors hover:border-[var(--g-ink)]"
                  >
                    <Icon className="size-5" />
                    <span className="font-heading text-lg">{title}</span>
                    <span className="text-[13px] leading-[18px] text-[var(--g-muted)]">{text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <LegalLinks hrefFor={(page) => tenantHref(base, `/legal/${page}`)} />
    </main>
  );
}

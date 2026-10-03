import { notFound } from "next/navigation";

import { LegalLinks } from "@/components/legal-page";
import { SetupNotice } from "@/components/setup-notice";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { isSupabaseConfigured } from "@/lib/env";
import { tenantBase } from "@/lib/staff-auth";
import { tenantHref } from "@/lib/tenant";

// The cafe's public home page (its "website" for Razorpay's merchant check): who they are,
// how to reach them, and links to their policies. Guests order by scanning a table QR.
export default async function CafeHome({ params }: PageProps<"/c/[slug]">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { slug } = await params;
  const cafe = await getCafeByTenantKey(slug);
  if (!cafe) notFound();
  const base = await tenantBase(slug);

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
      </div>
      <LegalLinks hrefFor={(page) => tenantHref(base, `/legal/${page}`)} />
    </main>
  );
}

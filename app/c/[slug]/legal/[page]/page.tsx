import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalPageView } from "@/components/legal-page";
import { SetupNotice } from "@/components/setup-notice";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { isSupabaseConfigured } from "@/lib/env";
import { isLegalPage, LEGAL_TITLES } from "@/lib/legal";
import { tenantBase } from "@/lib/staff-auth";
import { tenantHref } from "@/lib/tenant";

export async function generateMetadata({ params }: PageProps<"/c/[slug]/legal/[page]">): Promise<Metadata> {
  const { slug, page } = await params;
  if (!isLegalPage(page) || !isSupabaseConfigured()) return {};
  const cafe = await getCafeByTenantKey(slug);
  return cafe ? { title: `${LEGAL_TITLES[page]} · ${cafe.name}` } : {};
}

// The cafe's public policy pages, e.g. bluebean.<platform>/legal/refunds (what Razorpay checks).
export default async function CafeLegalPage({ params }: PageProps<"/c/[slug]/legal/[page]">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { slug, page } = await params;
  if (!isLegalPage(page)) notFound();
  const cafe = await getCafeByTenantKey(slug);
  if (!cafe) notFound();
  const base = await tenantBase(slug);

  return (
    <div className="guest flex min-h-dvh flex-1 flex-col" style={{ "--brand": cafe.brand_color } as React.CSSProperties}>
      <LegalPageView cafe={cafe} page={page} hrefFor={(p) => tenantHref(base, `/legal/${p}`)} />
    </div>
  );
}

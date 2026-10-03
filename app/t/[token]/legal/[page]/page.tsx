import { notFound } from "next/navigation";

import { LegalPageView } from "@/components/legal-page";
import { getCafeByTenantKey } from "@/lib/data/cafes";
import { getGuestMenu } from "@/lib/data/menu";
import { isLegalPage } from "@/lib/legal";

// The same policies, reachable from the guest's QR menu on any host.
export default async function GuestLegalPage({ params }: PageProps<"/t/[token]/legal/[page]">) {
  const { token, page } = await params;
  if (!isLegalPage(page)) notFound();
  const menu = await getGuestMenu(token);
  const cafe = menu && (await getCafeByTenantKey(menu.cafe.slug));
  if (!cafe) notFound();
  return <LegalPageView cafe={cafe} page={page} hrefFor={(p) => `/t/${token}/legal/${p}`} backHref={`/t/${token}`} />;
}

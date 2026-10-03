import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { GuestProvider } from "@/components/guest/guest-provider";
import { Notice } from "@/components/guest/notice";
import { SetupNotice } from "@/components/setup-notice";
import { foregroundFor } from "@/lib/color";
import { getGuestMenu } from "@/lib/data/menu";
import { isSupabaseConfigured } from "@/lib/env";

export async function generateMetadata({ params }: LayoutProps<"/t/[token]">): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const menu = await getGuestMenu((await params).token);
  return menu ? { title: `${menu.cafe.name} · Table ${menu.table.label}`, robots: { index: false } } : {};
}

export const viewport: Viewport = { themeColor: "#f8f7f4", width: "device-width", initialScale: 1 };

// Every guest page for one QR table: loads the menu once and shares it with the pages below.
export default async function GuestLayout({ children, params }: LayoutProps<"/t/[token]">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const menu = await getGuestMenu((await params).token);
  if (!menu) notFound();

  const style = {
    "--brand": menu.cafe.brandColor,
    "--brand-fg": foregroundFor(menu.cafe.brandColor),
  } as React.CSSProperties;

  return (
    <div className="guest flex min-h-dvh flex-1 flex-col" style={style}>
      <GuestProvider menu={menu}>
        {children}
        <Notice />
      </GuestProvider>
    </div>
  );
}

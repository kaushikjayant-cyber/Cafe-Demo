import { ChefHat, ClipboardList, LayoutDashboard, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { OrderStory, TicketDrop } from "@/components/home-motion";
import { RequestDemo } from "@/components/request-demo";
import { isSupabaseConfigured, platformName } from "@/lib/env";
import { qrModulesPath, siteOrigin, tableUrl } from "@/lib/qr";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: { absolute: `${platformName()} · QR ordering for cafes` } };
export const dynamic = "force-dynamic";

const DEMO_SLUG = "demo";

const TILTS = ["-1.6deg", "1.1deg", "-0.7deg", "1.5deg"];

/** The demo cafe's first table, for the live QR. Null if the demo isn't seeded. */
async function demoTable(): Promise<{ label: string; token: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createAdminClient();
  const { data: cafe } = await supabase.from("cafes").select("id").eq("slug", DEMO_SLUG).eq("is_demo", true).maybeSingle();
  if (!cafe) return null;
  const { data } = await supabase
    .from("tables")
    .select("label, token")
    .eq("cafe_id", cafe.id)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("sort")
    .limit(1)
    .maybeSingle();
  return data;
}

// Platform home: the demo launcher (§5.14). Built from a cafe's own objects: a table tent on
// a dark tabletop, order tickets on the kitchen rail, and a printed bill.
export default async function PlatformHome() {
  const table = await demoTable();
  const origin = await siteOrigin();
  const guestUrl = table ? tableUrl(origin, table.token) : null;
  const texture = qrModulesPath(guestUrl ?? platformName());
  const base = `/c/${DEMO_SLUG}`;

  const roles = [
    { href: guestUrl ? `/t/${table!.token}` : base, icon: Smartphone, title: "Guest", action: "Order as a guest", text: `Table ${table?.label ?? "T1"}: menu, cart, pay, track` },
    { href: `${base}/login?next=/staff`, icon: ClipboardList, title: "Counter", action: "Open the counter", text: "Live orders and payments" },
    { href: `${base}/login?next=/kitchen`, icon: ChefHat, title: "Kitchen", action: "Open the kitchen", text: "Tickets to cook" },
    { href: `${base}/login?next=/admin`, icon: LayoutDashboard, title: "Owner", action: "Open the owner panel", text: "Sales, menu, reviews, QR" },
  ];

  return (
    <main className="guest flex min-h-dvh flex-1 flex-col" style={{ "--brand": "#1c1917", "--brand-fg": "#fbf9f5" } as React.CSSProperties}>
      <OrderStory
        qr={texture}
        brand={platformName()}
        guestHref={roles[0].href}
        cafeHref={base}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-5 py-16 md:py-24">
        <section aria-labelledby="roles-title">
          <h2 id="roles-title" className="mb-8 font-heading text-3xl md:text-4xl">
            See every side of the cafe
          </h2>
          {/* The kitchen's ticket rail. */}
          <div className="h-2 rounded-full bg-gradient-to-b from-[#a8a29e] to-[#78716c]" aria-hidden />
          <TicketDrop className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
            {roles.map(({ href, icon: Icon, title, action, text }, i) => (
              <li key={title} className="w-56 shrink-0 lg:w-auto" style={{ "--n": i } as React.CSSProperties}>
                <Link href={href} className="home-link block rounded drop-shadow-[0_6px_8px_rgba(28,25,23,0.14)]">
                  <span className="ticket-hang block" style={{ "--tilt": TILTS[i] } as React.CSSProperties}>
                    <span className="torn-edge flex min-h-52 flex-col gap-2 bg-[var(--g-raised)] p-5 pb-8">
                      <Icon className="size-5 text-[var(--g-accent)]" />
                      <span className="mt-2 font-heading text-3xl">{title}</span>
                      <span className="text-sm text-[var(--g-muted)]">{text}</span>
                      <span className="mt-auto border-t border-dashed border-[var(--g-line)] pt-3 text-sm font-semibold">{action}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </TicketDrop>
        </section>

        <RequestDemo platform={platformName()} whatsapp={process.env.SALES_WHATSAPP?.replace(/\D/g, "") || null} />

        <footer className="mt-auto text-xs text-[var(--g-muted)]">The demo resets every morning. Orders you place here are not real and nothing is charged.</footer>
      </div>
    </main>
  );
}

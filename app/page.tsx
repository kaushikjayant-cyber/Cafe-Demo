import { ArrowRight, BellRing, ChefHat, ClipboardList, LayoutDashboard, QrCode, ReceiptText, Smartphone, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { isSupabaseConfigured, platformName } from "@/lib/env";
import { isTemporaryOrigin, qrSvg, siteOrigin, tableUrl } from "@/lib/qr";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: { absolute: `${platformName()} · QR ordering for cafes` } };
export const dynamic = "force-dynamic";

const DEMO_SLUG = "demo";

const FEATURES = [
  { icon: Smartphone, title: "Order from the table", text: "Guests scan, browse a live menu and order. No app, no waiting for a waiter." },
  { icon: ReceiptText, title: "UPI, cards & GST bills", text: "Pay online or at the counter. GST invoices are numbered and ready for your CA." },
  { icon: BellRing, title: "A counter that keeps up", text: "Orders chime in live, tables call for a waiter or the bill, the kitchen sees tickets." },
  { icon: Star, title: "Reviews before Google", text: "Low ratings reach your staff while the guest is still at the table." },
];

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

// Platform home: the demo launcher (§5.14). A short pitch, a QR a prospect can scan with
// their own phone, and one tap into each role of the demo cafe.
export default async function PlatformHome() {
  const table = await demoTable();
  const origin = await siteOrigin();
  const guestUrl = table ? tableUrl(origin, table.token) : null;
  const svg = guestUrl ? await qrSvg(guestUrl) : null;
  const base = `/c/${DEMO_SLUG}`;

  const roles = [
    { href: guestUrl ? `/t/${table!.token}` : base, icon: Smartphone, title: "Guest", text: `Table ${table?.label ?? "T1"}: menu, cart, pay, track` },
    { href: `${base}/login?next=/staff`, icon: ClipboardList, title: "Counter", text: "Live orders and payments" },
    { href: `${base}/login?next=/kitchen`, icon: ChefHat, title: "Kitchen", text: "Tickets to cook" },
    { href: `${base}/login?next=/admin`, icon: LayoutDashboard, title: "Owner", text: "Sales, menu, reviews, QR" },
  ];

  return (
    <main className="guest flex min-h-dvh flex-1 flex-col" style={{ "--brand": "#1c1917", "--brand-fg": "#fbf9f5" } as React.CSSProperties}>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-5 py-10 md:py-16">
        <header className="anim-fade-in flex items-center justify-between">
          <span className="font-heading text-xl">{platformName()}</span>
          <span className="label-caps rounded-full bg-[var(--g-soft)] px-3 py-1 text-[var(--g-muted)]">Live demo</span>
        </header>

        <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="anim-rise flex flex-col gap-5">
            <p className="label-caps text-[var(--g-accent)]">QR table ordering for Indian cafes</p>
            <h1 className="font-heading text-4xl leading-tight md:text-5xl">Scan. Order. Pay. Your counter keeps up.</h1>
            <p className="text-lg text-[var(--g-muted)]">
              Guests order and pay from their phone at the table. Your counter, kitchen and you see it all live, with GST bills and daily sales built in.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={roles[0].href}
                className="flex h-12 items-center gap-2 rounded bg-[var(--brand)] px-5 font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.99]"
              >
                Try it as a guest <ArrowRight className="size-4" />
              </Link>
              <Link href={base} className="flex h-12 items-center rounded border border-[var(--g-line)] px-5 font-semibold transition-colors hover:bg-[var(--g-soft)]">
                Visit the demo cafe
              </Link>
            </div>
          </div>

          <figure className="anim-rise flex flex-col items-center gap-3 rounded-md border border-[var(--g-line)] bg-[var(--g-raised)] p-6" style={{ "--i": 2 } as React.CSSProperties}>
            {svg ? (
              // Generated locally from our own URL by the qrcode library, not user input.
              <div className="size-52" aria-label={`QR code for table ${table?.label}`} role="img" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="grid size-52 place-items-center rounded bg-[var(--g-soft)] text-sm text-[var(--g-muted)]">
                <QrCode className="size-10" />
              </div>
            )}
            <figcaption className="text-center text-sm">
              <span className="font-heading text-lg">Scan with your phone</span>
              <span className="block text-[var(--g-muted)]">You&apos;re at table {table?.label ?? "T1"} of Brew &amp; Bloom</span>
              {guestUrl && isTemporaryOrigin(origin) && (
                <span className="mt-1 block text-xs text-[var(--g-muted)]">This QR points at {origin}: a phone can only open it if it can reach that address.</span>
              )}
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="roles-title" className="flex flex-col gap-4">
          <div>
            <h2 id="roles-title" className="font-heading text-2xl">
              See every side of the cafe
            </h2>
            <p className="text-sm text-[var(--g-muted)]">Open the counter in one window and a table in another, then place an order and watch it arrive. Staff logins are one tap.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map(({ href, icon: Icon, title, text }, i) => (
              <li key={title} className="anim-rise" style={{ "--i": i + 3 } as React.CSSProperties}>
                <Link
                  href={href}
                  className="group flex h-full flex-col gap-2 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-4 transition-colors hover:border-[var(--g-ink)]"
                >
                  <Icon className="size-5" />
                  <span className="flex items-center justify-between font-heading text-xl">
                    {title} <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="text-[13px] leading-[18px] text-[var(--g-muted)]">{text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="What it does" className="grid gap-6 border-t border-[var(--g-line)] pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex flex-col gap-2">
              <Icon className="size-5 text-[var(--g-accent)]" />
              <h3 className="font-heading text-lg">{title}</h3>
              <p className="text-sm text-[var(--g-muted)]">{text}</p>
            </div>
          ))}
        </section>

        <footer className="mt-auto text-xs text-[var(--g-muted)]">
          The demo resets every morning. Orders you place here are not real and nothing is charged.
        </footer>
      </div>
    </main>
  );
}

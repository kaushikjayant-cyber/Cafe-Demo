import type { Metadata } from "next";

import { PrintButton } from "@/components/print-button";
import { isTemporaryOrigin, qrSvg, siteOrigin, tableUrl } from "@/lib/qr";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Print QR cards" };

// Table cards to print, cut and stand on each table: four A6 cards per A4 sheet.
export default async function PrintTablesPage({ params }: PageProps<"/c/[slug]/admin/tables/print">) {
  const { slug } = await params;
  const { cafe } = await requireStaff(slug, ["owner", "manager"], "/admin/tables");
  const origin = await siteOrigin();
  const { data, error } = await (await createUserClient())
    .from("tables")
    .select("id, label, token")
    .eq("cafe_id", cafe.id)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("sort");
  if (error) throw error;
  const cards = await Promise.all(data.map(async (t) => ({ ...t, svg: await qrSvg(tableUrl(origin, t.token)) })));

  return (
    <>
      <style>{`@page { size: A4; margin: 8mm; }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-heading text-2xl font-bold">QR cards for {cards.length} tables</h1>
          <p className="text-sm text-[var(--g-muted)]">
            Prints four cards per A4 sheet. Laminate them so they survive spills.
            {isTemporaryOrigin(origin) && <strong className="text-amber-800"> These point to a temporary address: for testing only.</strong>}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-[6mm]">
        {cards.map((card) => (
          <article
            key={card.id}
            className="flex aspect-[105/148] flex-col items-center justify-between rounded-2xl bg-white p-[6%] text-center text-[#1c1b18] ring-1 ring-[#d9d5cd] break-inside-avoid print:rounded-none print:ring-[#bbb]"
            style={{ borderTop: `10px solid ${cafe.brand_color}` }}
          >
            <div>
              <p className="font-heading text-2xl font-bold">{cafe.name}</p>
              <p className="mt-1 text-sm text-[#5c5a54]">Scan to see the menu, order and pay</p>
            </div>
            {/* SVG generated on our server by the qrcode library from our own URL. */}
            <div className="w-[68%] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: card.svg }} />
            <div>
              <p className="text-xs tracking-[0.2em] text-[#5c5a54] uppercase">Table</p>
              <p className="font-heading text-5xl leading-none font-bold">{card.label}</p>
              <p className="mt-3 text-xs text-[#5c5a54]">UPI · Cards · or pay at the counter</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

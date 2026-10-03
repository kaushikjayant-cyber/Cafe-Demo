import { AlertTriangle, Printer } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/admin-shell";
import { TablesManager } from "@/components/admin/tables-manager";
import { isTemporaryOrigin, qrSvg, siteOrigin, tableUrl } from "@/lib/qr";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";
import { tenantHref } from "@/lib/tenant";

export const metadata: Metadata = { title: "Tables & QR" };

export default async function TablesPage({ params }: PageProps<"/c/[slug]/admin/tables">) {
  const { slug } = await params;
  const { cafe, base } = await requireStaff(slug, ["owner", "manager"], "/admin/tables");
  const origin = await siteOrigin();

  const { data, error } = await (await createUserClient())
    .from("tables")
    .select("id, label, token, is_active")
    .eq("cafe_id", cafe.id)
    .is("archived_at", null)
    .order("sort");
  if (error) throw error;

  const tables = await Promise.all(data.map(async (t) => ({ id: t.id, label: t.label, active: t.is_active, url: tableUrl(origin, t.token), qr: await qrSvg(tableUrl(origin, t.token)) })));

  return (
    <>
      <PageHeader
        title="Tables & QR codes"
        description="Each table has its own QR code. Guests scan it to see the menu and order to that table."
        actions={
          <a
            href={tenantHref(base, "/admin/tables/print")}
            target="_blank"
            rel="noopener"
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-fg)]"
          >
            <Printer className="size-4" /> Print QR cards
          </a>
        }
      />
      {isTemporaryOrigin(origin) && (
        <p className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <span>
            These codes point to <strong>{new URL(origin).host}</strong>, a temporary address. They&apos;re fine for testing, but print the cards for your tables only
            once your own web address is live, or they&apos;ll stop working when you move.
          </span>
        </p>
      )}
      <TablesManager tenantKey={slug} tables={tables} />
    </>
  );
}

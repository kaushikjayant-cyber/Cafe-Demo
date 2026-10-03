import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/admin-shell";
import { SettingsForms, type CafeSettings } from "@/components/admin/settings-forms";
import { maskKey } from "@/lib/crypto";
import { publicImageUrl } from "@/lib/data/menu";
import { gatewayKind } from "@/lib/payments/gateway";
import { siteOrigin } from "@/lib/qr";
import { requireStaff } from "@/lib/staff-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/c/[slug]/admin/settings">) {
  const { slug } = await params;
  const { cafe } = await requireStaff(slug, ["owner"], "/admin/settings");

  // The owner can read their whole cafe row through RLS.
  const { data: row, error } = await (await createUserClient())
    .from("cafes")
    .select("name, brand_color, logo_path, legal_name, address, phone, email, gstin, fssai_no, invoice_prefix, gst_mode, tax_rate_bp, prices_include_tax, opening_hours, day_starts_at, accept_mode, allow_pay_at_counter, google_review_url, is_demo")
    .eq("id", cafe.id)
    .single();
  if (error) throw error;

  // Secrets never leave the server: only whether they're set, and a masked key id.
  const { data: secrets } = await createAdminClient()
    .from("cafe_secrets")
    .select("razorpay_key_id, razorpay_key_secret_enc, razorpay_webhook_secret_enc")
    .eq("cafe_id", cafe.id)
    .maybeSingle();
  const kind = gatewayKind({ is_demo: row.is_demo, cafe_secrets: secrets ?? null });

  const settings: CafeSettings = {
    ...row,
    logo_url: publicImageUrl(row.logo_path),
    day_starts_at: String(row.day_starts_at).slice(0, 5),
    payments: {
      keyId: secrets?.razorpay_key_id ? maskKey(secrets.razorpay_key_id) : null,
      hasSecret: !!secrets?.razorpay_key_secret_enc,
      hasWebhookSecret: !!secrets?.razorpay_webhook_secret_enc,
      gateway: kind,
      webhookUrl: `${await siteOrigin()}/api/webhooks/razorpay/${cafe.id}`,
    },
  };

  return (
    <>
      <PageHeader title="Settings" description="Changes apply to new orders straight away. Past bills keep the details they were issued with." />
      <SettingsForms tenantKey={slug} settings={settings} />
    </>
  );
}

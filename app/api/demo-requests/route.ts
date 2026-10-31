import { NextResponse } from "next/server";
import { z } from "zod";

import { escapeHtml, sendEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env.server";
import { platformName } from "@/lib/env";
import { isSameOrigin } from "@/lib/guest-auth";
import { LIMITS, rateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  name: text(80).min(1, "Please add your name."),
  cafe: text(80).min(1, "Please add your cafe's name."),
  city: text(80).min(1, "Please add your city."),
  phone: text(30).regex(/^[+\d\s()-]*$/, "That phone number doesn't look right.").default(""),
  email: z.union([z.literal(""), z.email("That email address doesn't look right.").max(120)]).default(""),
  tables: text(10).default(""),
  note: text(500).default(""),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().max(200).default(""),
});

// POST /api/demo-requests: "Request a demo" from the home page. Saved first, then emailed,
// so a lead is never lost to an email outage.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "BAD_ORIGIN" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  }
  const lead = parsed.data;
  if (lead.website) return NextResponse.json({ ok: true }); // bot: pretend it worked
  if (!lead.phone && !lead.email) {
    return NextResponse.json({ code: "INVALID_REQUEST", message: "Please add a phone number or email so we can reach you." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimiter.allow(`demo-request:${ip}`, LIMITS.demoRequestsPerIp)) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "We've got your request already. We'll be in touch soon!" }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data: saved, error } = await admin
    .from("demo_requests")
    .insert({
      name: lead.name,
      cafe_name: lead.cafe,
      city: lead.city,
      phone: lead.phone || null,
      email: lead.email || null,
      tables: lead.tables || null,
      note: lead.note || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { SALES_EMAIL, RESEND_API_KEY } = serverEnv();
  if (SALES_EMAIL && RESEND_API_KEY) {
    const rows: [string, string][] = [
      ["Name", lead.name],
      ["Cafe", lead.cafe],
      ["City", lead.city],
      ["Phone", lead.phone],
      ["Email", lead.email],
      ["Tables", lead.tables],
      ["Note", lead.note],
    ].filter((row): row is [string, string] => !!row[1]);
    const whatsapp = lead.phone.replace(/\D/g, "");
    try {
      await sendEmail({
        to: SALES_EMAIL,
        replyTo: lead.email || undefined,
        subject: `Demo request: ${lead.cafe}, ${lead.city}`,
        text: `New demo request on ${platformName()}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}`,
        html:
          `<p>New demo request on <b>${escapeHtml(platformName())}</b></p><table cellpadding="4">` +
          rows.map(([k, v]) => `<tr><td style="color:#78716c">${k}</td><td>${escapeHtml(v)}</td></tr>`).join("") +
          `</table>` +
          (whatsapp.length >= 10 ? `<p><a href="https://wa.me/${whatsapp.length === 10 ? `91${whatsapp}` : whatsapp}">Reply on WhatsApp</a></p>` : ""),
      });
      await admin.from("demo_requests").update({ emailed_at: new Date().toISOString() }).eq("id", saved.id);
    } catch (sendError) {
      // Saved anyway; the owner can see it in the database. Don't fail the visitor.
      console.error("demo request email failed", sendError);
      await admin.from("demo_requests").update({ email_error: String(sendError).slice(0, 300) }).eq("id", saved.id);
    }
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

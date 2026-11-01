"use client";

import { CheckCircle2, LoaderCircle, MessageCircle, Send } from "lucide-react";
import { useState } from "react";

interface Props {
  platform: string;
  /** Digits with country code, e.g. 919812345678. Null hides the WhatsApp option. */
  whatsapp: string | null;
}

const field = "h-11 w-full rounded border border-[var(--g-line)] bg-[var(--g-raised)] px-3 text-sm";

/**
 * "Request a demo": sent from the site (saved, and emailed to sales through Resend), or
 * written into a WhatsApp message that opens in the visitor's own app.
 */
export function RequestDemo({ platform, whatsapp }: Props) {
  const [form, setForm] = useState({ name: "", cafe: "", city: "", phone: "", email: "", tables: "", note: "", website: "" });
  const [tried, setTried] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const missingRequired = !form.name.trim() || !form.cafe.trim() || !form.city.trim();
  const noContact = !form.phone.trim() && !form.email.trim();

  // WhatsApp opens even with an empty form: whatever is filled in goes into the message.
  const details = [
    form.name.trim() ? `Name: ${form.name.trim()}` : null,
    form.cafe.trim() ? `Cafe: ${form.cafe.trim()}` : null,
    form.city.trim() ? `City: ${form.city.trim()}` : null,
    form.tables.trim() ? `Tables: ${form.tables.trim()}` : null,
    form.note.trim() ? `Note: ${form.note.trim()}` : null,
  ].filter(Boolean);
  const whatsappHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent([`Hi! I'd like a demo of ${platform} for my cafe.`, ...(details.length ? ["", ...details] : [])].join("\n"))}`
    : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (missingRequired || noContact) return;
    setState("sending");
    try {
      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok || body.code === "RATE_LIMITED") return setState("sent");
      setError(body.message ?? "That didn't send. Please try again, or message us on WhatsApp.");
    } catch {
      setError("No connection. Please try again, or message us on WhatsApp.");
    }
    setState("idle");
  }

  return (
    <section
      id="request-demo"
      aria-labelledby="request-title"
      className="grid scroll-mt-6 gap-8 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:p-8"
    >
      <div className="flex flex-col gap-3">
        <p className="text-[var(--g-accent)]">Like what you see?</p>
        <h2 id="request-title" className="font-heading text-3xl leading-tight">
          Request a demo for your cafe
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          <li>✓ Your menu, prices and GST on a live demo</li>
          <li>✓ QR cards for your tables</li>
          <li>✓ No app for guests to install</li>
        </ul>
      </div>

      {state === "sent" ? (
        <div role="status" className="anim-rise flex flex-col items-start justify-center gap-3">
          <CheckCircle2 className="anim-pop size-10 text-[var(--g-sage)]" />
          <h3 className="font-heading text-2xl">Thank you, {form.name.trim().split(" ")[0]}!</h3>
          <p className="text-[var(--g-muted)]">
            We&apos;ve got your request for {form.cafe.trim()} and will reach you on {form.phone.trim() || form.email.trim()}, usually the same day.
          </p>
        </div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name" value={form.name} onChange={set("name")} invalid={tried && !form.name.trim()} autoComplete="name" />
            <Field label="Cafe name" value={form.cafe} onChange={set("cafe")} invalid={tried && !form.cafe.trim()} autoComplete="organization" />
            <Field label="City" value={form.city} onChange={set("city")} invalid={tried && !form.city.trim()} autoComplete="address-level2" />
            <Field label="Number of tables (optional)" value={form.tables} onChange={set("tables")} inputMode="numeric" />
            <Field label="Phone / WhatsApp" value={form.phone} onChange={set("phone")} invalid={tried && noContact} type="tel" autoComplete="tel" />
            <Field label="Email" value={form.email} onChange={set("email")} invalid={tried && noContact} type="email" autoComplete="email" />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Anything else? (optional)</span>
            <textarea
              value={form.note}
              onChange={(e) => set("note")(e.target.value.slice(0, 500))}
              rows={2}
              className="rounded border border-[var(--g-line)] bg-[var(--g-raised)] px-3 py-2 text-sm"
            />
          </label>
          {/* Honeypot for bots; hidden from people and screen readers. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => set("website")(e.target.value)} className="hidden" />

          {tried && (missingRequired || noContact) && (
            <p role="alert" className="text-sm text-[var(--g-danger)]">
              {missingRequired ? "Please add your name, cafe and city." : "Please add a phone number or email so we can reach you."}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--g-danger)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={state === "sending"}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded bg-[var(--brand)] px-5 font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {state === "sending" ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
              {state === "sending" ? "Sending…" : "Send request"}
            </button>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded border border-[#1f7a4d] px-5 font-semibold text-[#1f7a4d] transition-colors hover:bg-[#1f7a4d] hover:text-white"
              >
                <MessageCircle className="size-5" /> Or chat on WhatsApp
              </a>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  invalid,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        {...rest}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.slice(0, 120))}
        className={`${field} ${invalid ? "border-[var(--g-danger)]" : ""}`}
      />
    </label>
  );
}

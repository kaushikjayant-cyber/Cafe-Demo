"use client";

import { Check, Copy, ImagePlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { removePaymentKeys, saveBranding, saveBusiness, saveOrdering, savePaymentKeys, uploadLogo } from "@/app/c/[slug]/admin/settings/actions";
import { contrastRatio, foregroundFor } from "@/lib/color";
import { WEEKDAYS, type OpeningHours, type Weekday } from "@/lib/hours";

export interface CafeSettings {
  name: string;
  brand_color: string;
  logo_url: string | null;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  fssai_no: string | null;
  invoice_prefix: string;
  gst_mode: "regular" | "none";
  tax_rate_bp: number;
  prices_include_tax: boolean;
  opening_hours: OpeningHours | null;
  day_starts_at: string;
  accept_mode: "auto_paid" | "manual_all";
  allow_pay_at_counter: boolean;
  google_review_url: string | null;
  payments: { keyId: string | null; hasSecret: boolean; hasWebhookSecret: boolean; gateway: "razorpay" | "simulated" | null; webhookUrl: string };
}

const field = "h-10 w-full rounded-lg bg-[var(--g-bg)] px-3 text-sm ring-1 ring-[var(--g-line)] outline-none focus:ring-2 focus:ring-[var(--brand)]";
const DAY_NAMES: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const WEEK: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type Saver = () => Promise<{ ok: boolean; error?: string }>;

/** One settings card with its own save button and result line. */
function Section({ title, description, children, onSave }: { title: string; description: string; children: ReactNode; onSave: Saver }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; result: { ok: boolean; text: string } | null }>({ busy: false, result: null });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true, result: null });
    const r = await onSave();
    setState({ busy: false, result: r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "That didn't save." } });
    if (r.ok) router.refresh();
  }
  return (
    <form onSubmit={submit} className="anim-rise flex flex-col gap-4 rounded-2xl bg-[var(--g-surface)] p-5 ring-1 ring-[var(--g-line)]">
      <div>
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        <p className="text-sm text-[var(--g-muted)]">{description}</p>
      </div>
      {children}
      <div className="flex items-center justify-end gap-3 border-t border-[var(--g-line)] pt-4">
        {state.result && (
          <p role="status" className={`mr-auto text-sm ${state.result.ok ? "text-emerald-700" : "text-red-700"}`}>
            {state.result.ok && <Check className="mr-1 inline size-4" />}
            {state.result.text}
          </p>
        )}
        <button type="submit" disabled={state.busy} className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-60">
          {state.busy && <LoaderCircle className="size-4 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span>
        {label} {hint && <span className="font-normal text-[var(--g-muted)]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function SettingsForms({ tenantKey, settings }: { tenantKey: string; settings: CafeSettings }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <BrandingForm tenantKey={tenantKey} settings={settings} />
      <BusinessForm tenantKey={tenantKey} settings={settings} />
      <OrderingForm tenantKey={tenantKey} settings={settings} />
      <PaymentsForm tenantKey={tenantKey} settings={settings} />
    </div>
  );
}

function BrandingForm({ tenantKey, settings }: { tenantKey: string; settings: CafeSettings }) {
  const router = useRouter();
  const [name, setName] = useState(settings.name);
  const [color, setColor] = useState(settings.brand_color);
  const [logo, setLogo] = useState(settings.logo_url);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fg = foregroundFor(color);
  const ratio = contrastRatio(color, fg);

  return (
    <Section title="Brand" description="How your cafe looks on guests' phones, bills and QR cards." onSave={() => saveBranding(tenantKey, { name, brand_color: color })}>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--g-soft)] ring-1 ring-[var(--g-line)]" aria-label="Change logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
          {logo ? <img src={logo} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-[var(--g-muted)]" />}
          {logoBusy && (
            <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
              <LoaderCircle className="size-5 animate-spin" />
            </span>
          )}
        </button>
        <div className="text-sm text-[var(--g-muted)]">
          <p className="font-medium text-[var(--g-ink)]">Logo</p>
          <p>Square works best. Saved as soon as you choose it.</p>
          {logoError && <p className="text-red-700">{logoError}</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setLogoBusy(true);
            setLogoError(null);
            const form = new FormData();
            form.set("logo", file);
            const r = await uploadLogo(tenantKey, form);
            setLogoBusy(false);
            if (r.ok) {
              setLogo(r.data ?? null);
              router.refresh();
            } else setLogoError(r.error);
          }}
        />
      </div>
      <Field label="Cafe name">
        <input id="set-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </Field>
      <Field label="Brand colour" hint="(buttons, highlights, QR cards)">
        <div className="flex items-center gap-3">
          <input id="set-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg bg-transparent" />
          <span className="flex h-10 items-center rounded-lg px-4 text-sm font-semibold" style={{ background: color, color: fg }}>
            Place order · ₹380
          </span>
          <span className="text-xs text-[var(--g-muted)]">{ratio >= 4.5 ? "Easy to read" : ratio >= 3 ? "Readable for large text" : "Hard to read: pick a darker or lighter shade"}</span>
        </div>
      </Field>
    </Section>
  );
}

function BusinessForm({ tenantKey, settings }: { tenantKey: string; settings: CafeSettings }) {
  const [v, setV] = useState({
    legal_name: settings.legal_name ?? "",
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    gstin: settings.gstin ?? "",
    fssai_no: settings.fssai_no ?? "",
    invoice_prefix: settings.invoice_prefix,
    gst_mode: settings.gst_mode,
    tax_rate: String(settings.tax_rate_bp / 100),
    prices_include_tax: settings.prices_include_tax,
  });
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [key]: e.target.value });

  return (
    <Section
      title="Business & GST"
      description="Printed on every bill. GST changes apply to new orders only."
      onSave={() =>
        saveBusiness(tenantKey, {
          ...v,
          tax_rate_bp: Math.round(Number(v.tax_rate) * 100),
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registered business name">
          <input id="set-legal" value={v.legal_name} onChange={set("legal_name")} className={field} />
        </Field>
        <Field label="Phone">
          <input id="set-phone" value={v.phone} onChange={set("phone")} inputMode="tel" className={field} />
        </Field>
      </div>
      <Field label="Address">
        <textarea id="set-address" value={v.address} onChange={set("address")} rows={2} className={`${field} h-auto py-2`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input id="set-email" value={v.email} onChange={set("email")} type="email" className={field} />
        </Field>
        <Field label="FSSAI licence no.">
          <input id="set-fssai" value={v.fssai_no} onChange={set("fssai_no")} inputMode="numeric" className={field} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-xl bg-[var(--g-bg)] p-4">
        <legend className="sr-only">GST</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["regular", "GST registered"],
              ["none", "Not registered / composition"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${v.gst_mode === value ? "bg-[var(--g-surface)] ring-2 ring-[var(--brand)]" : "ring-[var(--g-line)]"}`}>
              <input type="radio" name="gst_mode" checked={v.gst_mode === value} onChange={() => setV({ ...v, gst_mode: value })} className="accent-[var(--brand)]" />
              {label}
            </label>
          ))}
        </div>
        {v.gst_mode === "regular" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="GSTIN">
              <input id="set-gstin" value={v.gstin} onChange={(e) => setV({ ...v, gstin: e.target.value.toUpperCase() })} maxLength={15} className={`${field} font-mono`} />
            </Field>
            <Field label="GST rate (%)" hint="(restaurants: 5)">
              <input id="set-rate" value={v.tax_rate} onChange={set("tax_rate")} inputMode="decimal" className={field} />
            </Field>
            <Field label="Menu prices">
              <select id="set-incl" value={v.prices_include_tax ? "incl" : "excl"} onChange={(e) => setV({ ...v, prices_include_tax: e.target.value === "incl" })} className={field}>
                <option value="incl">Include GST</option>
                <option value="excl">GST added on the bill</option>
              </select>
            </Field>
          </div>
        ) : (
          <p className="text-sm text-[var(--g-muted)]">Bills are issued as a “Bill of Supply” with no tax lines, as the law requires.</p>
        )}
      </fieldset>
      <Field label="Invoice number prefix" hint="(1–4 letters; numbering restarts every 1 April)">
        <input id="set-prefix" value={v.invoice_prefix} onChange={(e) => setV({ ...v, invoice_prefix: e.target.value.toUpperCase() })} maxLength={4} className={`${field} w-28 font-mono`} />
      </Field>
    </Section>
  );
}

function OrderingForm({ tenantKey, settings }: { tenantKey: string; settings: CafeSettings }) {
  const [alwaysOpen, setAlwaysOpen] = useState(!settings.opening_hours);
  const [hours, setHours] = useState<Record<Weekday, { open: boolean; from: string; to: string }>>(() =>
    Object.fromEntries(
      WEEKDAYS.map((d) => {
        const range = settings.opening_hours?.[d]?.[0];
        return [d, { open: settings.opening_hours ? !!range : true, from: range?.[0] ?? "08:00", to: range?.[1] ?? "23:00" }];
      }),
    ) as Record<Weekday, { open: boolean; from: string; to: string }>,
  );
  const [dayStart, setDayStart] = useState(settings.day_starts_at);
  const [acceptMode, setAcceptMode] = useState(settings.accept_mode);
  const [counter, setCounter] = useState(settings.allow_pay_at_counter);
  const [review, setReview] = useState(settings.google_review_url ?? "");

  return (
    <Section
      title="Ordering"
      description="When guests can order, and how orders reach the kitchen."
      onSave={() =>
        saveOrdering(tenantKey, {
          opening_hours: alwaysOpen
            ? null
            : (Object.fromEntries(WEEKDAYS.filter((d) => hours[d].open).map((d) => [d, [[hours[d].from, hours[d].to]]])) as Partial<Record<Weekday, [string, string][]>>),
          day_starts_at: dayStart,
          accept_mode: acceptMode,
          allow_pay_at_counter: counter,
          google_review_url: review,
        })
      }
    >
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={alwaysOpen} onChange={(e) => setAlwaysOpen(e.target.checked)} className="size-5 accent-[var(--brand)]" />
        Take orders at any time (no fixed hours)
      </label>
      {!alwaysOpen && (
        <div className="anim-rise flex flex-col gap-2 rounded-xl bg-[var(--g-bg)] p-3">
          {WEEK.map((d) => (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-32 items-center gap-2">
                <input type="checkbox" checked={hours[d].open} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], open: e.target.checked } })} className="size-4 accent-[var(--brand)]" />
                {DAY_NAMES[d]}
              </label>
              {hours[d].open ? (
                <>
                  <input type="time" aria-label={`${DAY_NAMES[d]} opens`} value={hours[d].from} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], from: e.target.value } })} className="h-9 rounded-md bg-[var(--g-surface)] px-2 ring-1 ring-[var(--g-line)]" />
                  to
                  <input type="time" aria-label={`${DAY_NAMES[d]} closes`} value={hours[d].to} onChange={(e) => setHours({ ...hours, [d]: { ...hours[d], to: e.target.value } })} className="h-9 rounded-md bg-[var(--g-surface)] px-2 ring-1 ring-[var(--g-line)]" />
                  {hours[d].to < hours[d].from && <span className="text-xs text-[var(--g-muted)]">(past midnight)</span>}
                </>
              ) : (
                <span className="text-[var(--g-muted)]">Closed</span>
              )}
            </div>
          ))}
        </div>
      )}
      <Field label="New day starts at" hint="(late-night orders before this count towards the previous day)">
        <input id="set-daystart" type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className={`${field} w-32`} />
      </Field>
      <Field label="When an order arrives">
        <select id="set-accept" value={acceptMode} onChange={(e) => setAcceptMode(e.target.value as CafeSettings["accept_mode"])} className={field}>
          <option value="auto_paid">Paid orders go straight to the kitchen; unpaid ones wait for the counter</option>
          <option value="manual_all">The counter accepts every order first</option>
        </select>
      </Field>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={counter} onChange={(e) => setCounter(e.target.checked)} className="size-5 accent-[var(--brand)]" />
        Guests can choose to pay at the counter
      </label>
      <Field label="Google review link" hint="(shown to guests after they rate their visit)">
        <input id="set-review" value={review} onChange={(e) => setReview(e.target.value)} placeholder="https://g.page/r/…/review" className={field} />
      </Field>
    </Section>
  );
}

function PaymentsForm({ tenantKey, settings }: { tenantKey: string; settings: CafeSettings }) {
  const router = useRouter();
  const p = settings.payments;
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [webhook, setWebhook] = useState("");
  const [copied, setCopied] = useState(false);

  const status =
    p.gateway === "razorpay" && p.keyId
      ? `Connected to Razorpay (${p.keyId})${p.hasWebhookSecret ? "" : ". Add the webhook secret so payments complete even if a guest closes their phone."}`
      : p.gateway === "razorpay"
        ? "Using the platform's Razorpay test account (demo cafe)."
        : p.gateway === "simulated"
          ? "Demo mode: online payments are simulated. Add your Razorpay keys to take real payments."
          : "Online payment is off. Guests can only pay at the counter until you add your Razorpay keys.";

  return (
    <Section
      title="Online payments (Razorpay)"
      description="Money goes straight to your own Razorpay account and bank. Keys are stored encrypted and never shown again."
      onSave={async () => {
        const r = await savePaymentKeys(tenantKey, { key_id: keyId || "", key_secret: secret, webhook_secret: webhook });
        if (r.ok) {
          setSecret("");
          setWebhook("");
        }
        return r;
      }}
    >
      <p className={`rounded-xl px-3 py-2 text-sm ${p.keyId ? "bg-emerald-50 text-emerald-900" : "bg-[var(--g-bg)] text-[var(--g-muted)]"}`}>{status}</p>
      <Field label="Key ID" hint={p.keyId ? `(saved: ${p.keyId}; enter it again to change keys)` : "(Razorpay → Account & Settings → API Keys)"}>
        <input id="set-keyid" value={keyId} onChange={(e) => setKeyId(e.target.value.trim())} placeholder="rzp_live_…" autoComplete="off" className={`${field} font-mono`} />
      </Field>
      <Field label="Key Secret" hint={p.hasSecret ? "(saved; leave blank to keep it)" : ""}>
        <input id="set-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" className={`${field} font-mono`} />
      </Field>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Webhook URL</span>
        <span className="text-[var(--g-muted)]">In Razorpay → Webhooks, add this URL with the events payment.captured and payment.failed.</span>
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--g-bg)] px-3 py-2.5 text-xs ring-1 ring-[var(--g-line)]">{p.webhookUrl}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(p.webhookUrl).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 ring-[var(--g-line)]"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <Field label="Webhook secret" hint={p.hasWebhookSecret ? "(saved; leave blank to keep it)" : "(the secret you typed when creating the webhook)"}>
        <input id="set-webhook" type="password" value={webhook} onChange={(e) => setWebhook(e.target.value)} autoComplete="new-password" className={`${field} font-mono`} />
      </Field>
      {p.keyId && (
        <button
          type="button"
          onClick={async () => {
            if ((await removePaymentKeys(tenantKey)).ok) router.refresh();
          }}
          className="self-start text-sm font-medium text-red-700"
        >
          Disconnect Razorpay
        </button>
      )}
    </Section>
  );
}

"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatINR } from "@/lib/money";
import type { OrderStatus } from "@/lib/order-state";
import { getBrowserClient } from "@/lib/supabase/browser";

import { useGuest } from "./guest-provider";

interface TrackedOrder {
  id: string;
  daily_no: number;
  status: OrderStatus;
  payment_status: string;
  guest_name: string | null;
  note: string | null;
  cancel_reason: string | null;
  subtotal_paise: number;
  tax_paise: number;
  round_off_paise: number;
  total_paise: number;
  gst_mode: "none" | "regular";
  prices_include_tax: boolean;
  tax_rate_bp: number;
  created_at: string;
  order_items: {
    id: string;
    name_snapshot: string;
    qty: number;
    line_total_paise: number;
    options_snapshot: { name: string }[];
    note: string | null;
    status: string;
  }[];
}

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Order sent" },
  { status: "accepted", label: "Confirmed" },
  { status: "preparing", label: "Being prepared" },
  { status: "ready", label: "Ready" },
  { status: "served", label: "Served" },
];
const STEP_INDEX: Partial<Record<OrderStatus, number>> = { placed: 0, accepted: 1, preparing: 2, ready: 3, served: 4, completed: 4 };

const HEADLINE: Record<OrderStatus, string> = {
  pending_payment: "Waiting for payment",
  placed: "Waiting for the cafe to confirm",
  accepted: "Confirmed! The kitchen will start soon",
  preparing: "Your order is being prepared",
  ready: "Ready! Coming to your table",
  served: "Served. Enjoy!",
  completed: "Thank you for visiting",
  cancelled: "This order was cancelled",
  rejected: "The cafe couldn't take this order",
  expired: "Payment wasn't completed, so this order wasn't sent",
};

const SELECT =
  "id, daily_no, status, payment_status, guest_name, note, cancel_reason, subtotal_paise, tax_paise, round_off_paise, " +
  "total_paise, gst_mode, prices_include_tax, tax_rate_bp, created_at, " +
  "order_items(id, name_snapshot, qty, line_total_paise, options_snapshot, note, status)";

async function fetchOrder(orderId: string): Promise<TrackedOrder | null> {
  const { data } = await getBrowserClient().from("orders").select(SELECT).eq("id", orderId).maybeSingle<TrackedOrder>();
  return data;
}

export function OrderTracker({ orderId }: { orderId: string }) {
  const { cafe, table, basePath, refreshRecentOrders } = useGuest();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [justPlaced, setJustPlaced] = useState(false);

  const firstLoad = useRef(true);

  const apply = useCallback((data: TrackedOrder | null) => {
    if (firstLoad.current && data) {
      firstLoad.current = false;
      setJustPlaced(Date.now() - new Date(data.created_at).getTime() < 20_000);
    }
    setOrder(data);
    setState(data ? "ready" : "missing");
  }, []);
  const load = useCallback(async () => apply(await fetchOrder(orderId)), [apply, orderId]);

  useEffect(() => {
    let active = true;
    void fetchOrder(orderId).then((data) => active && apply(data));
    const supabase = getBrowserClient();
    let subscribedBefore = false;
    const channel = supabase
      .channel(`order:${orderId}`)
      .on<Partial<TrackedOrder>>("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, ({ new: row }) =>
        setOrder((current) => (current ? { ...current, ...row, order_items: current.order_items } : current)),
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (subscribedBefore) void load(); // reconnected: catch up on anything missed [D-26]
        subscribedBefore = true;
      });
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [orderId, load, apply]);

  async function cancel() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      if (!response.ok) setCancelError((await response.json()).message ?? "We couldn't cancel this order. Please ask a member of staff.");
      await load();
      void refreshRecentOrders();
    } catch {
      setCancelError("We couldn't reach the cafe. Check your connection and try again.");
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  if (state === "loading") return <main className="flex-1" aria-busy="true" />;
  if (!order) {
    return (
      <main className="anim-rise mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-heading text-2xl font-bold">We can&apos;t show this order here</h1>
        <p className="text-[var(--g-muted)]">Orders can only be tracked on the phone that placed them. Staff can always help.</p>
        <Link href={basePath} className="rounded-xl bg-[var(--brand)] px-5 py-3 font-semibold text-[var(--brand-fg)]">
          Back to the menu
        </Link>
      </main>
    );
  }

  const stepIndex = STEP_INDEX[order.status];
  const stopped = stepIndex === undefined;
  const activeItems = order.order_items.filter((i) => i.status === "active");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 pt-4 pb-12">
      <header className="flex items-center gap-3">
        <Link href={basePath} aria-label="Back to menu" className="grid size-10 place-items-center rounded-full transition-colors hover:bg-[var(--g-soft)] active:scale-90">
          <ArrowLeft className="size-5" />
        </Link>
        <p className="text-sm text-[var(--g-muted)]">
          {cafe.name} · Table {table.label}
        </p>
      </header>

      <section aria-live="polite" className="anim-rise rounded-2xl bg-[var(--g-surface)] p-5 ring-1 ring-[var(--g-line)]">
        {justPlaced && order.status === "placed" && <SentTick />}
        <p className="text-sm font-medium text-[var(--g-muted)]">Order #{order.daily_no}</p>
        <h1 key={order.status} className="anim-rise mt-1 font-heading text-2xl font-bold leading-tight">
          {HEADLINE[order.status]}
        </h1>
        {order.cancel_reason && (order.status === "cancelled" || order.status === "rejected") && (
          <p className="mt-1 text-sm text-[var(--g-muted)]">Reason: {order.cancel_reason}</p>
        )}

        {!stopped && (
          <ol className="mt-5 flex flex-col gap-0">
            {STEPS.map((step, i) => {
              const done = i <= stepIndex;
              const current = i === stepIndex;
              return (
                <li key={step.status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      key={`${step.status}-${done}`}
                      className={`grid size-6 place-items-center rounded-full border-2 transition-colors duration-300 ${
                        done ? "anim-pop border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]" : "border-[var(--g-line)] bg-[var(--g-surface)]"
                      } ${current && order.status !== "served" && order.status !== "completed" ? "anim-ring-pulse" : ""}`}
                    >
                      {done && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="relative h-6 w-0.5 overflow-hidden bg-[var(--g-line)]">
                        <span
                          className="ease-spring absolute inset-0 origin-top bg-[var(--brand)] transition-transform duration-500"
                          style={{ transform: `scaleY(${i < stepIndex ? 1 : 0})` }}
                        />
                      </span>
                    )}
                  </div>
                  <span className={`text-sm leading-6 transition-colors duration-300 ${current ? "font-semibold" : done ? "" : "text-[var(--g-muted)]"}`}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-label="Items" style={{ "--i": 3 } as React.CSSProperties} className="anim-rise rounded-2xl bg-[var(--g-surface)] p-5 text-sm ring-1 ring-[var(--g-line)]">
        <ul className="flex flex-col gap-3">
          {activeItems.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="w-6 font-semibold tabular-nums">{item.qty}×</span>
              <span className="flex-1">
                {item.name_snapshot}
                {item.options_snapshot.length > 0 && (
                  <span className="block text-[var(--g-muted)]">{item.options_snapshot.map((o) => o.name).join(", ")}</span>
                )}
                {item.note && <span className="block text-[var(--g-muted)] italic">“{item.note}”</span>}
              </span>
              <span className="tabular-nums">{formatINR(item.line_total_paise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-1 border-t border-dashed border-[var(--g-line)] pt-3">
          {order.gst_mode === "regular" && !order.prices_include_tax && (
            <div className="flex justify-between text-[var(--g-muted)]">
              <span>GST ({order.tax_rate_bp / 100}%)</span>
              <span className="tabular-nums">{formatINR(order.tax_paise)}</span>
            </div>
          )}
          {order.round_off_paise !== 0 && (
            <div className="flex justify-between text-[var(--g-muted)]">
              <span>Round off</span>
              <span className="tabular-nums">{formatINR(order.round_off_paise)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(order.total_paise)}</span>
          </div>
          {order.gst_mode === "regular" && order.prices_include_tax && (
            <p className="text-xs text-[var(--g-muted)]">Includes GST of {formatINR(order.tax_paise)}</p>
          )}
          <p className="mt-2 text-[var(--g-muted)]">{order.payment_status === "paid" ? "Paid" : "Pay at the counter"}</p>
        </div>
      </section>

      <div className="anim-rise flex flex-col gap-2" style={{ "--i": 5 } as React.CSSProperties}>
        <Link
          href={basePath}
          className="flex h-12 items-center justify-center rounded-xl bg-[var(--brand)] font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.98]"
        >
          Order more
        </Link>
        {order.status === "placed" && (
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling}
            className={`h-12 rounded-xl border font-medium text-[var(--g-danger)] transition-colors disabled:opacity-50 ${
              confirmCancel ? "border-[var(--g-danger)] bg-red-50" : "border-[var(--g-line)]"
            }`}
          >
            {cancelling ? "Cancelling…" : confirmCancel ? "Tap again to cancel this order" : "Cancel order"}
          </button>
        )}
        {cancelError && (
          <p role="alert" className="anim-rise text-sm text-[var(--g-danger)]">
            {cancelError}
          </p>
        )}
      </div>
    </main>
  );
}

/** A tick that draws itself, shown once right after the guest places an order. */
function SentTick() {
  return (
    <div className="anim-pop mb-3 grid size-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)]">
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="var(--brand)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" className="anim-draw" style={{ "--len": 24 } as React.CSSProperties} />
      </svg>
    </div>
  );
}

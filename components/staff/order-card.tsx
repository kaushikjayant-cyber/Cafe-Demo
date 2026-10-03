"use client";

import { AlertTriangle, Banknote, CreditCard, QrCode, Smartphone, UserRound } from "lucide-react";
import { useState } from "react";

import { formatINR } from "@/lib/money";
import type { OrderStatus } from "@/lib/order-state";

import type { BoardOrder } from "./use-live-orders";

export type PayMethod = "cash" | "upi_counter" | "card_counter";

const REJECT_REASONS = ["An item is unavailable", "Kitchen is closing", "Duplicate order", "Table didn't order this"];
const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi_counter: "UPI", card_counter: "Card", online: "Online" };

export function minutesSince(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : 0;
}

/** Green under 10 minutes, amber to 20, red after: how long the guest has been waiting. */
export function ageTone(minutes: number): "fresh" | "warm" | "late" {
  return minutes < 10 ? "fresh" : minutes < 20 ? "warm" : "late";
}

const STRIPE = { fresh: "bg-emerald-500", warm: "bg-amber-500", late: "bg-red-500" } as const;
const AGE_TEXT = { fresh: "text-[var(--g-muted)]", warm: "text-amber-700", late: "font-semibold text-red-700" } as const;

interface Props {
  order: BoardOrder;
  now: number;
  busy: boolean;
  onTransition: (order: BoardOrder, to: OrderStatus, reason?: string) => void;
  onPay: (order: BoardOrder, method: PayMethod) => void;
}

export function OrderCard({ order, now, busy, onTransition, onPay }: Props) {
  const [panel, setPanel] = useState<"none" | "reject" | "pay" | "cancel">("none");
  const waiting = minutesSince(order.placed_at ?? order.created_at, now);
  const tone = ageTone(waiting);
  const isNew = now - new Date(order.created_at).getTime() < 15_000;
  const paid = order.payment_status === "paid";
  const items = order.order_items.filter((i) => i.status === "active");

  const primary: { label: string; to: OrderStatus } | null =
    order.status === "placed"
      ? { label: "Accept", to: "accepted" }
      : order.status === "accepted"
        ? { label: "Start preparing", to: "preparing" }
        : order.status === "preparing"
          ? { label: "Mark ready", to: "ready" }
          : order.status === "ready"
            ? { label: "Served", to: "served" }
            : null;

  return (
    <article
      className={`anim-rise relative overflow-hidden rounded-2xl bg-[var(--g-surface)] shadow-sm ring-1 ring-[var(--g-line)] ${isNew ? "anim-ring-pulse" : ""}`}
      aria-label={`Order ${order.daily_no}`}
    >
      {order.status !== "served" && <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${STRIPE[tone]}`} />}
      <div className="flex flex-col gap-3 py-3.5 pr-3.5 pl-5">
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-heading text-2xl font-bold tabular-nums">#{order.daily_no}</span>
              <span className="rounded-lg bg-[var(--g-ink)] px-2 py-0.5 text-sm font-bold text-white">{order.tables?.label ?? "Counter"}</span>
              <span title={order.source === "qr" ? "Ordered by QR" : "Taken by staff"} className="text-[var(--g-muted)]">
                {order.source === "qr" ? <QrCode className="size-4" /> : <UserRound className="size-4" />}
              </span>
            </div>
            {order.guest_name && <p className="mt-0.5 truncate text-sm font-medium">{order.guest_name}</p>}
          </div>
          <span className={`text-sm tabular-nums ${AGE_TEXT[tone]}`}>{waiting < 1 ? "Just now" : `${waiting} min`}</span>
        </header>

        {order.needs_attention && (
          <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Payment arrived after this order expired. Serve it or refund it.
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2 leading-snug">
              <span className="w-7 shrink-0 font-bold tabular-nums">{item.qty}×</span>
              <span className="min-w-0">
                <span className="font-medium">{item.name_snapshot}</span>
                {item.options_snapshot.length > 0 && (
                  <span className="block text-sm text-[var(--g-muted)]">{item.options_snapshot.map((o) => o.name).join(" · ")}</span>
                )}
                {item.note && <span className="mt-0.5 block rounded bg-amber-50 px-1.5 text-sm text-amber-900">“{item.note}”</span>}
              </span>
            </li>
          ))}
        </ul>
        {order.note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Note: {order.note}</p>}

        <div className="flex items-center justify-between border-t border-dashed border-[var(--g-line)] pt-2.5">
          <span className="font-semibold tabular-nums">{formatINR(order.total_paise)}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              paid ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
            }`}
          >
            {paid ? `Paid · ${METHOD_LABEL[order.payment_method ?? ""] ?? ""}` : "Unpaid"}
          </span>
        </div>

        {panel === "reject" && (
          <Chooser title="Why can't you take it?" onCancel={() => setPanel("none")}>
            {REJECT_REASONS.map((reason) => (
              <ChoiceButton key={reason} disabled={busy} onClick={() => onTransition(order, "rejected", reason)}>
                {reason}
              </ChoiceButton>
            ))}
          </Chooser>
        )}
        {panel === "cancel" && (
          <Chooser title="Cancel this order?" onCancel={() => setPanel("none")}>
            <ChoiceButton disabled={busy} danger onClick={() => onTransition(order, "cancelled", "Cancelled at the counter")}>
              Yes, cancel order #{order.daily_no}
            </ChoiceButton>
          </Chooser>
        )}
        {panel === "pay" && (
          <Chooser title={`Collect ${formatINR(order.total_paise)}`} onCancel={() => setPanel("none")}>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["cash", "Cash", Banknote],
                  ["upi_counter", "UPI", Smartphone],
                  ["card_counter", "Card", CreditCard],
                ] as const
              ).map(([method, label, Icon]) => (
                <button
                  key={method}
                  type="button"
                  disabled={busy}
                  onClick={() => onPay(order, method)}
                  className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl bg-[var(--g-soft)] text-sm font-semibold transition-transform hover:ring-2 hover:ring-[var(--brand)] active:scale-95 disabled:opacity-50"
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              ))}
            </div>
          </Chooser>
        )}

        {panel === "none" && (
          <div className="flex flex-wrap gap-2">
            {primary && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onTransition(order, primary.to)}
                className="h-12 min-w-32 flex-1 rounded-xl bg-[var(--brand)] font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {primary.label}
              </button>
            )}
            {!paid && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPanel("pay")}
                className={`h-12 rounded-xl px-4 font-semibold ring-1 transition-transform active:scale-[0.97] disabled:opacity-50 ${
                  order.status === "served" ? "flex-1 bg-[var(--brand)] text-[var(--brand-fg)] ring-transparent" : "ring-[var(--g-line)]"
                }`}
              >
                Mark paid
              </button>
            )}
            {order.status === "placed" && (
              <button type="button" disabled={busy} onClick={() => setPanel("reject")} className="h-12 rounded-xl px-4 text-sm font-medium text-red-700 ring-1 ring-[var(--g-line)]">
                Reject
              </button>
            )}
            {!paid && order.status !== "placed" && order.status !== "served" && (
              <button type="button" disabled={busy} onClick={() => setPanel("cancel")} className="h-12 rounded-xl px-3 text-sm text-[var(--g-muted)] hover:text-red-700">
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function Chooser({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="anim-rise flex flex-col gap-2 rounded-xl bg-[var(--g-bg)] p-2.5 ring-1 ring-[var(--g-line)]">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold">{title}</span>
        <button type="button" onClick={onCancel} className="text-sm text-[var(--g-muted)] hover:text-[var(--g-ink)]">
          Back
        </button>
      </div>
      {children}
    </div>
  );
}

function ChoiceButton({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl bg-[var(--g-surface)] px-3 py-3 text-left text-sm font-medium ring-1 ring-[var(--g-line)] transition-colors hover:ring-[var(--brand)] disabled:opacity-50 ${danger ? "text-red-700" : ""}`}
    >
      {children}
    </button>
  );
}

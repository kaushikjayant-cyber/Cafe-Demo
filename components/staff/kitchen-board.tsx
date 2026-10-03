"use client";

import { ChefHat, CookingPot } from "lucide-react";
import { useCallback, useState } from "react";

import type { OrderStatus, StaffRole } from "@/lib/order-state";
import { getBrowserClient } from "@/lib/supabase/browser";

import { ageTone, minutesSince } from "./order-card";
import { ShiftProvider, useAttentionAlert } from "./shift";
import { StaffShell, type ShellCafe } from "./staff-shell";
import { StaffToast, useStaffToast } from "./staff-toast";
import { useLiveOrders, type BoardOrder } from "./use-live-orders";
import { useNow } from "./use-now";

interface Props {
  tenantKey: string;
  base: string;
  cafe: ShellCafe;
  staff: { displayName: string; role: StaffRole };
}

const HEADER_TONE = {
  fresh: "bg-emerald-600 text-white",
  warm: "bg-amber-500 text-black",
  late: "bg-red-600 text-white",
} as const;

export function KitchenBoard(props: Props) {
  return (
    <ShiftProvider title="Start the kitchen">
      <Board {...props} />
    </ShiftProvider>
  );
}

function Board({ tenantKey, base, cafe, staff }: Props) {
  const { orders, connection, loaded, reload, patchOrder } = useLiveOrders(cafe.id);
  const now = useNow(10_000);
  const toast = useStaffToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  // The kitchen sees orders once the counter has accepted them.
  const tickets = orders.filter((o) => o.status === "accepted" || o.status === "preparing");
  const waiting = orders.filter((o) => o.status === "placed").length;
  useAttentionAlert(tickets.filter((o) => o.status === "accepted").length, "To cook");

  const move = useCallback(
    async (order: BoardOrder, to: OrderStatus) => {
      setBusyId(order.id);
      patchOrder(order.id, { status: to });
      const { error } = await getBrowserClient().rpc("transition_order", { p_order: order.id, p_from: order.status, p_to: to });
      if (error) {
        toast.show(error.message.includes("stale_transition") ? "Already updated on another screen." : "That didn't work. Please try again.");
        void reload();
      }
      setBusyId(null);
    },
    [patchOrder, reload, toast],
  );

  return (
    <StaffShell tenantKey={tenantKey} base={base} cafe={cafe} staff={staff} connection={connection}>
      <main className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
            <ChefHat className="size-6" /> To cook <span className="tabular-nums text-[var(--g-muted)]">({tickets.length})</span>
          </h1>
          {waiting > 0 && (
            <p className="rounded-full bg-[var(--g-soft)] px-3 py-1 text-sm text-[var(--g-muted)]">
              {waiting} new order{waiting > 1 ? "s" : ""} waiting for the counter to accept
            </p>
          )}
        </div>

        {!loaded ? (
          <div className="h-48 animate-pulse rounded-2xl bg-[var(--g-surface)]" />
        ) : tickets.length === 0 ? (
          <div className="grid flex-1 place-items-center">
            <p className="flex flex-col items-center gap-3 text-[var(--g-muted)]">
              <CookingPot className="size-12 opacity-50" />
              Nothing to cook right now.
            </p>
          </div>
        ) : (
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {tickets.map((order) => {
              const minutes = minutesSince(order.accepted_at ?? order.created_at, now);
              const tone = ageTone(minutes);
              const items = order.order_items.filter((i) => i.status === "active");
              return (
                <article key={order.id} className="anim-rise overflow-hidden rounded-2xl bg-[var(--g-surface)] ring-1 ring-[var(--g-line)]" aria-label={`Ticket ${order.daily_no}`}>
                  <header className={`flex items-center justify-between px-4 py-2.5 ${HEADER_TONE[tone]}`}>
                    <span className="flex items-baseline gap-2">
                      <span className="font-heading text-2xl font-bold tabular-nums">#{order.daily_no}</span>
                      <span className="text-lg font-bold">{order.tables?.label ?? "Counter"}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{minutes < 1 ? "Now" : `${minutes} min`}</span>
                  </header>
                  <ul className="flex flex-col gap-2.5 px-4 py-3.5">
                    {items.map((item) => (
                      <li key={item.id} className="flex gap-3 text-lg leading-snug">
                        <span className="w-8 shrink-0 font-bold tabular-nums">{item.qty}×</span>
                        <span className="min-w-0">
                          <span className="font-semibold">{item.name_snapshot}</span>
                          {item.options_snapshot.length > 0 && (
                            <span className="block text-base text-[var(--g-muted)]">{item.options_snapshot.map((o) => o.name).join(" · ")}</span>
                          )}
                          {item.note && <span className="mt-1 block rounded-md bg-amber-400/15 px-2 text-base font-medium text-amber-300">{item.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {order.note && <p className="mx-4 mb-3 rounded-lg bg-amber-400/15 px-3 py-2 text-base text-amber-300">{order.note}</p>}
                  <div className="flex gap-2 border-t border-[var(--g-line)] p-3">
                    {order.status === "accepted" && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => move(order, "preparing")}
                        className="h-14 flex-1 rounded-xl bg-[var(--g-soft)] text-lg font-semibold ring-1 ring-[var(--g-line)] transition-transform active:scale-[0.97] disabled:opacity-50"
                      >
                        Start
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => move(order, "ready")}
                      className="h-14 flex-1 rounded-xl bg-emerald-600 text-lg font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
                    >
                      Ready
                    </button>
                  </div>
                  {order.status === "preparing" && <p className="-mt-1 pb-2 text-center text-xs text-[var(--g-muted)]">Cooking</p>}
                </article>
              );
            })}
          </div>
        )}
      </main>
      <StaffToast toast={toast} />
    </StaffShell>
  );
}

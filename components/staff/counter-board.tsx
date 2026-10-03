"use client";

import { BellRing, Check, ReceiptText } from "lucide-react";
import { useCallback, useState } from "react";

import type { OrderStatus, StaffRole } from "@/lib/order-state";
import { getBrowserClient } from "@/lib/supabase/browser";

import { minutesSince, OrderCard, type PayMethod } from "./order-card";
import { ShiftProvider, useAttentionAlert } from "./shift";
import { StaffShell, type ShellCafe } from "./staff-shell";
import { StaffToast, useStaffToast } from "./staff-toast";
import { useLiveOrders, type BoardOrder, type ServiceRequest } from "./use-live-orders";
import { useNow } from "./use-now";

interface Props {
  tenantKey: string;
  base: string;
  cafe: ShellCafe;
  staff: { displayName: string; role: StaffRole };
}

const COLUMNS: { key: string; title: string; statuses: OrderStatus[]; empty: string }[] = [
  { key: "new", title: "New", statuses: ["placed"], empty: "New orders appear here with a chime." },
  { key: "kitchen", title: "In the kitchen", statuses: ["accepted", "preparing"], empty: "Nothing cooking." },
  { key: "ready", title: "Ready to serve", statuses: ["ready"], empty: "Nothing waiting at the pass." },
  { key: "served", title: "Served · to collect", statuses: ["served"], empty: "All bills settled." },
];

export function CounterBoard(props: Props) {
  return (
    <ShiftProvider title="Start the counter">
      <Board {...props} />
    </ShiftProvider>
  );
}

function Board({ tenantKey, base, cafe, staff }: Props) {
  const { orders, requests, connection, loaded, reload, patchOrder, dropRequest } = useLiveOrders(cafe.id);
  const now = useNow();
  const toast = useStaffToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mobileColumn, setMobileColumn] = useState("new");

  const attention = orders.filter((o) => o.status === "placed" || o.needs_attention).length + requests.length;
  useAttentionAlert(attention, "New orders");

  const fail = useCallback(
    (message: string) => {
      toast.show(message.includes("stale_transition") ? "Already updated on another device." : message.includes("already_paid") ? "This order is already paid." : "That didn't work. Please try again.");
      void reload();
    },
    [reload, toast],
  );

  const transition = useCallback(
    async (order: BoardOrder, to: OrderStatus, reason?: string) => {
      setBusyId(order.id);
      patchOrder(order.id, { status: to }); // optimistic; the server has the final word
      const { data, error } = await getBrowserClient().rpc("transition_order", { p_order: order.id, p_from: order.status, p_to: to, p_reason: reason ?? null });
      if (error) fail(error.message);
      else patchOrder(order.id, data as Partial<BoardOrder>);
      setBusyId(null);
    },
    [patchOrder, fail],
  );

  const pay = useCallback(
    async (order: BoardOrder, method: PayMethod) => {
      setBusyId(order.id);
      const { data, error } = await getBrowserClient().rpc("mark_order_paid", { p_order: order.id, p_method: method });
      if (error) fail(error.message);
      else {
        patchOrder(order.id, data as Partial<BoardOrder>);
        toast.show(`Order #${order.daily_no} paid. Invoice ${(data as BoardOrder).invoice_no}.`);
      }
      setBusyId(null);
    },
    [patchOrder, fail, toast],
  );

  const resolve = useCallback(
    async (request: ServiceRequest) => {
      dropRequest(request.id);
      const { error } = await getBrowserClient().rpc("resolve_service_request", { p_request: request.id });
      if (error) fail(error.message);
    },
    [dropRequest, fail],
  );

  return (
    <StaffShell tenantKey={tenantKey} base={base} cafe={cafe} staff={staff} connection={connection}>
      <main className="flex flex-1 flex-col gap-4 p-4">
        {requests.length > 0 && (
          <section aria-label="Table requests" className="flex flex-wrap gap-2">
            {requests.map((request) => (
              <div key={request.id} className="anim-rise anim-ring-pulse flex items-center gap-3 rounded-2xl bg-[var(--g-ink)] py-2 pr-2 pl-4 text-white shadow-lg">
                {request.type === "bill" ? <ReceiptText className="size-5" /> : <BellRing className="size-5" />}
                <span className="text-sm">
                  <span className="font-bold">{request.tables?.label ?? "A table"}</span> {request.type === "bill" ? "wants the bill" : "is calling a waiter"}
                  <span className="ml-2 opacity-70">{minutesSince(request.created_at, now) || "<1"} min</span>
                </span>
                <button
                  type="button"
                  onClick={() => resolve(request)}
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-[var(--g-ink)] transition-transform active:scale-95"
                >
                  <Check className="size-4" /> Done
                </button>
              </div>
            ))}
          </section>
        )}

        <div className="flex gap-1 rounded-xl bg-[var(--g-soft)] p-1 md:hidden" role="tablist" aria-label="Order columns">
          {COLUMNS.map((column) => {
            const count = orders.filter((o) => column.statuses.includes(o.status)).length;
            return (
              <button
                key={column.key}
                type="button"
                role="tab"
                aria-selected={mobileColumn === column.key}
                onClick={() => setMobileColumn(column.key)}
                className={`flex-1 rounded-lg px-1 py-2 text-xs font-semibold transition-colors ${
                  mobileColumn === column.key ? "bg-[var(--g-surface)] shadow-sm" : "text-[var(--g-muted)]"
                }`}
              >
                {column.title.split(" ·")[0]} {count > 0 && <span className="tabular-nums">({count})</span>}
              </button>
            );
          })}
        </div>

        <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnOrders = orders.filter((o) => column.statuses.includes(o.status));
            return (
              <section
                key={column.key}
                aria-label={column.title}
                className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-[var(--g-soft)]/60 p-3 ${mobileColumn === column.key ? "" : "hidden md:flex"}`}
              >
                <h2 className="flex items-center justify-between px-1 font-heading text-base font-bold">
                  {column.title}
                  <span key={columnOrders.length} className="anim-pop grid min-w-7 place-items-center rounded-full bg-[var(--g-surface)] px-2 text-sm tabular-nums ring-1 ring-[var(--g-line)]">
                    {columnOrders.length}
                  </span>
                </h2>
                {!loaded ? (
                  <div className="h-32 animate-pulse rounded-2xl bg-[var(--g-surface)]" />
                ) : columnOrders.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-[var(--g-muted)]">{column.empty}</p>
                ) : (
                  columnOrders.map((order) => (
                    <OrderCard key={order.id} order={order} now={now} busy={busyId === order.id} onTransition={transition} onPay={pay} />
                  ))
                )}
              </section>
            );
          })}
        </div>
      </main>
      <StaffToast toast={toast} />
    </StaffShell>
  );
}

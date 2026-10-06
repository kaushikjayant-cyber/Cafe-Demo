"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OrderStatus } from "@/lib/order-state";
import { getBrowserClient, subscribeWhenReady } from "@/lib/supabase/browser";

export interface BoardOrderItem {
  id: string;
  name_snapshot: string;
  qty: number;
  options_snapshot: { group: string; name: string }[];
  note: string | null;
  status: "active" | "voided";
  line_total_paise: number;
}

export interface BoardOrder {
  id: string;
  daily_no: number;
  status: OrderStatus;
  payment_status: "unpaid" | "paid" | "partially_refunded" | "refunded";
  payment_method: string | null;
  source: "qr" | "staff";
  guest_name: string | null;
  note: string | null;
  total_paise: number;
  needs_attention: boolean;
  invoice_no: string | null;
  created_at: string;
  placed_at: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  tables: { label: string } | null;
  order_items: BoardOrderItem[];
}

export interface ServiceRequest {
  id: string;
  type: "waiter" | "bill";
  created_at: string;
  tables: { label: string } | null;
}

/** A rating of 2★ or less that nobody has dealt with yet (§5.9). */
export interface LowReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  orders: { daily_no: number; tables: { label: string } | null } | null;
}

export type Connection = "connecting" | "live" | "offline";

/** Orders the counter or kitchen still has to act on. Served-and-paid orders are completed. */
export const BOARD_STATUSES: OrderStatus[] = ["placed", "accepted", "preparing", "ready", "served"];

const ORDER_SELECT =
  "id, daily_no, status, payment_status, payment_method, source, guest_name, note, total_paise, needs_attention, " +
  "invoice_no, created_at, placed_at, accepted_at, ready_at, tables(label), " +
  "order_items(id, name_snapshot, qty, options_snapshot, note, status, line_total_paise)";

const POLL_MS = 30_000;

async function fetchOrders(cafeId: string): Promise<BoardOrder[]> {
  const { data, error } = await getBrowserClient()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("cafe_id", cafeId)
    .in("status", BOARD_STATUSES)
    .order("created_at")
    .returns<BoardOrder[]>();
  if (error) throw error;
  return data;
}

async function fetchRequests(cafeId: string): Promise<ServiceRequest[]> {
  const { data, error } = await getBrowserClient()
    .from("service_requests")
    .select("id, type, created_at, tables(label)")
    .eq("cafe_id", cafeId)
    .eq("status", "open")
    .order("created_at")
    .returns<ServiceRequest[]>();
  if (error) throw error;
  return data;
}

const LOW_REVIEW_WINDOW_MS = 12 * 60 * 60 * 1000;

async function fetchLowReviews(cafeId: string): Promise<LowReview[]> {
  const { data, error } = await getBrowserClient()
    .from("reviews")
    .select("id, rating, comment, created_at, orders(daily_no, tables(label))")
    .eq("cafe_id", cafeId)
    .lte("rating", 2)
    .is("handled_at", null)
    .gte("created_at", new Date(Date.now() - LOW_REVIEW_WINDOW_MS).toISOString())
    .order("created_at")
    .returns<LowReview[]>();
  if (error) throw error;
  return data;
}

function upsert(orders: BoardOrder[], order: BoardOrder): BoardOrder[] {
  const rest = orders.filter((o) => o.id !== order.id);
  if (!BOARD_STATUSES.includes(order.status)) return rest;
  return [...rest, order].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Live view of a cafe's active orders and open table requests [D-26]:
 * Realtime for speed, a full reload on every reconnect, and a 30-second safety poll,
 * so a dropped event can never hide an order.
 */
export function useLiveOrders(cafeId: string) {
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [lowReviews, setLowReviews] = useState<LowReview[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [loaded, setLoaded] = useState(false);
  const ordersRef = useRef<BoardOrder[]>([]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const reload = useCallback(async () => {
    try {
      const [o, r, lr] = await Promise.all([fetchOrders(cafeId), fetchRequests(cafeId), fetchLowReviews(cafeId)]);
      setOrders(o);
      setRequests(r);
      setLowReviews(lr);
      setLoaded(true);
    } catch {
      setConnection("offline");
    }
  }, [cafeId]);

  /** Apply a change made on this device straight away; Realtime confirms it shortly after. */
  const patchOrder = useCallback((id: string, patch: Partial<BoardOrder>) => {
    setOrders((current) => {
      const order = current.find((o) => o.id === id);
      return order ? upsert(current, { ...order, ...patch }) : current;
    });
  }, []);

  const dropRequest = useCallback((id: string) => setRequests((current) => current.filter((r) => r.id !== id)), []);
  const dropLowReview = useCallback((id: string) => setLowReviews((current) => current.filter((r) => r.id !== id)), []);

  useEffect(() => {
    let active = true;
    let subscribedBefore = false;
    const run = (task: () => Promise<void>) => void task().catch(() => active && setConnection("offline"));

    run(async () => {
      const [o, r, lr] = await Promise.all([fetchOrders(cafeId), fetchRequests(cafeId), fetchLowReviews(cafeId)]);
      if (!active) return;
      setOrders(o);
      setRequests(r);
      setLowReviews(lr);
      setLoaded(true);
    });

    const unsubscribe = subscribeWhenReady((supabase) =>
      supabase
        .channel(`board:${cafeId}`)
        .on<BoardOrder>("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `cafe_id=eq.${cafeId}` }, (change) => {
          if (change.eventType === "DELETE") return;
          const row = change.new;
          if (change.eventType === "INSERT" || !BOARD_STATUSES.includes(row.status)) {
            // New orders need their items and table; leaving orders just disappear.
            if (!BOARD_STATUSES.includes(row.status)) {
              setOrders((current) => current.filter((o) => o.id !== row.id));
              return;
            }
            run(async () => {
              const { data } = await supabase.from("orders").select(ORDER_SELECT).eq("id", row.id).maybeSingle<BoardOrder>();
              if (active && data) setOrders((current) => upsert(current, data));
            });
            return;
          }
          // An order that moved onto the board (e.g. paid online) is fetched in full.
          if (!ordersRef.current.some((o) => o.id === row.id)) {
            run(async () => {
              const { data } = await supabase.from("orders").select(ORDER_SELECT).eq("id", row.id).maybeSingle<BoardOrder>();
              if (active && data) setOrders((latest) => upsert(latest, data));
            });
            return;
          }
          setOrders((current) => {
            const existing = current.find((o) => o.id === row.id);
            return existing ? upsert(current, { ...existing, ...row, tables: existing.tables, order_items: existing.order_items }) : current;
          });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "service_requests", filter: `cafe_id=eq.${cafeId}` }, () =>
          run(async () => {
            const r = await fetchRequests(cafeId);
            if (active) setRequests(r);
          }),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `cafe_id=eq.${cafeId}` }, () =>
          run(async () => {
            const lr = await fetchLowReviews(cafeId);
            if (active) setLowReviews(lr);
          }),
        )
        .subscribe((status) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            setConnection("live");
            if (subscribedBefore) void reload(); // reconnected: catch up on anything missed
            subscribedBefore = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnection("offline");
          }
        }),
    );

    const poll = setInterval(() => void reload(), POLL_MS);
    const onOnline = () => void reload();
    const onOffline = () => setConnection("offline");
    const onVisible = () => document.visibilityState === "visible" && void reload();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [cafeId, reload]);

  return { orders, requests, lowReviews, connection, loaded, reload, patchOrder, dropRequest, dropLowReview };
}

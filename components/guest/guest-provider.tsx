"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { GuestMenu, MenuItem } from "@/lib/menu-types";
import { getBrowserClient } from "@/lib/supabase/browser";

import { useCart } from "./cart-store";

export interface RecentOrder {
  id: string;
  daily_no: number;
  status: string;
  created_at: string;
}

interface GuestContextValue extends GuestMenu {
  basePath: string;
  recentOrders: RecentOrder[];
  refreshRecentOrders: () => Promise<void>;
  ensureSession: () => Promise<string>;
  notice: string | null;
  cartReady: boolean;
  showNotice: (message: string) => void;
}

const GuestContext = createContext<GuestContextValue | null>(null);

export function useGuest(): GuestContextValue {
  const value = useContext(GuestContext);
  if (!value) throw new Error("useGuest must be used inside <GuestProvider>");
  return value;
}

/** This device's orders at the cafe in the last 12 hours (RLS limits them to the guest's own). */
async function fetchRecentOrders(cafeId: string): Promise<RecentOrder[]> {
  const supabase = getBrowserClient();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return [];
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("orders")
    .select("id, daily_no, status, created_at")
    .eq("cafe_id", cafeId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

type ItemRow ={ id: string; price_paise: number; is_available: boolean; sold_out_until: string | null; is_visible: boolean; archived_at: string | null };
type OptionRow = { id: string; price_delta_paise: number; is_available: boolean };

export function GuestProvider({ menu, children }: { menu: GuestMenu; children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<MenuItem[]>(menu.items);
  const [itemsSource, setItemsSource] = useState(menu.items);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [cartReady, setCartReady] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastRefresh = useRef(0);
  const basePath = `/t/${menu.table.token}`;

  // Fresh server data (after router.refresh()) replaces live-patched state.
  if (itemsSource !== menu.items) {
    setItemsSource(menu.items);
    setItems(menu.items);
  }

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }, []);

  // Load the saved cart, then keep it tied to this cafe and table (R26).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useCart.persist.rehydrate();
      if (cancelled) return;
      const { movedTable } = useCart.getState().bind(menu.cafe.id, menu.table.id);
      if (movedTable) showNotice(`Your cart is now for table ${menu.table.label}.`);
      setCartReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [menu.cafe.id, menu.table.id, menu.table.label, showNotice]);

  const refreshRecentOrders = useCallback(async () => {
    setRecentOrders(await fetchRecentOrders(menu.cafe.id));
  }, [menu.cafe.id]);

  useEffect(() => {
    let active = true;
    void fetchRecentOrders(menu.cafe.id).then((orders) => active && setRecentOrders(orders));
    return () => {
      active = false;
    };
  }, [menu.cafe.id]);

  // Signs the guest in anonymously only when they first order, so browsing creates no users.
  const ensureSession = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: created, error } = await supabase.auth.signInAnonymously();
    if (error || !created.user) throw new Error("We couldn't start your session. Please reload the page.");
    return created.user.id;
  }, []);

  // Live stock and price changes [D-21], with a full refresh whenever we may have missed events [D-26].
  useEffect(() => {
    const supabase = getBrowserClient();
    let subscribedBefore = false;
    const refresh = (force = false) => {
      if (!force && Date.now() - lastRefresh.current < 15_000) return;
      lastRefresh.current = Date.now();
      router.refresh();
      void refreshRecentOrders();
    };

    const channel = supabase
      .channel(`menu:${menu.cafe.id}`)
      .on<ItemRow>("postgres_changes", { event: "UPDATE", schema: "public", table: "menu_items", filter: `cafe_id=eq.${menu.cafe.id}` }, ({ new: row }) => {
        setItems((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  pricePaise: row.price_paise,
                  isAvailable: row.is_available && row.is_visible && !row.archived_at,
                  soldOutUntil: row.sold_out_until,
                }
              : item,
          ),
        );
      })
      .on<OptionRow>("postgres_changes", { event: "UPDATE", schema: "public", table: "options", filter: `cafe_id=eq.${menu.cafe.id}` }, ({ new: row }) => {
        setItems((current) =>
          current.map((item) => ({
            ...item,
            groups: item.groups.map((group) => ({
              ...group,
              options: group.options.map((o) => (o.id === row.id ? { ...o, available: row.is_available, priceDeltaPaise: row.price_delta_paise } : o)),
            })),
          })),
        );
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // A second SUBSCRIBED means we reconnected and may have missed changes.
        if (subscribedBefore) refresh(true);
        subscribedBefore = true;
      });

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [menu.cafe.id, refreshRecentOrders, router]);

  const value = useMemo<GuestContextValue>(
    () => ({ ...menu, items, basePath, recentOrders, refreshRecentOrders, ensureSession, notice, showNotice, cartReady }),
    [menu, items, basePath, recentOrders, refreshRecentOrders, ensureSession, notice, showNotice, cartReady],
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

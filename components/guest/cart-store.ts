"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  optionIds: string[];
  optionLabels: string[];
  /** Per unit, including options, as the guest saw it. */
  unitPricePaise: number;
  qty: number;
  note: string;
}

interface CartState {
  cafeId: string | null;
  tableId: string | null;
  lines: CartLine[];
  /** Reused on retries so a flaky network never creates a second order [D-16]. */
  pendingKey: string | null;
  updatedAt: number;
  bind: (cafeId: string, tableId: string) => { movedTable: boolean };
  add: (line: Omit<CartLine, "key">) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  setPrice: (itemId: string, optionIds: string[], unitPricePaise: number) => void;
  checkoutKey: () => string;
  clear: () => void;
}

const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function lineKey(itemId: string, optionIds: string[], note: string): string {
  return [itemId, [...optionIds].sort().join(","), note.trim().toLowerCase()].join("|");
}

const sameOptions = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      cafeId: null,
      tableId: null,
      lines: [],
      pendingKey: null,
      updatedAt: Date.now(),

      bind: (cafeId, tableId) => {
        const state = get();
        const stale = Date.now() - state.updatedAt > MAX_AGE_MS;
        if (state.cafeId !== cafeId || stale) {
          set({ cafeId, tableId, lines: [], pendingKey: null, updatedAt: Date.now() });
          return { movedTable: false };
        }
        if (state.tableId !== tableId) {
          set({ tableId, updatedAt: Date.now() });
          return { movedTable: state.lines.length > 0 };
        }
        return { movedTable: false };
      },

      add: (line) =>
        set((state) => {
          const key = lineKey(line.itemId, line.optionIds, line.note);
          const existing = state.lines.find((l) => l.key === key);
          const lines = existing
            ? state.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + line.qty) } : l))
            : [...state.lines, { ...line, key }];
          return { lines, pendingKey: null, updatedAt: Date.now() };
        }),

      setQty: (key, qty) =>
        set((state) => ({
          lines: qty <= 0 ? state.lines.filter((l) => l.key !== key) : state.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(20, qty) } : l)),
          pendingKey: null,
          updatedAt: Date.now(),
        })),

      remove: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key), pendingKey: null, updatedAt: Date.now() })),

      setPrice: (itemId, optionIds, unitPricePaise) =>
        set((state) => ({
          lines: state.lines.map((l) => (l.itemId === itemId && sameOptions(l.optionIds, optionIds) ? { ...l, unitPricePaise } : l)),
          pendingKey: null,
        })),

      checkoutKey: () => {
        const existing = get().pendingKey;
        if (existing) return existing;
        const key = crypto.randomUUID();
        set({ pendingKey: key });
        return key;
      },

      clear: () => set({ lines: [], pendingKey: null, updatedAt: Date.now() }),
    }),
    {
      name: "cafe-cart",
      storage: createJSONStorage(() => localStorage),
      // Loaded by GuestProvider after mount, so the first render matches the server's (empty) HTML.
      skipHydration: true,
      partialize: ({ cafeId, tableId, lines, pendingKey, updatedAt }) => ({ cafeId, tableId, lines, pendingKey, updatedAt }),
    },
  ),
);

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPricePaise * l.qty, 0);
}

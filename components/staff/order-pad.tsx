"use client";

import { LoaderCircle, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { lineKey, type CartLine } from "@/components/guest/cart-store";
import { DietMark } from "@/components/guest/diet-mark";
import { ItemSheet, type NewCartLine } from "@/components/guest/item-sheet";
import { QtyStepper } from "@/components/guest/qty-stepper";
import { itemIsAvailable, type MenuCategory, type MenuItem } from "@/lib/menu-types";
import { computeBill, formatINR, type GstMode } from "@/lib/money";
import type { StaffRole } from "@/lib/order-state";

import { StaffShell, type ShellCafe } from "./staff-shell";
import { StaffToast, useStaffToast } from "./staff-toast";

interface Props {
  tenantKey: string;
  base: string;
  cafe: ShellCafe & { taxRateBp: number; pricesIncludeTax: boolean; gstMode: GstMode };
  staff: { displayName: string; role: StaffRole };
  categories: MenuCategory[];
  items: MenuItem[];
  tables: { id: string; label: string }[];
}

/** Staff take an order for a guest who didn't scan; it goes straight to the kitchen. */
export function OrderPad({ tenantKey, base, cafe, staff, categories, items, tables }: Props) {
  const toast = useStaffToast();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [tableId, setTableId] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [sending, setSending] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const add = (line: NewCartLine) =>
    setLines((current) => {
      const k = lineKey(line.itemId, line.optionIds, line.note);
      const existing = current.find((l) => l.key === k);
      return existing ? current.map((l) => (l.key === k ? { ...l, qty: Math.min(20, l.qty + line.qty) } : l)) : [...current, { ...line, key: k }];
    });
  const setQty = (k: string, qty: number) => setLines((current) => (qty <= 0 ? current.filter((l) => l.key !== k) : current.map((l) => (l.key === k ? { ...l, qty } : l))));

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const order = new Map(categories.map((c, i) => [c.id, i]));
    return items
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : !category || i.categoryId === category))
      .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0)); // stable: keeps menu order within a category
  }, [items, categories, q, category]);
  const bill = computeBill({
    lines: lines.map((l) => ({ unitPricePaise: l.unitPricePaise, qty: l.qty })),
    taxRateBp: cafe.taxRateBp,
    pricesIncludeTax: cafe.pricesIncludeTax,
    gstMode: cafe.gstMode,
  });

  function tap(item: MenuItem) {
    if (!itemIsAvailable(item)) return;
    if (item.groups.length) setOpenItem(item);
    else add({ itemId: item.id, name: item.name, optionIds: [], optionLabels: [], unitPricePaise: item.pricePaise, qty: 1, note: "" });
  }

  async function send() {
    setSending(true);
    try {
      const response = await fetch("/api/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: tableId || null,
          lines: lines.map((l) => ({ itemId: l.itemId, optionIds: l.optionIds, qty: l.qty, note: l.note || undefined, unitPricePaise: l.unitPricePaise })),
          note: note.trim() || undefined,
          guestName: guestName.trim() || undefined,
          idempotencyKey: key,
        }),
      });
      const body = await response.json();
      if (response.ok) {
        toast.show(`Order #${body.dailyNo} sent to the kitchen.`);
        setLines([]);
        setNote("");
        setGuestName("");
        setKey(crypto.randomUUID());
      } else if (body.code === "CART_CHANGED") {
        toast.show(`${body.problems[0]?.name ?? "An item"} has changed or sold out. Please remove it and add it again.`);
      } else {
        toast.show(body.message ?? "That didn't go through. Please try again.");
      }
    } catch {
      toast.show("No connection. Your order is still here; try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <StaffShell tenantKey={tenantKey} base={base} cafe={cafe} staff={staff}>
      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_380px]">
        <section aria-label="Menu" className="flex min-w-0 flex-col gap-3">
          <label className="flex h-12 items-center gap-2 rounded-xl bg-[var(--g-surface)] px-3 ring-1 ring-[var(--g-line)] focus-within:ring-[var(--brand)]">
            <Search className="size-4 text-[var(--g-muted)]" />
            <span className="sr-only">Search the menu</span>
            <input id="pad-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu" className="h-full w-full bg-transparent outline-none" />
          </label>
          {!q && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {[{ id: null, name: "All" }, ...categories].map((c) => (
                <button
                  key={c.id ?? "all"}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                    category === c.id ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "bg-[var(--g-surface)] ring-1 ring-[var(--g-line)]"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((item) => {
              const available = itemIsAvailable(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!available}
                  onClick={() => tap(item)}
                  className="flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl bg-[var(--g-surface)] p-3 text-left ring-1 ring-[var(--g-line)] transition-transform hover:ring-[var(--brand)] active:scale-[0.97] disabled:opacity-45"
                >
                  <span className="flex items-start gap-1.5 font-medium leading-snug">
                    <span className="mt-1">
                      <DietMark diet={item.diet} />
                    </span>
                    {item.name}
                  </span>
                  <span className="text-sm text-[var(--g-muted)] tabular-nums">
                    {available ? formatINR(item.pricePaise) : "Sold out"}
                    {available && item.groups.length > 0 && " · options"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside aria-label="Ticket" className="flex flex-col gap-3 self-start rounded-2xl bg-[var(--g-surface)] p-4 ring-1 ring-[var(--g-line)] lg:sticky lg:top-20">
          <h2 className="font-heading text-lg font-bold">New order</h2>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Table
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="h-11 rounded-lg bg-[var(--g-bg)] px-3 font-normal ring-1 ring-[var(--g-line)]"
            >
              <option value="">Counter / takeaway</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--g-line)] py-8 text-center text-sm text-[var(--g-muted)]">Tap items to add them.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--g-line)]">
              {lines.map((line) => (
                <li key={line.key} className="anim-rise flex flex-col gap-1.5 py-2.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {line.name}
                      {line.optionLabels.length > 0 && <span className="block font-normal text-[var(--g-muted)]">{line.optionLabels.join(", ")}</span>}
                      {line.note && <span className="block font-normal text-[var(--g-muted)] italic">“{line.note}”</span>}
                    </span>
                    <span className="tabular-nums">{formatINR(line.unitPricePaise * line.qty)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <QtyStepper qty={line.qty} onChange={(qty) => setQty(line.key, qty)} size="sm" label={`Quantity of ${line.name}`} />
                    <button type="button" onClick={() => setQty(line.key, 0)} aria-label={`Remove ${line.name}`} className="p-2 text-[var(--g-muted)] hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <input
            id="pad-guest"
            value={guestName}
            maxLength={40}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Guest name (optional)"
            className="h-11 rounded-lg bg-[var(--g-bg)] px-3 ring-1 ring-[var(--g-line)] outline-none focus:ring-[var(--brand)]"
          />
          <input
            id="pad-note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the kitchen (optional)"
            className="h-11 rounded-lg bg-[var(--g-bg)] px-3 ring-1 ring-[var(--g-line)] outline-none focus:ring-[var(--brand)]"
          />

          <div className="flex items-baseline justify-between border-t border-dashed border-[var(--g-line)] pt-3">
            <span className="text-sm text-[var(--g-muted)]">{cafe.gstMode === "regular" && cafe.pricesIncludeTax ? `Total (incl. GST ${formatINR(bill.taxPaise)})` : "Total"}</span>
            <span key={bill.totalPaise} className="anim-pop font-heading text-2xl font-bold tabular-nums">
              {formatINR(bill.totalPaise)}
            </span>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={lines.length === 0 || sending}
            className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-lg font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {sending && <LoaderCircle className="size-5 animate-spin" />}
            Send to kitchen
          </button>
        </aside>
      </main>
      {openItem && <ItemSheet item={openItem} onClose={() => setOpenItem(null)} onAdd={add} />}
      <StaffToast toast={toast} />
    </StaffShell>
  );
}

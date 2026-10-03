"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { StaffRole } from "@/lib/order-state";
import { getBrowserClient, subscribeWhenReady } from "@/lib/supabase/browser";

import { StaffShell, type ShellCafe } from "./staff-shell";
import { StaffToast, useStaffToast } from "./staff-toast";

export interface StockOption {
  id: string;
  name: string;
  is_available: boolean;
}

export interface StockItem {
  id: string;
  category: string;
  name: string;
  is_available: boolean;
  sold_out_until: string | null;
  options: StockOption[];
}

interface Props {
  tenantKey: string;
  base: string;
  cafe: ShellCafe & { timezone: string };
  staff: { displayName: string; role: StaffRole };
  items: StockItem[];
}

type ItemRow = { id: string; is_available: boolean; sold_out_until: string | null };
type OptionRow = { id: string; is_available: boolean };

function isOn(item: Pick<StockItem, "is_available" | "sold_out_until">, now: number): boolean {
  return item.is_available || (item.sold_out_until !== null && now >= new Date(item.sold_out_until).getTime());
}

export function StockPanel({ tenantKey, base, cafe, staff, items: initial }: Props) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [onlyOut, setOnlyOut] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const toast = useStaffToast();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Stay in step with toggles made on other devices.
  useEffect(
    () =>
      subscribeWhenReady((supabase) =>
        supabase
          .channel(`stock:${cafe.id}`)
          .on<ItemRow>("postgres_changes", { event: "UPDATE", schema: "public", table: "menu_items", filter: `cafe_id=eq.${cafe.id}` }, ({ new: row }) =>
            setItems((current) => current.map((i) => (i.id === row.id ? { ...i, is_available: row.is_available, sold_out_until: row.sold_out_until } : i))),
          )
          .on<OptionRow>("postgres_changes", { event: "UPDATE", schema: "public", table: "options", filter: `cafe_id=eq.${cafe.id}` }, ({ new: row }) =>
            setItems((current) =>
              current.map((i) => ({ ...i, options: i.options.map((o) => (o.id === row.id ? { ...o, is_available: row.is_available } : o)) })),
            ),
          )
          .subscribe(),
      ),
    [cafe.id],
  );

  const untilLabel = useMemo(() => {
    const format = new Intl.DateTimeFormat("en-IN", { timeZone: cafe.timezone, hour: "numeric", minute: "2-digit", weekday: "short" });
    return (iso: string) => format.format(new Date(iso));
  }, [cafe.timezone]);

  async function setItem(item: StockItem, mode: "on" | "today" | "off") {
    setBusy(item.id);
    const supabase = getBrowserClient();
    const { data, error } =
      mode === "today"
        ? await supabase.rpc("set_item_sold_out_today", { p_item: item.id })
        : await supabase.rpc("set_item_availability", { p_item: item.id, p_available: mode === "on", p_until: null });
    if (error) toast.show("That didn't save. Please try again.");
    else {
      const patch = mode === "on" ? { is_available: true, sold_out_until: null } : { is_available: false, sold_out_until: mode === "today" ? (data as string) : null };
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
      toast.show(mode === "on" ? `${item.name} is back on the menu.` : `${item.name} is sold out${mode === "today" ? " for today" : ""}.`);
    }
    setBusy(null);
  }

  async function setOption(item: StockItem, option: StockOption) {
    setBusy(option.id);
    const { error } = await getBrowserClient().rpc("set_option_availability", { p_option: option.id, p_available: !option.is_available });
    if (error) toast.show("That didn't save. Please try again.");
    else
      setItems((current) =>
        current.map((i) => (i.id === item.id ? { ...i, options: i.options.map((o) => (o.id === option.id ? { ...o, is_available: !o.is_available } : o)) } : i)),
      );
    setBusy(null);
  }

  // "We're out of oat milk": one switch per option name, applied to every item.
  const optionNames = useMemo(() => {
    const byName = new Map<string, { name: string; total: number; off: number }>();
    for (const option of items.flatMap((i) => i.options)) {
      const key = option.name.toLowerCase();
      const entry = byName.get(key) ?? { name: option.name, total: 0, off: 0 };
      entry.total += 1;
      if (!option.is_available) entry.off += 1;
      byName.set(key, entry);
    }
    return [...byName.values()].filter((o) => o.total > 1);
  }, [items]);

  async function setOptionEverywhere(name: string, available: boolean) {
    setBusy(`all:${name}`);
    const { error } = await getBrowserClient().rpc("set_option_availability_by_name", { p_cafe: cafe.id, p_name: name, p_available: available });
    if (error) toast.show("That didn't save. Please try again.");
    else {
      setItems((current) =>
        current.map((i) => ({ ...i, options: i.options.map((o) => (o.name.toLowerCase() === name.toLowerCase() ? { ...o, is_available: available } : o)) })),
      );
      toast.show(available ? `${name} is available again everywhere.` : `${name} is sold out on every item.`);
    }
    setBusy(null);
  }

  const q = query.trim().toLowerCase();
  const visible = items.filter((i) => (!q || i.name.toLowerCase().includes(q)) && (!onlyOut || !isOn(i, now) || i.options.some((o) => !o.is_available)));
  const categories = [...new Set(visible.map((i) => i.category))];
  const outCount = items.filter((i) => !isOn(i, now)).length;

  return (
    <StaffShell tenantKey={tenantKey} base={base} cafe={cafe} staff={staff}>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto font-heading text-xl font-bold">Stock</h1>
          <button
            type="button"
            aria-pressed={onlyOut}
            onClick={() => setOnlyOut((v) => !v)}
            className={`h-10 rounded-xl px-3 text-sm font-medium ring-1 transition-colors ${onlyOut ? "bg-[var(--g-ink)] text-[var(--g-bg)] ring-transparent" : "ring-[var(--g-line)]"}`}
          >
            Sold out only {outCount > 0 && <span className="tabular-nums">({outCount})</span>}
          </button>
        </div>
        <label className="flex h-12 items-center gap-2 rounded-xl bg-[var(--g-surface)] px-3 ring-1 ring-[var(--g-line)] focus-within:ring-[var(--brand)]">
          <Search className="size-4 text-[var(--g-muted)]" />
          <span className="sr-only">Find an item</span>
          <input id="stock-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item" className="h-full w-full bg-transparent outline-none" />
        </label>

        {!q && optionNames.length > 0 && (
          <section aria-label="Options across the menu" className="flex flex-col gap-2 rounded-2xl bg-[var(--g-surface)] p-4 ring-1 ring-[var(--g-line)]">
            <h2 className="text-sm font-semibold">Across the whole menu</h2>
            <p className="-mt-1 text-xs text-[var(--g-muted)]">Out of oat milk? Tap it once to switch it off on every item.</p>
            <div className="flex flex-wrap gap-2">
              {optionNames.map((option) => {
                const allOff = option.off === option.total;
                return (
                  <button
                    key={option.name}
                    type="button"
                    aria-pressed={allOff}
                    disabled={busy === `all:${option.name}`}
                    onClick={() => setOptionEverywhere(option.name, allOff)}
                    className={`h-9 rounded-full px-3 text-sm ring-1 transition-colors disabled:opacity-50 ${
                      allOff ? "bg-red-50 text-red-700 line-through ring-red-200" : option.off > 0 ? "ring-amber-300" : "ring-[var(--g-line)]"
                    }`}
                  >
                    {option.name}
                    {option.off > 0 && !allOff && <span className="ml-1 text-xs text-amber-700">({option.off} off)</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {categories.length === 0 && <p className="py-10 text-center text-[var(--g-muted)]">Nothing matches.</p>}

        {categories.map((category) => (
          <section key={category} className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-semibold tracking-wide text-[var(--g-muted)] uppercase">{category}</h2>
            <ul className="divide-y divide-[var(--g-line)] overflow-hidden rounded-2xl bg-[var(--g-surface)] ring-1 ring-[var(--g-line)]">
              {visible
                .filter((i) => i.category === category)
                .map((item) => {
                  const on = isOn(item, now);
                  const optionsOut = item.options.filter((o) => !o.is_available).length;
                  return (
                    <li key={item.id} className="flex flex-col">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                        <div className="min-w-40 flex-1">
                          <p className={`font-medium ${on ? "" : "text-[var(--g-muted)] line-through decoration-1"}`}>{item.name}</p>
                          <p className="text-xs text-[var(--g-muted)]">
                            {on
                              ? optionsOut > 0
                                ? `${optionsOut} option${optionsOut > 1 ? "s" : ""} sold out`
                                : "Available"
                              : item.sold_out_until
                                ? `Sold out · back ${untilLabel(item.sold_out_until)}`
                                : "Sold out until switched back on"}
                          </p>
                        </div>
                        {on ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy === item.id}
                              onClick={() => setItem(item, "today")}
                              className="h-10 rounded-xl bg-red-50 px-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 transition-transform active:scale-95 disabled:opacity-50"
                            >
                              Sold out today
                            </button>
                            <button
                              type="button"
                              disabled={busy === item.id}
                              onClick={() => setItem(item, "off")}
                              className="h-10 rounded-xl px-3 text-sm text-[var(--g-muted)] ring-1 ring-[var(--g-line)] transition-transform active:scale-95 disabled:opacity-50"
                            >
                              Until further notice
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy === item.id}
                            onClick={() => setItem(item, "on")}
                            className="anim-pop h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
                          >
                            Back in stock
                          </button>
                        )}
                        {item.options.length > 0 && (
                          <button
                            type="button"
                            aria-expanded={open === item.id}
                            onClick={() => setOpen((v) => (v === item.id ? null : item.id))}
                            className="flex h-10 items-center gap-1 rounded-xl px-2 text-sm text-[var(--g-muted)] hover:bg-[var(--g-soft)]"
                          >
                            Options <ChevronDown className={`size-4 transition-transform ${open === item.id ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </div>
                      {open === item.id && (
                        <div className="anim-rise flex flex-wrap gap-2 bg-[var(--g-bg)] px-4 py-3">
                          {item.options.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              aria-pressed={!option.is_available}
                              disabled={busy === option.id}
                              onClick={() => setOption(item, option)}
                              className={`h-9 rounded-full px-3 text-sm ring-1 transition-colors disabled:opacity-50 ${
                                option.is_available ? "ring-[var(--g-line)]" : "bg-red-50 text-red-700 line-through ring-red-200"
                              }`}
                            >
                              {option.name}
                            </button>
                          ))}
                          <p className="w-full text-xs text-[var(--g-muted)]">Tap an option to mark it sold out (or back in stock).</p>
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </main>
      <StaffToast toast={toast} />
    </StaffShell>
  );
}

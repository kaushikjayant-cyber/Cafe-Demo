"use client";

import { ChevronRight, Clock3, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { itemIsAvailable, orderingBlockedReason, type MenuItem } from "@/lib/menu-types";
import { formatINR } from "@/lib/money";
import { goesWellWith } from "@/lib/upsell";
import { isActive, type OrderStatus } from "@/lib/order-state";

import { cartCount, cartTotal, useCart } from "./cart-store";
import { DietMark } from "./diet-mark";
import { useGuest } from "./guest-provider";
import { ItemSheet } from "./item-sheet";
import { QtyStepper } from "./qty-stepper";
import { LegalLinks } from "@/components/legal-page";

import { ServiceButtons } from "./service-buttons";

/** Orders that no longer need a bill. */
const CLOSED = new Set(["cancelled", "rejected", "expired"]);

const TAG_LABEL: Record<string, string> = { spicy: "Spicy", new: "New", bestseller: "Bestseller", jain: "Jain" };

export function MenuView() {
  const { cafe, table, categories, items, basePath, recentOrders } = useGuest();
  const lines = useCart((s) => s.lines);
  const addToCart = useCart((s) => s.add);
  const [query, setQuery] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id);
  const tabsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const blocked = orderingBlockedReason(cafe, table);
  const activeOrders = recentOrders.filter((o) => isActive(o.status as OrderStatus));

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((category) => ({
        category,
        items: items.filter(
          (item) =>
            item.categoryId === category.id &&
            (!vegOnly || item.diet === "veg" || item.diet === "vegan") &&
            (!q || item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [categories, items, query, vegOnly]);

  // Highlight the category tab for the section in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCategory(visible.target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    document.querySelectorAll("[data-menu-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  // Slide the highlight pill under the active tab, and keep that tab in view.
  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${activeCategory}"]`);
    const pill = pillRef.current;
    if (!tab || !pill) return;
    const first = !pill.dataset.ready;
    if (first) pill.style.transition = "none";
    pill.style.width = `${tab.offsetWidth}px`;
    pill.style.height = `${tab.offsetHeight}px`;
    pill.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
    pill.style.opacity = "1";
    if (first) {
      pill.getBoundingClientRect(); // commit the start position before re-enabling transitions
      pill.style.transition = "";
      pill.dataset.ready = "1";
    }
    tab.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeCategory, sections, query]);

  const rowIndex = useMemo(() => new Map(sections.flatMap((s) => s.items).map((item, i) => [item.id, i])), [sections]);

  const count = cartCount(lines);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col pb-28">
      <header className="anim-fade-in flex items-center gap-3 px-4 pt-5 pb-3">
        {cafe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
          <img src={cafe.logoUrl} alt="" className="size-11 rounded-xl object-cover" />
        ) : (
          <div className="grid size-11 place-items-center rounded-xl bg-[var(--brand)] font-heading text-lg font-bold text-[var(--brand-fg)]">
            {cafe.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-xl font-bold leading-tight">{cafe.name}</h1>
          <p className="text-sm text-[var(--g-muted)]">
            Table <span className="font-semibold text-[var(--g-ink)]">{table.label}</span>
          </p>
        </div>
        {cafe.isDemo && <span className="rounded-full bg-[var(--g-soft)] px-2.5 py-1 text-xs font-medium text-[var(--g-muted)]">Demo</span>}
      </header>

      {activeOrders.length > 0 && (
        <Link
          href={`${basePath}/order/${activeOrders[0].id}`}
          className="anim-rise mx-4 mb-3 flex items-center gap-3 rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] px-4 py-3 transition-colors hover:border-[var(--brand)]"
        >
          <span className="anim-ring-pulse grid size-8 place-items-center rounded-full"><Clock3 className="size-5 text-[var(--brand)]" /></span>
          <span className="flex-1 text-sm">
            <span className="font-semibold">Order #{activeOrders[0].daily_no}</span> is in progress
            {activeOrders.length > 1 && ` (+${activeOrders.length - 1} more)`}
          </span>
          <ChevronRight className="size-4 text-[var(--g-muted)]" />
        </Link>
      )}

      {table.isActive && cafe.status !== "suspended" && (
        <div className="anim-rise mx-4 mb-3" style={{ "--i": 1 } as React.CSSProperties}>
          <ServiceButtons canRequestBill={recentOrders.some((o) => !CLOSED.has(o.status))} />
        </div>
      )}

      {blocked && (
        <p role="status" className="anim-rise mx-4 mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {blocked}
        </p>
      )}

      <div className="sticky top-0 z-20 border-b border-[var(--g-line)] bg-[var(--g-bg)]/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 pt-2 pb-2">
          <label className="flex h-11 flex-1 items-center gap-2 rounded border border-[var(--g-line)] bg-[var(--g-raised)] px-3 focus-within:border-[var(--g-ink)]">
            <Search className="size-4 text-[var(--g-muted)]" />
            <span className="sr-only">Search the menu</span>
            <input
              id="menu-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes and drinks"
              className="h-full w-full bg-transparent outline-none placeholder:text-[var(--g-muted)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            aria-pressed={vegOnly}
            onClick={() => setVegOnly((v) => !v)}
            className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors duration-200 active:scale-95 ${
              vegOnly ? "border-[var(--g-veg)] bg-green-50 text-[var(--g-veg)]" : "border-[var(--g-line)] bg-[var(--g-surface)]"
            }`}
          >
            <DietMark diet="veg" /> Veg
          </button>
        </div>
        {!query && (
          <nav ref={tabsRef} aria-label="Menu categories" className="no-scrollbar relative flex gap-1 overflow-x-auto px-3 pb-2">
            <span
              ref={pillRef}
              aria-hidden
              className="ease-spring absolute top-0 left-0 rounded-full bg-[var(--g-accent)] opacity-0 transition-[transform,width,opacity] duration-300"
            />
            {sections.map(({ category }) => (
              <a
                key={category.id}
                data-tab={category.id}
                href={`#cat-${category.id}`}
                aria-current={activeCategory === category.id ? "true" : undefined}
                className={`relative z-10 shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-300 ${
                  activeCategory === category.id ? "text-white" : "text-[var(--g-muted)] hover:text-[var(--g-ink)]"
                }`}
              >
                {category.name}
              </a>
            ))}
          </nav>
        )}
      </div>

      {sections.length === 0 && (
        <p className="anim-fade-in px-6 py-16 text-center text-[var(--g-muted)]">
          Nothing matches {query ? `“${query}”` : "that filter"}. Try another word.
        </p>
      )}

      {sections.map(({ category, items: sectionItems }) => (
        <section key={category.id} id={`cat-${category.id}`} data-menu-section className="scroll-mt-28 px-4 pt-6">
          <h2 className="mb-3 font-heading text-2xl">{category.name}</h2>
          <ul className="flex flex-col gap-3">
            {sectionItems.map((item) => (
              <MenuRow key={item.id} item={item} index={rowIndex.get(item.id) ?? 0} canOrder={!blocked} onOpen={() => setOpenItem(item)} />
            ))}
          </ul>
        </section>
      ))}

      <LegalLinks hrefFor={(page) => `${basePath}/legal/${page}`} />

      {count > 0 && !blocked && (
        <div className="anim-bar-up fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            href={`${basePath}/cart`}
            className="mx-auto flex h-14 max-w-2xl items-center justify-between rounded-md bg-[var(--brand)] px-5 text-[var(--brand-fg)] shadow-lg transition-transform active:scale-[0.98]"
          >
            <span className="text-sm">
              <span key={count} className="anim-pop inline-block font-semibold">
                {count} item{count > 1 ? "s" : ""}
              </span>{" "}
              · <span className="tabular-nums">{formatINR(cartTotal(lines))}</span>
            </span>
            <span className="group flex items-center gap-1 font-semibold">
              View order <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      )}

      {openItem && (
        <ItemSheet
          key={openItem.id}
          item={openItem}
          onClose={() => setOpenItem(null)}
          onAdd={addToCart}
          pairings={goesWellWith(openItem, items)}
          onPick={setOpenItem}
        />
      )}
    </main>
  );
}

function MenuRow({ item, index, canOrder, onOpen }: { item: MenuItem; index: number; canOrder: boolean; onOpen: () => void }) {
  const available = itemIsAvailable(item);
  const simple = item.groups.length === 0;
  const simpleKey = `${item.id}||`;
  const inCart = useCart((s) => (simple ? s.lines.find((l) => l.key === simpleKey)?.qty ?? 0 : s.lines.filter((l) => l.itemId === item.id).reduce((n, l) => n + l.qty, 0)));
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);

  const addSimple = () =>
    add({ itemId: item.id, name: item.name, optionIds: [], optionLabels: [], unitPricePaise: item.pricePaise, qty: 1, note: "" });

  return (
    <li
      className={`anim-rise relative rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-4 transition-opacity duration-500 ${available ? "" : "opacity-50"}`}
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
    >
      <button type="button" onClick={onOpen} disabled={!available || !canOrder} className="flex w-full gap-3 text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <DietMark diet={item.diet} />
            {item.tags
              .filter((t) => TAG_LABEL[t])
              .map((t) => (
                <span key={t} className="label-caps rounded-full bg-[color-mix(in_srgb,var(--g-accent)_12%,transparent)] px-2 py-0.5 text-[var(--g-accent)]">
                  {TAG_LABEL[t]}
                </span>
              ))}
          </span>
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-heading text-xl leading-snug">{item.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatINR(item.pricePaise)}</span>
          </span>
          {item.description && <span className="line-clamp-2 text-[13px] leading-[18px] text-[var(--g-muted)]">{item.description}</span>}
        </span>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
          <img src={item.imageUrl} alt="" loading="lazy" className="size-20 shrink-0 rounded-md border border-[var(--g-line)] object-cover" />
        )}
      </button>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--g-line)] pt-3">
        <span className="label-caps text-[var(--g-muted)]">{!available ? "Sold out" : simple ? "" : "Customisable"}</span>
        {!available || !canOrder ? null : simple && inCart > 0 ? (
          <div className="anim-pop">
            <QtyStepper qty={inCart} onChange={(qty) => setQty(simpleKey, qty)} size="sm" label={`Quantity of ${item.name}`} />
          </div>
        ) : (
          <button
            type="button"
            onClick={simple ? addSimple : onOpen}
            aria-label={`Add ${item.name}`}
            className="flex h-10 items-center gap-1.5 rounded bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-fg)] transition-transform duration-150 active:scale-[0.97]"
          >
            <Plus className="size-4" /> Add{inCart > 0 ? ` · ${inCart}` : ""}
          </button>
        )}
      </div>
    </li>
  );
}

"use client";

import { ArrowLeft, LoaderCircle, Plus, Smartphone, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { itemIsAvailable, orderingBlockedReason, type MenuItem } from "@/lib/menu-types";
import { computeBill, formatINR } from "@/lib/money";
import type { CartProblem } from "@/lib/orders/validate";
import { cartSuggestion } from "@/lib/upsell";

import { cartCount, useCart, type CartLine } from "./cart-store";
import { useGuest } from "./guest-provider";
import { ItemSheet } from "./item-sheet";
import { QtyStepper } from "./qty-stepper";

/** Why a cart line can't be ordered against the live menu, or null. Price changes are fixed up automatically. */
function lineProblem(line: CartLine, item: MenuItem | undefined): string | null {
  if (!item || !itemIsAvailable(item)) return "Sold out. Remove it to continue.";
  const options = item.groups.flatMap((g) => g.options);
  const gone = line.optionIds.map((id) => options.find((o) => o.id === id)).find((o) => !o || !o.available);
  if (gone !== undefined) return `${gone?.name ?? "An option"} is sold out. Remove this and add it again.`;
  return null;
}

function livePrice(line: CartLine, item: MenuItem | undefined): number | null {
  if (!item) return null;
  const options = item.groups.flatMap((g) => g.options);
  return line.optionIds.reduce((sum, id) => sum + (options.find((o) => o.id === id)?.priceDeltaPaise ?? 0), item.pricePaise);
}

export function CartView() {
  const router = useRouter();
  const { cafe, table, items, basePath, ensureSession, refreshRecentOrders, showNotice, cartReady } = useGuest();
  const { lines, setQty, remove, setPrice, checkoutKey, clear, add } = useCart();
  const [suggestionOpen, setSuggestionOpen] = useState<MenuItem | null>(null);
  const suggestion = useMemo(() => cartSuggestion(lines.map((l) => l.itemId), items), [lines, items]);
  const [guestName, setGuestName] = useState("");
  const [note, setNote] = useState("");
  const [payChoice, setPayChoice] = useState<"online" | "counter">(cafe.onlinePayments ? "online" : "counter");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  // Let the line slide out before it leaves the cart.
  function removeLine(key: string) {
    setRemoving((current) => new Set(current).add(key));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      remove(key);
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, reduced ? 0 : 200);
  }

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const blocked = orderingBlockedReason(cafe, table);

  // Follow live price changes, and say so (R2).
  useEffect(() => {
    for (const line of lines) {
      const price = livePrice(line, itemById.get(line.itemId));
      if (price !== null && price !== line.unitPricePaise) {
        setPrice(line.itemId, line.optionIds, price);
        showNotice(`${line.name} is now ${formatINR(price)}.`);
      }
    }
  }, [lines, itemById, setPrice, showNotice]);

  const problems = Object.fromEntries(
    lines.map((l) => [l.key, serverProblems[l.key] ?? lineProblem(l, itemById.get(l.itemId))]).filter(([, p]) => p),
  ) as Record<string, string>;
  const hasProblems = Object.keys(problems).length > 0;

  const bill = computeBill({
    lines: lines.map((l) => ({ unitPricePaise: l.unitPricePaise, qty: l.qty })),
    taxRateBp: cafe.taxRateBp,
    pricesIncludeTax: cafe.pricesIncludeTax,
    gstMode: cafe.gstMode,
  });

  async function placeOrder() {
    setError(null);
    setSubmitting(true);
    try {
      await ensureSession();
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableToken: table.token,
          lines: lines.map((l) => ({ itemId: l.itemId, optionIds: l.optionIds, qty: l.qty, note: l.note || undefined, unitPricePaise: l.unitPricePaise })),
          note: note.trim() || undefined,
          guestName: guestName.trim() || undefined,
          payChoice,
          idempotencyKey: checkoutKey(),
        }),
      });
      const body = await response.json();

      if (response.ok) {
        clear();
        void refreshRecentOrders();
        // Online orders go straight into checkout on the tracking page.
        router.replace(`${basePath}/order/${body.orderId}${body.orderStatus === "pending_payment" ? "?pay=1" : ""}`);
        return;
      }
      if (body.code === "CART_CHANGED") {
        const next: Record<string, string> = {};
        for (const problem of body.problems as CartProblem[]) {
          const line = lines[problem.lineIndex];
          if (!line) continue;
          if (problem.code === "PRICE_CHANGED") {
            setPrice(line.itemId, line.optionIds, problem.unitPricePaise);
            showNotice(`${problem.name} is now ${formatINR(problem.unitPricePaise)}. Please check your order.`);
          } else if (problem.code === "INVALID_OPTIONS") {
            next[line.key] = `${problem.message} Remove this and add it again.`;
          } else {
            next[line.key] = problem.code === "OPTION_UNAVAILABLE" ? `${problem.option} is sold out. Remove this and add it again.` : "Sold out. Remove it to continue.";
          }
        }
        setServerProblems(next);
        router.refresh();
        return;
      }
      setError(body.message ?? "Something went wrong. Please try again.");
      if (body.code === "ORDERING_CLOSED") router.refresh();
    } catch {
      // The idempotency key is kept, so trying again can't create a second order.
      setError("We couldn't reach the cafe. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!cartReady) return <main className="flex-1" aria-busy="true" />;

  if (lines.length === 0) {
    return (
      <main className="anim-rise mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-heading text-2xl font-bold">Your order is empty</h1>
        <Link href={basePath} className="rounded-xl bg-[var(--brand)] px-5 py-3 font-semibold text-[var(--brand-fg)]">
          Browse the menu
        </Link>
      </main>
    );
  }

  return (
    <main className="anim-slide-in-right mx-auto flex w-full max-w-2xl flex-1 flex-col pb-32">
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <Link href={basePath} aria-label="Back to menu" className="grid size-10 place-items-center rounded-full transition-colors hover:bg-[var(--g-soft)] active:scale-90">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="font-heading text-xl font-bold">Your order</h1>
          <p className="text-sm text-[var(--g-muted)]">
            {cafe.name} · Table {table.label}
          </p>
        </div>
      </header>

      <ul className="mx-4 divide-y divide-[var(--g-line)] rounded-2xl bg-[var(--g-surface)] px-4 shadow-sm ring-1 ring-[var(--g-line)]">
        {lines.map((line, i) => (
          <li
            key={line.key}
            className={`flex flex-col gap-2 py-4 ${removing.has(line.key) ? "anim-slide-out-left" : "anim-rise"}`}
            style={{ "--i": i } as React.CSSProperties}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg leading-snug">{line.name}</p>
                {line.optionLabels.length > 0 && <p className="text-sm text-[var(--g-muted)]">{line.optionLabels.join(", ")}</p>}
                {line.note && <p className="text-sm text-[var(--g-muted)] italic">“{line.note}”</p>}
              </div>
              <p className="font-medium tabular-nums">{formatINR(line.unitPricePaise * line.qty)}</p>
            </div>
            <div className="flex items-center justify-between">
              {problems[line.key] ? (
                <p className="anim-fade-in text-sm font-medium text-[var(--g-danger)]">{problems[line.key]}</p>
              ) : (
                <QtyStepper qty={line.qty} onChange={(q) => setQty(line.key, q)} size="sm" label={`Quantity of ${line.name}`} />
              )}
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--g-muted)] transition-colors hover:bg-[var(--g-soft)] hover:text-[var(--g-danger)]"
              >
                <Trash2 className="size-4" /> Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Link href={basePath} className="mx-4 mt-3 text-sm font-semibold text-[var(--brand)]">
        + Add more items
      </Link>

      {suggestion && (
        <div key={suggestion.id} className="anim-rise mx-4 mt-4 flex items-center gap-3 rounded-md border border-dashed border-[var(--g-accent)] bg-[color-mix(in_srgb,var(--g-accent)_6%,transparent)] p-3">
          <div className="min-w-0 flex-1">
            <p className="label-caps text-[var(--g-accent)]">Goes well with your order</p>
            <p className="mt-0.5 text-sm">
              Add a <span className="font-heading text-base">{suggestion.name}</span> for{" "}
              <span className="font-semibold tabular-nums">{formatINR(suggestion.pricePaise)}</span>?
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              suggestion.groups.length === 0
                ? add({ itemId: suggestion.id, name: suggestion.name, optionIds: [], optionLabels: [], unitPricePaise: suggestion.pricePaise, qty: 1, note: "" })
                : setSuggestionOpen(suggestion)
            }
            className="flex h-10 shrink-0 items-center gap-1 rounded bg-[var(--brand)] px-3 text-sm font-semibold text-[var(--brand-fg)] active:scale-[0.97]"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>
      )}
      {suggestionOpen && <ItemSheet key={suggestionOpen.id} item={suggestionOpen} onClose={() => setSuggestionOpen(null)} onAdd={add} />}

      <section className="anim-rise mx-4 mt-6 flex flex-col gap-3" style={{ "--i": 3 } as React.CSSProperties}>
        <div>
          <label htmlFor="guest-name" className="mb-1.5 block text-sm font-semibold">
            Your name <span className="font-normal text-[var(--g-muted)]">(optional, so we can call you)</span>
          </label>
          <input
            id="guest-name"
            value={guestName}
            maxLength={40}
            autoComplete="given-name"
            onChange={(e) => setGuestName(e.target.value)}
            className="h-11 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] px-3 outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label htmlFor="order-note" className="mb-1.5 block text-sm font-semibold">
            Note for the kitchen <span className="font-normal text-[var(--g-muted)]">(optional)</span>
          </label>
          <textarea
            id="order-note"
            value={note}
            maxLength={300}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. serve the desserts after the coffee"
            className="w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] px-3 py-2 outline-none focus:border-[var(--brand)]"
          />
        </div>
      </section>

      <section aria-label="Bill" style={{ "--i": 5 } as React.CSSProperties} className="anim-rise mx-4 mt-6 rounded-2xl bg-[var(--g-surface)] p-4 text-sm ring-1 ring-[var(--g-line)]">
        <Row label={`Items (${cartCount(lines)})`} value={formatINR(bill.subtotalPaise)} />
        {cafe.gstMode === "regular" && !cafe.pricesIncludeTax && <Row label={`GST (${cafe.taxRateBp / 100}%)`} value={formatINR(bill.taxPaise)} />}
        {bill.roundOffPaise !== 0 && <Row label="Round off" value={formatINR(bill.roundOffPaise)} />}
        <div className="mt-2 flex justify-between border-t border-dashed border-[var(--g-line)] pt-2 text-base font-bold">
          <span>To pay</span>
          <span key={bill.totalPaise} className="anim-pop inline-block tabular-nums">
            {formatINR(bill.totalPaise)}
          </span>
        </div>
        {cafe.gstMode === "regular" && cafe.pricesIncludeTax && (
          <p className="mt-1 text-xs text-[var(--g-muted)]">Includes GST of {formatINR(bill.taxPaise)}</p>
        )}
        {cafe.onlinePayments && cafe.allowPayAtCounter ? (
          <fieldset className="mt-4 grid grid-cols-2 gap-2">
            <legend className="mb-2 text-sm font-semibold text-[var(--g-ink)]">How would you like to pay?</legend>
            {(
              [
                ["online", "Pay now", "UPI, cards, netbanking", Smartphone],
                ["counter", "Pay at counter", "After your meal", Store],
              ] as const
            ).map(([value, title, hint, Icon]) => (
              <label
                key={value}
                className={`flex cursor-pointer flex-col gap-1 rounded-xl p-3 ring-1 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--brand)] ${
                  payChoice === value ? "bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] ring-2 ring-[var(--brand)]" : "ring-[var(--g-line)]"
                }`}
              >
                <input type="radio" name="pay-choice" value={value} checked={payChoice === value} onChange={() => setPayChoice(value)} className="sr-only" />
                <Icon className="size-5 text-[var(--brand)]" />
                <span className="font-semibold text-[var(--g-ink)]">{title}</span>
                <span className="text-xs text-[var(--g-muted)]">{hint}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="mt-3 rounded-lg bg-[var(--g-soft)] px-3 py-2 text-[var(--g-muted)]">
            {payChoice === "online" ? "You'll pay online (UPI, cards) right after ordering." : "You'll pay at the counter after your meal."}
          </p>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--g-line)] bg-[var(--g-bg)]/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {(error || blocked) && (
            <p role="alert" className="anim-rise text-sm font-medium text-[var(--g-danger)]">
              {error ?? blocked}
            </p>
          )}
          <button
            type="button"
            onClick={placeOrder}
            disabled={submitting || hasProblems || !!blocked}
            className="flex h-14 items-center justify-between rounded-2xl bg-[var(--brand)] px-5 font-semibold text-[var(--brand-fg)] shadow-lg transition-[transform,opacity] active:scale-[0.98] disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              {submitting && <LoaderCircle className="size-5 animate-spin" />}
              {submitting ? "Placing order…" : hasProblems ? "Fix the items above" : payChoice === "online" ? "Place order & pay" : "Place order"}
            </span>
            <span className="tabular-nums">{formatINR(bill.totalPaise)}</span>
          </button>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-[var(--g-muted)]">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

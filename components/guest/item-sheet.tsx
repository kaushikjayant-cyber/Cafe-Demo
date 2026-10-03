"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MenuItem, MenuOptionGroup } from "@/lib/menu-types";
import { formatINR } from "@/lib/money";

import { useCart } from "./cart-store";
import { DietMark } from "./diet-mark";
import { QtyStepper } from "./qty-stepper";

function defaultSelection(groups: MenuOptionGroup[]): Record<string, string[]> {
  // Preselect the first available choice for required single-choice groups (e.g. Size: Regular).
  return Object.fromEntries(
    groups.map((g) => {
      const first = g.options.find((o) => o.available);
      return [g.id, g.minSelect >= 1 && g.maxSelect === 1 && first ? [first.id] : []];
    }),
  );
}

function groupHint(group: MenuOptionGroup): string {
  if (group.minSelect === 0) return group.maxSelect === 1 ? "Optional" : `Optional · up to ${group.maxSelect}`;
  if (group.minSelect === group.maxSelect) return group.minSelect === 1 ? "Required" : `Choose ${group.minSelect}`;
  return `Choose ${group.minSelect}–${group.maxSelect}`;
}

const CLOSE_MS = 200;

export function ItemSheet({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const add = useCart((s) => s.add);
  const [selected, setSelected] = useState(() => defaultSelection(item.groups));
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Play the slide-down, then unmount.
  const close = useCallback(() => {
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(onClose, reduced ? 0 : CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const chosen = useMemo(
    () => item.groups.flatMap((g) => g.options.filter((o) => selected[g.id]?.includes(o.id)).map((o) => ({ group: g, option: o }))),
    [item.groups, selected],
  );
  const unitPrice = item.pricePaise + chosen.reduce((sum, c) => sum + c.option.priceDeltaPaise, 0);
  const missing = item.groups.find((g) => (selected[g.id]?.length ?? 0) < g.minSelect);

  function toggle(group: MenuOptionGroup, optionId: string) {
    setSelected((current) => {
      const picked = current[group.id] ?? [];
      if (group.maxSelect === 1) return { ...current, [group.id]: picked[0] === optionId && group.minSelect === 0 ? [] : [optionId] };
      if (picked.includes(optionId)) return { ...current, [group.id]: picked.filter((id) => id !== optionId) };
      if (picked.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...picked, optionId] };
    });
  }

  function submit() {
    if (missing) return;
    add({
      itemId: item.id,
      name: item.name,
      optionIds: chosen.map((c) => c.option.id),
      optionLabels: chosen.map((c) => c.option.name),
      unitPricePaise: unitPrice,
      qty,
      note: note.trim(),
    });
    close();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="item-sheet-title">
      <button type="button" aria-label="Close" className={`absolute inset-0 bg-black/45 ${closing ? "anim-fade-out" : "anim-fade-in"}`} onClick={close} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-[var(--g-surface)] shadow-2xl outline-none sm:mb-6 sm:rounded-2xl ${closing ? "anim-sheet-down" : "anim-sheet-up"}`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-[var(--g-surface)]/90 shadow"
        >
          <X className="size-5" />
        </button>

        <div className="overflow-y-auto overscroll-contain">
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL; next/image comes with the image pipeline in Phase 4.
            <img src={item.imageUrl} alt="" className="aspect-[16/10] w-full rounded-t-2xl object-cover" />
          )}
          <div className="flex flex-col gap-2 px-5 pt-5 pb-4">
            <div className="flex items-center gap-2 pr-10">
              <DietMark diet={item.diet} />
              <h2 id="item-sheet-title" className="font-heading text-xl font-bold leading-tight">
                {item.name}
              </h2>
            </div>
            <p className="text-base font-semibold tabular-nums">{formatINR(item.pricePaise)}</p>
            {item.description && <p className="text-sm text-[var(--g-muted)]">{item.description}</p>}
          </div>

          {item.groups.map((group) => (
            <fieldset key={group.id} className="border-t border-[var(--g-line)] px-5 py-4">
              <legend className="sr-only">{group.name}</legend>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-semibold">{group.name}</span>
                <span className="text-xs text-[var(--g-muted)]">{groupHint(group)}</span>
              </div>
              <div className="flex flex-col">
                {group.options.map((option) => {
                  const checked = selected[group.id]?.includes(option.id) ?? false;
                  const full = !checked && group.maxSelect > 1 && (selected[group.id]?.length ?? 0) >= group.maxSelect;
                  return (
                    <label
                      key={option.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 py-1.5 ${!option.available || full ? "cursor-not-allowed opacity-45" : ""}`}
                    >
                      <input
                        type={group.maxSelect === 1 ? "radio" : "checkbox"}
                        name={group.id}
                        checked={checked}
                        disabled={!option.available || full}
                        onChange={() => toggle(group, option.id)}
                        onClick={(e) => {
                          // Radios can't normally be unticked; allow it for optional groups.
                          if (group.maxSelect === 1 && checked && group.minSelect === 0) {
                            e.preventDefault();
                            toggle(group, option.id);
                          }
                        }}
                        className="size-5 accent-[var(--brand)]"
                      />
                      <span className="flex-1">{option.name}</span>
                      <span className="text-sm text-[var(--g-muted)] tabular-nums">
                        {!option.available ? "Sold out" : option.priceDeltaPaise ? `+${formatINR(option.priceDeltaPaise)}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="border-t border-[var(--g-line)] px-5 py-4">
            <label htmlFor="item-note" className="mb-2 block font-semibold">
              Anything we should know? <span className="font-normal text-[var(--g-muted)]">(optional)</span>
            </label>
            <input
              id="item-note"
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. extra hot, no ice"
              className="h-11 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-bg)] px-3 outline-none focus:border-[var(--brand)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--g-line)] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <QtyStepper qty={qty} onChange={setQty} min={1} label={`Quantity of ${item.name}`} />
          <button
            type="button"
            onClick={submit}
            disabled={!!missing}
            className="flex h-11 flex-1 items-center justify-between rounded-lg bg-[var(--brand)] px-4 font-semibold text-[var(--brand-fg)] disabled:opacity-50"
          >
            <span>{missing ? `Choose ${missing.name.toLowerCase()}` : "Add to order"}</span>
            <span className="tabular-nums">{formatINR(unitPrice * qty)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

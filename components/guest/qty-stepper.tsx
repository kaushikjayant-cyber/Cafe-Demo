"use client";

import { Minus, Plus } from "lucide-react";

interface Props {
  qty: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: "sm" | "md";
}

export function QtyStepper({ qty, onChange, min = 0, max = 20, label, size = "md" }: Props) {
  const h = size === "sm" ? "h-10" : "h-11";
  const w = size === "sm" ? "w-9" : "w-11";
  return (
    <div className={`inline-flex ${h} items-center rounded border border-[var(--g-line)] bg-[var(--g-raised)]`} role="group" aria-label={label}>
      <button
        type="button"
        className={`${w} ${h} grid place-items-center text-[var(--brand)] disabled:opacity-30`}
        onClick={() => onChange(qty - 1)}
        disabled={qty <= min}
        aria-label="Decrease quantity"
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        className={`${w} ${h} grid place-items-center text-[var(--brand)] disabled:opacity-30`}
        onClick={() => onChange(qty + 1)}
        disabled={qty >= max}
        aria-label="Increase quantity"
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

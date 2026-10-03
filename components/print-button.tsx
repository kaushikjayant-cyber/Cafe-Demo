"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-[var(--g-line)] transition-transform active:scale-95 print:hidden"
    >
      <Printer className="size-4" /> Print or save as PDF
    </button>
  );
}

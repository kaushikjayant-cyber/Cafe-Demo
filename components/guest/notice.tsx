"use client";

import { useGuest } from "./guest-provider";

/** Short-lived message, e.g. "Cold Brew just sold out". Announced to screen readers. */
export function Notice() {
  const { notice } = useGuest();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      {notice && (
        <p key={notice} className="anim-toast pointer-events-auto max-w-md rounded-xl bg-[var(--g-ink)] px-4 py-3 text-sm text-white shadow-lg">
          {notice}
        </p>
      )}
    </div>
  );
}

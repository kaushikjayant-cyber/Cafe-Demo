"use client";

import { useEffect } from "react";

// Shown if the menu can't load (database or network hiccup, R12). Never a raw stack trace.
export default function GuestError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="guest mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading text-2xl font-bold">We couldn&apos;t load the menu</h1>
      <p className="text-[var(--g-muted)]">This is usually a brief connection problem. Please try again in a moment.</p>
      <button type="button" onClick={reset} className="h-12 rounded-xl bg-[#1c1b18] px-6 font-semibold text-white">
        Try again
      </button>
    </main>
  );
}

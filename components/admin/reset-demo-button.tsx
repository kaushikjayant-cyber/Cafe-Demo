"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resetDemo } from "@/app/c/[slug]/admin/demo-actions";

/** Shown in the demo cafe only. Two taps, so a stray click doesn't wipe a live pitch. */
export function ResetDemoButton({ tenantKey }: { tenantKey: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span role="status" className="anim-fade-in text-xs text-[var(--g-muted)]">
          {message}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onBlur={() => setConfirm(false)}
        onClick={() => {
          if (!confirm) return setConfirm(true);
          setConfirm(false);
          start(async () => {
            const result = await resetDemo(tenantKey);
            setMessage(result.ok ? `Fresh demo: ${result.data?.toLocaleString("en-IN")} orders over 60 days.` : result.error);
            if (result.ok) router.refresh();
          });
        }}
        className={`flex h-9 items-center gap-1.5 rounded border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
          confirm ? "border-[var(--g-accent)] bg-[var(--g-accent)] text-white" : "border-[var(--g-line)] text-[var(--g-muted)] hover:text-[var(--g-ink)]"
        }`}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {pending ? "Resetting…" : confirm ? "Tap again to reset" : "Reset demo"}
      </button>
    </div>
  );
}

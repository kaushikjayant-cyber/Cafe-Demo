"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setReviewHidden } from "@/app/c/[slug]/admin/reviews/actions";

export function ReviewHideButton({ tenantKey, reviewId, hidden }: { tenantKey: string; reviewId: string; hidden: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await setReviewHidden(tenantKey, reviewId, !hidden);
          if (result.ok) router.refresh();
          else alert(result.error);
        })
      }
      className="flex h-9 items-center gap-1.5 rounded border border-[var(--g-line)] px-3 text-xs font-semibold text-[var(--g-muted)] transition-colors hover:text-[var(--g-ink)] disabled:opacity-50"
    >
      {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {hidden ? "Show" : "Hide"}
    </button>
  );
}

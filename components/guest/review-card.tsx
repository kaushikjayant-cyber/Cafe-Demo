"use client";

import { ExternalLink, LoaderCircle, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";

import { useGuest } from "./guest-provider";

interface ReviewItem {
  itemId: string;
  name: string;
}

const RATING_WORDS = ["", "Poor", "Not great", "Okay", "Good", "Loved it"];

/**
 * "How was everything?" once an order has been served or paid (§5.9). The Google link is
 * shown after every rating, never only to happy guests: Google forbids review gating [D-29].
 */
export function ReviewCard({ orderId, items }: { orderId: string; items: ReviewItem[] }) {
  const { cafe, ensureSession } = useGuest();
  const [state, setState] = useState<"loading" | "open" | "sending" | "done">("loading");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/reviews?orderId=${orderId}`)
      .then((r) => r.json())
      .then((data: { reviewed: boolean; rating: number | null }) => {
        if (!active) return;
        if (data.reviewed) setRating(data.rating ?? 0);
        setState(data.reviewed ? "done" : "open");
      })
      .catch(() => active && setState("open"));
    return () => {
      active = false;
    };
  }, [orderId]);

  async function submit() {
    setState("sending");
    setError(null);
    try {
      await ensureSession();
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, rating, comment, items: Object.entries(liked).map(([itemId, value]) => ({ itemId, liked: value })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok || data.code === "already_reviewed") {
        setState("done");
        return;
      }
      setError(data.message ?? "That didn't send. Please try again.");
      setState("open");
    } catch {
      setError("We couldn't reach the cafe. Check your connection and try again.");
      setState("open");
    }
  }

  if (state === "loading") return null;

  if (state === "done") {
    return (
      <section aria-live="polite" className="anim-rise flex flex-col gap-3 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-5">
        <p className="label-caps text-[var(--g-sage)]">Thank you</p>
        <h2 className="font-heading text-xl">
          {rating >= 4 ? "We're so glad you enjoyed it." : rating > 0 ? "Thanks for telling us. The team has been told." : "Thanks for your feedback."}
        </h2>
        {cafe.googleReviewUrl && (
          <a
            href={cafe.googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded border border-[var(--g-line)] bg-[var(--g-raised)] text-sm font-semibold transition-colors hover:bg-[var(--g-soft)]"
          >
            Review us on Google <ExternalLink className="size-4" />
          </a>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="review-title" className="anim-rise flex flex-col gap-4 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-5">
      <div>
        <p className="label-caps text-[var(--g-muted)]">Your feedback</p>
        <h2 id="review-title" className="mt-1 font-heading text-xl">
          How was everything?
        </h2>
      </div>

      <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className="grid size-12 place-items-center rounded transition-transform active:scale-90"
          >
            <Star
              className={`size-8 transition-colors ${n <= rating ? "fill-[var(--g-accent)] text-[var(--g-accent)]" : "text-[var(--g-line)]"}`}
              strokeWidth={1.5}
            />
          </button>
        ))}
        {rating > 0 && <span className="anim-fade-in ml-2 text-sm font-medium text-[var(--g-muted)]">{RATING_WORDS[rating]}</span>}
      </div>

      {rating > 0 && (
        <div className="anim-rise flex flex-col gap-4">
          {items.length > 0 && (
            <ul aria-label="Rate each item (optional)" className="flex flex-col divide-y divide-[var(--g-line)] border-y border-[var(--g-line)]">
              {items.map((item) => (
                <li key={item.itemId} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm">{item.name}</span>
                  {[true, false].map((value) => {
                    const Icon = value ? ThumbsUp : ThumbsDown;
                    const on = liked[item.itemId] === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${value ? "Liked" : "Didn't like"} ${item.name}`}
                        onClick={() =>
                          setLiked((current) => {
                            const next = { ...current };
                            if (on) delete next[item.itemId];
                            else next[item.itemId] = value;
                            return next;
                          })
                        }
                        className={`grid size-10 place-items-center rounded-full transition-colors ${
                          on ? (value ? "bg-[var(--g-sage)] text-white" : "bg-[var(--g-accent)] text-white") : "text-[var(--g-muted)] hover:bg-[var(--g-soft)]"
                        }`}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{rating <= 2 ? "What went wrong? We'll fix it right away." : "Anything to add? (optional)"}</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              rows={3}
              className="rounded border border-[var(--g-line)] bg-[var(--g-raised)] px-3 py-2 text-sm"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-[var(--g-danger)]">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={state === "sending"}
            className="flex h-12 items-center justify-center gap-2 rounded bg-[var(--brand)] font-semibold text-[var(--brand-fg)] transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {state === "sending" && <LoaderCircle className="size-5 animate-spin" />}
            {state === "sending" ? "Sending…" : "Send feedback"}
          </button>
        </div>
      )}
    </section>
  );
}

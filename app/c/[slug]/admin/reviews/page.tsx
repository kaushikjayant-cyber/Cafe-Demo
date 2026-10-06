import { Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/admin/admin-shell";
import { ReviewHideButton } from "@/components/admin/review-hide-button";
import { requireStaff } from "@/lib/staff-auth";
import { createUserClient } from "@/lib/supabase/server";
import { tenantHref } from "@/lib/tenant";

export const metadata: Metadata = { title: "Reviews" };

const FILTERS = { all: "All", low: "2★ and below", comments: "With comments", hidden: "Hidden" } as const;
type Filter = keyof typeof FILTERS;

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  is_hidden: boolean;
  created_at: string;
  handled_at: string | null;
  orders: { daily_no: number; tables: { label: string } | null } | null;
  review_items: { liked: boolean; menu_items: { name: string } | null }[];
}

/** Request time, read once per request (outside render purity rules). */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function ReviewsPage({ params, searchParams }: PageProps<"/c/[slug]/admin/reviews">) {
  const { slug } = await params;
  const { cafe, base } = await requireStaff(slug, ["owner", "manager"], "/admin/reviews");
  const raw = (await searchParams).filter;
  const filter: Filter = typeof raw === "string" && raw in FILTERS ? (raw as Filter) : "all";
  const since = daysAgo(30);
  const supabase = await createUserClient();

  let list = supabase
    .from("reviews")
    .select("id, rating, comment, is_hidden, created_at, handled_at, orders(daily_no, tables(label)), review_items(liked, menu_items(name))")
    .eq("cafe_id", cafe.id)
    .eq("is_hidden", filter === "hidden")
    .order("created_at", { ascending: false })
    .limit(50);
  if (filter === "low") list = list.lte("rating", 2);
  if (filter === "comments") list = list.not("comment", "is", null);

  // Averages include hidden reviews: hiding is for abuse, not for improving the score.
  const [reviews, recent, thumbs] = await Promise.all([
    list.returns<ReviewRow[]>(),
    supabase.from("reviews").select("rating").eq("cafe_id", cafe.id).gte("created_at", since),
    supabase
      .from("review_items")
      .select("item_id, liked, menu_items(name), reviews!inner(created_at)")
      .eq("cafe_id", cafe.id)
      .gte("reviews.created_at", since)
      .returns<{ item_id: string; liked: boolean; menu_items: { name: string } | null }[]>(),
  ]);
  if (reviews.error) throw reviews.error;
  if (recent.error) throw recent.error;

  const ratings = recent.data.map((r) => r.rating);
  const average = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const histogram = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: ratings.filter((r) => r === stars).length }));
  const maxCount = Math.max(1, ...histogram.map((h) => h.count));

  const byItem = new Map<string, { name: string; up: number; down: number }>();
  for (const t of thumbs.data ?? []) {
    const entry = byItem.get(t.item_id) ?? { name: t.menu_items?.name ?? "Removed item", up: 0, down: 0 };
    if (t.liked) entry.up++;
    else entry.down++;
    byItem.set(t.item_id, entry);
  }
  const share = (i: { up: number; down: number }, n: number) => n / (i.up + i.down);
  const scored = [...byItem.values()].filter((i) => i.up + i.down >= 3);
  const loved = [...scored].sort((a, b) => share(b, b.up) - share(a, a.up) || b.up - a.up).slice(0, 5);
  const disliked = scored.filter((i) => i.down > 0).sort((a, b) => share(b, b.down) - share(a, a.down) || b.down - a.down).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Reviews"
        description={
          cafe.google_review_url
            ? "Guests rate their order from their phone. Everyone is offered your Google review link afterwards."
            : "Guests rate their order from their phone. Add your Google review link in Settings to send them there too."
        }
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-5">
          <p className="label-caps text-[var(--g-muted)]">Last 30 days</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-heading text-5xl leading-none">{average === null ? "–" : average.toFixed(1)}</span>
            <span className="pb-1 text-sm text-[var(--g-muted)]">
              from {ratings.length} review{ratings.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-4 flex flex-col gap-1.5">
            {histogram.map(({ stars, count }) => (
              <li key={stars} className="flex items-center gap-2 text-sm">
                <span className="w-6 tabular-nums">{stars}★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--g-soft)]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(count / maxCount) * 100}%`, background: stars <= 2 ? "var(--g-accent)" : stars === 3 ? "#a8a29e" : "var(--g-sage)" }}
                  />
                </span>
                <span className="w-10 text-right text-[var(--g-muted)] tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-5 sm:grid-cols-2">
          <ItemList title="Most loved" empty="Not enough ratings yet." items={loved.map((i) => ({ name: i.name, value: `${Math.round(share(i, i.up) * 100)}% 👍`, good: true }))} />
          <ItemList title="Needs a look" empty="No complaints about any item." items={disliked.map((i) => ({ name: i.name, value: `${i.down} 👎`, good: false }))} />
        </section>
      </div>

      <nav aria-label="Filter reviews" className="flex flex-wrap gap-2">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={`${tenantHref(base, "/admin/reviews")}${key === "all" ? "" : `?filter=${key}`}`}
            aria-current={filter === key ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === key ? "bg-[var(--g-accent)] text-white" : "border border-[var(--g-line)] text-[var(--g-muted)] hover:text-[var(--g-ink)]"
            }`}
          >
            {FILTERS[key]}
          </Link>
        ))}
      </nav>

      {reviews.data.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--g-line)] px-4 py-12 text-center text-sm text-[var(--g-muted)]">No reviews here yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.data.map((review) => (
            <li key={review.id} className={`rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] p-4 ${review.is_hidden ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`flex items-center gap-0.5 ${review.rating <= 2 ? "text-[var(--g-accent)]" : "text-[var(--g-ink)]"}`} aria-label={`${review.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={`size-4 ${i < review.rating ? "fill-current" : "text-[var(--g-line)]"}`} />
                  ))}
                </span>
                <span className="text-sm text-[var(--g-muted)]">
                  {review.orders?.tables?.label ?? "Counter"} · #{review.orders?.daily_no} · {when.format(new Date(review.created_at))}
                </span>
                {review.rating <= 2 && (
                  <span
                    className={`label-caps rounded-full px-2 py-0.5 ${
                      review.handled_at ? "bg-[var(--g-soft)] text-[var(--g-muted)]" : "bg-[color-mix(in_srgb,var(--g-accent)_12%,transparent)] text-[var(--g-accent)]"
                    }`}
                  >
                    {review.handled_at ? "Handled" : "Not handled"}
                  </span>
                )}
                {review.is_hidden && <span className="label-caps rounded-full bg-[var(--g-soft)] px-2 py-0.5 text-[var(--g-muted)]">Hidden</span>}
                <span className="ml-auto">
                  <ReviewHideButton tenantKey={slug} reviewId={review.id} hidden={review.is_hidden} />
                </span>
              </div>
              {review.comment && <p className="mt-2 font-heading text-lg leading-snug italic">“{review.comment}”</p>}
              {review.review_items.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {review.review_items.map((t, i) => (
                    <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${t.liked ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                      {t.liked ? "👍" : "👎"} {t.menu_items?.name ?? "Removed item"}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ItemList({ title, empty, items }: { title: string; empty: string; items: { name: string; value: string; good: boolean }[] }) {
  return (
    <div>
      <h2 className="font-heading text-lg">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--g-muted)]">{empty}</p>
      ) : (
        <ol className="mt-2 flex flex-col divide-y divide-[var(--g-line)]">
          {items.map((item) => (
            <li key={item.name} className="flex justify-between gap-2 py-1.5 text-sm">
              <span className="truncate">{item.name}</span>
              <span className={`shrink-0 tabular-nums ${item.good ? "text-[var(--g-sage)]" : "text-[var(--g-accent)]"}`}>{item.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

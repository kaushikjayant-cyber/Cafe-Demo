// In-memory sliding-window rate limits [D-23]. Correct while the app runs as a single
// Render instance; move to Postgres or Upstash before scaling out to more instances.

export interface Limit {
  max: number;
  windowMs: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Records a hit and returns whether it is within the limit. */
  allow(key: string, { max, windowMs }: Limit): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(windowMs);
    return true;
  }

  private sweep(windowMs: number): void {
    const now = this.now();
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= windowMs)) this.hits.delete(key);
    }
  }
}

export const LIMITS = {
  ordersPerGuest: { max: 5, windowMs: 10 * 60_000 },
  ordersPerTable: { max: 20, windowMs: 10 * 60_000 },
  serviceRequestPerTable: { max: 1, windowMs: 2 * 60_000 },
} satisfies Record<string, Limit>;

export const rateLimiter = new RateLimiter();

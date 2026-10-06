import { describe, expect, it } from "vitest";

import { contrastRatio, foregroundFor } from "@/lib/color";
import { isOpenAt } from "@/lib/hours";
import { orderingBlockedReason, type GuestCafe, type GuestTable } from "@/lib/menu-types";
import { RateLimiter } from "@/lib/rate-limit";

const IST = "Asia/Kolkata";
// 2026-10-05 is a Monday. 14:30 UTC = 20:00 IST.
const at = (iso: string) => new Date(iso);

describe("isOpenAt", () => {
  const hours = { mon: [["08:00", "23:00"]], fri: [["08:00", "02:00"]] } as const;

  it("is always open when no hours are set", () => {
    expect(isOpenAt(null, new Date(), IST)).toBe(true);
  });

  it("checks the cafe's local time, not UTC", () => {
    expect(isOpenAt({ ...hours }, at("2026-10-05T14:30:00Z"), IST)).toBe(true); // Mon 20:00
    expect(isOpenAt({ ...hours }, at("2026-10-05T18:00:00Z"), IST)).toBe(false); // Mon 23:30
    expect(isOpenAt({ ...hours }, at("2026-10-05T02:00:00Z"), IST)).toBe(false); // Mon 07:30
  });

  it("treats a missing day as closed", () => {
    expect(isOpenAt({ ...hours }, at("2026-10-06T08:00:00Z"), IST)).toBe(false); // Tue
  });

  it("handles late-night ranges that run past midnight", () => {
    expect(isOpenAt({ ...hours }, at("2026-10-09T19:30:00Z"), IST)).toBe(true); // Sat 01:00, from Fri
    expect(isOpenAt({ ...hours }, at("2026-10-09T21:00:00Z"), IST)).toBe(false); // Sat 02:30
  });
});

describe("foregroundFor", () => {
  it("picks readable text for light and dark brand colours", () => {
    expect(foregroundFor("#0E7A63")).toBe("#ffffff");
    expect(foregroundFor("#F5C518")).toBe("#111111");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});

describe("orderingBlockedReason", () => {
  const cafe: GuestCafe = {
    id: "c", slug: "demo", name: "Demo", logoUrl: null, brandColor: "#0E7A63", timezone: IST, gstMode: "regular",
    taxRateBp: 500, pricesIncludeTax: true, allowPayAtCounter: true, onlinePayments: true, orderingPaused: false, pauseMessage: null,
    isOpen: true, status: "active", isDemo: false, googleReviewUrl: null,
  };
  const table: GuestTable = { id: "t", label: "T1", token: "bbtable001", isActive: true };

  it("allows ordering normally", () => {
    expect(orderingBlockedReason(cafe, table)).toBeNull();
  });

  it("explains each reason ordering is off", () => {
    expect(orderingBlockedReason({ ...cafe, status: "suspended" }, table)).toMatch(/order at the counter/);
    expect(orderingBlockedReason(cafe, { ...table, isActive: false })).toMatch(/table/);
    expect(orderingBlockedReason({ ...cafe, isOpen: false }, table)).toMatch(/closed/);
    expect(orderingBlockedReason({ ...cafe, orderingPaused: true, pauseMessage: "Back in 10" }, table)).toBe("Back in 10");
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit, then recovers after the window", () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    const limit = { max: 2, windowMs: 1000 };
    expect(limiter.allow("k", limit)).toBe(true);
    expect(limiter.allow("k", limit)).toBe(true);
    expect(limiter.allow("k", limit)).toBe(false);
    expect(limiter.allow("other", limit)).toBe(true);
    now = 1001;
    expect(limiter.allow("k", limit)).toBe(true);
  });
});

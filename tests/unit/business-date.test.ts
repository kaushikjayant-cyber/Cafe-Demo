import { describe, expect, it } from "vitest";

import { businessDate, fyCode, localDate } from "@/lib/business-date";

const IST = "Asia/Kolkata";

describe("businessDate", () => {
  it("uses the cafe's local date, not UTC", () => {
    // 2026-10-03 20:00 UTC = 2026-10-04 01:30 IST
    expect(localDate(new Date("2026-10-03T20:00:00Z"), IST)).toBe("2026-10-04");
  });

  it("counts orders before the day starts as the previous trading day", () => {
    // 01:30 IST on the 4th, day starts at 04:00 → still the 3rd
    expect(businessDate(new Date("2026-10-03T20:00:00Z"), IST, "04:00")).toBe("2026-10-03");
    // 04:00 IST exactly → the 4th
    expect(businessDate(new Date("2026-10-03T22:30:00Z"), IST, "04:00")).toBe("2026-10-04");
  });

  it("with a midnight day start, matches the calendar date", () => {
    expect(businessDate(new Date("2026-10-03T18:29:00Z"), IST, "00:00")).toBe("2026-10-03");
    expect(businessDate(new Date("2026-10-03T18:30:00Z"), IST, "00:00")).toBe("2026-10-04");
  });

  it("rejects malformed times", () => {
    expect(() => businessDate(new Date(), IST, "4am")).toThrow();
    expect(() => businessDate(new Date(), IST, "25:00")).toThrow();
  });
});

describe("fyCode", () => {
  it("rolls over on 1 April", () => {
    expect(fyCode("2026-10-03")).toBe("2627");
    expect(fyCode("2027-03-31")).toBe("2627");
    expect(fyCode("2027-04-01")).toBe("2728");
    expect(fyCode("2099-12-31")).toBe("9900");
  });
});

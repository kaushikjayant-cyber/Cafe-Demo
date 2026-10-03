import { describe, expect, it } from "vitest";

import { formatINRShort, paiseToInput, percentChange, rupeesToPaise, shortDate } from "@/lib/format";
import { isTemporaryOrigin } from "@/lib/qr-origin";

describe("formatINRShort", () => {
  it("uses lakh and crore like Indian owners do", () => {
    expect(formatINRShort(4520000)).toBe("₹45,200");
    expect(formatINRShort(91140000)).toBe("₹9.11 L");
    expect(formatINRShort(10000000)).toBe("₹1 L");
    expect(formatINRShort(1240000000)).toBe("₹1.24 Cr");
    expect(formatINRShort(-250000)).toBe("-₹2,500");
  });
});

describe("percentChange", () => {
  it("rounds, and says nothing when there's no baseline", () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(92, 100)).toBe(-8);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe("price input", () => {
  it("accepts what owners type", () => {
    expect(rupeesToPaise("190")).toBe(19000);
    expect(rupeesToPaise("190.5")).toBe(19050);
    expect(rupeesToPaise("₹1,190.50")).toBe(119050);
    expect(rupeesToPaise("-10")).toBe(-1000);
  });

  it("rejects what isn't a price", () => {
    for (const bad of ["", "abc", "1.999", "12a", "9999999"]) expect(rupeesToPaise(bad), bad).toBeNull();
  });

  it("round-trips for the edit form", () => {
    expect(paiseToInput(19000)).toBe("190");
    expect(paiseToInput(19050)).toBe("190.50");
  });
});

describe("shortDate", () => {
  it("formats a calendar date without shifting it across timezones", () => {
    expect(shortDate("2026-10-03")).toMatch(/^3 Oct/);
  });
});

describe("printed QR safety (R21)", () => {
  it("flags addresses that won't survive moving to the cafe's own domain", () => {
    expect(isTemporaryOrigin("http://localhost:3000")).toBe(true);
    expect(isTemporaryOrigin("https://cafe-platform.onrender.com")).toBe(true);
    expect(isTemporaryOrigin("http://192.168.1.20:3000")).toBe(true);
    expect(isTemporaryOrigin("https://bluebean.cafeqr.in")).toBe(false);
  });
});

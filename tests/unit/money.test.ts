import { describe, expect, it } from "vitest";

import { computeBill, formatINR, lineTotal, roundDiv } from "@/lib/money";

describe("roundDiv", () => {
  it("rounds half up", () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(4, 2)).toBe(2);
    expect(roundDiv(149, 100)).toBe(1);
    expect(roundDiv(150, 100)).toBe(2);
  });

  it("rejects bad input", () => {
    expect(() => roundDiv(-1, 2)).toThrow();
    expect(() => roundDiv(1, 0)).toThrow();
    expect(() => roundDiv(1.5, 2)).toThrow();
  });
});

describe("lineTotal", () => {
  it("adds option deltas then multiplies by quantity", () => {
    // Latte ₹190 + Large ₹40 + Oat ₹50, x2
    expect(lineTotal({ unitPricePaise: 19000, optionDeltasPaise: [4000, 5000], qty: 2 })).toBe(56000);
  });

  it("allows a negative option as long as the unit stays non-negative", () => {
    expect(lineTotal({ unitPricePaise: 10000, optionDeltasPaise: [-2000], qty: 1 })).toBe(8000);
    expect(() => lineTotal({ unitPricePaise: 1000, optionDeltasPaise: [-2000], qty: 1 })).toThrow();
  });

  it("rejects zero, fractional and fractional-paise quantities", () => {
    expect(() => lineTotal({ unitPricePaise: 100, qty: 0 })).toThrow();
    expect(() => lineTotal({ unitPricePaise: 100, qty: 1.5 })).toThrow();
    expect(() => lineTotal({ unitPricePaise: 100.5, qty: 1 })).toThrow();
  });
});

describe("computeBill: prices include tax (Indian menu default)", () => {
  it("backs GST out of a whole-rupee total with no round off", () => {
    // ₹190 + ₹140 = ₹330 incl. 5% GST → taxable 314.29, GST 15.71
    const bill = computeBill({
      lines: [
        { unitPricePaise: 19000, qty: 1 },
        { unitPricePaise: 14000, qty: 1 },
      ],
      taxRateBp: 500,
      pricesIncludeTax: true,
      gstMode: "regular",
    });
    expect(bill).toMatchObject({
      subtotalPaise: 33000,
      taxablePaise: 31429,
      taxPaise: 1571,
      cgstPaise: 785,
      sgstPaise: 786,
      roundOffPaise: 0,
      totalPaise: 33000,
    });
    expect(bill.taxablePaise + bill.taxPaise).toBe(bill.subtotalPaise);
  });

  it("rounds a paise-level menu to the nearest rupee", () => {
    const bill = computeBill({
      lines: [{ unitPricePaise: 19950, qty: 1 }],
      taxRateBp: 500,
      pricesIncludeTax: true,
      gstMode: "regular",
    });
    expect(bill.totalPaise).toBe(20000);
    expect(bill.roundOffPaise).toBe(50);
  });
});

describe("computeBill: prices exclude tax", () => {
  it("adds GST on top and shows a round off line", () => {
    // ₹250 + 5% = ₹262.50 → ₹263, round off +0.50
    const bill = computeBill({
      lines: [{ unitPricePaise: 25000, qty: 1 }],
      taxRateBp: 500,
      pricesIncludeTax: false,
      gstMode: "regular",
    });
    expect(bill).toMatchObject({ taxablePaise: 25000, taxPaise: 1250, roundOffPaise: 50, totalPaise: 26300 });
  });

  it("can round down", () => {
    // ₹209 + 5% = ₹219.45 → ₹219, round off -0.45
    const bill = computeBill({
      lines: [{ unitPricePaise: 20900, qty: 1 }],
      taxRateBp: 500,
      pricesIncludeTax: false,
      gstMode: "regular",
    });
    expect(bill.totalPaise).toBe(21900);
    expect(bill.roundOffPaise).toBe(-45);
  });
});

describe("computeBill: no GST (unregistered or composition cafe)", () => {
  it("never charges tax, whatever the rate setting", () => {
    const bill = computeBill({
      lines: [{ unitPricePaise: 25000, qty: 2 }],
      taxRateBp: 500,
      pricesIncludeTax: false,
      gstMode: "none",
    });
    expect(bill).toMatchObject({ taxPaise: 0, cgstPaise: 0, sgstPaise: 0, taxablePaise: 50000, totalPaise: 50000 });
  });
});

describe("computeBill: edge cases", () => {
  it("handles an empty bill", () => {
    const bill = computeBill({ lines: [], taxRateBp: 500, pricesIncludeTax: true, gstMode: "regular" });
    expect(bill.totalPaise).toBe(0);
  });

  it("handles a zero tax rate", () => {
    const bill = computeBill({
      lines: [{ unitPricePaise: 12345, qty: 1 }],
      taxRateBp: 0,
      pricesIncludeTax: false,
      gstMode: "regular",
    });
    expect(bill.taxPaise).toBe(0);
    expect(bill.totalPaise).toBe(12300);
  });

  it("CGST and SGST always add up to the tax", () => {
    for (let paise = 100; paise < 50000; paise += 137) {
      const bill = computeBill({
        lines: [{ unitPricePaise: paise, qty: 3 }],
        taxRateBp: 500,
        pricesIncludeTax: true,
        gstMode: "regular",
      });
      expect(bill.cgstPaise + bill.sgstPaise).toBe(bill.taxPaise);
      expect(Math.abs(bill.roundOffPaise)).toBeLessThanOrEqual(50);
    }
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(12345600)).toBe("₹1,23,456");
    expect(formatINR(19050)).toBe("₹190.50");
    expect(formatINR(0)).toBe("₹0");
  });
});

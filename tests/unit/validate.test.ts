import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MenuItem } from "@/lib/menu-types";
import { placeOrderSchema, priceCart, type CartLineInput } from "@/lib/orders/validate";

const id = () => randomUUID();
const size = { regular: id(), large: id() };
const milk = { regular: id(), oat: id() };
const extras = { shot: id(), syrup: id(), cream: id() };

const latte: MenuItem = {
  id: id(),
  categoryId: id(),
  name: "Café Latte",
  description: null,
  pricePaise: 19000,
  imageUrl: null,
  diet: "veg",
  tags: [],
  isAvailable: true,
  soldOutUntil: null,
  groups: [
    {
      id: id(),
      name: "Size",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: size.regular, name: "Regular", priceDeltaPaise: 0, available: true },
        { id: size.large, name: "Large", priceDeltaPaise: 4000, available: true },
      ],
    },
    {
      id: id(),
      name: "Milk",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: milk.regular, name: "Regular milk", priceDeltaPaise: 0, available: true },
        { id: milk.oat, name: "Oat milk", priceDeltaPaise: 5000, available: false },
      ],
    },
    {
      id: id(),
      name: "Extras",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: extras.shot, name: "Extra shot", priceDeltaPaise: 4000, available: true },
        { id: extras.syrup, name: "Hazelnut syrup", priceDeltaPaise: 3000, available: true },
        { id: extras.cream, name: "Whipped cream", priceDeltaPaise: 3000, available: true },
      ],
    },
  ],
};

const brownie: MenuItem = { ...latte, id: id(), name: "Brownie", pricePaise: 14000, groups: [] };
const soldOut: MenuItem = { ...brownie, id: id(), name: "Cheesecake", isAvailable: false };
const menu = [latte, brownie, soldOut];

const line = (overrides: Partial<CartLineInput>): CartLineInput => ({
  itemId: latte.id,
  optionIds: [size.regular, milk.regular],
  qty: 1,
  unitPricePaise: 19000,
  ...overrides,
});

describe("priceCart", () => {
  it("prices a valid cart from the menu, with option snapshots", () => {
    const result = priceCart(
      [
        line({ optionIds: [size.large, milk.regular, extras.shot], unitPricePaise: 27000, qty: 2, note: "extra hot" }),
        line({ itemId: brownie.id, optionIds: [], unitPricePaise: 14000 }),
      ],
      menu,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0]).toMatchObject({ unitPricePaise: 27000, lineTotalPaise: 54000, note: "extra hot" });
    expect(result.lines[0].options.map((o) => o.name)).toEqual(["Large", "Regular milk", "Extra shot"]);
    expect(result.lines[1]).toMatchObject({ unitPricePaise: 14000, lineTotalPaise: 14000, note: null });
  });

  it("reports a price change with the new price instead of charging it silently", () => {
    const result = priceCart([line({ unitPricePaise: 18000 })], menu);
    expect(result).toEqual({
      ok: false,
      problems: [{ code: "PRICE_CHANGED", lineIndex: 0, itemId: latte.id, name: "Café Latte", unitPricePaise: 19000 }],
    });
  });

  it("rejects sold-out and unknown items", () => {
    const result = priceCart([line({ itemId: soldOut.id, optionIds: [], unitPricePaise: 14000 }), line({ itemId: id(), optionIds: [] })], menu);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.code)).toEqual(["ITEM_UNAVAILABLE", "ITEM_UNAVAILABLE"]);
  });

  it("treats an item whose 'sold out for today' window has passed as available", () => {
    const back: MenuItem = { ...brownie, isAvailable: false, soldOutUntil: "2026-10-03T22:30:00Z" };
    const lines = [line({ itemId: back.id, optionIds: [], unitPricePaise: 14000 })];
    expect(priceCart(lines, [back], new Date("2026-10-03T22:00:00Z")).ok).toBe(false);
    expect(priceCart(lines, [back], new Date("2026-10-03T22:31:00Z")).ok).toBe(true);
  });

  it("rejects a sold-out option", () => {
    const result = priceCart([line({ optionIds: [size.regular, milk.oat], unitPricePaise: 24000 })], menu);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toMatchObject({ code: "OPTION_UNAVAILABLE", option: "Oat milk" });
  });

  it("enforces required groups and maximum choices", () => {
    const missingSize = priceCart([line({ optionIds: [milk.regular] })], menu);
    const twoSizes = priceCart([line({ optionIds: [size.regular, size.large, milk.regular], unitPricePaise: 23000 })], menu);
    const threeExtras = priceCart(
      [line({ optionIds: [size.regular, milk.regular, extras.shot, extras.syrup, extras.cream], unitPricePaise: 29000 })],
      menu,
    );
    for (const result of [missingSize, twoSizes, threeExtras]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problems[0].code).toBe("INVALID_OPTIONS");
    }
  });

  it("rejects options from another item and duplicated options", () => {
    const foreign = priceCart([line({ itemId: brownie.id, optionIds: [extras.shot], unitPricePaise: 18000 })], menu);
    const duplicate = priceCart([line({ optionIds: [size.regular, milk.regular, extras.shot, extras.shot], unitPricePaise: 27000 })], menu);
    for (const result of [foreign, duplicate]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problems[0].code).toBe("INVALID_OPTIONS");
    }
  });
});

describe("placeOrderSchema", () => {
  const valid = {
    tableToken: "bbtable001",
    lines: [line({})],
    payChoice: "counter",
    idempotencyKey: randomUUID(),
  };

  it("accepts a normal order", () => {
    expect(placeOrderSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown fields, so a client can't send its own total", () => {
    expect(placeOrderSchema.safeParse({ ...valid, totalPaise: 1 }).success).toBe(false);
  });

  it("rejects empty carts, silly quantities and bad tokens", () => {
    expect(placeOrderSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid, lines: [line({ qty: 0 })] }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid, lines: [line({ qty: 500 })] }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...valid, tableToken: "../../etc" }).success).toBe(false);
  });
});

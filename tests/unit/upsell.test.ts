import { describe, expect, it } from "vitest";

import type { MenuItem } from "@/lib/menu-types";
import { cartSuggestion, goesWellWith } from "@/lib/upsell";

const item = (id: string, pairs: string[] = [], over: Partial<MenuItem> = {}): MenuItem => ({
  id, categoryId: "c", name: id, description: null, pricePaise: 10000, imageUrl: null, diet: "veg", tags: [],
  isAvailable: true, soldOutUntil: null, groups: [], pairs, ...over,
});

describe("cartSuggestion", () => {
  const menu = [
    item("latte", ["brownie", "cookie"]),
    item("sandwich", ["cold-coffee"]),
    item("brownie"),
    item("cookie"),
    item("cold-coffee", [], { isAvailable: false }),
  ];

  it("suggests a pairing of the newest cart item that isn't already in the cart", () => {
    expect(cartSuggestion(["latte"], menu)?.id).toBe("brownie");
    expect(cartSuggestion(["latte", "brownie"], menu)?.id).toBe("cookie");
  });

  it("skips sold-out pairings and falls back to older cart items", () => {
    expect(cartSuggestion(["latte", "sandwich"], menu)?.id).toBe("brownie");
    expect(cartSuggestion(["sandwich"], menu)).toBeNull();
  });

  it("lists only available pairings for the item sheet", () => {
    expect(goesWellWith(item("x", ["cold-coffee", "cookie", "gone"]), menu).map((i) => i.id)).toEqual(["cookie"]);
  });
});

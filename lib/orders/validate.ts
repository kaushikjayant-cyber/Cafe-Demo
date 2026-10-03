// Prices a guest's cart against the current menu [D-22]. Pure, so every rejection path is
// unit-tested. The server never trusts prices from the browser; the browser's prices are
// only used to detect "the price changed while it was in your cart" (R2).

import { z } from "zod";

import { itemIsAvailable, type MenuItem } from "@/lib/menu-types";
import { lineTotal } from "@/lib/money";

export const cartLineSchema = z.object({
  itemId: z.uuid(),
  optionIds: z.array(z.uuid()).max(20),
  qty: z.int().min(1).max(20),
  note: z.string().trim().max(140).optional(),
  /** What the guest saw, per unit including options. */
  unitPricePaise: z.int().min(0),
});

export const placeOrderSchema = z.strictObject({
  tableToken: z.string().regex(/^[a-z0-9]{10}$/),
  lines: z.array(cartLineSchema).min(1).max(30),
  note: z.string().trim().max(300).optional(),
  guestName: z.string().trim().max(40).optional(),
  payChoice: z.enum(["counter", "online"]),
  idempotencyKey: z.uuid(),
});

export type CartLineInput = z.infer<typeof cartLineSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export interface PricedLine {
  itemId: string;
  name: string;
  qty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  note: string | null;
  options: { group: string; name: string; priceDeltaPaise: number }[];
}

export type CartProblem =
  | { code: "ITEM_UNAVAILABLE"; lineIndex: number; itemId: string; name: string }
  | { code: "OPTION_UNAVAILABLE"; lineIndex: number; itemId: string; name: string; option: string }
  | { code: "PRICE_CHANGED"; lineIndex: number; itemId: string; name: string; unitPricePaise: number }
  | { code: "INVALID_OPTIONS"; lineIndex: number; itemId: string; name: string; message: string };

export type PriceCartResult = { ok: true; lines: PricedLine[] } | { ok: false; problems: CartProblem[] };

export function priceCart(lines: CartLineInput[], menu: MenuItem[], now = new Date()): PriceCartResult {
  const byId = new Map(menu.map((item) => [item.id, item]));
  const problems: CartProblem[] = [];
  const priced: PricedLine[] = [];

  lines.forEach((line, lineIndex) => {
    const item = byId.get(line.itemId);
    if (!item || !itemIsAvailable(item, now)) {
      problems.push({ code: "ITEM_UNAVAILABLE", lineIndex, itemId: line.itemId, name: item?.name ?? "An item" });
      return;
    }

    const ref = { lineIndex, itemId: item.id, name: item.name };
    if (new Set(line.optionIds).size !== line.optionIds.length) {
      problems.push({ code: "INVALID_OPTIONS", ...ref, message: "An option was chosen twice." });
      return;
    }

    const chosen = new Set(line.optionIds);
    const options: PricedLine["options"] = [];
    let known = 0;
    for (const group of item.groups) {
      const picked = group.options.filter((o) => chosen.has(o.id));
      known += picked.length;
      if (picked.length < group.minSelect || picked.length > group.maxSelect) {
        const message =
          group.minSelect === group.maxSelect
            ? `Choose ${group.minSelect} for ${group.name}.`
            : `Choose ${group.minSelect}–${group.maxSelect} for ${group.name}.`;
        problems.push({ code: "INVALID_OPTIONS", ...ref, message });
        return;
      }
      for (const option of picked) {
        if (!option.available) {
          problems.push({ code: "OPTION_UNAVAILABLE", ...ref, option: option.name });
          return;
        }
        options.push({ group: group.name, name: option.name, priceDeltaPaise: option.priceDeltaPaise });
      }
    }
    if (known !== chosen.size) {
      problems.push({ code: "INVALID_OPTIONS", ...ref, message: "An option doesn't belong to this item." });
      return;
    }

    const unitPricePaise = lineTotal({
      unitPricePaise: item.pricePaise,
      optionDeltasPaise: options.map((o) => o.priceDeltaPaise),
      qty: 1,
    });
    if (unitPricePaise !== line.unitPricePaise) {
      problems.push({ code: "PRICE_CHANGED", ...ref, unitPricePaise });
      return;
    }

    priced.push({
      itemId: item.id,
      name: item.name,
      qty: line.qty,
      unitPricePaise,
      lineTotalPaise: unitPricePaise * line.qty,
      note: line.note || null,
      options,
    });
  });

  return problems.length ? { ok: false, problems } : { ok: true, lines: priced };
}

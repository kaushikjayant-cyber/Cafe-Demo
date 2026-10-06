import { itemIsAvailable, type MenuItem } from "@/lib/menu-types";

/**
 * The one cart suggestion (§5.10): the first pairing of the items in the cart that's on the
 * menu, available, and not already in the cart. Cart items are walked newest first, so the
 * suggestion follows what the guest just added.
 */
export function cartSuggestion(cartItemIds: string[], items: MenuItem[], now = new Date()): MenuItem | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const inCart = new Set(cartItemIds);
  for (const id of [...cartItemIds].reverse()) {
    for (const pairedId of byId.get(id)?.pairs ?? []) {
      const paired = byId.get(pairedId);
      if (paired && !inCart.has(paired.id) && itemIsAvailable(paired, now)) return paired;
    }
  }
  return null;
}

/** Items for the "Goes well with" row of one item: available ones only. */
export function goesWellWith(item: MenuItem, items: MenuItem[], now = new Date()): MenuItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return item.pairs.map((id) => byId.get(id)).filter((i): i is MenuItem => !!i && itemIsAvailable(i, now));
}

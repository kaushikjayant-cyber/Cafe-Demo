// Menu data as sent to guest pages. Server-only fields (plan, secrets, tokens of other
// tables) never appear here.

export type Diet = "veg" | "nonveg" | "egg" | "vegan";

export interface MenuOption {
  id: string;
  name: string;
  priceDeltaPaise: number;
  available: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  pricePaise: number;
  imageUrl: string | null;
  diet: Diet | null;
  tags: string[];
  isAvailable: boolean;
  soldOutUntil: string | null;
  groups: MenuOptionGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
}

export interface GuestCafe {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  timezone: string;
  gstMode: "none" | "regular";
  taxRateBp: number;
  pricesIncludeTax: boolean;
  allowPayAtCounter: boolean;
  orderingPaused: boolean;
  pauseMessage: string | null;
  isOpen: boolean;
  status: "trial" | "active" | "grace" | "suspended";
  isDemo: boolean;
}

export interface GuestTable {
  id: string;
  label: string;
  token: string;
  isActive: boolean;
}

export interface GuestMenu {
  cafe: GuestCafe;
  table: GuestTable;
  categories: MenuCategory[];
  items: MenuItem[];
}

/** Same rule as public.item_is_available() [D-14]. */
export function itemIsAvailable(item: Pick<MenuItem, "isAvailable" | "soldOutUntil">, now = new Date()): boolean {
  return item.isAvailable || (item.soldOutUntil !== null && now >= new Date(item.soldOutUntil));
}

/** Why a guest can't order right now, or null if they can. */
export function orderingBlockedReason(cafe: GuestCafe, table: GuestTable): string | null {
  if (cafe.status === "suspended") return "Online ordering is unavailable right now. Please order at the counter.";
  if (!table.isActive) return "This table isn't taking orders. Please ask a member of staff.";
  if (!cafe.isOpen) return "We're closed right now. You can still browse the menu.";
  if (cafe.orderingPaused) return cafe.pauseMessage || "We've paused new orders for a few minutes. Please check back shortly.";
  return null;
}

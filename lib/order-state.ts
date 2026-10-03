// Order state machine [D-19]. Must match public.order_transition_allowed() in
// supabase/migrations/*_functions.sql; tests/db/order-state.test.ts checks they agree.

export const ORDER_STATUSES = [
  "pending_payment",
  "placed",
  "accepted",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
  "rejected",
  "expired",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StaffRole = "owner" | "manager" | "cashier" | "kitchen";
export type ActorRole = StaffRole | "service";

const COUNTER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["placed", "accepted", "expired", "cancelled"],
  placed: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served"],
  served: ["completed"],
  completed: [],
  cancelled: [],
  rejected: [],
  expired: [],
};

const KITCHEN_TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  accepted: ["preparing", "ready"],
  preparing: ["ready"],
};

export function canTransition(from: OrderStatus, to: OrderStatus, role: ActorRole): boolean {
  const table = role === "kitchen" ? KITCHEN_TRANSITIONS : COUNTER_TRANSITIONS;
  return table[from]?.includes(to) ?? false;
}

export function isTerminal(status: OrderStatus): boolean {
  return COUNTER_TRANSITIONS[status].length === 0;
}

/** Statuses an order can be cancelled from (still being made). */
export const CANCELLABLE: OrderStatus[] = ["placed", "accepted", "preparing"];

/** Orders the counter board still needs to act on. */
export function isActive(status: OrderStatus): boolean {
  return status === "placed" || status === "accepted" || status === "preparing" || status === "ready";
}

// Realtime channel names shared by guest and staff pages.

/** Menu changes (postgres_changes) and cafe-status broadcasts for one cafe. */
export function cafeChannel(cafeId: string): string {
  return `cafe:${cafeId}`;
}

/** Broadcast when the counter pauses or resumes ordering, so open menus refresh. */
export const CAFE_STATUS_EVENT = "status";

import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { addStaff, as, createCafe, createOrder, createTestDb, createUser } from "./harness";

let db: PGlite;
let cafe: string;
let otherCafe: string;
let category: string;
const guest = randomUUID();
const stranger = randomUUID();
const cashier = randomUUID();
const manager = randomUUID();
const kitchen = randomUUID();
const otherOwner = randomUUID();

async function item(name: string, cafeId = cafe, categoryId = category): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.menu_items (cafe_id, category_id, name, price_paise) values ($1, $2, $3, 10000) returning id",
    [cafeId, categoryId, name],
  );
  return rows[0].id;
}

async function line(order: string, itemId: string, qty = 1, cafeId = cafe) {
  await db.query(
    "insert into public.order_items (order_id, cafe_id, item_id, name_snapshot, unit_price_paise, qty, line_total_paise) values ($1, $2, $3, 'x', 10000, $4, $5)",
    [order, cafeId, itemId, qty, 10000 * qty],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  cafe = await createCafe(db, "review-cafe");
  otherCafe = await createCafe(db, "review-other");
  for (const id of [guest, stranger, cashier, manager, kitchen, otherOwner]) await createUser(db, id);
  await addStaff(db, cafe, cashier, "cashier");
  await addStaff(db, cafe, manager, "manager");
  await addStaff(db, cafe, kitchen, "kitchen");
  await addStaff(db, otherCafe, otherOwner, "owner");
  category = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'Coffee') returning id", [cafe])).rows[0].id;
});

describe("submit_review", () => {
  const submit = (order: string, customer: string, rating: number, items: unknown[] = [], comment = "") =>
    as(db, { role: "service_role" }, async (tx) =>
      (await tx.query<{ id: string }>("select public.submit_review($1, $2, $3, $4, $5) as id", [order, customer, rating, comment, JSON.stringify(items)])).rows[0].id,
    );

  it("records one review per served order, with per-item thumbs for items in that order only", async () => {
    const latte = await item("Latte");
    const foreign = await item("Elsewhere");
    const order = await createOrder(db, cafe, { customerUid: guest, status: "served" });
    await line(order, latte);

    const id = await submit(order, guest, 2, [{ item_id: latte, liked: false }, { item_id: foreign, liked: true }], "  coffee was cold  ");
    const { rows } = await db.query<{ rating: number; comment: string }>("select rating, comment from public.reviews where id = $1", [id]);
    expect(rows[0]).toEqual({ rating: 2, comment: "coffee was cold" });
    const thumbs = await db.query<{ item_id: string; liked: boolean }>("select item_id, liked from public.review_items where review_id = $1", [id]);
    expect(thumbs.rows).toEqual([{ item_id: latte, liked: false }]);

    await expect(submit(order, guest, 5)).rejects.toThrow(/already_reviewed/);
  });

  it("only the phone that ordered, only once the order happened, and never from the browser", async () => {
    const placed = await createOrder(db, cafe, { customerUid: guest, status: "placed" });
    await expect(submit(placed, guest, 4)).rejects.toThrow(/not_reviewable/);

    const paidEarly = await createOrder(db, cafe, { customerUid: guest, status: "preparing", paymentStatus: "paid" });
    await expect(submit(paidEarly, guest, 4)).resolves.toBeTruthy();

    const served = await createOrder(db, cafe, { customerUid: guest, status: "served" });
    await expect(submit(served, stranger, 4)).rejects.toThrow(/order_not_found/);
    await expect(submit(served, guest, 6)).rejects.toThrow(/invalid_rating/);
    await expect(
      as(db, { role: "authenticated", uid: guest }, (tx) => tx.query("select public.submit_review($1, $2, 5, '', '[]')", [served, guest])),
    ).rejects.toThrow(/permission denied/);
  });

  it("staff of the cafe (not the kitchen, not other cafes) can mark a low rating as handled", async () => {
    const order = await createOrder(db, cafe, { customerUid: guest, status: "completed" });
    const id = await submit(order, guest, 1);
    const handle = (uid: string) => as(db, { role: "authenticated", uid }, (tx) => tx.query("select public.handle_review($1)", [id]));

    await expect(handle(kitchen)).rejects.toThrow(/forbidden/);
    await expect(handle(otherOwner)).rejects.toThrow(/forbidden/);
    await handle(cashier);
    const { rows } = await db.query<{ handled: boolean }>("select handled_at is not null as handled from public.reviews where id = $1", [id]);
    expect(rows[0].handled).toBe(true);
  });
});

describe("refresh_insights", () => {
  it("ranks best-sellers and pairs items bought together at least 5 times, ignoring orders that never happened", async () => {
    const cafeId = await createCafe(db, "insights-cafe");
    const cat = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'All') returning id", [cafeId])).rows[0].id;
    const [coffee, cookie, tea, cake] = [await item("Coffee", cafeId, cat), await item("Cookie", cafeId, cat), await item("Tea", cafeId, cat), await item("Cake", cafeId, cat)];

    for (let i = 0; i < 5; i++) {
      const order = await createOrder(db, cafeId, { status: "completed" });
      await line(order, coffee, 2, cafeId);
      await line(order, cookie, 1, cafeId);
    }
    for (let i = 0; i < 4; i++) {
      const order = await createOrder(db, cafeId, { status: "completed" });
      await line(order, tea, 1, cafeId);
      await line(order, cake, 1, cafeId);
    }
    // Cancelled orders don't count, so tea + cake stay below the threshold.
    const cancelled = await createOrder(db, cafeId, { status: "cancelled" });
    await line(cancelled, tea, 1, cafeId);
    await line(cancelled, cake, 1, cafeId);

    await as(db, { role: "service_role" }, (tx) => tx.query("select public.refresh_insights($1)", [cafeId]));

    const sold = await db.query<{ item_id: string; sold_30d: number }>("select item_id, sold_30d from public.item_insights where cafe_id = $1 order by sold_30d desc", [cafeId]);
    expect(sold.rows[0]).toEqual({ item_id: coffee, sold_30d: 10 });
    const pairs = await db.query<{ item_id: string; paired_item_id: string; together: number }>(
      "select item_id, paired_item_id, together from public.auto_pairings where cafe_id = $1 order by item_id",
      [cafeId],
    );
    expect(pairs.rows.map((p) => [p.item_id, p.paired_item_id, p.together]).sort()).toEqual(
      [
        [coffee, cookie, 5],
        [cookie, coffee, 5],
      ].sort(),
    );

    await expect(as(db, { role: "authenticated", uid: manager }, (tx) => tx.query("select public.refresh_insights()"))).rejects.toThrow(/permission denied/);
  });
});

describe("set_item_pairings", () => {
  it("replaces an item's manual pairings, for managers of that cafe only, at most 3", async () => {
    const [a, b, c, d, e] = [await item("A"), await item("B"), await item("C"), await item("D"), await item("E")];
    const set = (uid: string, ids: string[]) =>
      as(db, { role: "authenticated", uid }, (tx) => tx.query("select public.set_item_pairings($1, $2)", [a, ids]));

    await set(manager, [b, c]);
    await set(manager, [c, a, d]); // an item can't pair with itself
    const { rows } = await db.query<{ paired_item_id: string }>("select paired_item_id from public.item_pairings where item_id = $1 order by sort", [a]);
    expect(rows.map((r) => r.paired_item_id)).toEqual([c, d]);

    await expect(set(manager, [b, c, d, e])).rejects.toThrow(/too_many_pairings/);
    await expect(set(cashier, [b])).rejects.toThrow(/forbidden/);
    await expect(set(otherOwner, [b])).rejects.toThrow(/forbidden/);
  });
});

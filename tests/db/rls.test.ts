// Tenant isolation and guest access [D-04, D-06, D-21]. Each test states a rule from
// IMPLEMENTATION.md §3.2 / §6 and tries to break it.

import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { addStaff, as, createCafe, createOrder, createTestDb, createUser } from "./harness";

let db: PGlite;
let cafeA: string;
let cafeB: string;
const ownerA = randomUUID();
const cashierA = randomUUID();
const kitchenA = randomUUID();
const ownerB = randomUUID();
const guest1 = randomUUID();
const guest2 = randomUUID();
let orderGuest1: string;
let orderGuest2: string;
let orderB: string;

beforeAll(async () => {
  db = await createTestDb();
  cafeA = await createCafe(db, "cafe-a");
  cafeB = await createCafe(db, "cafe-b");
  for (const id of [ownerA, cashierA, kitchenA, ownerB]) await createUser(db, id);
  for (const id of [guest1, guest2]) await createUser(db, id, { anonymous: true });
  await addStaff(db, cafeA, ownerA, "owner");
  await addStaff(db, cafeA, cashierA, "cashier");
  await addStaff(db, cafeA, kitchenA, "kitchen");
  await addStaff(db, cafeB, ownerB, "owner");

  orderGuest1 = await createOrder(db, cafeA, { customerUid: guest1 });
  orderGuest2 = await createOrder(db, cafeA, { customerUid: guest2 });
  orderB = await createOrder(db, cafeB);
  await db.query(
    `insert into public.cafe_secrets (cafe_id, razorpay_key_id, razorpay_key_secret_enc) values ($1, 'rzp_test_x', 'v1:secret')`,
    [cafeA],
  );
});

const count = async (tx: { query: PGlite["query"] }, sql: string, params: unknown[] = []) =>
  Number((await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)).rows[0].n);

describe("orders", () => {
  it("staff see only their own cafe's orders", async () => {
    await as(db, { role: "authenticated", uid: ownerA }, async (tx) => {
      expect(await count(tx, "select id from public.orders")).toBe(2);
      expect(await count(tx, "select id from public.orders where id = $1", [orderB])).toBe(0);
    });
    await as(db, { role: "authenticated", uid: ownerB }, async (tx) => {
      expect(await count(tx, "select id from public.orders")).toBe(1);
    });
  });

  it("a guest sees only their own orders, never another guest's", async () => {
    await as(db, { role: "authenticated", uid: guest1 }, async (tx) => {
      expect(await count(tx, "select id from public.orders")).toBe(1);
      expect(await count(tx, "select id from public.orders where id = $1", [orderGuest2])).toBe(0);
    });
  });

  it("anonymous visitors without a session see no orders", async () => {
    await as(db, { role: "anon" }, async (tx) => {
      expect(await count(tx, "select id from public.orders")).toBe(0);
    });
  });

  it("guests cannot insert or update orders directly", async () => {
    await expect(
      as(db, { role: "authenticated", uid: guest1 }, (tx) =>
        tx.query(
          `insert into public.orders (cafe_id, business_date, daily_no, source, customer_uid, idempotency_key, status,
             subtotal_paise, tax_paise, total_paise, tax_rate_bp, prices_include_tax, gst_mode)
           values ($1, current_date, 999, 'qr', $2, gen_random_uuid(), 'placed', 1, 0, 1, 500, true, 'regular')`,
          [cafeA, guest1],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    const updated = await as(db, { role: "authenticated", uid: guest1 }, (tx) =>
      tx.query("update public.orders set total_paise = 0 where id = $1 returning id", [orderGuest1]),
    );
    expect(updated.rows).toHaveLength(0);
  });

  it("staff cannot rewrite orders directly either (only via transition_order)", async () => {
    const updated = await as(db, { role: "authenticated", uid: ownerA }, (tx) =>
      tx.query("update public.orders set total_paise = 0 where id = $1 returning id", [orderGuest1]),
    );
    expect(updated.rows).toHaveLength(0);
  });
});

describe("secrets and platform data", () => {
  it("nobody but the service role can read payment secrets", async () => {
    for (const uid of [ownerA, guest1]) {
      await as(db, { role: "authenticated", uid }, async (tx) => {
        expect(await count(tx, "select * from public.cafe_secrets")).toBe(0);
      });
    }
    await as(db, { role: "service_role" }, async (tx) => {
      expect(await count(tx, "select * from public.cafe_secrets")).toBe(1);
    });
  });

  it("guests cannot list cafes or table tokens", async () => {
    await as(db, { role: "authenticated", uid: guest1 }, async (tx) => {
      expect(await count(tx, "select id from public.cafes")).toBe(0);
      expect(await count(tx, "select id from public.tables")).toBe(0);
    });
  });
});

describe("cafe settings", () => {
  it("the owner can edit settings but not their plan, status or AMC date", async () => {
    await as(db, { role: "authenticated", uid: ownerA }, async (tx) => {
      const res = await tx.query("update public.cafes set name = 'Renamed' where id = $1 returning name", [cafeA]);
      expect(res.rows).toHaveLength(1);
    });
    await expect(
      as(db, { role: "authenticated", uid: ownerA }, (tx) =>
        tx.query("update public.cafes set plan = 'premium' where id = $1", [cafeA]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, { role: "authenticated", uid: ownerA }, (tx) =>
        tx.query("update public.cafes set status = 'active', amc_valid_until = '2099-01-01' where id = $1", [cafeA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("an owner cannot edit another cafe", async () => {
    const res = await as(db, { role: "authenticated", uid: ownerA }, (tx) =>
      tx.query("update public.cafes set name = 'Hijacked' where id = $1 returning id", [cafeB]),
    );
    expect(res.rows).toHaveLength(0);
  });

  it("a cashier cannot edit settings, but can pause ordering through the RPC", async () => {
    const res = await as(db, { role: "authenticated", uid: cashierA }, (tx) =>
      tx.query("update public.cafes set name = 'Cashier edit' where id = $1 returning id", [cafeA]),
    );
    expect(res.rows).toHaveLength(0);

    await as(db, { role: "authenticated", uid: cashierA }, (tx) =>
      tx.query("select public.set_ordering_paused($1, true, 'Kitchen is busy')", [cafeA]),
    );
    const { rows } = await db.query<{ ordering_paused: boolean }>("select ordering_paused from public.cafes where id = $1", [cafeA]);
    expect(rows[0].ordering_paused).toBe(true);

    await expect(
      as(db, { role: "authenticated", uid: cashierA }, (tx) =>
        tx.query("select public.set_ordering_paused($1, true, 'x')", [cafeB]),
      ),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("menu", () => {
  let categoryA: string;
  let visibleItem: string;
  let hiddenItem: string;

  beforeAll(async () => {
    categoryA = (
      await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'Coffee') returning id", [cafeA])
    ).rows[0].id;
    visibleItem = (
      await db.query<{ id: string }>(
        "insert into public.menu_items (cafe_id, category_id, name, price_paise) values ($1, $2, 'Latte', 19000) returning id",
        [cafeA, categoryA],
      )
    ).rows[0].id;
    hiddenItem = (
      await db.query<{ id: string }>(
        "insert into public.menu_items (cafe_id, category_id, name, price_paise, is_visible) values ($1, $2, 'Secret', 100, false) returning id",
        [cafeA, categoryA],
      )
    ).rows[0].id;
  });

  it("anyone can read the visible menu, but not hidden items", async () => {
    await as(db, { role: "anon" }, async (tx) => {
      expect(await count(tx, "select id from public.menu_items where id = $1", [visibleItem])).toBe(1);
      expect(await count(tx, "select id from public.menu_items where id = $1", [hiddenItem])).toBe(0);
    });
    await as(db, { role: "authenticated", uid: cashierA }, async (tx) => {
      expect(await count(tx, "select id from public.menu_items where id = $1", [hiddenItem])).toBe(1);
    });
  });

  it("only owners and managers edit prices", async () => {
    const byCashier = await as(db, { role: "authenticated", uid: cashierA }, (tx) =>
      tx.query("update public.menu_items set price_paise = 1 where id = $1 returning id", [visibleItem]),
    );
    expect(byCashier.rows).toHaveLength(0);

    const byOwnerB = await as(db, { role: "authenticated", uid: ownerB }, (tx) =>
      tx.query("update public.menu_items set price_paise = 1 where id = $1 returning id", [visibleItem]),
    );
    expect(byOwnerB.rows).toHaveLength(0);

    const byOwner = await as(db, { role: "authenticated", uid: ownerA }, (tx) =>
      tx.query("update public.menu_items set price_paise = 20000 where id = $1 returning id", [visibleItem]),
    );
    expect(byOwner.rows).toHaveLength(1);
  });

  it("any staff member, including the kitchen, can mark an item sold out", async () => {
    await as(db, { role: "authenticated", uid: kitchenA }, (tx) =>
      tx.query("select public.set_item_availability($1, false)", [visibleItem]),
    );
    const { rows } = await db.query<{ is_available: boolean }>("select is_available from public.menu_items where id = $1", [visibleItem]);
    expect(rows[0].is_available).toBe(false);

    await expect(
      as(db, { role: "authenticated", uid: ownerB }, (tx) => tx.query("select public.set_item_availability($1, true)", [visibleItem])),
    ).rejects.toThrow(/forbidden/);
    await expect(
      as(db, { role: "authenticated", uid: guest1 }, (tx) => tx.query("select public.set_item_availability($1, true)", [visibleItem])),
    ).rejects.toThrow(/forbidden/);
  });

  it("an owner cannot put an item into another cafe's category", async () => {
    await expect(
      as(db, { role: "authenticated", uid: ownerB }, (tx) =>
        tx.query("insert into public.menu_items (cafe_id, category_id, name, price_paise) values ($1, $2, 'Sneaky', 100)", [
          cafeB,
          categoryA,
        ]),
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("schema shape", () => {
  it("has one foreign key per table pair, so Supabase API embeds are unambiguous (PGRST201)", async () => {
    const { rows } = await db.query<{ pair: string }>(`
      select conrelid::regclass || ' -> ' || confrelid::regclass as pair
      from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
      group by 1 having count(*) > 1 order by 1`);
    // item_pairings legitimately points at two different menu items.
    expect(rows.map((r) => r.pair)).toEqual(["item_pairings -> menu_items"]);
  });
});

describe("internal functions", () => {
  it("browser roles cannot call the counters or the expiry job", async () => {
    for (const sql of [
      "select public.next_daily_no($1, current_date)",
      "select public.next_invoice_no($1, '2627')",
    ]) {
      await expect(as(db, { role: "authenticated", uid: ownerA }, (tx) => tx.query(sql, [cafeA]))).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      as(db, { role: "anon" }, (tx) => tx.query("select public.expire_stale_payments()")),
    ).rejects.toThrow(/permission denied/);
  });
});

import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, createUser } from "./harness";

let db: PGlite;
let cafeId: string;
let tableId: string;
let itemId: string;
const guest = randomUUID();

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  await createUser(db, guest, { anonymous: true });
  cafeId = (await db.query<{ id: string }>("select id from public.cafes where slug = 'demo'")).rows[0].id;
  tableId = (await db.query<{ id: string }>("select id from public.tables where token = 'bbtable001'")).rows[0].id;
  itemId = (await db.query<{ id: string }>("select id from public.menu_items where name = 'Chocolate Brownie'")).rows[0].id;
});

const payload = (key: string) => ({
  cafe_id: cafeId,
  table_id: tableId,
  source: "qr",
  customer_uid: guest,
  guest_name: "Asha",
  idempotency_key: key,
  status: "placed",
  payment_method: null,
  subtotal_paise: 28000,
  tax_paise: 1333,
  cgst_paise: 666,
  sgst_paise: 667,
  round_off_paise: 0,
  total_paise: 28000,
  note: "",
  lines: [
    { item_id: itemId, name: "Chocolate Brownie", unit_price_paise: 14000, qty: 2, options: [], line_total_paise: 28000, note: "warm please" },
  ],
});

type Placed = { order_id: string; daily_no: number; status: string; duplicate: boolean };

const place = (key: string) =>
  as(db, { role: "service_role" }, async (tx) => (await tx.query<{ r: Placed }>("select public.place_order($1) as r", [payload(key)])).rows[0].r);

describe("place_order", () => {
  it("stores the order and its items with the cafe's tax settings", async () => {
    const result = await place(randomUUID());
    expect(result).toMatchObject({ status: "placed", duplicate: false });
    expect(result.daily_no).toBeGreaterThan(0);

    const { rows } = await db.query<{ total_paise: number; tax_rate_bp: number; gst_mode: string; guest_name: string; placed_at: string | null; items: number; note: string }>(
      `select o.total_paise, o.tax_rate_bp, o.gst_mode, o.guest_name, o.placed_at,
              (select count(*)::int from public.order_items where order_id = o.id) as items,
              (select note from public.order_items where order_id = o.id) as note
       from public.orders o where o.id = $1`,
      [result.order_id],
    );
    expect(rows[0]).toMatchObject({ total_paise: 28000, tax_rate_bp: 500, gst_mode: "regular", guest_name: "Asha", items: 1, note: "warm please" });
    expect(rows[0].placed_at).not.toBeNull();
  });

  it("returns the first order for a retried idempotency key, without a duplicate", async () => {
    const key = randomUUID();
    const first = await place(key);
    const retry = await place(key);
    expect(retry).toEqual({ ...first, duplicate: true });
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.orders where idempotency_key = $1", [key]);
    expect(rows[0].n).toBe(1);
  });

  it("gives consecutive orders consecutive daily numbers", async () => {
    const a = await place(randomUUID());
    const b = await place(randomUUID());
    expect(b.daily_no).toBe(a.daily_no + 1);
  });

  it("the guest can read their order through RLS; browser roles can't call it", async () => {
    const { order_id } = await place(randomUUID());
    const seen = await as(db, { role: "authenticated", uid: guest }, (tx) =>
      tx.query("select id from public.orders where id = $1", [order_id]),
    );
    expect(seen.rows).toHaveLength(1);

    await expect(
      as(db, { role: "authenticated", uid: guest }, (tx) => tx.query("select public.place_order($1)", [payload(randomUUID())])),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses statuses the API never sends", async () => {
    await expect(
      as(db, { role: "service_role" }, (tx) =>
        tx.query("select public.place_order($1)", [{ ...payload(randomUUID()), status: "served" }]),
      ),
    ).rejects.toThrow(/invalid_status/);
  });

  it("the guest can cancel through the service role while the order is still 'placed'", async () => {
    const { order_id } = await place(randomUUID());
    const { rows } = await as(db, { role: "service_role" }, (tx) =>
      tx.query<{ status: string }>("select status from public.transition_order($1, 'placed', 'cancelled', 'Cancelled by guest')", [order_id]),
    );
    expect(rows[0].status).toBe("cancelled");
  });
});

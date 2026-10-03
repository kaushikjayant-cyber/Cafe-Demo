import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { businessDate, fyCode } from "@/lib/business-date";
import { canTransition, ORDER_STATUSES } from "@/lib/order-state";

import { addStaff, as, createCafe, createOrder, createTestDb, createUser } from "./harness";

let db: PGlite;
let cafe: string;
const cashier = randomUUID();
const kitchen = randomUUID();
const manager = randomUUID();
const outsider = randomUUID();

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  cafe = await createCafe(db, "fn-cafe");
  for (const id of [cashier, kitchen, manager, outsider]) await createUser(db, id);
  await addStaff(db, cafe, cashier, "cashier");
  await addStaff(db, cafe, kitchen, "kitchen");
  await addStaff(db, cafe, manager, "manager");
});

describe("order state machine parity", () => {
  it("SQL and TypeScript allow exactly the same transitions", async () => {
    for (const role of ["owner", "manager", "cashier", "kitchen", "service"] as const) {
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          const { rows } = await db.query<{ ok: boolean }>("select public.order_transition_allowed($1, $2, $3) as ok", [
            from,
            to,
            role,
          ]);
          expect(rows[0].ok, `${role}: ${from} → ${to}`).toBe(canTransition(from, to, role));
        }
      }
    }
  });
});

describe("transition_order", () => {
  it("moves an order and stamps the time", async () => {
    const order = await createOrder(db, cafe);
    const { rows } = await as(db, { role: "authenticated", uid: cashier }, (tx) =>
      tx.query<{ status: string; accepted_at: string | null }>(
        "select status, accepted_at from public.transition_order($1, 'placed', 'accepted')",
        [order],
      ),
    );
    expect(rows[0].status).toBe("accepted");
    expect(rows[0].accepted_at).not.toBeNull();
  });

  it("rejects a stale update when another device got there first", async () => {
    const order = await createOrder(db, cafe);
    await as(db, { role: "authenticated", uid: cashier }, (tx) =>
      tx.query("select public.transition_order($1, 'placed', 'accepted')", [order]),
    );
    await expect(
      as(db, { role: "authenticated", uid: cashier }, (tx) =>
        tx.query("select public.transition_order($1, 'placed', 'rejected')", [order]),
      ),
    ).rejects.toThrow(/stale_transition/);
  });

  it("stops the kitchen from accepting orders", async () => {
    const order = await createOrder(db, cafe);
    await expect(
      as(db, { role: "authenticated", uid: kitchen }, (tx) =>
        tx.query("select public.transition_order($1, 'placed', 'accepted')", [order]),
      ),
    ).rejects.toThrow(/transition_not_allowed/);
  });

  it("stops staff of other cafes", async () => {
    const order = await createOrder(db, cafe);
    await expect(
      as(db, { role: "authenticated", uid: outsider }, (tx) =>
        tx.query("select public.transition_order($1, 'placed', 'accepted')", [order]),
      ),
    ).rejects.toThrow(/forbidden/);
  });

  it("only a manager or owner can cancel a paid order", async () => {
    const order = await createOrder(db, cafe, { status: "accepted", paymentStatus: "paid" });
    await expect(
      as(db, { role: "authenticated", uid: cashier }, (tx) =>
        tx.query("select public.transition_order($1, 'accepted', 'cancelled', 'out of milk')", [order]),
      ),
    ).rejects.toThrow(/forbidden/);
    const { rows } = await as(db, { role: "authenticated", uid: manager }, (tx) =>
      tx.query<{ cancel_reason: string }>(
        "select cancel_reason from public.transition_order($1, 'accepted', 'cancelled', 'out of milk')",
        [order],
      ),
    );
    expect(rows[0].cancel_reason).toBe("out of milk");
  });
});

describe("counters", () => {
  it("daily numbers count up per cafe and day", async () => {
    const next = async (date: string) =>
      (await db.query<{ n: number }>("select public.next_daily_no($1, $2) as n", [cafe, date])).rows[0].n;
    expect(await next("2026-10-03")).toBe(1);
    expect(await next("2026-10-03")).toBe(2);
    expect(await next("2026-10-04")).toBe(1);
  });

  it("invoice numbers are gap-free, per financial year, and at most 16 characters", async () => {
    const next = async (fy: string) =>
      (await db.query<{ no: string }>("select public.next_invoice_no($1, $2) as no", [cafe, fy])).rows[0].no;
    expect(await next("2627")).toBe("INV/2627/000001");
    expect(await next("2627")).toBe("INV/2627/000002");
    expect(await next("2728")).toBe("INV/2728/000001");
    expect((await next("2627")).length).toBeLessThanOrEqual(16);
  });

  it("concurrent callers never get the same daily number", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.query<{ n: number }>("select public.next_daily_no($1, '2026-12-25') as n", [cafe]).then((r) => r.rows[0].n),
      ),
    );
    expect(new Set(numbers).size).toBe(20);
  });
});

describe("dates match TypeScript", () => {
  it("business_date agrees with lib/business-date across midnight and the day start", async () => {
    for (const iso of ["2026-10-03T18:29:00Z", "2026-10-03T20:00:00Z", "2026-10-03T22:29:00Z", "2026-10-03T22:30:00Z"]) {
      const { rows } = await db.query<{ d: string }>(
        "select public.business_date($1::timestamptz, 'Asia/Kolkata', '04:00')::text as d",
        [iso],
      );
      expect(rows[0].d, iso).toBe(businessDate(new Date(iso), "Asia/Kolkata", "04:00"));
    }
  });

  it("fy_code agrees with lib/business-date", async () => {
    for (const date of ["2026-10-03", "2027-03-31", "2027-04-01", "2030-01-15"]) {
      const { rows } = await db.query<{ fy: string }>("select public.fy_code($1::date) as fy", [date]);
      expect(rows[0].fy, date).toBe(fyCode(date));
    }
  });
});

describe("sold out for today", () => {
  it("an item comes back automatically once the window passes", async () => {
    const { rows } = await db.query<{ past: boolean; future: boolean; forever: boolean; on: boolean }>(`
      select public.item_is_available(false, now() - interval '1 minute') as past,
             public.item_is_available(false, now() + interval '1 hour') as future,
             public.item_is_available(false, null) as forever,
             public.item_is_available(true, null) as on`);
    expect(rows[0]).toEqual({ past: true, future: false, forever: false, on: true });
  });
});

describe("expire_stale_payments", () => {
  it("expires unpaid online orders older than 15 minutes and nothing else", async () => {
    const stale = await createOrder(db, cafe, { status: "pending_payment" });
    const fresh = await createOrder(db, cafe, { status: "pending_payment" });
    const placed = await createOrder(db, cafe, { status: "placed" });
    await db.query("update public.orders set created_at = now() - interval '16 minutes' where id = any($1)", [[stale, placed]]);

    await db.query("select public.expire_stale_payments()");
    const { rows } = await db.query<{ id: string; status: string }>("select id, status from public.orders where id = any($1)", [
      [stale, fresh, placed],
    ]);
    const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(status[stale]).toBe("expired");
    expect(status[fresh]).toBe("pending_payment");
    expect(status[placed]).toBe("placed");
  });
});

describe("demo seed", () => {
  it("creates the demo cafe with a full menu, options and tables", async () => {
    const { rows } = await db.query<{ items: number; groups: number; tables: number; pairings: number; name: string }>(`
      select c.name,
        (select count(*)::int from public.menu_items where cafe_id = c.id) as items,
        (select count(*)::int from public.option_groups where cafe_id = c.id) as groups,
        (select count(*)::int from public.tables where cafe_id = c.id) as tables,
        (select count(*)::int from public.item_pairings where cafe_id = c.id) as pairings
      from public.cafes c where c.slug = 'demo'`);
    expect(rows[0]).toMatchObject({ name: "Brew & Bloom", tables: 12, pairings: 6 });
    expect(rows[0].items).toBeGreaterThanOrEqual(35);
    expect(rows[0].groups).toBeGreaterThan(20);
  });

  it("can be re-run without duplicating anything", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    await db.exec(readFileSync(join(__dirname, "..", "..", "supabase", "seed.sql"), "utf8"));
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.cafes where slug = 'demo'");
    expect(rows[0].n).toBe(1);
  });
});

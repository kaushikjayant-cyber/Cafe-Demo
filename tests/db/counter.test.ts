import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { addStaff, as, createCafe, createOrder, createTestDb, createUser } from "./harness";

let db: PGlite;
let cafe: string;
let otherCafe: string;
const cashier = randomUUID();
const kitchen = randomUUID();
const outsider = randomUUID();

beforeAll(async () => {
  db = await createTestDb();
  cafe = await createCafe(db, "counter-cafe");
  otherCafe = await createCafe(db, "other-cafe");
  for (const id of [cashier, kitchen, outsider]) await createUser(db, id);
  await addStaff(db, cafe, cashier, "cashier");
  await addStaff(db, cafe, kitchen, "kitchen");
  await addStaff(db, otherCafe, outsider, "owner");
});

type Paid = { status: string; payment_status: string; payment_method: string; invoice_no: string; paid_at: string };
const pay = (uid: string, order: string, method = "cash") =>
  as(db, { role: "authenticated", uid }, async (tx) =>
    (await tx.query<Paid>("select status, payment_status, payment_method, invoice_no, paid_at from public.mark_order_paid($1, $2)", [order, method])).rows[0],
  );

describe("mark_order_paid", () => {
  it("records the payment and assigns a GST invoice number", async () => {
    const order = await createOrder(db, cafe, { status: "accepted" });
    const paid = await pay(cashier, order, "upi_counter");
    expect(paid).toMatchObject({ status: "accepted", payment_status: "paid", payment_method: "upi_counter" });
    expect(paid.invoice_no).toMatch(/^INV\/\d{4}\/\d{6}$/);
    expect(paid.paid_at).not.toBeNull();
  });

  it("completes an order that was already served", async () => {
    const order = await createOrder(db, cafe, { status: "served" });
    expect((await pay(cashier, order)).status).toBe("completed");
  });

  it("gives each payment the next invoice number", async () => {
    const a = await pay(cashier, await createOrder(db, cafe));
    const b = await pay(cashier, await createOrder(db, cafe));
    expect(Number(b.invoice_no.slice(-6))).toBe(Number(a.invoice_no.slice(-6)) + 1);
  });

  it("refuses to take payment twice", async () => {
    const order = await createOrder(db, cafe);
    await pay(cashier, order);
    await expect(pay(cashier, order)).rejects.toThrow(/already_paid/);
  });

  it("refuses cancelled orders, unknown methods, the kitchen and other cafes", async () => {
    await expect(pay(cashier, await createOrder(db, cafe, { status: "cancelled" }))).rejects.toThrow(/order_closed/);
    await expect(pay(cashier, await createOrder(db, cafe), "bitcoin")).rejects.toThrow(/invalid_method/);
    await expect(pay(kitchen, await createOrder(db, cafe))).rejects.toThrow(/forbidden/);
    await expect(pay(outsider, await createOrder(db, cafe))).rejects.toThrow(/forbidden/);
  });
});

describe("serving a paid order", () => {
  it("finishes it instead of leaving it on the board", async () => {
    const order = await createOrder(db, cafe, { status: "ready" });
    await pay(cashier, order);
    const { rows } = await as(db, { role: "authenticated", uid: cashier }, (tx) =>
      tx.query<{ status: string }>("select status from public.transition_order($1, 'ready', 'served')", [order]),
    );
    expect(rows[0].status).toBe("completed");
  });
});

describe("sold out for today", () => {
  it("sets the item back to available at the start of the next business day", async () => {
    const category = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'X') returning id", [cafe])).rows[0].id;
    const item = (
      await db.query<{ id: string }>(
        "insert into public.menu_items (cafe_id, category_id, name, price_paise) values ($1, $2, 'Muffin', 100) returning id",
        [cafe, category],
      )
    ).rows[0].id;

    const { rows } = await as(db, { role: "authenticated", uid: kitchen }, (tx) =>
      tx.query<{ until: string; local: string }>(
        `select u as until, to_char(u at time zone 'Asia/Kolkata', 'HH24:MI') as local
         from public.set_item_sold_out_today($1) as u`,
        [item],
      ),
    );
    expect(rows[0].local).toBe("04:00");
    const until = new Date(rows[0].until).getTime();
    expect(until).toBeGreaterThan(Date.now());
    expect(until - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);

    const state = await db.query<{ is_available: boolean; available_now: boolean }>(
      "select is_available, public.item_is_available(is_available, sold_out_until) as available_now from public.menu_items where id = $1",
      [item],
    );
    expect(state.rows[0]).toEqual({ is_available: false, available_now: false });

    await expect(
      as(db, { role: "authenticated", uid: outsider }, (tx) => tx.query("select public.set_item_sold_out_today($1)", [item])),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("switching an option off across the menu", () => {
  it("turns oat milk off on every drink at once, only in the staff member's cafe", async () => {
    const category = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'Drinks') returning id", [cafe])).rows[0].id;
    const otherCategory = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'Drinks') returning id", [otherCafe])).rows[0].id;
    const addOatMilk = async (cafeId: string, categoryId: string, name: string) => {
      const item = (
        await db.query<{ id: string }>("insert into public.menu_items (cafe_id, category_id, name, price_paise) values ($1, $2, $3, 100) returning id", [cafeId, categoryId, name])
      ).rows[0].id;
      const group = (await db.query<{ id: string }>("insert into public.option_groups (cafe_id, item_id, name) values ($1, $2, 'Milk') returning id", [cafeId, item])).rows[0].id;
      await db.query("insert into public.options (cafe_id, group_id, name) values ($1, $2, 'Oat milk')", [cafeId, group]);
    };
    await addOatMilk(cafe, category, "Latte");
    await addOatMilk(cafe, category, "Mocha");
    await addOatMilk(otherCafe, otherCategory, "Flat White");

    const { rows } = await as(db, { role: "authenticated", uid: kitchen }, (tx) =>
      tx.query<{ n: number }>("select public.set_option_availability_by_name($1, 'oat MILK', false) as n", [cafe]),
    );
    expect(rows[0].n).toBe(2);
    const other = await db.query<{ is_available: boolean }>("select is_available from public.options where cafe_id = $1", [otherCafe]);
    expect(other.rows[0].is_available).toBe(true);

    await expect(
      as(db, { role: "authenticated", uid: kitchen }, (tx) => tx.query("select public.set_option_availability_by_name($1, 'Oat milk', false)", [otherCafe])),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("service requests", () => {
  it("staff of the cafe can mark a request done; others can't", async () => {
    const table = (
      await db.query<{ id: string }>("insert into public.tables (cafe_id, label, token) values ($1, 'T9', 'svcreq0001') returning id", [cafe])
    ).rows[0].id;
    const request = (
      await db.query<{ id: string }>("insert into public.service_requests (cafe_id, table_id, type) values ($1, $2, 'bill') returning id", [cafe, table])
    ).rows[0].id;

    await expect(
      as(db, { role: "authenticated", uid: outsider }, (tx) => tx.query("select public.resolve_service_request($1)", [request])),
    ).rejects.toThrow(/forbidden/);

    await as(db, { role: "authenticated", uid: kitchen }, (tx) => tx.query("select public.resolve_service_request($1)", [request]));
    const { rows } = await db.query<{ status: string; done_by: string | null }>("select status, done_by from public.service_requests where id = $1", [request]);
    expect(rows[0].status).toBe("done");
    expect(rows[0].done_by).not.toBeNull();
  });
});

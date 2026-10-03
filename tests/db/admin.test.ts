import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { addStaff, as, createCafe, createOrder, createTestDb, createUser } from "./harness";

let db: PGlite;
let cafe: string;
let otherCafe: string;
let category: string;
const owner = randomUUID();
const manager = randomUUID();
const cashier = randomUUID();
const otherOwner = randomUUID();

beforeAll(async () => {
  db = await createTestDb();
  cafe = await createCafe(db, "admin-cafe");
  otherCafe = await createCafe(db, "other-admin");
  for (const id of [owner, manager, cashier, otherOwner]) await createUser(db, id);
  await addStaff(db, cafe, owner, "owner");
  await addStaff(db, cafe, manager, "manager");
  await addStaff(db, cafe, cashier, "cashier");
  await addStaff(db, otherCafe, otherOwner, "owner");
  category = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'Coffee') returning id", [cafe])).rows[0].id;
});

type Dash = { today_stats: { revenue: number; orders: number }; period_stats: { revenue: number; orders: number }; daily: unknown[] };
const dashboard = (uid: string, cafeId = cafe, days = 7) =>
  as(db, { role: "authenticated", uid }, async (tx) => (await tx.query<{ d: Dash }>("select public.admin_dashboard($1, $2) as d", [cafeId, days])).rows[0].d);

describe("admin_dashboard", () => {
  it("counts real sales only: no cancelled, rejected, expired or unpaid-online orders", async () => {
    const today = (await db.query<{ d: string }>("select public.business_date(now(), 'Asia/Kolkata', '04:00')::text as d")).rows[0].d;
    const place = async (status: string) => {
      const id = await createOrder(db, cafe, { status });
      await db.query("update public.orders set business_date = $2, placed_at = now(), total_paise = 10000 where id = $1", [id, today]);
      return id;
    };
    await place("completed");
    await place("served");
    for (const status of ["cancelled", "rejected", "expired", "pending_payment"]) await place(status);

    const d = await dashboard(owner);
    expect(d.today_stats).toEqual({ revenue: 20000, orders: 2 });
    expect(d.daily).toHaveLength(7);
  });

  it("subtracts refunds from sales", async () => {
    const id = await createOrder(db, cafe, { status: "completed", paymentStatus: "partially_refunded" });
    const today = (await db.query<{ d: string }>("select public.business_date(now(), 'Asia/Kolkata', '04:00')::text as d")).rows[0].d;
    await db.query("update public.orders set business_date = $2, placed_at = now(), total_paise = 10000 where id = $1", [id, today]);
    const payment = (await db.query<{ id: string }>("insert into public.payments (cafe_id, order_id, rp_order_id, amount_paise, status) values ($1, $2, 'order_r1', 10000, 'captured') returning id", [cafe, id])).rows[0].id;
    await db.query("insert into public.refunds (cafe_id, payment_id, amount_paise) values ($1, $2, 4000)", [cafe, payment]);

    const d = await dashboard(manager);
    expect(d.today_stats).toEqual({ revenue: 26000, orders: 3 });
  });

  it("is for owners and managers of the cafe only", async () => {
    await expect(dashboard(cashier)).rejects.toThrow(/forbidden/);
    await expect(dashboard(otherOwner)).rejects.toThrow(/forbidden/);
    await expect(dashboard(owner, cafe, 0)).rejects.toThrow(/invalid_range/);
  });
});

describe("save_menu_item", () => {
  const save = (uid: string, p: Record<string, unknown>) =>
    as(db, { role: "authenticated", uid }, async (tx) => (await tx.query<{ id: string }>("select public.save_menu_item($1) as id", [p])).rows[0].id);

  const base = () => ({
    cafe_id: cafe,
    category_id: category,
    name: "Latte",
    description: "",
    price_paise: 19000,
    diet: "veg",
    tags: ["new"],
    is_visible: true,
    groups: [{ name: "Size", min_select: 1, max_select: 1, options: [{ name: "Regular", price_delta_paise: 0 }, { name: "Large", price_delta_paise: 4000 }] }],
  });

  const options = async (item: string) =>
    (
      await db.query<{ id: string; name: string; price: number }>(
        "select o.id, o.name, o.price_delta_paise as price from public.options o join public.option_groups g on g.id = o.group_id where g.item_id = $1 order by o.sort",
        [item],
      )
    ).rows;

  it("creates an item with its option groups in one go", async () => {
    const id = await save(owner, base());
    expect((await options(id)).map((o) => [o.name, o.price])).toEqual([
      ["Regular", 0],
      ["Large", 4000],
    ]);
  });

  it("keeps option ids on edit (open carts keep working), adds and removes the rest, and audits price changes", async () => {
    const id = await save(manager, base());
    const [regular, large] = await options(id);
    const groupId = (await db.query<{ id: string }>("select id from public.option_groups where item_id = $1", [id])).rows[0].id;

    await save(manager, {
      ...base(),
      id,
      price_paise: 21000,
      groups: [{ id: groupId, name: "Size", min_select: 1, max_select: 1, options: [{ id: regular.id, name: "Regular", price_delta_paise: 0 }, { name: "Huge", price_delta_paise: 9000 }] }],
    });
    const after = await options(id);
    expect(after[0].id).toBe(regular.id);
    expect(after.map((o) => o.name)).toEqual(["Regular", "Huge"]);
    expect(after.some((o) => o.id === large.id)).toBe(false);

    const { rows } = await db.query<{ action: string; before_price: number; after_price: number }>(
      "select action, (before->>'price_paise')::int as before_price, (after->>'price_paise')::int as after_price from public.activity_log where entity_id = $1",
      [id],
    );
    expect(rows).toEqual([{ action: "price_changed", before_price: 19000, after_price: 21000 }]);
  });

  it("refuses the counter, other cafes, and categories from another cafe", async () => {
    await expect(save(cashier, base())).rejects.toThrow(/forbidden/);
    await expect(save(otherOwner, base())).rejects.toThrow(/forbidden/);
    const foreignCategory = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'X') returning id", [otherCafe])).rows[0].id;
    await expect(save(owner, { ...base(), category_id: foreignCategory })).rejects.toThrow(/foreign key/);
  });

  it("archiving keeps the item for history but takes it off the menu", async () => {
    const id = await save(owner, base());
    await as(db, { role: "authenticated", uid: manager }, (tx) => tx.query("select public.archive_menu_item($1)", [id]));
    const { rows } = await db.query<{ archived: boolean; is_visible: boolean }>("select archived_at is not null as archived, is_visible from public.menu_items where id = $1", [id]);
    expect(rows[0]).toEqual({ archived: true, is_visible: false });
    await expect(as(db, { role: "authenticated", uid: cashier }, (tx) => tx.query("select public.archive_menu_item($1)", [id]))).rejects.toThrow(/forbidden/);
  });
});

describe("generate_demo_history", () => {
  it("refuses to touch a real (non-demo) cafe, and browser roles can't call it", async () => {
    await expect(as(db, { role: "service_role" }, (tx) => tx.query("select public.generate_demo_history($1, 1)", [cafe]))).rejects.toThrow(/not_a_demo_cafe/);
    await expect(as(db, { role: "authenticated", uid: owner }, (tx) => tx.query("select public.generate_demo_history($1, 1)", [cafe]))).rejects.toThrow(/permission denied/);
  });
});

describe("is_service_role", () => {
  it("answers false (instead of failing) when there are no JWT claims at all", async () => {
    const { rows } = await db.query<{ ok: boolean }>("select public.is_service_role() as ok");
    expect(rows[0].ok).toBe(false);
  });
});

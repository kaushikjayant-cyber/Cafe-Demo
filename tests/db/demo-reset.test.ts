import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { addStaff, as, createCafe, createOrder, createTestDb, createUser } from "./harness";

let db: PGlite;
let demo: string;
let real: string;
let item: string;
const owner = randomUUID();

const reset = (cafe: string, gap = "2 minutes") =>
  as(db, { role: "service_role" }, async (tx) => (await tx.query<{ n: number }>("select public.reset_demo_cafe($1, $2::interval) as n", [cafe, gap])).rows[0].n);
const count = async (sql: string, cafe: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, [cafe])).rows[0].n;

beforeAll(async () => {
  db = await createTestDb();
  demo = await createCafe(db, "demo-reset");
  real = await createCafe(db, "real-cafe");
  await db.query("update public.cafes set is_demo = true where id = $1", [demo]);
  await createUser(db, owner);
  await addStaff(db, demo, owner, "owner");
  const category = (await db.query<{ id: string }>("insert into public.categories (cafe_id, name) values ($1, 'Coffee') returning id", [demo])).rows[0].id;
  item = (await db.query<{ id: string }>("insert into public.menu_items (cafe_id, category_id, name, price_paise) values ($1, $2, 'Latte', 19000) returning id", [demo, category])).rows[0].id;
  await db.query("insert into public.tables (cafe_id, label, token) values ($1, 'T1', 'zzdemo0001')", [demo]);
}, 60_000);

describe("reset_demo_cafe", () => {
  it("wipes visitors' orders and switch-offs, and regenerates history up to now", async () => {
    await createOrder(db, demo, { status: "placed", dailyNo: 999 });
    await db.query("update public.menu_items set is_available = false where id = $1", [item]);
    await db.query("update public.cafes set ordering_paused = true, pause_message = 'Back soon' where id = $1", [demo]);

    const created = await reset(demo);
    expect(created).toBeGreaterThan(0);
    expect(await count("public.orders where cafe_id = $1 and daily_no = 999", demo)).toBe(0);
    expect(await count("public.orders where cafe_id = $1 and status <> 'completed'", demo)).toBe(0);
    expect(await count("public.reviews where cafe_id = $1", demo)).toBeGreaterThan(0);
    expect(await count("public.reviews where cafe_id = $1 and rating <= 2 and handled_at is null", demo)).toBe(0);
    const { rows } = await db.query<{ available: boolean; paused: boolean }>(
      "select m.is_available as available, c.ordering_paused as paused from public.menu_items m join public.cafes c on c.id = m.cafe_id where m.id = $1",
      [item],
    );
    expect(rows[0]).toEqual({ available: true, paused: false });
  }, 60_000);

  it("is rate-limited, only for demo cafes, and never callable from the browser", async () => {
    await expect(reset(demo)).rejects.toThrow(/reset_too_soon/);
    await expect(reset(real)).rejects.toThrow(/not_a_demo_cafe/);
    await expect(as(db, { role: "authenticated", uid: owner }, (tx) => tx.query("select public.reset_demo_cafe($1)", [demo]))).rejects.toThrow(/permission denied/);
  }, 60_000);
});

// Runs our real migrations and seed in PGlite (Postgres compiled to WASM), with a small
// shim for the parts of Supabase they depend on. Lets RLS and SQL functions be tested
// without Docker or a Supabase project.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = join(__dirname, "..", "..");

export async function createTestDb(options: { seed?: boolean } = {}): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));

  const migrationsDir = join(root, "supabase", "migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  if (options.seed) {
    await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  }
  return db;
}

type Who =
  | { role: "anon" }
  | { role: "authenticated"; uid: string }
  | { role: "service_role" };

/** Runs fn as a Supabase API role, the way PostgREST does: SET ROLE plus JWT claims. */
export async function as<T>(db: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = who.role === "authenticated" ? { role: who.role, sub: who.uid } : { role: who.role };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec(`set local role ${who.role}`);
    return fn(tx);
  });
}

export async function createUser(db: PGlite, id: string, options: { anonymous?: boolean } = {}): Promise<string> {
  await db.query("insert into auth.users (id, is_anonymous) values ($1, $2)", [id, options.anonymous ?? false]);
  return id;
}

export async function createCafe(db: PGlite, slug: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.cafes (slug, name, status) values ($1, $2, 'active') returning id",
    [slug, `Cafe ${slug}`],
  );
  return rows[0].id;
}

export async function addStaff(
  db: PGlite,
  cafeId: string,
  userId: string,
  role: "owner" | "manager" | "cashier" | "kitchen",
): Promise<void> {
  await db.query(
    "insert into public.staff (cafe_id, user_id, display_name, username, role) values ($1, $2, $3, $4, $5)",
    [cafeId, userId, role, `${role}-${userId.slice(0, 8)}`, role],
  );
}

/** Inserts an order directly (as the server would with the service role). */
export async function createOrder(
  db: PGlite,
  cafeId: string,
  options: { customerUid?: string; status?: string; paymentStatus?: string; dailyNo?: number } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.orders (cafe_id, business_date, daily_no, source, customer_uid, idempotency_key,
       status, payment_status, subtotal_paise, tax_paise, total_paise, tax_rate_bp, prices_include_tax, gst_mode)
     values ($1, current_date, $2, 'qr', $3, gen_random_uuid(), $4, $5, 19000, 905, 19000, 500, true, 'regular')
     returning id`,
    [
      cafeId,
      options.dailyNo ?? Math.floor(Math.random() * 1e6),
      options.customerUid ?? null,
      options.status ?? "placed",
      options.paymentStatus ?? "unpaid",
    ],
  );
  return rows[0].id;
}

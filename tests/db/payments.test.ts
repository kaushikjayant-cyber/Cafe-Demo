import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { addStaff, as, createCafe, createOrder, createTestDb, createUser } from "./harness";

let db: PGlite;
let cafe: string;
const owner = randomUUID();

beforeAll(async () => {
  db = await createTestDb();
  cafe = await createCafe(db, "pay-cafe");
  await createUser(db, owner);
  await addStaff(db, cafe, owner, "owner");
});

const service = <T>(sql: string, params: unknown[]) =>
  as(db, { role: "service_role" }, async (tx) => (await tx.query<T>(sql, params)).rows[0]);

/** A pending online order with a created gateway payment, as /api/payments/create leaves it. */
async function pendingOrder(options: { status?: string; total?: number } = {}) {
  const order = await createOrder(db, cafe, { status: options.status ?? "pending_payment" });
  const total = options.total ?? 19000;
  await db.query("update public.orders set total_paise = $2 where id = $1", [order, total]);
  const rpOrder = `order_${randomUUID().slice(0, 8)}`;
  const payment = (
    await db.query<{ id: string }>(
      "insert into public.payments (cafe_id, order_id, rp_order_id, amount_paise) values ($1, $2, $3, $4) returning id",
      [cafe, order, rpOrder, total],
    )
  ).rows[0].id;
  return { order, rpOrder, payment, total };
}

type Recorded = { r: { result: string; order_id: string; status?: string } };
const record = async (rpOrder: string, amount: number, rpPayment = `pay_${randomUUID().slice(0, 8)}`) =>
  (await service<Recorded>("select public.record_online_payment($1, $2, $3) as r", [rpOrder, rpPayment, amount])).r;

const orderRow = async (id: string) =>
  (
    await db.query<{ status: string; payment_status: string; payment_method: string; invoice_no: string | null; needs_attention: boolean }>(
      "select status, payment_status, payment_method, invoice_no, needs_attention from public.orders where id = $1",
      [id],
    )
  ).rows[0];

describe("record_online_payment", () => {
  it("pays a pending order, sends it to the kitchen (auto-accept) and issues an invoice", async () => {
    const { order, rpOrder, total } = await pendingOrder();
    expect(await record(rpOrder, total)).toMatchObject({ result: "paid", status: "accepted" });
    expect(await orderRow(order)).toMatchObject({ status: "accepted", payment_status: "paid", payment_method: "online", needs_attention: false });
    expect((await orderRow(order)).invoice_no).toMatch(/^INV\/\d{4}\/\d{6}$/);
  });

  it("is idempotent: the webhook arriving after the browser's verify changes nothing", async () => {
    const { order, rpOrder, total } = await pendingOrder();
    await record(rpOrder, total, "pay_same");
    const invoice = (await orderRow(order)).invoice_no;
    expect(await record(rpOrder, total, "pay_same")).toMatchObject({ result: "already_recorded" });
    expect((await orderRow(order)).invoice_no).toBe(invoice);
  });

  it("refuses an amount that doesn't match what we asked for", async () => {
    const { rpOrder, total } = await pendingOrder();
    await expect(record(rpOrder, total - 1)).rejects.toThrow(/amount_mismatch/);
  });

  it("brings a late payment for an expired order back to the counter, flagged", async () => {
    const { order, rpOrder, total } = await pendingOrder();
    await db.query("update public.orders set status = 'expired' where id = $1", [order]);
    expect(await record(rpOrder, total)).toMatchObject({ result: "late_payment", status: "placed" });
    expect(await orderRow(order)).toMatchObject({ status: "placed", payment_status: "paid", needs_attention: true });
  });

  it("flags a second successful payment for the same order instead of charging silently", async () => {
    const first = await pendingOrder();
    await record(first.rpOrder, first.total);
    const secondRp = `order_${randomUUID().slice(0, 8)}`;
    await db.query("insert into public.payments (cafe_id, order_id, rp_order_id, amount_paise) values ($1, $2, $3, $4)", [cafe, first.order, secondRp, first.total]);
    expect(await record(secondRp, first.total)).toMatchObject({ result: "double_payment" });
    expect((await orderRow(first.order)).needs_attention).toBe(true);
  });

  it("pays an order that was already at the counter without changing its status", async () => {
    const { order, rpOrder, total } = await pendingOrder({ status: "preparing" });
    expect((await orderRow(order)).payment_status).toBe("unpaid");
    expect(await record(rpOrder, total)).toMatchObject({ result: "paid", status: "preparing" });
    expect(await orderRow(order)).toMatchObject({ status: "preparing", payment_status: "paid" });
  });

  it("can't be called from the browser", async () => {
    const { rpOrder, total } = await pendingOrder();
    await expect(
      as(db, { role: "authenticated", uid: owner }, (tx) => tx.query("select public.record_online_payment($1, 'pay_x', $2)", [rpOrder, total])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("record_payment_failure", () => {
  it("marks the attempt failed and leaves the order waiting for payment", async () => {
    const { order, rpOrder } = await pendingOrder();
    await service("select public.record_payment_failure($1)", [rpOrder]);
    const { rows } = await db.query<{ status: string }>("select status from public.payments where rp_order_id = $1", [rpOrder]);
    expect(rows[0].status).toBe("failed");
    expect((await orderRow(order)).status).toBe("pending_payment");
  });
});

describe("record_refund", () => {
  const staffId = async () => (await db.query<{ id: string }>("select id from public.staff where user_id = $1", [owner])).rows[0].id;
  const refund = async (payment: string, amount: number) =>
    service<{ payment_status: string; needs_attention: boolean }>(
      "select payment_status, needs_attention from public.record_refund($1, $2, $3, 'test', $4)",
      [payment, `rfnd_${randomUUID().slice(0, 8)}`, amount, await staffId()],
    );

  it("a full refund marks the order refunded", async () => {
    const { rpOrder, payment, total } = await pendingOrder();
    await record(rpOrder, total);
    expect(await refund(payment, total)).toMatchObject({ payment_status: "refunded" });
  });

  it("a partial refund marks it partially refunded, and refunds can't exceed the payment", async () => {
    const { rpOrder, payment, total } = await pendingOrder();
    await record(rpOrder, total);
    expect(await refund(payment, 5000)).toMatchObject({ payment_status: "partially_refunded" });
    await expect(refund(payment, total)).rejects.toThrow(/refund_too_large/);
  });

  it("refunding the extra charge of a double payment leaves the order paid and clears the flag", async () => {
    const first = await pendingOrder();
    await record(first.rpOrder, first.total);
    const secondRp = `order_${randomUUID().slice(0, 8)}`;
    const second = (
      await db.query<{ id: string }>(
        "insert into public.payments (cafe_id, order_id, rp_order_id, amount_paise) values ($1, $2, $3, $4) returning id",
        [cafe, first.order, secondRp, first.total],
      )
    ).rows[0].id;
    await record(secondRp, first.total);
    expect(await refund(second, first.total)).toEqual({ payment_status: "paid", needs_attention: false });
  });

  it("won't refund a payment that never went through", async () => {
    const { payment, total } = await pendingOrder();
    await expect(refund(payment, total)).rejects.toThrow(/payment_not_refundable/);
  });
});

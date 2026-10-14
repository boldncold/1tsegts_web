import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { OWNER_EMAIL } from "./lib/admin";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const dish = { description: "", category: "Mongolian" as const, tags: [], available: true };

async function setup() {
  const t = convexTest(schema, modules);
  /** A signed-in session as Convex Auth represents it: subject = "<userId>|<sessionId>". */
  const as = async (email: string) => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { email }));
    return t.withIdentity({ subject: `${userId}|session` });
  };
  const owner = await as(OWNER_EMAIL);
  const menuId = await t.run((ctx) => ctx.db.insert("menu", { ...dish, name: "Бууз", price: 12000 }));
  const insertOrder = (fields: Record<string, unknown> = {}) =>
    t.run((ctx) =>
      ctx.db.insert("orders", {
        items: [{ id: menuId, name: "Бууз", price: 12000, quantity: 1 }],
        total: 12000,
        orderType: "pickup",
        status: "pending",
        timestamp: new Date().toISOString(),
        ...fields,
      }),
    ) as Promise<Id<"orders">>;
  const get = <T extends "orders" | "menu" | "bankTransactions">(id: Id<T>) => t.run((ctx) => ctx.db.get(id));
  return { t, as, owner, menuId, insertOrder, get };
}

describe("admin access", () => {
  test("anonymous and non-admin callers are refused; owner and listed admins pass", async () => {
    const { t, as, owner } = await setup();
    const stranger = await as("stranger@example.com");
    await expect(t.query(api.ordersAdmin.recent, {})).rejects.toThrow(/NOT_ADMIN/);
    await expect(stranger.query(api.ordersAdmin.recent, {})).rejects.toThrow(/NOT_ADMIN/);
    await expect(stranger.mutation(api.staff.addAdmin, { email: "x@example.com" })).rejects.toThrow(/NOT_ADMIN/);

    await owner.mutation(api.staff.addAdmin, { email: " Cashier@Example.com " });
    const cashier = await as("cashier@example.com");
    await expect(cashier.query(api.ordersAdmin.recent, {})).resolves.toEqual([]);
    expect(await cashier.query(api.staff.viewer, {})).toMatchObject({ isAdmin: true });
    expect(await stranger.query(api.staff.viewer, {})).toMatchObject({ isAdmin: false });
    expect(await t.query(api.staff.viewer, {})).toBeNull();
  });

  test("the owner and yourself cannot be removed; others can", async () => {
    const { owner, as } = await setup();
    await owner.mutation(api.staff.addAdmin, { email: "a@example.com" });
    const a = await as("a@example.com");
    await expect(a.mutation(api.staff.removeAdmin, { email: OWNER_EMAIL })).rejects.toThrow(/CANNOT_REMOVE/);
    await expect(a.mutation(api.staff.removeAdmin, { email: "a@example.com" })).rejects.toThrow(/CANNOT_REMOVE/);
    await owner.mutation(api.staff.removeAdmin, { email: "a@example.com" });
    expect(await owner.query(api.staff.listAdmins, {})).toEqual([]);
    await expect(a.query(api.ordersAdmin.recent, {})).rejects.toThrow(/NOT_ADMIN/);
  });
});

describe("menu admin", () => {
  const form = {
    name: "Хуушуур",
    description: "",
    price: 3500,
    category: "Mongolian" as const,
    tags: [],
    available: true,
    status: "available" as const,
    statusUntil: null,
    scheduledDays: [],
    todayOnly: false,
    featured: false,
    packagingPrice: 500,
    portions: [],
    pool: null,
  };

  test("replacing an uploaded image deletes the old file; orderCount survives a save", async () => {
    const { t, owner, get } = await setup();
    const [first, second] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["a"])),
      await ctx.storage.store(new Blob(["b"])),
    ]);
    const id = await owner.mutation(api.menuAdmin.save, { item: form, image: { storageId: first }, sideImages: [] });
    await t.run((ctx) => ctx.db.patch(id, { orderCount: 7 }));

    await owner.mutation(api.menuAdmin.save, { id, item: { ...form, price: 4000 }, image: { storageId: second }, sideImages: [] });
    const row = await get(id);
    expect(row).toMatchObject({ price: 4000, orderCount: 7, image: { storageId: second } });
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).not.toBeNull();

    await owner.mutation(api.menuAdmin.remove, { id });
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).toBeNull();
  });

  test("quick updates clear fields with null; invalid items are refused", async () => {
    const { owner, menuId, get } = await setup();
    await owner.mutation(api.menuAdmin.update, { id: menuId, changes: { pool: "specials", statusUntil: 123 } });
    expect(await get(menuId)).toMatchObject({ pool: "specials", statusUntil: 123 });
    await owner.mutation(api.menuAdmin.update, { id: menuId, changes: { pool: null, statusUntil: null } });
    const row = await get(menuId);
    expect(row?.pool).toBeUndefined();
    expect(row?.statusUntil).toBeUndefined();
    await expect(owner.mutation(api.menuAdmin.save, { item: { ...form, price: -1 }, sideImages: [] })).rejects.toThrow(/INVALID_ITEM/);
  });
});

describe("kitchen status", () => {
  test("an unpaid QPay order cannot start cooking; a confirmed one and a cash one can", async () => {
    const { owner, insertOrder, get } = await setup();
    const unpaid = await insertOrder({ paymentMethod: "qpay", paymentStatus: "AWAITING_PAYMENT" });
    const paid = await insertOrder({ paymentMethod: "qpay", paymentStatus: "CONFIRMED" });
    const cash = await insertOrder({ paymentMethod: "cash" });
    await expect(owner.mutation(api.ordersAdmin.setStatus, { orderId: unpaid, status: "preparing" })).rejects.toThrow(/AWAITING_PAYMENT/);
    await owner.mutation(api.ordersAdmin.setStatus, { orderId: paid, status: "preparing" });
    await owner.mutation(api.ordersAdmin.setStatus, { orderId: cash, status: "preparing" });
    expect((await get(paid))?.status).toBe("preparing");

    await owner.mutation(api.ordersAdmin.setStatus, { orderId: unpaid, status: "cancelled" });
    expect(await get(unpaid)).toMatchObject({ status: "cancelled", cancelledBy: "restaurant" });
  });

  test("orders holding money cannot be deleted, except admin test orders", async () => {
    const { owner, insertOrder, get } = await setup();
    const paid = await insertOrder({ paymentMethod: "qpay", paymentStatus: "CONFIRMED" });
    const review = await insertOrder({ paymentMethod: "qpay", paymentStatus: "MANUAL_REVIEW" });
    const test = await insertOrder({ paymentMethod: "cash", paymentStatus: "CONFIRMED", isTest: true });
    const unpaid = await insertOrder({ paymentMethod: "cash" });
    await expect(owner.mutation(api.ordersAdmin.remove, { orderId: paid })).rejects.toThrow(/HOLDS_PAYMENT/);
    await expect(owner.mutation(api.ordersAdmin.remove, { orderId: review })).rejects.toThrow(/HOLDS_PAYMENT/);
    await owner.mutation(api.ordersAdmin.remove, { orderId: test });
    await owner.mutation(api.ordersAdmin.remove, { orderId: unpaid });
    expect(await get(test)).toBeNull();
    expect(await get(unpaid)).toBeNull();
  });

  test("a counter order is priced on the server and goes straight to the kitchen", async () => {
    const { owner, menuId, get } = await setup();
    const { orderId, orderNumber } = await owner.mutation(api.ordersAdmin.createCounterOrder, {
      orderType: "pickup",
      items: [{ menuId, quantity: 2 }],
    });
    expect(orderNumber).toBe("001");
    expect(await get(orderId)).toMatchObject({ total: 24000, status: "preparing" });
  });
});

describe("confirming payments", () => {
  test("records who confirmed, reconciles the bank entry, drops the QR, and is idempotent", async () => {
    const { t, owner, insertOrder, get } = await setup();
    const orderId = await insertOrder({
      paymentMethod: "bank_transfer",
      paymentStatus: "AWAITING_PAYMENT",
      amountMnt: 12000,
      referenceCode: "GR-ABC234",
      qpayQrImage: "big-base64",
    });
    const txId = await owner.mutation(api.bank.add, {
      amountMnt: 12000,
      description: "order gr-abc234 thanks",
      postedAt: new Date().toISOString(),
    });
    expect(await get(txId)).toMatchObject({ matchStatus: "matched", matchedOrderId: orderId, referenceCode: "GR-ABC234" });

    expect(await owner.mutation(api.payments.confirmPayment, { orderId, bankTxId: txId })).toEqual({ updated: true });
    const order = await get(orderId);
    expect(order).toMatchObject({ paymentStatus: "CONFIRMED", paidVia: "admin_manual", paidBy: OWNER_EMAIL, matchedTxId: txId });
    expect(order?.qpayQrImage).toBeUndefined();
    expect(await get(txId)).toMatchObject({ matchStatus: "reconciled" });

    expect(await owner.mutation(api.payments.confirmPayment, { orderId })).toEqual({ updated: false, reason: "already_confirmed" });
    await expect(t.mutation(api.payments.confirmPayment, { orderId })).rejects.toThrow(/NOT_ADMIN/);
  });
});

describe("bank matching", () => {
  test("amount mismatch and unknown refs are reported; the sweep matches an order that arrives later", async () => {
    const { owner, insertOrder, get, t } = await setup();
    await insertOrder({ paymentMethod: "bank_transfer", paymentStatus: "AWAITING_PAYMENT", amountMnt: 12000, referenceCode: "GR-MMMMMM" });
    const short = await owner.mutation(api.bank.add, { amountMnt: 100, description: "GR-MMMMMM", postedAt: new Date().toISOString() });
    const early = await owner.mutation(api.bank.add, { amountMnt: 5000, description: "GR-LATER2", postedAt: new Date().toISOString() });
    const plain = await owner.mutation(api.bank.add, { amountMnt: 5000, description: "rent", postedAt: new Date().toISOString() });
    expect((await get(short))?.matchStatus).toBe("amount_mismatch");
    expect((await get(early))?.matchStatus).toBe("unknown_ref");
    expect((await get(plain))?.matchStatus).toBe("unmatched");

    const later = await insertOrder({ paymentMethod: "bank_transfer", paymentStatus: "AWAITING_PAYMENT", amountMnt: 5000, referenceCode: "GR-LATER2" });
    await t.mutation(internal.bank.sweep, {});
    expect(await get(early)).toMatchObject({ matchStatus: "matched", matchedOrderId: later });
  });
});

describe("admin test orders from the storefront", () => {
  test("a discount is refused for customers", async () => {
    const { t, menuId } = await setup();
    await expect(
      t.mutation(api.orders.create, { orderType: "pickup", paymentMethod: "qpay", items: [{ menuId, quantity: 1 }], adminDiscountMnt: 11000 }),
    ).rejects.toThrow(/NOT_ADMIN/);
  });

  test("an admin's discounted order is marked test; a fully discounted one confirms itself", async () => {
    const { owner, menuId, get } = await setup();
    const partial = await owner.mutation(api.orders.create, {
      orderType: "pickup",
      paymentMethod: "qpay",
      items: [{ menuId, quantity: 1 }],
      adminDiscountMnt: 2000,
    });
    expect(await get(partial.orderId)).toMatchObject({ isTest: true, amountMnt: 10000, adminDiscountMnt: 2000, paymentStatus: "AWAITING_PAYMENT" });

    const free = await owner.mutation(api.orders.create, {
      orderType: "pickup",
      paymentMethod: "bank_transfer",
      items: [{ menuId, quantity: 1 }],
      adminDiscountMnt: 999999,
    });
    const order = await get(free.orderId);
    expect(order).toMatchObject({ amountMnt: 0, paymentStatus: "CONFIRMED", paidVia: "admin_manual", paidBy: OWNER_EMAIL });
    expect(order?.referenceCode).toBeUndefined();
  });
});

describe("refunds", () => {
  function fakeRefunds(reply: () => Response) {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    vi.stubEnv("QPAY_BASE_URL", "https://qpay.test");
    vi.stubEnv("QPAY_USERNAME", "u");
    vi.stubEnv("QPAY_PASSWORD", "p");
    vi.stubEnv("QPAY_INVOICE_CODE", "c");
    vi.stubEnv("QPAY_CALLBACK_TOKEN", "t");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin !== "https://qpay.test") return realFetch(input, init);
      calls.push(`${init?.method} ${url.pathname}`);
      if (url.pathname === "/v2/auth/token") {
        return new Response(JSON.stringify({ access_token: "b", refresh_token: "r", expires_in: Date.now() / 1000 + 3600, refresh_expires_in: 0 }));
      }
      return reply();
    });
    return calls;
  }

  test("P2P payments are refused with guidance; nothing is sent to QPay", async () => {
    const { owner, insertOrder } = await setup();
    const calls = fakeRefunds(() => new Response("{}"));
    const orderId = await insertOrder({ paymentMethod: "qpay", paymentStatus: "CONFIRMED", qpayPaymentId: "p1", qpayPaymentType: "P2P" });
    await expect(owner.action(api.qpay.refund, { orderId })).rejects.toThrow(/P2P_NOT_REFUNDABLE/);
    expect(calls).toEqual([]);
  });

  test("a card payment is refunded at QPay and marked REFUNDED; repeating is harmless", async () => {
    const { t, owner, insertOrder, get } = await setup();
    const calls = fakeRefunds(() => new Response("{}"));
    const orderId = await insertOrder({ paymentMethod: "qpay", paymentStatus: "CONFIRMED", qpayPaymentId: "p1", qpayPaymentType: "CARD" });
    await expect(t.action(api.qpay.refund, { orderId })).rejects.toThrow(/NOT_ADMIN/);
    expect(await owner.action(api.qpay.refund, { orderId, note: "wrong dish" })).toEqual({ refunded: true });
    expect(calls).toContain("DELETE /v2/payment/refund/p1");
    expect(await get(orderId)).toMatchObject({ paymentStatus: "REFUNDED", refundNote: "wrong dish" });
    expect(await owner.action(api.qpay.refund, { orderId })).toEqual({ refunded: true, alreadyRefunded: true });
  });

  test("QPay saying 'already refunded' settles the order instead of failing forever", async () => {
    const { owner, insertOrder, get } = await setup();
    fakeRefunds(() => new Response(JSON.stringify({ error: "PAYMENT_ALREADY_CANCELED" }), { status: 400 }));
    const orderId = await insertOrder({ paymentMethod: "qpay", paymentStatus: "CONFIRMED", qpayPaymentId: "p1", qpayPaymentType: "CARD" });
    await owner.action(api.qpay.refund, { orderId });
    expect((await get(orderId))?.paymentStatus).toBe("REFUNDED");
  });
});

describe("store settings", () => {
  test("admins save hours; nonsense hours are refused", async () => {
    const { t, owner } = await setup();
    const settings = { openHour: 10, closeHour: 20, closedDays: [1], closedUntil: null, noClosedDayUntil: null };
    await expect(t.mutation(api.settings.saveStore, { settings })).rejects.toThrow(/NOT_ADMIN/);
    await owner.mutation(api.settings.saveStore, { settings });
    expect(await t.query(api.settings.getStore, {})).toEqual(settings);
    await expect(owner.mutation(api.settings.saveStore, { settings: { ...settings, closeHour: 30 } })).rejects.toThrow();
  });
});

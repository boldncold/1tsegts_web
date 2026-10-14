import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const base = {
  description: "",
  category: "Mongolian" as const,
  tags: [],
  available: true,
};

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    khuushuur: await ctx.db.insert("menu", {
      ...base,
      name: "Хуушуур",
      price: 3500,
      packagingPrice: 500,
      legacyId: "fs-khuushuur",
    }),
    tsuivan: await ctx.db.insert("menu", {
      ...base,
      name: "Цуйван",
      price: 12000,
      portions: [
        { name: "Small", price: 9000 },
        { name: "Large", price: 15000 },
      ],
    }),
  }));
  return { t, ids };
}

const pickup = { orderType: "pickup" as const, customerName: "Бат", phone: "99112233" };

describe("orders.create", () => {
  test("prices from the menu: portions, and packaging only when packed", async () => {
    const { t, ids } = await setup();
    const { orderId } = await t.mutation(api.orders.create, {
      ...pickup,
      paymentMethod: "qpay",
      items: [
        { menuId: ids.khuushuur, quantity: 3, packaging: true },
        { menuId: ids.tsuivan, quantity: 1, portionName: "Large" },
        { menuId: ids.khuushuur, quantity: 1, packaging: false },
      ],
    });
    const order = await t.run((ctx) => ctx.db.get(orderId));
    const expected = 3 * 3500 + 3 * 500 + 15000 + 3500;
    expect(order?.total).toBe(expected);
    expect(order?.amountMnt).toBe(expected);
    expect(order?.items[1]).toMatchObject({ name: "Цуйван", price: 15000, selectedPortion: { name: "Large", price: 15000 } });
  });

  test("prices the menu UI's 'Default' pseudo-portion at the base price", async () => {
    const { t, ids } = await setup();
    const { orderId } = await t.mutation(api.orders.create, {
      ...pickup,
      paymentMethod: "qpay",
      items: [{ menuId: ids.tsuivan, quantity: 2, portionName: "Default" }],
    });
    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order?.amountMnt).toBe(2 * 12000);
    expect(order?.items[0].selectedPortion).toEqual({ name: "Default", price: 12000 });
  });

  test("qpay: awaiting payment, 15-minute window, no reference code", async () => {
    const { t, ids } = await setup();
    const before = Date.now();
    const { orderId } = await t.mutation(api.orders.create, {
      ...pickup,
      paymentMethod: "qpay",
      items: [{ menuId: ids.khuushuur, quantity: 1 }],
    });
    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order).toMatchObject({ status: "pending", paymentStatus: "AWAITING_PAYMENT" });
    expect(order?.referenceCode).toBeUndefined();
    const windowMs = Date.parse(order!.paymentExpiresAt!) - before;
    expect(windowMs).toBeGreaterThan(14 * 60_000);
    expect(windowMs).toBeLessThanOrEqual(15 * 60_000 + 1000);
  });

  test("bank transfer: reference code and a 30-minute window", async () => {
    const { t, ids } = await setup();
    const { orderId } = await t.mutation(api.orders.create, {
      ...pickup,
      paymentMethod: "bank_transfer",
      items: [{ menuId: ids.khuushuur, quantity: 1 }],
    });
    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order?.referenceCode).toMatch(/^GR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(order?.paymentStatus).toBe("AWAITING_PAYMENT");
  });

  test("cash: no payment state at all", async () => {
    const { t, ids } = await setup();
    const { orderId } = await t.mutation(api.orders.create, {
      ...pickup,
      paymentMethod: "cash",
      items: [{ menuId: ids.khuushuur, quantity: 1 }],
    });
    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order?.paymentStatus).toBeUndefined();
    expect(order?.amountMnt).toBeUndefined();
    expect(order?.total).toBe(3500);
  });

  test("order numbers run 001, 002 … and wrap after 999", async () => {
    const { t, ids } = await setup();
    const place = () =>
      t.mutation(api.orders.create, {
        ...pickup,
        paymentMethod: "cash",
        items: [{ menuId: ids.khuushuur, quantity: 1 }],
      });
    expect((await place()).orderNumber).toBe("001");
    expect((await place()).orderNumber).toBe("002");
    await t.run(async (ctx) => {
      const counter = await ctx.db.query("counters").first();
      await ctx.db.patch(counter!._id, { value: 999 });
    });
    expect((await place()).orderNumber).toBe("001");
  });

  test("bumps orderCount by quantity on the server", async () => {
    const { t, ids } = await setup();
    await t.mutation(api.orders.create, {
      ...pickup,
      paymentMethod: "cash",
      items: [
        { menuId: ids.khuushuur, quantity: 2 },
        { menuId: ids.khuushuur, quantity: 1, packaging: true },
      ],
    });
    const row = await t.run((ctx) => ctx.db.get(ids.khuushuur));
    expect(row?.orderCount).toBe(3);
  });

  test("accepts a Firestore menu id from a cart saved before the cutover", async () => {
    const { t, ids } = await setup();
    const { orderId } = await t.mutation(api.orders.create, {
      ...pickup,
      paymentMethod: "cash",
      items: [{ menuId: "fs-khuushuur", quantity: 1 }],
    });
    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order?.items[0].id).toBe(ids.khuushuur);
  });

  test.each([
    ["negative quantity", { quantity: -1 }],
    ["fractional quantity", { quantity: 1.5 }],
    ["unknown portion", { portionName: "Huge" }],
  ])("rejects %s", async (_label, override) => {
    const { t, ids } = await setup();
    await expect(
      t.mutation(api.orders.create, {
        ...pickup,
        paymentMethod: "qpay",
        items: [{ menuId: ids.tsuivan, quantity: 1, ...override }],
      }),
    ).rejects.toThrow(/ORDER_UNPRICEABLE/);
  });

  test("rejects an item that is not on the menu, and an empty cart", async () => {
    const { t } = await setup();
    for (const items of [[{ menuId: "ghost", quantity: 1 }], []]) {
      await expect(
        t.mutation(api.orders.create, { ...pickup, paymentMethod: "cash", items }),
      ).rejects.toThrow(/ORDER_UNPRICEABLE/);
    }
  });
});

describe("orders.track", () => {
  test("hides staff-only fields and returns the canonical id", async () => {
    const { t } = await setup();
    const orderId = await t.run((ctx) =>
      ctx.db.insert("orders", {
        items: [],
        total: 1000,
        orderType: "pickup",
        status: "pending",
        timestamp: new Date().toISOString(),
        paidBy: "cashier@example.com",
        isTest: true,
        legacyId: "fs-order-1",
      }),
    );
    const byLegacy = await t.query(api.orders.track, { orderId: "fs-order-1" });
    expect(byLegacy?.id).toBe(orderId);
    expect(byLegacy).not.toHaveProperty("paidBy");
    expect(byLegacy).not.toHaveProperty("isTest");
    expect(byLegacy).not.toHaveProperty("legacyId");
    expect(await t.query(api.orders.track, { orderId: "nope" })).toBeNull();
  });
});

describe("orders.cancel", () => {
  async function orderWith(fields: { status?: "pending" | "preparing"; paymentStatus?: "AWAITING_PAYMENT" | "CONFIRMED" | "MANUAL_REVIEW" | "EXPIRED" }) {
    const { t } = await setup();
    const orderId: Id<"orders"> = await t.run((ctx) =>
      ctx.db.insert("orders", {
        items: [],
        total: 1000,
        orderType: "pickup",
        status: fields.status ?? "pending",
        timestamp: new Date().toISOString(),
        ...(fields.paymentStatus ? { paymentMethod: "qpay" as const, paymentStatus: fields.paymentStatus } : {}),
      }),
    );
    return { t, orderId };
  }

  test.each([["cash", {}], ["awaiting payment", { paymentStatus: "AWAITING_PAYMENT" as const }], ["expired", { paymentStatus: "EXPIRED" as const }]])(
    "a pending %s order is kept as cancelled-by-customer",
    async (_label, fields) => {
      const { t, orderId } = await orderWith(fields);
      expect(await t.mutation(api.orders.cancel, { orderId })).toEqual({ cancelled: true });
      const order = await t.run((ctx) => ctx.db.get(orderId));
      expect(order).toMatchObject({ status: "cancelled", cancelledBy: "customer" });
    },
  );

  test.each([
    ["a confirmed payment", { paymentStatus: "CONFIRMED" as const }],
    ["money under manual review", { paymentStatus: "MANUAL_REVIEW" as const }],
    ["an order the kitchen started", { status: "preparing" as const }],
  ])("refuses to cancel %s", async (_label, fields) => {
    const { t, orderId } = await orderWith(fields);
    await expect(t.mutation(api.orders.cancel, { orderId })).rejects.toThrow(/NOT_CANCELLABLE/);
  });
});

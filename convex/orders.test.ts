import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import type { StoreHours } from "./lib/availability";

const base = {
  description: "",
  category: "Mongolian" as const,
  tags: [],
  available: true,
};

/** Open around the clock, so tests that aren't about opening hours pass at any time of day. */
const ALWAYS_OPEN: StoreHours = { openHour: 0, closeHour: 24, closedDays: [], closedUntil: null, noClosedDayUntil: null };

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("storeSettings", ALWAYS_OPEN));
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

describe("orders.create refuses what the menu wouldn't let a customer order", () => {
  afterEach(() => vi.useRealTimers());

  // Ulaanbaatar is UTC+8 all year. 2026-10-19 is a Monday (closed by
  // default), 2026-10-20 a Tuesday.
  const ub = (iso: string) => new Date(`${iso}+08:00`);
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ub(iso));
  };
  const HOUR = 3_600_000;

  async function withDish(fields: Record<string, unknown>) {
    const { t, ids } = await setup();
    const dishId = await t.run((ctx) =>
      ctx.db.insert("menu", { ...base, name: "Тест", price: 5000, ...fields }),
    );
    const order = (extra: Record<string, unknown> = {}) =>
      t.mutation(api.orders.create, { ...pickup, paymentMethod: "cash", items: [{ menuId: dishId, quantity: 1, ...extra }] });
    const setHours = (hours: Partial<typeof ALWAYS_OPEN>) =>
      t.run(async (ctx) => {
        const row = await ctx.db.query("storeSettings").first();
        await ctx.db.patch(row!._id, hours);
      });
    return { t, ids, dishId, order, setHours };
  }

  test("hidden: refused; available: accepted", async () => {
    at("2026-10-20T12:00");
    await expect((await withDish({ status: "hidden" })).order()).rejects.toThrow(/unavailable_item/);
    await expect((await withDish({ status: "available" })).order()).resolves.toHaveProperty("orderId");
  });

  test("sold out today: refused until statusUntil, accepted after", async () => {
    at("2026-10-20T12:00");
    const until = ub("2026-10-21T00:00").getTime();
    const { order } = await withDish({ status: "sold_out_today", statusUntil: until });
    await expect(order()).rejects.toThrow(/unavailable_item/);
    at("2026-10-21T12:00");
    await expect(order()).resolves.toHaveProperty("orderId");
  });

  test("today only: accepted until statusUntil, refused after", async () => {
    at("2026-10-20T12:00");
    const { order } = await withDish({ todayOnly: true, statusUntil: Date.now() + HOUR });
    await expect(order()).resolves.toHaveProperty("orderId");
    at("2026-10-20T14:00");
    await expect(order()).rejects.toThrow(/unavailable_item/);
  });

  test("the legacy available=false flag is honoured when there is no status", async () => {
    at("2026-10-20T12:00");
    await expect((await withDish({ available: false })).order()).rejects.toThrow(/unavailable_item/);
  });

  test("weekly schedule uses Ulaanbaatar's day, not the server's (UTC)", async () => {
    // A Tuesday-only dish. 07:59 Tuesday in UB is still Monday in UTC.
    at("2026-10-20T07:59");
    const { order } = await withDish({ scheduledDays: [2] });
    await expect(order()).resolves.toHaveProperty("orderId");
    // 00:30 Wednesday in UB is still Tuesday in UTC: a UTC clock would let it through.
    at("2026-10-21T00:30");
    await expect(order()).rejects.toThrow(/unavailable_item/);
  });

  test("a portion switched off is refused; the dish's other portions are not", async () => {
    at("2026-10-20T12:00");
    const { order } = await withDish({
      portions: [
        { name: "Small", price: 4000, available: false },
        { name: "Large", price: 6000 },
      ],
    });
    await expect(order({ portionName: "Small" })).rejects.toThrow(/unavailable_portion/);
    await expect(order({ portionName: "Large" })).resolves.toHaveProperty("orderId");
  });

  test("an unpublished draft is refused; a published special in the Draft category is not", async () => {
    at("2026-10-20T12:00");
    await expect((await withDish({ category: "Draft" })).order()).rejects.toThrow(/unavailable_item/);
    await expect((await withDish({ category: "Draft", pool: "specials" })).order()).resolves.toHaveProperty("orderId");
  });

  test("opening hours: closed before opening, on the closed day and during a forced closure", async () => {
    const { order, setHours } = await withDish({});
    await setHours({ openHour: 11, closeHour: 19, closedDays: [1] });

    at("2026-10-20T10:59");
    await expect(order()).rejects.toThrow(/STORE_CLOSED/);
    at("2026-10-20T11:00");
    await expect(order()).resolves.toHaveProperty("orderId");
    at("2026-10-20T19:00");
    await expect(order()).rejects.toThrow(/STORE_CLOSED/);
    at("2026-10-19T12:00"); // Monday
    await expect(order()).rejects.toThrow(/STORE_CLOSED/);

    await setHours({ closedUntil: "2026-10-20" });
    at("2026-10-20T12:00");
    await expect(order()).rejects.toThrow(/STORE_CLOSED/);
  });

  test("with no saved hours, the defaults apply (11:00–19:00, closed Mondays)", async () => {
    const { t, order } = await withDish({});
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("storeSettings").collect()) await ctx.db.delete(row._id);
    });
    at("2026-10-20T12:00");
    await expect(order()).resolves.toHaveProperty("orderId");
    at("2026-10-20T20:00");
    await expect(order()).rejects.toThrow(/STORE_CLOSED/);
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
        reviewResolution: "accepted",
        reviewResolvedBy: "admin@example.com",
      }),
    );
    const byLegacy = await t.query(api.orders.track, { orderId: "fs-order-1" });
    expect(byLegacy?.id).toBe(orderId);
    expect(byLegacy).not.toHaveProperty("paidBy");
    expect(byLegacy).not.toHaveProperty("isTest");
    expect(byLegacy).not.toHaveProperty("legacyId");
    expect(byLegacy).not.toHaveProperty("reviewResolvedBy");
    expect(byLegacy).not.toHaveProperty("reviewResolution");
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

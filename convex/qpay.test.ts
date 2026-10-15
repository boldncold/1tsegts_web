import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const QPAY = "https://qpay.test";
const SITE = "https://site.test";
const TOKEN = "callback-secret";

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

/** A fake QPay behind fetch; every other URL goes to the real fetch. */
function fakeQpay() {
  const calls: Call[] = [];
  let paymentRows: unknown[] = [];
  let invoices = 0;
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== QPAY) return realFetch(input, init);
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (url.pathname === "/v2/auth/token") {
      const now = Math.floor(Date.now() / 1000);
      return json({ access_token: "bearer-1", refresh_token: "r", expires_in: now + 86400, refresh_expires_in: now + 172800 });
    }
    if (url.pathname === "/v2/invoice" && method === "POST") {
      invoices += 1;
      // Deep links omitted on purpose: QPay often leaves them out.
      return json({ invoice_id: `inv-${invoices}`, qr_text: "QR", qr_image: "IMG", qPay_shortUrl: "https://s.qpay.mn/x" });
    }
    if (url.pathname === "/v2/payment/check") return json({ count: paymentRows.length, rows: paymentRows });
    if (url.pathname.startsWith("/v2/invoice/") && method === "DELETE") return json({});
    return new Response("unexpected", { status: 500 });
  });
  return {
    calls,
    count: (path: string, method = "POST") => calls.filter((c) => c.path === path && c.method === method).length,
    pay: (amount: string | number, extra: Record<string, unknown> = {}) => {
      paymentRows = [{ payment_id: "pay-1", payment_status: "PAID", payment_amount: amount, payment_type: "P2P", payment_wallet: "Khan", ...extra }];
    },
  };
}

beforeEach(() => {
  vi.stubEnv("QPAY_BASE_URL", QPAY);
  vi.stubEnv("QPAY_USERNAME", "user");
  vi.stubEnv("QPAY_PASSWORD", "pass");
  vi.stubEnv("QPAY_INVOICE_CODE", "TEST_INVOICE");
  vi.stubEnv("QPAY_CALLBACK_TOKEN", TOKEN);
  vi.stubEnv("CONVEX_SITE_URL", SITE);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const qpay = fakeQpay();
  const menuId = await t.run((ctx) =>
    ctx.db.insert("menu", { name: "Бууз", description: "", price: 12000, category: "Mongolian", tags: [], available: true }),
  );
  const placeQpayOrder = async () =>
    (
      await t.mutation(api.orders.create, {
        orderType: "pickup",
        paymentMethod: "qpay",
        items: [{ menuId, quantity: 1 }],
      })
    ).orderId;
  const order = (id: Id<"orders">) => t.run((ctx) => ctx.db.get(id));
  const callback = (orderId: string, token = TOKEN) =>
    t.fetch(`/qpay/callback/${token}/${orderId}?qpay_payment_id=pay-1`, { method: "GET" });
  return { t, qpay, placeQpayOrder, order, callback };
}

describe("qpay.createInvoice", () => {
  test("bills the server-set amount, with a callback carrying token and order id", async () => {
    const { t, qpay, placeQpayOrder, order } = await setup();
    const orderId = await placeQpayOrder();

    const reply = await t.action(api.qpay.createInvoice, { orderId });
    expect(reply).toEqual({
      invoice_id: "inv-1",
      qr_text: "QR",
      qr_image: "IMG",
      qPay_shortUrl: "https://s.qpay.mn/x",
      qPay_deeplink: [],
    });
    const sent = qpay.calls.find((c) => c.path === "/v2/invoice")!.body!;
    expect(sent.amount).toBe(12000);
    expect(sent.sender_invoice_no).toBe(orderId);
    expect(sent.callback_url).toBe(`${SITE}/qpay/callback/${TOKEN}/${orderId}`);
    expect((await order(orderId))?.qpayInvoiceId).toBe("inv-1");
  });

  test("uses the configured callback base (our own domain) when one is set", async () => {
    vi.stubEnv("QPAY_CALLBACK_BASE_URL", "https://1tsegts.com/api/qpay/callback/");
    const { t, qpay, placeQpayOrder } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    const sent = qpay.calls.find((c) => c.path === "/v2/invoice")!.body!;
    expect(sent.callback_url).toBe(`https://1tsegts.com/api/qpay/callback/${TOKEN}/${orderId}`);
  });

  test("is idempotent: a second call returns the stored invoice without calling QPay", async () => {
    const { t, qpay, placeQpayOrder } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    const again = await t.action(api.qpay.createInvoice, { orderId, skipQrImage: true });
    expect(again.invoice_id).toBe("inv-1");
    expect(again.qr_image).toBeNull();
    expect(qpay.count("/v2/invoice")).toBe(1);
  });

  test("re-uses the cached QPay token across invoices", async () => {
    const { t, qpay, placeQpayOrder } = await setup();
    await t.action(api.qpay.createInvoice, { orderId: await placeQpayOrder() });
    await t.action(api.qpay.createInvoice, { orderId: await placeQpayOrder() });
    expect(qpay.count("/v2/auth/token")).toBe(1);
  });

  test("does not reuse a cached token after the merchant account changes", async () => {
    const { t, qpay, placeQpayOrder } = await setup();
    await t.action(api.qpay.createInvoice, { orderId: await placeQpayOrder() });
    vi.stubEnv("QPAY_USERNAME", "another-merchant");
    await t.action(api.qpay.createInvoice, { orderId: await placeQpayOrder() });
    expect(qpay.count("/v2/auth/token")).toBe(2);
  });

  test("refuses expired, cancelled and non-QPay orders", async () => {
    const { t, placeQpayOrder } = await setup();
    const expired = await placeQpayOrder();
    await t.run((ctx) => ctx.db.patch(expired, { paymentExpiresAt: new Date(Date.now() - 1000).toISOString() }));
    await expect(t.action(api.qpay.createInvoice, { orderId: expired })).rejects.toThrow(/ORDER_NOT_PAYABLE/);

    const cancelled = await placeQpayOrder();
    await t.mutation(api.orders.cancel, { orderId: cancelled });
    await expect(t.action(api.qpay.createInvoice, { orderId: cancelled })).rejects.toThrow(/ORDER_NOT_PAYABLE/);

    await expect(t.action(api.qpay.createInvoice, { orderId: "nope" })).rejects.toThrow(/ORDER_NOT_PAYABLE/);
  });

  test("saveInvoice refuses to replace an invoice another call attached first", async () => {
    const { t, placeQpayOrder } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    const second = await t.mutation(internal.payments.saveInvoice, {
      orderId,
      qpayInvoiceId: "inv-late",
      qpayQrText: "QR2",
      qpayQrImage: "",
      qpayShortUrl: "",
      qpayDeeplinks: [],
    });
    expect(second).toEqual({ saved: false });
  });
});

describe("qpayCallback", () => {
  test("rejects a wrong token without touching the order", async () => {
    const { t, placeQpayOrder, callback, order } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    const res = await callback(orderId, "wrong");
    expect(res.status).toBe(401);
    expect((await order(orderId))?.paymentStatus).toBe("AWAITING_PAYMENT");
  });

  test("confirms an exact payment, and a replayed callback changes nothing", async () => {
    const { t, qpay, placeQpayOrder, callback, order } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    qpay.pay("12000.00"); // QPay sends decimal strings

    const first = await callback(orderId);
    expect(first.status).toBe(200);
    expect(await first.text()).toBe("SUCCESS");
    const paid = await order(orderId);
    expect(paid).toMatchObject({
      paymentStatus: "CONFIRMED",
      paidVia: "qpay",
      qpayPaymentId: "pay-1",
      qpayPaymentType: "P2P",
      status: "pending", // kitchen status is never touched by payment
    });

    const replay = await callback(orderId);
    expect(replay.status).toBe(200);
    expect((await order(orderId))?.paidAt).toBe(paid?.paidAt);
  });

  test("flags a payment of the wrong amount for review", async () => {
    const { t, qpay, placeQpayOrder, callback, order } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    qpay.pay("100.00");
    expect((await callback(orderId)).status).toBe(200);
    expect(await order(orderId)).toMatchObject({
      paymentStatus: "MANUAL_REVIEW",
      paymentReviewReason: "qpay_amount_mismatch",
      paymentReviewExpectedMnt: 12000,
      paymentReviewObservedMnt: 100,
    });
  });

  test("flags a payment that lands after expiry", async () => {
    const { t, qpay, placeQpayOrder, callback, order } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    await t.mutation(internal.payments.expireOrder, { orderId });
    qpay.pay(12000);
    expect((await callback(orderId)).status).toBe(200);
    expect(await order(orderId)).toMatchObject({ paymentStatus: "MANUAL_REVIEW", paymentReviewReason: "qpay_paid_after_expiry" });
  });

  test("flags a payment that lands after the customer cancelled", async () => {
    const { t, qpay, placeQpayOrder, callback, order } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    await t.mutation(api.orders.cancel, { orderId });
    qpay.pay(12000);
    expect((await callback(orderId)).status).toBe(200);
    expect(await order(orderId)).toMatchObject({
      status: "cancelled",
      paymentStatus: "MANUAL_REVIEW",
      paymentReviewReason: "qpay_paid_after_cancel",
    });
  });

  test("asks QPay to retry while no payment is visible yet", async () => {
    const { t, placeQpayOrder, callback, order } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    expect((await callback(orderId)).status).toBe(500);
    expect((await order(orderId))?.paymentStatus).toBe("AWAITING_PAYMENT");
  });
});

describe("expirePendingInvoices", () => {
  test("expires lapsed QPay orders, cancels their invoices, and leaves the rest alone", async () => {
    const { t, qpay, placeQpayOrder, order } = await setup();
    const lapsed = await placeQpayOrder();
    const fresh = await placeQpayOrder();
    const paid = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId: lapsed });
    const past = new Date(Date.now() - 60_000).toISOString();
    await t.run(async (ctx) => {
      await ctx.db.patch(lapsed, { paymentExpiresAt: past });
      await ctx.db.patch(paid, { paymentExpiresAt: past, paymentStatus: "CONFIRMED" });
    });

    await t.action(internal.qpay.expirePendingInvoices, {});

    expect((await order(lapsed))?.paymentStatus).toBe("EXPIRED");
    expect((await order(fresh))?.paymentStatus).toBe("AWAITING_PAYMENT");
    expect((await order(paid))?.paymentStatus).toBe("CONFIRMED");
    expect(qpay.count("/v2/invoice/inv-1", "DELETE")).toBe(1);
  });
});

describe("customer cancel", () => {
  test("closes the QPay invoice so the QR stops taking money", async () => {
    vi.useFakeTimers();
    const { t, qpay, placeQpayOrder } = await setup();
    const orderId = await placeQpayOrder();
    await t.action(api.qpay.createInvoice, { orderId });
    await t.mutation(api.orders.cancel, { orderId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(qpay.count("/v2/invoice/inv-1", "DELETE")).toBe(1);
  });
});

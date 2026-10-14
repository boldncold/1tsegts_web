/**
 * QPay: invoice creation, the payment callback, expiry and invoice cleanup.
 *
 * Actions talk to QPay over HTTP; every database change goes through the
 * internal mutations in payments.ts, so state transitions stay transactional
 * even though the HTTP calls around them are not. Ported from functions/src/
 * (createQpayInvoice, qpayWebhook, expirePendingQpayInvoices) — read
 * QPAY_INTEGRATION.md for the protocol.
 *
 * Config comes from Convex environment variables (dashboard → Settings →
 * Environment Variables, or `npx convex env set`):
 *   QPAY_BASE_URL       https://merchant-sandbox.qpay.mn (sandbox) or https://merchant.qpay.mn
 *   QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE
 *   QPAY_CALLBACK_TOKEN random string; part of the callback URL, checked on every callback
 *   QPAY_CALLBACK_BASE_URL optional; production sets it to the whitelisted
 *                       https://1tsegts.com/api/qpay/callback (see callbackBase)
 * Without QPAY_CALLBACK_BASE_URL the callback URL derives from CONVEX_SITE_URL,
 * which Convex provides.
 */

import { ConvexError, v } from "convex/values";
import { action, httpAction, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  QpayApiError,
  qpayAuth,
  qpayCancelInvoice,
  qpayCreateInvoice,
  qpayPaymentCheck,
  qpayRefundPayment,
} from "./lib/qpayClient";

const REAUTH_BUFFER_MS = 60_000;
export const CALLBACK_PATH_PREFIX = "/qpay/callback/";

interface QpayConfig {
  baseUrl: string;
  username: string;
  password: string;
  invoiceCode: string;
  callbackToken: string;
}

const QPAY_ENV = {
  baseUrl: "QPAY_BASE_URL",
  username: "QPAY_USERNAME",
  password: "QPAY_PASSWORD",
  invoiceCode: "QPAY_INVOICE_CODE",
  callbackToken: "QPAY_CALLBACK_TOKEN",
} as const satisfies Record<keyof QpayConfig, string>;

function readQpayConfig(): QpayConfig {
  const entries = Object.entries(QPAY_ENV).map(([key, name]) => [key, process.env[name]?.trim()]);
  const missing = entries
    .filter(([, value]) => !value)
    .map(([key]) => QPAY_ENV[key as keyof QpayConfig]);
  if (missing.length > 0) {
    throw new Error(`QPay config missing: ${missing.join(", ")} (Convex environment variables)`);
  }
  // Trimmed above: a trailing newline or slash from a pasted value breaks
  // every URL built on it.
  const config = Object.fromEntries(entries) as unknown as QpayConfig;
  return { ...config, baseUrl: config.baseUrl.replace(/\/+$/, "") };
}

async function getQpayAccessToken(ctx: ActionCtx, config: QpayConfig): Promise<string> {
  const account = { baseUrl: config.baseUrl, username: config.username };
  const cached = await ctx.runQuery(internal.payments.cachedQpayToken, account);
  if (cached && cached.expiresAt - Date.now() > REAUTH_BUFFER_MS) return cached.accessToken;

  // Re-auth from scratch rather than /refresh: the spec makes refresh one-shot.
  const fresh = await qpayAuth(config.baseUrl, config.username, config.password);
  await ctx.runMutation(internal.payments.storeQpayToken, {
    ...account,
    accessToken: fresh.access_token,
    expiresAt: fresh.expires_in * 1000, // QPay sends a unix timestamp in seconds
  });
  return fresh.access_token;
}

/** What QpayPaymentPanel renders: QPay's own field names, kept from the Firebase callable. */
export interface InvoiceReply {
  invoice_id: string;
  qr_text: string;
  qr_image: string | null;
  qPay_shortUrl: string;
  qPay_deeplink: { name: string; description: string; logo: string; link: string }[];
}

/**
 * Where QPay sends payment callbacks. QPay production only accepts callback
 * hosts on its whitelist (docs/qpay/callback-whitelist-email.md), so
 * production sets QPAY_CALLBACK_BASE_URL to a domain we own —
 * https://1tsegts.com/api/qpay/callback, proxied to this deployment by a
 * Vercel rewrite — and the whitelisted host survives any backend move.
 * Without it, callbacks go straight to this deployment's own site URL.
 */
function callbackBase(): string {
  const configured = process.env.QPAY_CALLBACK_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const site = process.env.CONVEX_SITE_URL;
  if (!site) throw new Error("CONVEX_SITE_URL is not set");
  return `${site}${CALLBACK_PATH_PREFIX.replace(/\/$/, "")}`;
}

function notPayable(reason: string): never {
  throw new ConvexError({ code: "ORDER_NOT_PAYABLE", reason });
}

/**
 * Pre-warm, fired when the checkout form opens: absorbs the cold start and any
 * QPay re-auth so "Confirm order" only pays for the invoice. Moves no money.
 */
export const warmUp = action({
  args: {},
  handler: async (ctx) => {
    try {
      await getQpayAccessToken(ctx, readQpayConfig());
    } catch {
      // Best effort: a real problem surfaces on createInvoice with a proper error.
    }
    return null;
  },
});

/**
 * The QR and bank deep links for a QPay order. Idempotent: an order that
 * already has an invoice gets the stored one back without calling QPay. Bills
 * order.amountMnt, which the server set when it priced the order.
 */
export const createInvoice = action({
  args: {
    orderId: v.string(),
    // Mobile pays by app and rarely renders the QR; the base64 PNG is ~30-60KB
    // of the reply. It is still stored on the order for the QR toggle.
    skipQrImage: v.optional(v.boolean()),
  },
  handler: async (ctx, { orderId, skipQrImage }): Promise<InvoiceReply> => {
    const order = await ctx.runQuery(internal.payments.orderForInvoice, { orderId });
    if (!order) notPayable("not_found");
    if (order.paymentMethod !== "qpay") notPayable("not_qpay");
    if (order.paymentStatus !== "AWAITING_PAYMENT") notPayable(`state:${order.paymentStatus}`);
    if (order.status === "cancelled") notPayable("cancelled");

    const respond = (invoice: {
      invoiceId: string;
      qrText: string;
      qrImage: string;
      shortUrl: string;
      deeplinks: { name: string; description: string; logo: string; link: string }[];
    }): InvoiceReply => ({
      invoice_id: invoice.invoiceId,
      qr_text: invoice.qrText,
      qr_image: skipQrImage ? null : invoice.qrImage,
      qPay_shortUrl: invoice.shortUrl,
      qPay_deeplink: invoice.deeplinks,
    });

    if (order.qpayInvoiceId && order.qpayQrText) {
      return respond({
        invoiceId: order.qpayInvoiceId,
        qrText: order.qpayQrText,
        qrImage: order.qpayQrImage ?? "",
        shortUrl: order.qpayShortUrl ?? "",
        deeplinks: order.qpayDeeplinks ?? [],
      });
    }
    // Don't mint an invoice for a window that has closed; expiry is imminent.
    if (Date.parse(order.paymentExpiresAt ?? "") <= Date.now()) notPayable("expired");
    const amount = order.amountMnt ?? 0;
    if (amount <= 0) notPayable("no_amount");

    let config: QpayConfig;
    let accessToken: string;
    let created;
    try {
      config = readQpayConfig();
      accessToken = await getQpayAccessToken(ctx, config);
      created = await qpayCreateInvoice(config.baseUrl, accessToken, {
        invoice_code: config.invoiceCode,
        sender_invoice_no: order.id,
        invoice_receiver_code: "terminal",
        invoice_description: `1tsegts order #${order.orderNumber ?? order.id}`.slice(0, 255),
        amount,
        // Token first, so an order id that leaks alone exposes nothing.
        callback_url:
          `${callbackBase()}/${encodeURIComponent(config.callbackToken)}` +
          `/${encodeURIComponent(order.id)}`,
      });
    } catch (err) {
      console.error("qpay.createInvoice: QPay call failed", { orderId: order.id, error: String(err) });
      throw new ConvexError({ code: "QPAY_UNAVAILABLE", reason: String(err).slice(0, 300) });
    }

    const invoice = {
      invoiceId: created.invoice_id,
      qrText: created.qr_text ?? "",
      qrImage: created.qr_image ?? "",
      shortUrl: created.qPay_shortUrl ?? "",
      deeplinks: created.qPay_deeplink ?? [],
    };
    const { saved } = await ctx.runMutation(internal.payments.saveInvoice, {
      orderId: order.id,
      qpayInvoiceId: invoice.invoiceId,
      qpayQrText: invoice.qrText,
      qpayQrImage: invoice.qrImage,
      qpayShortUrl: invoice.shortUrl,
      qpayDeeplinks: invoice.deeplinks,
    });
    if (saved) return respond(invoice);

    // Lost a race: a concurrent call attached its invoice first, or the order
    // stopped awaiting payment. Ours is orphaned — close it so nobody can pay
    // into it — then answer from the order's current state.
    await qpayCancelInvoice(config.baseUrl, accessToken, invoice.invoiceId).catch((err) =>
      console.warn("qpay.createInvoice: could not cancel orphaned invoice", {
        invoiceId: invoice.invoiceId,
        error: String(err),
      }),
    );
    const current = await ctx.runQuery(internal.payments.orderForInvoice, { orderId: order.id });
    if (current?.qpayInvoiceId && current.qpayQrText && current.paymentStatus === "AWAITING_PAYMENT") {
      return respond({
        invoiceId: current.qpayInvoiceId,
        qrText: current.qpayQrText,
        qrImage: current.qpayQrImage ?? "",
        shortUrl: current.qpayShortUrl ?? "",
        deeplinks: current.qpayDeeplinks ?? [],
      });
    }
    notPayable(`state:${current?.paymentStatus}`);
  },
});

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const reply = (status: number, body: string) => new Response(body, { status });

/**
 * QPay's payment callback: <site>/qpay/callback/<token>/<orderId>.
 *
 * The request body is never trusted. The token proves the caller knows our
 * secret; /payment/check is what proves money arrived. QPay needs HTTP 200 and
 * the literal body "SUCCESS", or it retries. Every branch ends in confirmed,
 * flagged for a human, or a deliberate retry (see LESSONS.md).
 */
export const qpayCallback = httpAction(async (ctx, request) => {
  const segments = new URL(request.url).pathname
    .slice(CALLBACK_PATH_PREFIX.length)
    .split("/")
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
  // QPay only appends a ?qpay_payment_id= query, never path segments, so our
  // two values are the last two.
  const [token, orderId] = segments.slice(-2);
  if (!token || !orderId) return reply(400, "bad request");

  let config: QpayConfig;
  try {
    config = readQpayConfig();
  } catch (err) {
    console.error("qpayCallback: QPay not configured", String(err));
    return reply(500, "server error"); // retryable once configured
  }
  if (!constantTimeEqual(token, config.callbackToken)) {
    console.warn("qpayCallback: bad callback token", { orderId });
    return reply(401, "unauthorized");
  }

  const order = await ctx.runQuery(internal.payments.orderForCallback, { orderId });
  if (!order || !order.qpayInvoiceId) {
    // Orders are no longer deleted by customers, so this means a malformed id
    // or a record removed by hand — retrying cannot help. Loud, then ack.
    console.error("qpayCallback: no order/invoice for callback", { orderId });
    return reply(200, "SUCCESS");
  }

  let check;
  try {
    const accessToken = await getQpayAccessToken(ctx, config);
    check = await qpayPaymentCheck(config.baseUrl, accessToken, order.qpayInvoiceId);
  } catch (err) {
    console.error("qpayCallback: payment check failed", { orderId, error: String(err) });
    return reply(500, "server error"); // transient: let QPay retry
  }

  const expected = Math.round(Number(order.amountMnt ?? 0));
  const paidRows = check.rows.filter((r) => r.payment_status === "PAID");
  const exact = paidRows.find((r) => Math.round(Number(r.payment_amount)) === expected);

  if (exact) {
    const result = await ctx.runMutation(internal.payments.markOrderPaid, {
      orderId: order.id,
      meta: {
        source: "qpay",
        qpayPaymentId: exact.payment_id,
        ...(exact.payment_type ? { qpayPaymentType: exact.payment_type } : {}),
        ...(exact.payment_wallet ? { qpayPaymentWallet: exact.payment_wallet } : {}),
      },
    });
    if (result.reason === "bad_state:EXPIRED" || result.reason === "bad_state:cancelled") {
      // Real money on an order that is closed. The invoice cancel at QPay is
      // best-effort, so the QR can outlive the order — flag, never drop.
      const reason =
        result.reason === "bad_state:EXPIRED" ? "qpay_paid_after_expiry" : "qpay_paid_after_cancel";
      console.error(`qpayCallback: ${reason} — flagging for review`, {
        orderId,
        qpayPaymentId: exact.payment_id,
      });
      await ctx.runMutation(internal.payments.flagForReview, {
        orderId: order.id,
        reason,
        expectedAmountMnt: expected,
        observedAmountMnt: Math.round(Number(exact.payment_amount)),
        qpayPaymentId: exact.payment_id,
      });
    } else {
      // updated, already_confirmed (a retry), or already under review.
      console.log("qpayCallback: order paid", { orderId, ...result });
    }
    return reply(200, "SUCCESS");
  }

  if (paidRows.length > 0) {
    // Money arrived but not the amount we billed. Flag and ack, so QPay stops
    // retrying and an admin reconciles.
    const observed = Math.round(Number(paidRows[0].payment_amount));
    console.error("qpayCallback: paid amount mismatch — flagging for review", {
      orderId,
      expected,
      observed: paidRows.map((r) => r.payment_amount),
    });
    await ctx.runMutation(internal.payments.flagForReview, {
      orderId: order.id,
      reason: "qpay_amount_mismatch",
      expectedAmountMnt: expected,
      observedAmountMnt: observed,
      qpayPaymentId: paidRows[0].payment_id,
    });
    return reply(200, "SUCCESS");
  }

  // QPay often calls a beat before /payment/check shows the payment. A 500
  // makes it retry; if it never pays, the expiry cron closes the order.
  console.log("qpayCallback: no PAID row yet", { orderId, rows: check.rows.length });
  return reply(500, "payment not yet visible");
});

/**
 * Every 5 minutes (crons.ts): cancel QPay invoices whose window has passed and
 * mark the orders EXPIRED. The cancel is best-effort — the EXPIRED flip is
 * what the customer sees, and a payment that still lands is flagged.
 */
export const expirePendingInvoices = internalAction({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.runQuery(internal.payments.expiredQpayOrders, { now: Date.now() });
    if (expired.length === 0) return;

    let config: QpayConfig | null = null;
    let accessToken: string | null = null;
    if (expired.some((o) => o.qpayInvoiceId)) {
      try {
        config = readQpayConfig();
        accessToken = await getQpayAccessToken(ctx, config);
      } catch (err) {
        // Non-fatal: still expire the orders; the invoices are retried next run.
        console.error("expirePendingInvoices: QPay auth failed", String(err));
      }
    }

    for (const { orderId, qpayInvoiceId } of expired) {
      if (qpayInvoiceId && config && accessToken) {
        await qpayCancelInvoice(config.baseUrl, accessToken, qpayInvoiceId).catch((err) =>
          console.warn("expirePendingInvoices: cancelInvoice failed", { orderId, error: String(err) }),
        );
      }
      await ctx.runMutation(internal.payments.expireOrder, { orderId });
    }
    console.log("expirePendingInvoices: expired", { count: expired.length });
  },
});

/**
 * Admin refunds a confirmed QPay payment. QPay can only refund CARD payments
 * through the API; a P2P (bank-app) payment — the usual case — is refused with
 * P2P_NOT_REFUNDABLE so the admin refunds it by hand.
 */
export const refund = action({
  args: { orderId: v.id("orders"), note: v.optional(v.string()) },
  handler: async (ctx, { orderId, note }): Promise<{ refunded: true; alreadyRefunded?: true }> => {
    const admin = await ctx.runQuery(internal.staff.currentAdmin, {});
    if (!admin) throw new ConvexError({ code: "NOT_ADMIN" });

    const order = await ctx.runQuery(internal.payments.orderForRefund, { orderId });
    if (!order) throw new ConvexError({ code: "NOT_FOUND" });
    if (order.paymentMethod !== "qpay") throw new ConvexError({ code: "NOT_QPAY" });
    if (order.paymentStatus === "REFUNDED") return { refunded: true, alreadyRefunded: true };
    if (order.paymentStatus !== "CONFIRMED") {
      throw new ConvexError({ code: "NOT_REFUNDABLE", reason: order.paymentStatus ?? "none" });
    }
    if (!order.qpayPaymentId) throw new ConvexError({ code: "NO_PAYMENT_ID" });
    if (order.qpayPaymentType && order.qpayPaymentType !== "CARD") {
      throw new ConvexError({ code: "P2P_NOT_REFUNDABLE" });
    }

    const config = readQpayConfig();
    try {
      await qpayRefundPayment(config.baseUrl, await getQpayAccessToken(ctx, config), order.qpayPaymentId, note);
    } catch (err) {
      // PAYMENT_ALREADY_CANCELED: an earlier attempt refunded at QPay but did
      // not get to record it. Treat as success so the order can settle.
      if (!(err instanceof QpayApiError && err.code === "PAYMENT_ALREADY_CANCELED")) {
        console.error("qpay.refund: QPay refused", { orderId, error: String(err) });
        throw new ConvexError({
          code: "QPAY_REFUND_FAILED",
          reason: err instanceof QpayApiError ? err.code : "unknown",
        });
      }
    }
    await ctx.runMutation(internal.payments.markRefunded, { orderId, ...(note ? { note } : {}) });
    console.log("qpay.refund: refunded", { orderId, by: admin.email });
    return { refunded: true };
  },
});

/** Close an invoice at QPay after the customer cancels its order. Best-effort. */
export const cancelInvoice = internalAction({
  args: { invoiceId: v.string() },
  handler: async (ctx, { invoiceId }) => {
    try {
      const config = readQpayConfig();
      await qpayCancelInvoice(config.baseUrl, await getQpayAccessToken(ctx, config), invoiceId);
    } catch (err) {
      // A payment that lands anyway is caught by the callback and flagged.
      console.warn("cancelInvoice failed", { invoiceId, error: String(err) });
    }
  },
});

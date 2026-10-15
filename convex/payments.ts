/**
 * Payment state transitions — the only code that writes paymentStatus.
 *
 * Every function here is internal: reachable from the QPay callback, the expiry
 * cron and (from P4) the admin's confirm action, never from a browser. Each is
 * a Convex mutation, so it runs as one serializable transaction — the
 * explicit runTransaction calls of functions/src/markOrderPaid.ts and friends
 * are implicit here.
 *
 * paymentStatus is never derived from, nor written together with, the kitchen
 * `status` (see PROJECT.md).
 */

import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/admin";

export const paidMeta = v.object({
  source: v.union(v.literal("qpay"), v.literal("monpay"), v.literal("admin_manual")),
  qpayPaymentId: v.optional(v.string()),
  // Captured at confirm time so a refund can tell CARD (refundable through
  // QPay) from P2P (manual bank transfer) without another API call.
  qpayPaymentType: v.optional(v.string()),
  qpayPaymentWallet: v.optional(v.string()),
  monpayTxnId: v.optional(v.string()),
  /** Reconciled in the same transaction as the order. */
  bankTxId: v.optional(v.id("bankTransactions")),
  // Who confirmed, for admin confirmations — from the verified identity, never
  // from anything a browser sends.
  paidByUid: v.optional(v.string()),
  paidByEmail: v.optional(v.string()),
});

export type MarkPaidResult = { updated: boolean; reason?: string };

/**
 * "This order is paid." Idempotent: a repeat call (QPay retries callbacks)
 * returns already_confirmed and writes nothing.
 */
export const markOrderPaid = internalMutation({
  args: { orderId: v.id("orders"), meta: paidMeta },
  handler: (ctx, { orderId, meta }) => markPaid(ctx, orderId, meta),
});

/**
 * An admin confirms a payment by hand: cash at the counter, or a bank transfer
 * they have checked (pass bankTxId to reconcile it in the same transaction).
 * Attribution comes from the verified sign-in, never from the browser.
 * Returns the result rather than throwing on a refusal, so the dashboard can
 * tell "already confirmed" (benign) from "bad state" (money on a closed order).
 */
export const confirmPayment = mutation({
  args: { orderId: v.id("orders"), bankTxId: v.optional(v.id("bankTransactions")) },
  handler: async (ctx, { orderId, bankTxId }) => {
    const admin = await requireAdmin(ctx);
    const result = await markPaid(ctx, orderId, {
      source: "admin_manual",
      ...(bankTxId ? { bankTxId } : {}),
      paidByUid: admin.userId,
      paidByEmail: admin.email,
    });
    console.log("confirmPayment", { orderId, bankTxId, by: admin.email, ...result });
    return result;
  },
});

export async function markPaid(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  meta: Infer<typeof paidMeta>,
): Promise<MarkPaidResult> {
  const order = await ctx.db.get(orderId);
  if (!order) return { updated: false, reason: "order_not_found" };
  if (order.paymentStatus === "CONFIRMED") return { updated: false, reason: "already_confirmed" };

  // The customer cancelled while the payment was in flight. Never confirm a
  // cancelled order: the kitchen won't cook it, yet the money is real — the
  // caller flags it for an admin instead.
  if (order.status === "cancelled") return { updated: false, reason: "bad_state:cancelled" };

  // Cash orders carry no payment state until a cashier marks them paid.
  // Narrow on purpose: a cash order since EXPIRED or REFUNDED still fails.
  const isUnpaidCashOrder = order.paymentMethod === "cash" && order.paymentStatus === undefined;
  if (!isUnpaidCashOrder && order.paymentStatus !== "AWAITING_PAYMENT") {
    return { updated: false, reason: `bad_state:${order.paymentStatus ?? "none"}` };
  }

  // One bank credit settles one order: an entry already reconciled against a
  // different order must not confirm this one too.
  const tx = meta.bankTxId ? await ctx.db.get(meta.bankTxId) : null;
  if (tx?.matchStatus === "reconciled" && tx.matchedOrderId !== orderId) {
    return { updated: false, reason: "bad_state:bank_entry_already_used" };
  }

  await ctx.db.patch(orderId, {
    paymentStatus: "CONFIRMED",
    paidAt: new Date().toISOString(),
    paidVia: meta.source,
    ...(meta.qpayPaymentId ? { qpayPaymentId: meta.qpayPaymentId } : {}),
    ...(meta.qpayPaymentType ? { qpayPaymentType: meta.qpayPaymentType } : {}),
    ...(meta.qpayPaymentWallet ? { qpayPaymentWallet: meta.qpayPaymentWallet } : {}),
    ...(meta.monpayTxnId ? { monpayTxnId: meta.monpayTxnId } : {}),
    ...(meta.bankTxId ? { matchedTxId: meta.bankTxId } : {}),
    ...(meta.paidByUid ? { paidByUid: meta.paidByUid } : {}),
    ...(meta.paidByEmail ? { paidBy: meta.paidByEmail } : {}),
    // The ~30-60KB QR is only needed while awaiting payment; dropping it
    // keeps a kept-forever order at a couple of KB.
    qpayQrImage: undefined,
  });

  if (tx) await ctx.db.patch(tx._id, { matchStatus: "reconciled", matchedOrderId: orderId });
  return { updated: true };
}

/**
 * Real money arrived that can't be auto-confirmed (wrong amount, paid after
 * expiry or cancellation). Never dropped, never retried forever: parked for a
 * human. A CONFIRMED or REFUNDED order is left alone.
 */
export const flagForReview = internalMutation({
  args: {
    orderId: v.id("orders"),
    reason: v.string(),
    expectedAmountMnt: v.number(),
    observedAmountMnt: v.number(),
    qpayPaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;
    if (order.paymentStatus === "CONFIRMED" || order.paymentStatus === "REFUNDED") return;
    await ctx.db.patch(args.orderId, {
      paymentStatus: "MANUAL_REVIEW",
      paymentReviewReason: args.reason,
      paymentReviewExpectedMnt: args.expectedAmountMnt,
      paymentReviewObservedMnt: args.observedAmountMnt,
      qpayPaymentId: args.qpayPaymentId,
      flaggedForReviewAt: new Date().toISOString(),
    });
  },
});

/** Only flips a still-AWAITING order, so a payment confirmed meanwhile wins. */
export const expireOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (order?.paymentStatus !== "AWAITING_PAYMENT") return false;
    await ctx.db.patch(orderId, {
      paymentStatus: "EXPIRED",
      expiredAt: new Date().toISOString(),
      qpayQrImage: undefined, // see markPaid
    });
    return true;
  },
});

/** QPay orders past their payment window (bounded, so a backlog can't blow up one run). */
export const expiredQpayOrders = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const awaiting = await ctx.db
      .query("orders")
      .withIndex("by_paymentStatus_method", (q) =>
        q.eq("paymentStatus", "AWAITING_PAYMENT").eq("paymentMethod", "qpay"),
      )
      .take(200);
    return awaiting
      .filter((order) => {
        const expiresAt = Date.parse(order.paymentExpiresAt ?? "");
        // Unparseable: treat as fresh rather than expire a payable order.
        return !Number.isNaN(expiresAt) && expiresAt < now;
      })
      .map((order) => ({ orderId: order._id, qpayInvoiceId: order.qpayInvoiceId }));
  },
});

/** What createInvoice needs to know about an order, by Convex id. */
export const orderForInvoice = internalQuery({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const id = ctx.db.normalizeId("orders", orderId);
    const order = id ? await ctx.db.get(id) : null;
    if (!order) return null;
    return {
      id: order._id,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paymentExpiresAt: order.paymentExpiresAt,
      amountMnt: order.amountMnt,
      orderNumber: order.orderNumber,
      qpayInvoiceId: order.qpayInvoiceId,
      qpayQrText: order.qpayQrText,
      qpayQrImage: order.qpayQrImage,
      qpayShortUrl: order.qpayShortUrl,
      qpayDeeplinks: order.qpayDeeplinks,
    };
  },
});

/**
 * Attach a freshly created QPay invoice. Refuses (saved: false) if another
 * call attached one first or the order stopped awaiting payment meanwhile —
 * the caller then cancels its now-orphaned invoice at QPay.
 */
export const saveInvoice = internalMutation({
  args: {
    orderId: v.id("orders"),
    qpayInvoiceId: v.string(),
    qpayQrText: v.string(),
    qpayQrImage: v.string(),
    qpayShortUrl: v.string(),
    qpayDeeplinks: v.array(
      v.object({ name: v.string(), description: v.string(), logo: v.string(), link: v.string() }),
    ),
  },
  handler: async (ctx, { orderId, ...invoice }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.qpayInvoiceId || order.paymentStatus !== "AWAITING_PAYMENT") {
      return { saved: false };
    }
    await ctx.db.patch(orderId, invoice);
    return { saved: true };
  },
});

/** What the QPay callback needs, by the order id in its URL. */
export const orderForCallback = internalQuery({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const id = ctx.db.normalizeId("orders", orderId);
    const order = id ? await ctx.db.get(id) : null;
    if (!order) return null;
    return {
      id: order._id,
      qpayInvoiceId: order.qpayInvoiceId,
      amountMnt: order.amountMnt ?? order.total,
    };
  },
});

export const cachedQpayToken = internalQuery({
  args: { baseUrl: v.string(), username: v.string() },
  handler: (ctx, { baseUrl, username }) =>
    ctx.db
      .query("qpayTokens")
      .withIndex("by_account", (q) => q.eq("baseUrl", baseUrl).eq("username", username))
      .unique(),
});

export const storeQpayToken = internalMutation({
  args: { baseUrl: v.string(), username: v.string(), accessToken: v.string(), expiresAt: v.number() },
  handler: async (ctx, token) => {
    const existing = await ctx.db
      .query("qpayTokens")
      .withIndex("by_account", (q) => q.eq("baseUrl", token.baseUrl).eq("username", token.username))
      .unique();
    if (existing) await ctx.db.replace(existing._id, token);
    else await ctx.db.insert("qpayTokens", token);
  },
});

/** What the refund action needs to decide, by Convex id. */
export const orderForRefund = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order) return null;
    return {
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      qpayPaymentId: order.qpayPaymentId,
      qpayPaymentType: order.qpayPaymentType,
    };
  },
});

/** Only flips a still-CONFIRMED order, so a state that changed meanwhile is not clobbered. */
export const markRefunded = internalMutation({
  args: { orderId: v.id("orders"), note: v.optional(v.string()) },
  handler: async (ctx, { orderId, note }) => {
    const order = await ctx.db.get(orderId);
    if (order?.paymentStatus !== "CONFIRMED") return false;
    await ctx.db.patch(orderId, {
      paymentStatus: "REFUNDED",
      refundedAt: new Date().toISOString(),
      refundedVia: "qpay",
      ...(note ? { refundNote: note } : {}),
    });
    return true;
  },
});

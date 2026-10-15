/**
 * Admin order management: the kitchen board, status changes, counter orders.
 *
 * Orders are kept, not swept away: the old dashboard deleted everything older
 * than 7 days (paid orders included) on every load. History now stays, and the
 * QR image — the bulk of an order — is dropped once payment settles
 * (payments.ts), so a kept order costs a couple of KB.
 */

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./lib/admin";
import { loadMenuFor, priceCart } from "./lib/orderPricing";
import { nextOrderNumber } from "./orders";
import { orderStatus, orderType } from "./validators";

const BOARD_DAYS = 7;

/** The dashboard's working set: the last week, newest first, without QR images. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const since = new Date(Date.now() - BOARD_DAYS * 86_400_000).toISOString();
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .order("desc")
      .collect();
    return orders.map(({ _id, _creationTime, qpayQrImage, ...order }) => ({ ...order, id: _id }));
  },
});

/** Non-cash orders must not start cooking until their payment is CONFIRMED. */
const KITCHEN_STATES_NEEDING_PAYMENT = new Set<Doc<"orders">["status"]>(["preparing", "ready", "completed"]);

export const setStatus = mutation({
  args: { orderId: v.id("orders"), status: orderStatus },
  handler: async (ctx, { orderId, status }) => {
    await requireAdmin(ctx);
    const order = await ctx.db.get(orderId);
    if (!order) throw new ConvexError({ code: "NOT_FOUND" });

    // The invariant in PROJECT.md, enforced here rather than only by the
    // dashboard hiding a button. An allowlist on CONFIRMED, so any new payment
    // state stays blocked until someone decides otherwise.
    const onlinePayment = order.paymentMethod === "qpay" || order.paymentMethod === "bank_transfer";
    if (onlinePayment && KITCHEN_STATES_NEEDING_PAYMENT.has(status) && order.paymentStatus !== "CONFIRMED") {
      throw new ConvexError({ code: "AWAITING_PAYMENT", reason: order.paymentStatus ?? "none" });
    }

    const cancelling = status === "cancelled" && order.status !== "cancelled";
    await ctx.db.patch(orderId, {
      status,
      ...(cancelling ? { cancelledBy: "restaurant" as const, cancelledAt: new Date().toISOString() } : {}),
    });
    // As with a customer cancel: close the QPay invoice so the QR stops taking
    // money. Best-effort; a payment that still lands is flagged for review.
    if (cancelling && order.qpayInvoiceId && order.paymentStatus === "AWAITING_PAYMENT") {
      await ctx.scheduler.runAfter(0, internal.qpay.cancelInvoice, { invoiceId: order.qpayInvoiceId });
    }
  },
});

/**
 * Delete an order — only one that holds no money and can't receive any. A
 * confirmed, refunded or under-review payment is a financial record, and an
 * issued QPay invoice can still be paid; admin test orders are the exception,
 * since their "payment" is a zero-charge confirmation.
 */
export const remove = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireAdmin(ctx);
    const order = await ctx.db.get(orderId);
    if (!order) return;
    const holdsMoney =
      order.paymentStatus === "CONFIRMED" ||
      order.paymentStatus === "REFUNDED" ||
      order.paymentStatus === "MANUAL_REVIEW";
    if (holdsMoney && !order.isTest) {
      throw new ConvexError({ code: "HOLDS_PAYMENT", reason: order.paymentStatus });
    }
    // Its QPay invoice can still be paid (closing it at QPay is best-effort),
    // and the callback would then find no order to confirm or flag — money in
    // with nothing to show for it. Cancelling keeps the record instead.
    if (order.qpayInvoiceId && !order.isTest) {
      throw new ConvexError({ code: "HAS_QPAY_INVOICE" });
    }
    await ctx.db.delete(orderId);
  },
});

/**
 * A walk-in order entered at the counter: priced on the server, numbered from
 * the same counter as online orders, and straight into the kitchen. No payment
 * method — the cashier handles the money, as before.
 */
export const createCounterOrder = mutation({
  args: {
    items: v.array(
      v.object({ menuId: v.string(), quantity: v.number(), portionName: v.optional(v.string()) }),
    ),
    orderType,
    kioskNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const pricing = priceCart(args.items, await loadMenuFor(ctx, args.items));
    if (pricing.ok === false) {
      throw new ConvexError({ code: "ORDER_UNPRICEABLE", reason: pricing.reason });
    }
    const orderNumber = await nextOrderNumber(ctx);
    const orderId = await ctx.db.insert("orders", {
      items: pricing.items,
      total: pricing.chargedMnt,
      orderType: args.orderType,
      ...(args.orderType === "kiosk" && args.kioskNumber ? { kioskNumber: args.kioskNumber } : {}),
      orderNumber,
      status: "preparing",
      timestamp: new Date().toISOString(),
    });
    return { orderId, orderNumber };
  },
});

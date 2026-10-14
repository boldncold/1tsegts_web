import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { orderType, paymentMethod } from "./validators";
import { loadMenuFor, priceCart } from "./lib/orderPricing";

// Payment windows. The server owns expiry now; the client copies in
// src/lib/qpayConfig.ts and src/lib/bankConfig.ts are display-only.
const QPAY_PAYMENT_WINDOW_MINUTES = 15;
const BANK_PAYMENT_WINDOW_MINUTES = 30;

// Limits carried over from isValidOrder() in firestore.rules.
const MAX_LINES = 50;
const MAX_NAME = 100;
const MAX_PHONE = 20;
const MAX_KIOSK = 50;
const MAX_NOTES = 500;

/** Payment states in which the customer may still back out (an allowlist). */
const CUSTOMER_CANCELLABLE_PAYMENT = new Set<Doc<"orders">["paymentStatus"]>([
  undefined, // cash — paid at the counter, nothing taken yet
  "AWAITING_PAYMENT",
  "EXPIRED",
]);

function invalid(reason: string): never {
  throw new ConvexError({ code: "INVALID_ORDER", reason });
}

/** Sequential 001–999, wrapping. Replaces the random 3-digit number, which could collide. */
async function nextOrderNumber(ctx: MutationCtx): Promise<string> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", "orderNumber"))
    .unique();
  const next = ((counter?.value ?? 0) % 999) + 1;
  if (counter) await ctx.db.patch(counter._id, { value: next });
  else await ctx.db.insert("counters", { name: "orderNumber", value: next });
  return String(next).padStart(3, "0");
}

// Typo-safe reference code for bank transfers (no 0/O, 1/I/L), as in
// src/lib/referenceCode.ts. The customer types it into the transfer memo.
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

async function newReferenceCode(ctx: MutationCtx): Promise<string> {
  for (;;) {
    let code = "GR-";
    for (let i = 0; i < 6; i++) {
      code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
    }
    const taken = await ctx.db
      .query("orders")
      .withIndex("by_referenceCode", (q) => q.eq("referenceCode", code))
      .first();
    if (!taken) return code;
  }
}

/** By Convex id, or by Firestore id for a pending order saved before the cutover. */
async function findOrder(ctx: QueryCtx, orderId: string): Promise<Doc<"orders"> | null> {
  const id = ctx.db.normalizeId("orders", orderId);
  if (id) return ctx.db.get(id);
  return ctx.db
    .query("orders")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", orderId))
    .unique();
}

/**
 * Place an order. The client says what the customer picked; the server prices
 * it, numbers it and sets up payment. Nothing money-related is accepted from
 * the browser.
 */
export const create = mutation({
  args: {
    items: v.array(
      v.object({
        menuId: v.string(),
        quantity: v.number(),
        portionName: v.optional(v.string()),
        packaging: v.optional(v.boolean()),
      }),
    ),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    orderType,
    kioskNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    paymentMethod,
  },
  handler: async (ctx, args) => {
    if (args.items.length > MAX_LINES) invalid("too_many_lines");
    if ((args.customerName?.length ?? 0) >= MAX_NAME) invalid("name_too_long");
    if ((args.phone?.length ?? 0) >= MAX_PHONE) invalid("phone_too_long");
    if ((args.kioskNumber?.length ?? 0) >= MAX_KIOSK) invalid("kiosk_too_long");
    if ((args.notes?.length ?? 0) >= MAX_NOTES) invalid("notes_too_long");

    const pricing = priceCart(args.items, await loadMenuFor(ctx, args.items));
    if (pricing.ok === false) {
      throw new ConvexError({ code: "ORDER_UNPRICEABLE", reason: pricing.reason });
    }
    const amountMnt = pricing.chargedMnt;
    if (args.paymentMethod !== "cash" && amountMnt <= 0) invalid("zero_amount");

    const now = Date.now();
    const expiresIn = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
    const orderNumber = await nextOrderNumber(ctx);

    const orderId = await ctx.db.insert("orders", {
      items: pricing.items,
      total: amountMnt,
      ...(args.customerName ? { customerName: args.customerName } : {}),
      ...(args.phone ? { phone: args.phone } : {}),
      orderType: args.orderType,
      ...(args.orderType === "kiosk" && args.kioskNumber ? { kioskNumber: args.kioskNumber } : {}),
      ...(args.notes ? { notes: args.notes } : {}),
      orderNumber,
      status: "pending",
      timestamp: new Date(now).toISOString(),
      paymentMethod: args.paymentMethod,
      // Cash orders carry no payment state: the cashier takes the money.
      ...(args.paymentMethod === "qpay"
        ? {
            paymentStatus: "AWAITING_PAYMENT" as const,
            amountMnt,
            paymentExpiresAt: expiresIn(QPAY_PAYMENT_WINDOW_MINUTES),
          }
        : {}),
      ...(args.paymentMethod === "bank_transfer"
        ? {
            paymentStatus: "AWAITING_PAYMENT" as const,
            amountMnt,
            referenceCode: await newReferenceCode(ctx),
            paymentExpiresAt: expiresIn(BANK_PAYMENT_WINDOW_MINUTES),
          }
        : {}),
    });

    // Popularity, server-side now — Firestore let any client increment it.
    for (const item of pricing.items) {
      const id = ctx.db.normalizeId("menu", item.id);
      const row = id && (await ctx.db.get(id));
      if (row) await ctx.db.patch(row._id, { orderCount: (row.orderCount ?? 0) + item.quantity });
    }

    return { orderId, orderNumber };
  },
});

/**
 * A customer's view of their own order, for the pending-order tracker. Anyone
 * holding the id can read it, as with Firestore; staff-only fields are left out.
 * `id` is the canonical Convex id, so a client tracking a Firestore id can switch.
 */
export const track = query({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const order = await findOrder(ctx, orderId);
    if (!order) return null;
    const {
      _id,
      _creationTime,
      legacyId,
      paidBy,
      paidByUid,
      matchedTxId,
      paymentReviewReason,
      paymentReviewExpectedMnt,
      paymentReviewObservedMnt,
      flaggedForReviewAt,
      isTest,
      adminDiscountMnt,
      ...view
    } = order;
    return { ...view, id: _id };
  },
});

/** Customer backs out. Kept as a cancelled record rather than deleted (see schema). */
export const cancel = mutation({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const order = await findOrder(ctx, orderId);
    if (!order) return { cancelled: false as const, reason: "not_found" };
    if (order.status === "cancelled") return { cancelled: true as const };
    if (order.status !== "pending" || !CUSTOMER_CANCELLABLE_PAYMENT.has(order.paymentStatus)) {
      throw new ConvexError({
        code: "NOT_CANCELLABLE",
        reason: `${order.status}/${order.paymentStatus ?? "cash"}`,
      });
    }
    await ctx.db.patch(order._id, {
      status: "cancelled",
      cancelledBy: "customer",
      cancelledAt: new Date().toISOString(),
    });
    // Close the QPay invoice so the QR stops accepting money. Best-effort: a
    // payment that still lands is flagged by the callback.
    if (order.qpayInvoiceId && order.paymentStatus === "AWAITING_PAYMENT") {
      await ctx.scheduler.runAfter(0, internal.qpay.cancelInvoice, { invoiceId: order.qpayInvoiceId });
    }
    return { cancelled: true as const };
  },
});

import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  bankTxMatchStatus,
  category,
  imageRef,
  itemStatus,
  orderItem,
  orderStatus,
  orderType,
  paidVia,
  paymentMethod,
  paymentStatus,
  portion,
  qpayBankDeeplink,
} from "./validators";

export const menuFields = {
  name: v.string(),
  description: v.string(),
  price: v.number(),
  image: v.optional(imageRef),
  sideImages: v.optional(v.array(imageRef)),
  category,
  tags: v.array(v.string()),
  available: v.boolean(), // legacy flag, kept alongside `status`
  status: v.optional(itemStatus),
  statusUntil: v.optional(v.number()),
  scheduledDays: v.optional(v.array(v.number())), // 0=Sun … 6=Sat
  todayOnly: v.optional(v.boolean()),
  featured: v.optional(v.boolean()),
  // Lives on the item because the public menu ranks and badges by it.
  orderCount: v.optional(v.number()),
  packagingPrice: v.optional(v.number()),
  portions: v.optional(v.array(portion)),
  pool: v.optional(v.literal("specials")),
  legacyId: v.optional(v.string()), // Firestore doc id, for re-runnable imports
};

// Every field optional, like the Firestore doc it replaces: the client merges
// whatever is stored over DEFAULT_STORE_SETTINGS (src/lib/utils.ts).
export const storeSettingsFields = {
  openHour: v.optional(v.number()),
  closeHour: v.optional(v.number()),
  closedDays: v.optional(v.array(v.number())), // 0=Sun … 6=Sat
  closedUntil: v.optional(v.union(v.string(), v.null())), // YYYY-MM-DD
  noClosedDayUntil: v.optional(v.union(v.string(), v.null())), // YYYY-MM-DD
};

export const orderFields = {
  items: v.array(orderItem),
  total: v.number(),
  customerName: v.optional(v.string()),
  phone: v.optional(v.string()),
  orderType,
  kioskNumber: v.optional(v.string()),
  orderNumber: v.optional(v.string()),
  notes: v.optional(v.string()),
  status: orderStatus, // kitchen state — never derived from paymentStatus
  timestamp: v.string(), // ISO
  // Cancelled orders are kept, not deleted: a QPay payment can still land on
  // one, and the webhook must be able to find it and flag it for review.
  cancelledBy: v.optional(v.union(v.literal("customer"), v.literal("restaurant"))),
  cancelledAt: v.optional(v.string()),

  paymentMethod: v.optional(paymentMethod),
  paymentStatus: v.optional(paymentStatus),
  referenceCode: v.optional(v.string()),
  amountMnt: v.optional(v.number()),
  paymentExpiresAt: v.optional(v.string()),
  matchedTxId: v.optional(v.string()), // bank tx id; Firestore ids on imported orders
  paidAt: v.optional(v.string()),
  paidBy: v.optional(v.string()),
  paidByUid: v.optional(v.string()),
  paidVia: v.optional(paidVia),
  expiredAt: v.optional(v.string()), // written by the expiry job

  qpayInvoiceId: v.optional(v.string()),
  qpayPaymentId: v.optional(v.string()),
  qpayPaymentType: v.optional(v.string()),
  qpayPaymentWallet: v.optional(v.string()),
  qpayQrText: v.optional(v.string()),
  qpayQrImage: v.optional(v.string()),
  qpayShortUrl: v.optional(v.string()),
  qpayDeeplinks: v.optional(v.array(qpayBankDeeplink)),
  monpayTxnId: v.optional(v.string()),

  refundedAt: v.optional(v.string()),
  refundedVia: v.optional(v.union(v.literal("qpay"), v.literal("manual"))),
  refundNote: v.optional(v.string()),

  paymentReviewReason: v.optional(v.string()),
  paymentReviewExpectedMnt: v.optional(v.number()),
  paymentReviewObservedMnt: v.optional(v.number()),
  flaggedForReviewAt: v.optional(v.string()),
  // How an admin settled the review (payments.acceptReviewedPayment / markReviewRefunded).
  reviewResolution: v.optional(v.union(v.literal("accepted"), v.literal("refunded_manually"))),
  reviewResolvedAt: v.optional(v.string()),
  reviewResolvedBy: v.optional(v.string()),

  isTest: v.optional(v.boolean()),
  adminDiscountMnt: v.optional(v.number()),

  legacyId: v.optional(v.string()),
};

export default defineSchema({
  // Convex Auth: users, sessions, accounts. Only admins ever sign in.
  ...authTables,

  menu: defineTable(menuFields)
    .index("by_name", ["name"])
    .index("by_featured", ["featured", "available"])
    .index("by_available_orderCount", ["available", "orderCount"])
    .index("by_legacyId", ["legacyId"]),

  // Single row — the store hours every visitor's StoreSettingsContext reads.
  storeSettings: defineTable(storeSettingsFields),

  orders: defineTable(orderFields)
    .index("by_timestamp", ["timestamp"])
    .index("by_paymentStatus_method", ["paymentStatus", "paymentMethod"])
    .index("by_referenceCode", ["referenceCode"])
    .index("by_legacyId", ["legacyId"]),

  bankTransactions: defineTable({
    source: v.literal("manual"),
    amountMnt: v.number(),
    direction: v.union(v.literal("credit"), v.literal("debit")),
    description: v.string(),
    referenceCode: v.optional(v.string()),
    bankTxId: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderAccount: v.optional(v.string()),
    postedAt: v.string(),
    receivedAt: v.string(),
    matchedOrderId: v.optional(v.id("orders")),
    matchStatus: bankTxMatchStatus,
  })
    .index("by_postedAt", ["postedAt"])
    .index("by_matchStatus", ["matchStatus"]),

  // Named monotonic counters, e.g. "orderNumber". One row per name, so
  // concurrent increments conflict and Convex retries them in order.
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  // QPay bearer token, re-used until ~60s before expiry (QPay's spec asks for
  // sparing /auth/token calls). Keyed by base URL and merchant, so a token is
  // never sent to another environment or used for another merchant account.
  qpayTokens: defineTable({
    baseUrl: v.string(),
    username: v.string(),
    accessToken: v.string(),
    expiresAt: v.number(), // ms since epoch
  }).index("by_account", ["baseUrl", "username"]),

  // Admin allowlist, replacing Firestore's admin_emails + users.role.
  admins: defineTable({
    email: v.string(), // lowercased
  }).index("by_email", ["email"]),
});

/**
 * Field validators shared by the schema and by function arguments.
 *
 * These mirror src/types.ts — that file stays the client's view of the data,
 * this one is what the database enforces. Change both together.
 */

import { v } from "convex/values";

export const category = v.union(
  v.literal("European"),
  v.literal("Asian"),
  v.literal("Drinks"),
  v.literal("Mongolian"),
  v.literal("Draft"),
  // Possibly present on menu docs imported from Firestore;
  // the UI groups specials through `pool` instead.
  v.literal("Specials"),
);

export const itemStatus = v.union(
  v.literal("available"),
  v.literal("sold_out_today"),
  v.literal("hidden"),
  v.literal("daily_special"), // legacy, see ItemStatus in src/types.ts
);

export const portion = v.object({
  name: v.string(),
  price: v.number(),
  available: v.optional(v.boolean()),
});

/**
 * A menu image: an uploaded file in Convex storage, or an external URL (items
 * imported from Firestore can carry one). Firestore stored uploads as
 * base64 data URLs inside the document — moved to storage on import, because
 * every reactive re-run of the menu query would otherwise re-read megabytes.
 */
export const imageRef = v.union(
  v.object({ storageId: v.id("_storage") }),
  v.object({ url: v.string() }),
);

export const orderStatus = v.union(
  v.literal("pending"),
  v.literal("preparing"),
  v.literal("ready"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const orderType = v.union(v.literal("pickup"), v.literal("kiosk"));

export const paymentMethod = v.union(
  v.literal("qpay"),
  v.literal("cash"),
  v.literal("bank_transfer"),
);

// Kept strictly separate from orderStatus — see PROJECT.md.
export const paymentStatus = v.union(
  v.literal("AWAITING_PAYMENT"),
  v.literal("CONFIRMED"),
  v.literal("EXPIRED"),
  v.literal("MANUAL_REVIEW"),
  v.literal("REFUNDED"),
);

export const paidVia = v.union(
  v.literal("qpay"),
  v.literal("admin_manual"),
  v.literal("monpay"),
  // Removed Gmail-ingestion path; may survive on imported history.
  v.literal("email_parse"),
  v.literal("auto_email_match"),
);

export const qpayBankDeeplink = v.object({
  name: v.string(),
  description: v.string(),
  logo: v.string(),
  link: v.string(),
});

export const orderItem = v.object({
  // Menu item id. A string rather than v.id("menu"): imported orders carry
  // Firestore ids, and an order is a historical record — it must not break
  // when the menu item is later deleted.
  id: v.string(),
  name: v.string(),
  price: v.number(),
  quantity: v.number(),
  packaging: v.optional(v.boolean()),
  packagingPrice: v.optional(v.number()),
  // The admin "add order" form writes null when no portion was chosen.
  selectedPortion: v.optional(v.union(portion, v.null())),
});

export const bankTxMatchStatus = v.union(
  v.literal("unmatched"),
  v.literal("matched"),
  v.literal("amount_mismatch"),
  v.literal("unknown_ref"),
  v.literal("reconciled"),
);

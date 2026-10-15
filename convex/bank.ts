/**
 * Bank-transfer ledger: admin-entered credits, matched to orders by the
 * reference code the customer put in the transfer memo. Ported from
 * functions/src/bankMatching.ts + reconcileBankTransaction + sweepBankTransactions.
 *
 * Matching only produces a status for the dashboard. Nothing is confirmed here:
 * every transaction is typed by a human, so an admin checks it and confirms
 * through payments.confirmPayment (passing bankTxId to reconcile both at once).
 */

import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/admin";

/** Reference codes the checkout hands the customer, e.g. GR-7K2M9Q. */
const REF_CODE_RE = /GR-[A-Z2-9]{6}/i;
const LEDGER_DAYS = 7;
const SWEEP_LIMIT = 200;

type MatchStatus = Doc<"bankTransactions">["matchStatus"];

async function computeMatch(
  ctx: MutationCtx,
  tx: Pick<Doc<"bankTransactions">, "description" | "amountMnt" | "matchStatus" | "matchedOrderId">,
): Promise<{ status: MatchStatus; orderId?: Id<"orders"> }> {
  // Reconciled is terminal: an admin already settled it.
  if (tx.matchStatus === "reconciled" && tx.matchedOrderId) {
    return { status: "reconciled", orderId: tx.matchedOrderId };
  }
  const ref = tx.description.match(REF_CODE_RE)?.[0]?.toUpperCase();
  if (!ref) return { status: "unmatched" };
  const order = await ctx.db
    .query("orders")
    .withIndex("by_referenceCode", (q) => q.eq("referenceCode", ref))
    .first();
  if (!order) return { status: "unknown_ref" };
  if (typeof order.amountMnt === "number" && order.amountMnt !== tx.amountMnt) {
    return { status: "amount_mismatch", orderId: order._id };
  }
  return { status: "matched", orderId: order._id };
}

export const recent = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const since = new Date(Date.now() - LEDGER_DAYS * 86_400_000).toISOString();
    const rows = await ctx.db
      .query("bankTransactions")
      .withIndex("by_postedAt", (q) => q.gte("postedAt", since))
      .order("desc")
      .collect();
    return rows.map(({ _id, _creationTime, ...tx }) => ({ ...tx, id: _id }));
  },
});

/** Admin types in a credit from the bank statement; it is matched on the spot. */
export const add = mutation({
  args: {
    amountMnt: v.number(),
    description: v.string(),
    senderName: v.optional(v.string()),
    postedAt: v.string(), // ISO
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isSafeInteger(args.amountMnt) || args.amountMnt <= 0) {
      throw new ConvexError({ code: "INVALID_AMOUNT" });
    }
    if (Number.isNaN(Date.parse(args.postedAt))) throw new ConvexError({ code: "INVALID_DATE" });

    const referenceCode = args.description.match(REF_CODE_RE)?.[0]?.toUpperCase();
    const match = await computeMatch(ctx, { description: args.description, amountMnt: args.amountMnt, matchStatus: "unmatched" });
    return ctx.db.insert("bankTransactions", {
      source: "manual",
      amountMnt: args.amountMnt,
      direction: "credit",
      description: args.description,
      ...(referenceCode ? { referenceCode } : {}),
      ...(args.senderName ? { senderName: args.senderName } : {}),
      postedAt: new Date(args.postedAt).toISOString(),
      receivedAt: new Date().toISOString(),
      matchStatus: match.status,
      ...(match.orderId ? { matchedOrderId: match.orderId } : {}),
    });
  },
});

/** A mistyped entry can be removed — not one already reconciled against a confirmed order. */
export const remove = mutation({
  args: { txId: v.id("bankTransactions") },
  handler: async (ctx, { txId }) => {
    await requireAdmin(ctx);
    const tx = await ctx.db.get(txId);
    if (!tx) return;
    if (tx.matchStatus === "reconciled") throw new ConvexError({ code: "RECONCILED" });
    await ctx.db.delete(txId);
  },
});

/**
 * Every 5 minutes (crons.ts): re-match open entries. Catches the transfer typed
 * in before its order existed (unknown_ref) and an order's amount changing.
 * Idempotent; writes only when a match changes.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    let examined = 0;
    let rematched = 0;
    for (const status of ["unmatched", "matched", "amount_mismatch", "unknown_ref"] as const) {
      const open = await ctx.db
        .query("bankTransactions")
        .withIndex("by_matchStatus", (q) => q.eq("matchStatus", status))
        .take(SWEEP_LIMIT);
      for (const tx of open) {
        examined += 1;
        const match = await computeMatch(ctx, tx);
        if (match.status !== tx.matchStatus || match.orderId !== tx.matchedOrderId) {
          await ctx.db.patch(tx._id, { matchStatus: match.status, matchedOrderId: match.orderId });
          rematched += 1;
        }
      }
    }
    // Logged even when empty, so "examined nothing" is distinguishable from "never ran".
    console.log("bank.sweep", { examined, rematched });
  },
});

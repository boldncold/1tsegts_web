/** Who is signed in, and the admin allowlist (replaces Firestore admin_emails). */

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getAdmin, OWNER_EMAIL, requireAdmin } from "./lib/admin";

/** For AuthContext: null when signed out. isAdmin drives UI only — every admin function re-checks. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return {
      email: user?.email ?? null,
      name: user?.name ?? null,
      image: user?.image ?? null,
      isAdmin: (await getAdmin(ctx)) !== null,
    };
  },
});

/** The admin check for actions, which have no db: runQuery carries the caller's auth. */
export const currentAdmin = internalQuery({
  args: {},
  handler: (ctx) => getAdmin(ctx),
});

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("admins").collect();
    return rows.map((row) => row.email).sort();
  },
});

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ConvexError({ code: "INVALID_EMAIL" });
  }
  return normalized;
}

export const addAdmin = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await requireAdmin(ctx);
    const normalized = normalizeEmail(email);
    if (normalized === OWNER_EMAIL) return; // always an admin
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (!existing) await ctx.db.insert("admins", { email: normalized });
  },
});

export const removeAdmin = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const admin = await requireAdmin(ctx);
    const normalized = email.trim().toLowerCase();
    // The owner is hard-coded, and nobody removes themselves by accident.
    if (normalized === OWNER_EMAIL || normalized === admin.email) {
      throw new ConvexError({ code: "CANNOT_REMOVE" });
    }
    const row = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

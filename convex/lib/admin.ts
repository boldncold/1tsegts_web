/**
 * Server-side admin check — the enforcement boundary that firestore.rules'
 * isAdmin() used to be. The admin dashboard hiding itself is UX only.
 *
 * An admin is a signed-in user whose (Google-verified) email is the owner's or
 * on the `admins` list. Mirrors resolveIsAdmin in src/context/AuthContext.tsx.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const OWNER_EMAIL = "boldsaihanlolor@gmail.com";

export interface AdminIdentity {
  userId: Id<"users">;
  email: string;
}

export async function getAdmin(ctx: QueryCtx): Promise<AdminIdentity | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const email = (await ctx.db.get(userId))?.email?.trim().toLowerCase();
  if (!email) return null;
  if (email === OWNER_EMAIL) return { userId, email };
  const listed = await ctx.db
    .query("admins")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return listed ? { userId, email } : null;
}

export async function requireAdmin(ctx: QueryCtx): Promise<AdminIdentity> {
  const admin = await getAdmin(ctx);
  if (!admin) throw new ConvexError({ code: "NOT_ADMIN" });
  return admin;
}

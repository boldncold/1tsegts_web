import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { Infer } from "convex/values";
import type { imageRef } from "./validators";

async function imageUrl(
  ctx: QueryCtx,
  ref: Infer<typeof imageRef> | undefined,
): Promise<string> {
  if (!ref) return "";
  if ("url" in ref) return ref.url;
  return (await ctx.storage.getUrl(ref.storageId)) ?? "";
}

/**
 * The client's MenuItem shape (src/types.ts): `id` instead of `_id`, images
 * resolved to URLs, import bookkeeping left out.
 */
async function toMenuItem(ctx: QueryCtx, item: Doc<"menu">) {
  const { _id, _creationTime, legacyId, image, sideImages, ...rest } = item;
  return {
    ...rest,
    id: _id,
    image: await imageUrl(ctx, image),
    sideImages: await Promise.all((sideImages ?? []).map((ref) => imageUrl(ctx, ref))),
  };
}

/**
 * The whole menu, by name. Hidden and sold-out items are included, as they
 * were from Firestore: the client applies status and schedule rules itself
 * (getDynamicStatus in src/lib/utils.ts), and none of it is secret.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("menu").withIndex("by_name").collect();
    return Promise.all(items.map((item) => toMenuItem(ctx, item)));
  },
});

/**
 * Up to 10 dishes for the home-page carousel: the admin's featured picks, or
 * the most-ordered available dishes when nothing is featured.
 */
export const featured = query({
  args: {},
  handler: async (ctx) => {
    const picks = await ctx.db
      .query("menu")
      .withIndex("by_featured", (q) => q.eq("featured", true).eq("available", true))
      .take(10);
    const items =
      picks.length > 0
        ? picks
        : await ctx.db
            .query("menu")
            .withIndex("by_available_orderCount", (q) => q.eq("available", true))
            .order("desc")
            .take(10);
    return Promise.all(items.map((item) => toMenuItem(ctx, item)));
  },
});

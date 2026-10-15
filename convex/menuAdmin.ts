/**
 * Admin menu management. Images are uploaded to Convex storage by the browser
 * (generateUploadUrl) and saved as storage references; the old Firestore model
 * kept base64 data URLs inside the menu documents.
 */

import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/admin";
import { toMenuItem } from "./menu";
import { category, imageRef, itemStatus, portion } from "./validators";

type ImageRef = Infer<typeof imageRef>;

/** The public MenuItem shape plus the raw image references, so an unchanged image is saved back as-is. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const items = await ctx.db.query("menu").withIndex("by_name").collect();
    return Promise.all(
      items.map(async (item) => ({
        ...(await toMenuItem(ctx, item)),
        imageRef: item.image ?? null,
        sideImageRefs: item.sideImages ?? [],
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

const editable = v.object({
  name: v.string(),
  description: v.string(),
  price: v.number(),
  category,
  tags: v.array(v.string()),
  available: v.boolean(),
  status: itemStatus,
  statusUntil: v.union(v.number(), v.null()),
  scheduledDays: v.array(v.number()),
  todayOnly: v.boolean(),
  featured: v.boolean(),
  packagingPrice: v.number(),
  portions: v.array(portion),
  pool: v.union(v.literal("specials"), v.null()),
});

function validate(item: Infer<typeof editable>) {
  const money = (n: number) => Number.isFinite(n) && n >= 0;
  const name = item.name.trim();
  if (!name || name.length >= 100) throw new ConvexError({ code: "INVALID_ITEM", reason: "name" });
  if (!money(item.price) || !money(item.packagingPrice) || !item.portions.every((p) => money(p.price))) {
    throw new ConvexError({ code: "INVALID_ITEM", reason: "price" });
  }
}

function storageIds(refs: readonly (ImageRef | undefined)[]): Set<Id<"_storage">> {
  return new Set(refs.flatMap((ref) => (ref && "storageId" in ref ? [ref.storageId] : [])));
}

const isPlaceholder = (ref: ImageRef | undefined) =>
  !!ref && "url" in ref && /^https?:\/\/([\w-]+\.)?picsum\.photos\//.test(ref.url);

/**
 * One-off cleanup. The admin form used to save a random picsum.photos photo
 * for a dish added without one, so the live menu showed forests and seascapes
 * as food. Removes those references; the menu falls back to its plain tile.
 *   npx convex run menuAdmin:clearPlaceholderImages          (dev)
 *   npx convex run --prod menuAdmin:clearPlaceholderImages   (production)
 */
export const clearPlaceholderImages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cleared: string[] = [];
    for (const item of await ctx.db.query("menu").collect()) {
      const before = item.sideImages ?? [];
      const sideImages = before.filter((ref) => !isPlaceholder(ref));
      const dropMain = isPlaceholder(item.image);
      if (!dropMain && sideImages.length === before.length) continue;
      await ctx.db.patch(item._id, {
        ...(dropMain ? { image: undefined } : {}),
        sideImages: sideImages.length > 0 ? sideImages : undefined,
      });
      cleared.push(item.name);
    }
    console.log(`Cleared placeholder images from ${cleared.length} dishes:`, cleared);
    return cleared;
  },
});

/** Delete stored files the item no longer references. */
async function dropUnusedImages(ctx: MutationCtx, before: Doc<"menu">, keep: Set<Id<"_storage">>) {
  for (const id of storageIds([before.image, ...(before.sideImages ?? [])])) {
    if (!keep.has(id)) await ctx.storage.delete(id);
  }
}

/** Create (no id) or replace an item from the admin form. */
export const save = mutation({
  args: {
    id: v.optional(v.id("menu")),
    item: editable,
    image: v.optional(imageRef),
    sideImages: v.array(imageRef),
  },
  handler: async (ctx, { id, item, image, sideImages }) => {
    await requireAdmin(ctx);
    validate(item);
    const { statusUntil, pool, ...rest } = item;
    const row = {
      ...rest,
      name: item.name.trim(),
      ...(statusUntil !== null ? { statusUntil } : {}),
      ...(pool !== null ? { pool } : {}),
      ...(image ? { image } : {}),
      ...(sideImages.length > 0 ? { sideImages } : {}),
    };

    if (!id) return ctx.db.insert("menu", { ...row, orderCount: 0 });

    const existing = await ctx.db.get(id);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND" });
    await dropUnusedImages(ctx, existing, storageIds([image, ...sideImages]));
    // Popularity and import bookkeeping are not form fields; carry them over.
    await ctx.db.replace(id, {
      ...row,
      ...(existing.orderCount !== undefined ? { orderCount: existing.orderCount } : {}),
      ...(existing.legacyId !== undefined ? { legacyId: existing.legacyId } : {}),
    });
    return id;
  },
});

/** The dashboard's one-click changes (status, featured, schedule, category). null clears a field. */
export const update = mutation({
  args: {
    id: v.id("menu"),
    changes: v.object({
      status: v.optional(itemStatus),
      available: v.optional(v.boolean()),
      statusUntil: v.optional(v.union(v.number(), v.null())),
      featured: v.optional(v.boolean()),
      todayOnly: v.optional(v.boolean()),
      scheduledDays: v.optional(v.array(v.number())),
      category: v.optional(category),
      pool: v.optional(v.union(v.literal("specials"), v.null())),
    }),
  },
  handler: async (ctx, { id, changes }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(id))) throw new ConvexError({ code: "NOT_FOUND" });
    const { statusUntil, pool, ...rest } = changes;
    await ctx.db.patch(id, {
      ...rest,
      ...(statusUntil !== undefined ? { statusUntil: statusUntil ?? undefined } : {}),
      ...(pool !== undefined ? { pool: pool ?? undefined } : {}),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("menu") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) return;
    await dropUnusedImages(ctx, existing, new Set());
    await ctx.db.delete(id);
  },
});

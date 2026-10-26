/**
 * One-off Firebase → Convex import of the publicly readable collections.
 *
 *   npx convex run migrations/firestoreImport:importPublicData \
 *     '{"source":{"projectId":"…","databaseId":"…","apiKey":"…"},"collections":["menu","settings"]}'
 *
 * Values come from firebase-applet-config.json. Each document read is billed
 * against the production Firestore quota — check counts before running.
 *
 * Re-runnable: rows are matched on legacyId (the Firestore doc id) and
 * replaced, so a second run converges instead of duplicating. Uploaded menu
 * images are reused while their bytes are unchanged and stored anew when a
 * photo changed; dishes deleted in Firestore are removed (menu only).
 *
 * Not covered: admin_emails and bank_transactions are admin-only under the
 * Firestore rules, and the live database also refuses settings, so an
 * unauthenticated reader cannot see them (reported as the collection's error).
 * Admins and store hours are re-entered by hand; bank transactions are drained
 * before cutover.
 */

import { v, type Infer } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { menuFields, orderFields, storeSettingsFields } from "../schema";
import type { imageRef } from "../validators";
import { listCollection, queryCollectionFrom } from "../lib/firestoreRest";
import {
  dataUrlToBlob,
  mapMenuItem,
  mapOrder,
  mapStoreSettings,
  type Mapped,
} from "./firestoreMappers";

const menuRow = v.object(menuFields);
const orderRow = v.object(orderFields);
const storeSettingsRow = v.object(storeSettingsFields);

type ImageRef = Infer<typeof imageRef>;

interface CollectionReport {
  /** Set when the collection could not be read at all (e.g. refused by rules). */
  error?: string;
  read: number;
  imported: number;
  failed: { id: string; error: string }[];
  /** Source field → how many docs carried it without a schema home. */
  dropped: Record<string, number>;
  /** Menu only: names of imported dishes removed because Firestore no longer has them. */
  removed?: string[];
}

function newReport(): CollectionReport {
  return { read: 0, imported: 0, failed: [], dropped: {} };
}

function tallyDropped(report: CollectionReport, mapped: Mapped) {
  for (const key of mapped.dropped) report.dropped[key] = (report.dropped[key] ?? 0) + 1;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const left = new Uint8Array(x);
  const right = new Uint8Array(y);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}

/**
 * The image for `src`: a URL stays a URL; an uploaded (data:) image reuses one
 * of the row's already-stored files with identical bytes, so a re-run uploads
 * nothing, but a photo changed in Firestore since the last run is stored anew.
 */
async function storeImage(ctx: ActionCtx, src: string, stored: readonly ImageRef[]): Promise<ImageRef> {
  if (!src.startsWith("data:")) return { url: src };
  const blob = dataUrlToBlob(src);
  for (const ref of stored) {
    if (!("storageId" in ref)) continue;
    const existing = await ctx.storage.get(ref.storageId);
    if (existing && (await sameBytes(existing, blob))) return ref;
  }
  return { storageId: await ctx.storage.store(blob) };
}

const storageIds = (refs: readonly (ImageRef | undefined)[]) =>
  refs.flatMap((ref) => (ref && "storageId" in ref ? [ref.storageId] : []));

export const importPublicData = internalAction({
  args: {
    source: v.object({ projectId: v.string(), databaseId: v.string(), apiKey: v.string() }),
    collections: v.array(v.union(v.literal("menu"), v.literal("settings"), v.literal("orders"))),
    /** Orders newer than this many days. The dashboard deletes anything older than 7. */
    ordersSinceDays: v.optional(v.number()),
  },
  handler: async (ctx, { source, collections, ordersSinceDays }) => {
    const reports: Partial<Record<(typeof collections)[number], CollectionReport>> = {};

    // The mapped fields are plain records; the mutations' argument validators
    // (the schema's own field definitions) are what actually check them, so a
    // bad document fails alone and lands in the report.

    if (collections.includes("menu")) {
      const report = (reports.menu = newReport());
      const docs = await listCollection(source, "menu").catch((err) => {
        report.error = errorMessage(err);
        return [];
      });
      report.read = docs.length;
      for (const doc of docs) {
        try {
          const mapped = mapMenuItem(doc.data);
          tallyDropped(report, mapped);
          const existing = await ctx.runQuery(
            internal.migrations.firestoreImport.menuImagesByLegacyId,
            { legacyId: doc.id },
          );
          const previous = existing
            ? [...(existing.image ? [existing.image] : []), ...(existing.sideImages ?? [])]
            : [];
          const image = mapped.imageSource ? await storeImage(ctx, mapped.imageSource, previous) : undefined;
          const sideImages = await Promise.all(
            mapped.sideImageSources.map((src) => storeImage(ctx, src, previous)),
          );
          await ctx.runMutation(internal.migrations.firestoreImport.upsertMenuItem, {
            item: {
              ...mapped.fields,
              legacyId: doc.id,
              ...(image ? { image } : {}),
              ...(sideImages.length > 0 ? { sideImages } : {}),
            } as Infer<typeof menuRow>,
          });
          // Files the row no longer uses: a photo replaced or removed in Firestore.
          const kept = new Set(storageIds([image, ...sideImages]));
          for (const id of storageIds(previous)) if (!kept.has(id)) await ctx.storage.delete(id);
          report.imported += 1;
        } catch (err) {
          report.failed.push({ id: doc.id, error: errorMessage(err) });
        }
      }
      // Dishes deleted in Firestore since the last run. Only after a complete,
      // non-empty read: a failed or empty read must never empty the menu.
      if (!report.error && docs.length > 0) {
        report.removed = await ctx.runMutation(internal.migrations.firestoreImport.pruneMenu, {
          keepLegacyIds: docs.map((doc) => doc.id),
        });
      }
    }

    if (collections.includes("settings")) {
      const report = (reports.settings = newReport());
      const docs = await listCollection(source, "settings").catch((err) => {
        report.error = errorMessage(err);
        return [];
      });
      report.read = docs.length;
      const store = docs.find((d) => d.id === "store");
      if (store) {
        try {
          const mapped = mapStoreSettings(store.data);
          tallyDropped(report, mapped);
          await ctx.runMutation(internal.migrations.firestoreImport.upsertStoreSettings, {
            settings: mapped.fields as Infer<typeof storeSettingsRow>,
          });
          report.imported += 1;
        } catch (err) {
          report.failed.push({ id: store.id, error: errorMessage(err) });
        }
      }
    }

    if (collections.includes("orders")) {
      const report = (reports.orders = newReport());
      const since = new Date(Date.now() - (ordersSinceDays ?? 7) * 86_400_000).toISOString();
      const docs = await queryCollectionFrom(source, "orders", "timestamp", since).catch((err) => {
        report.error = errorMessage(err);
        return [];
      });
      report.read = docs.length;
      for (const doc of docs) {
        try {
          const mapped = mapOrder(doc.data);
          tallyDropped(report, mapped);
          await ctx.runMutation(internal.migrations.firestoreImport.upsertOrder, {
            order: { ...mapped.fields, legacyId: doc.id } as Infer<typeof orderRow>,
          });
          report.imported += 1;
        } catch (err) {
          report.failed.push({ id: doc.id, error: errorMessage(err) });
        }
      }
    }

    return reports;
  },
});

export const menuImagesByLegacyId = internalQuery({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }) => {
    const row = await ctx.db
      .query("menu")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId))
      .unique();
    return row ? { image: row.image, sideImages: row.sideImages } : null;
  },
});

/**
 * Delete imported dishes (and their stored files) whose Firestore doc is gone.
 * Rows without a legacyId were created in Convex and are never touched.
 */
export const pruneMenu = internalMutation({
  args: { keepLegacyIds: v.array(v.string()) },
  handler: async (ctx, { keepLegacyIds }) => {
    const keep = new Set(keepLegacyIds);
    const removed: string[] = [];
    for (const row of await ctx.db.query("menu").collect()) {
      if (!row.legacyId || keep.has(row.legacyId)) continue;
      for (const id of storageIds([row.image, ...(row.sideImages ?? [])])) await ctx.storage.delete(id);
      if (row.thumb) await ctx.storage.delete(row.thumb);
      await ctx.db.delete(row._id);
      removed.push(row.name);
    }
    return removed;
  },
});

export const upsertMenuItem = internalMutation({
  args: { item: menuRow },
  handler: async (ctx, { item }) => {
    if (!item.legacyId) throw new Error("legacyId is required");
    const existing = await ctx.db
      .query("menu")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", item.legacyId))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, item);
      return existing._id;
    }
    return ctx.db.insert("menu", item);
  },
});

export const upsertStoreSettings = internalMutation({
  args: { settings: storeSettingsRow },
  handler: async (ctx, { settings }) => {
    const existing = await ctx.db.query("storeSettings").first();
    if (existing) {
      await ctx.db.replace(existing._id, settings);
      return existing._id;
    }
    return ctx.db.insert("storeSettings", settings);
  },
});

export const upsertOrder = internalMutation({
  args: { order: orderRow },
  handler: async (ctx, { order }) => {
    if (!order.legacyId) throw new Error("legacyId is required");
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", order.legacyId))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, order);
      return existing._id;
    }
    return ctx.db.insert("orders", order);
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/admin";

/** Store hours, or null when the admin has never saved any (client uses defaults). */
export const getStore = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("storeSettings").first();
    if (!row) return null;
    const { _id, _creationTime, ...settings } = row;
    return settings;
  },
});

/** Admin saves the store hours (the whole settings object, as the dashboard holds it). */
export const saveStore = mutation({
  args: {
    settings: v.object({
      openHour: v.number(),
      closeHour: v.number(),
      closedDays: v.array(v.number()),
      closedUntil: v.union(v.string(), v.null()),
      noClosedDayUntil: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, { settings }) => {
    await requireAdmin(ctx);
    const { openHour, closeHour, closedDays } = settings;
    const isHour = (h: number) => Number.isInteger(h) && h >= 0 && h <= 24;
    if (!isHour(openHour) || !isHour(closeHour) || closedDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new Error("invalid store hours");
    }
    const existing = await ctx.db.query("storeSettings").first();
    if (existing) await ctx.db.replace(existing._id, settings);
    else await ctx.db.insert("storeSettings", settings);
  },
});

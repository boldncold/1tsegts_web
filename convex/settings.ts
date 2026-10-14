import { query } from "./_generated/server";

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

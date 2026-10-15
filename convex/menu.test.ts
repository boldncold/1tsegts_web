import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const dish = {
  description: "",
  price: 10000,
  category: "Mongolian" as const,
  tags: [],
  available: true,
};

describe("menu.list", () => {
  test("returns MenuItem-shaped rows sorted by name, without import bookkeeping", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("menu", { ...dish, name: "Цуйван", legacyId: "fs-1" });
      await ctx.db.insert("menu", { ...dish, name: "Бууз" });
    });

    const items = await t.query(api.menu.list, {});
    expect(items.map((i) => i.name)).toEqual(["Бууз", "Цуйван"]);
    expect(items[0]).toHaveProperty("id");
    expect(items[0]).not.toHaveProperty("_id");
    expect(items[1]).not.toHaveProperty("legacyId");
  });

  test("resolves storage images to URLs and passes external URLs through", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" }));
      await ctx.db.insert("menu", {
        ...dish,
        name: "A",
        image: { storageId },
        sideImages: [{ url: "https://picsum.photos/seed/a/800/600" }],
      });
      await ctx.db.insert("menu", { ...dish, name: "B" });
    });

    const [withImages, without] = await t.query(api.menu.list, {});
    expect(withImages.image).toMatch(/^https?:\/\//);
    expect(withImages.sideImages).toEqual(["https://picsum.photos/seed/a/800/600"]);
    expect(without.image).toBe("");
    expect(without.sideImages).toEqual([]);
  });
});

describe("menu.featured", () => {
  test("returns available featured dishes only", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("menu", { ...dish, name: "picked", featured: true });
      await ctx.db.insert("menu", { ...dish, name: "picked but off", featured: true, available: false });
      await ctx.db.insert("menu", { ...dish, name: "popular", orderCount: 99 });
    });

    const items = await t.query(api.menu.featured, {});
    expect(items.map((i) => i.name)).toEqual(["picked"]);
  });

  test("falls back to the most-ordered available dishes when nothing is featured", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("menu", { ...dish, name: "some", orderCount: 5 });
      await ctx.db.insert("menu", { ...dish, name: "most", orderCount: 40 });
      await ctx.db.insert("menu", { ...dish, name: "unavailable", orderCount: 100, available: false });
    });

    const items = await t.query(api.menu.featured, {});
    expect(items.map((i) => i.name)).toEqual(["most", "some"]);
  });
});

describe("settings.getStore", () => {
  test("is null until the admin saves settings, then returns them without _id", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.settings.getStore, {})).toBeNull();

    await t.run((ctx) =>
      ctx.db.insert("storeSettings", { openHour: 10, closedUntil: null }),
    );
    expect(await t.query(api.settings.getStore, {})).toEqual({ openHour: 10, closedUntil: null });
  });
});

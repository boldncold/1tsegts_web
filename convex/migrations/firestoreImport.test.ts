import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import { decodeFields } from "../lib/firestoreRest";
import { dataUrlToBlob, mapMenuItem, mapOrder, mapStoreSettings } from "./firestoreMappers";

afterEach(() => vi.unstubAllGlobals());

describe("decodeFields (Firestore REST values)", () => {
  test("decodes every value type the app stores", () => {
    expect(
      decodeFields({
        name: { stringValue: "Бууз" },
        price: { integerValue: "12000" },
        rating: { doubleValue: 4.5 },
        available: { booleanValue: true },
        pool: { nullValue: null },
        at: { timestampValue: "2026-10-14T07:00:00Z" },
        tags: { arrayValue: { values: [{ stringValue: "popular" }] } },
        empty: { arrayValue: {} },
        portion: { mapValue: { fields: { name: { stringValue: "Large" } } } },
      }),
    ).toEqual({
      name: "Бууз",
      price: 12000,
      rating: 4.5,
      available: true,
      pool: null,
      at: "2026-10-14T07:00:00Z",
      tags: ["popular"],
      empty: [],
      portion: { name: "Large" },
    });
  });
});

describe("mapMenuItem", () => {
  test("keeps schema fields, drops strays and nulls, splits out image sources", () => {
    const mapped = mapMenuItem({
      id: "stray-id-field",
      name: "Хуушуур",
      price: 3500,
      category: "Mongolian",
      available: true,
      pool: null, // how the admin cleared the specials pool
      image: "data:image/jpeg;base64,AAAA",
      sideImages: ["https://example.com/a.jpg", ""],
      portions: [{ name: "Large", price: 5000, junk: 1 }],
    });
    expect(mapped.fields).toEqual({
      name: "Хуушуур",
      price: 3500,
      category: "Mongolian",
      available: true,
      tags: [],
      description: "",
      portions: [{ name: "Large", price: 5000 }],
    });
    expect(mapped.dropped).toEqual(["id"]);
    expect(mapped.imageSource).toBe("data:image/jpeg;base64,AAAA");
    expect(mapped.sideImageSources).toEqual(["https://example.com/a.jpg"]);
  });
});

describe("mapStoreSettings", () => {
  test("keeps null closure dates — they mean 'none scheduled'", () => {
    expect(mapStoreSettings({ openHour: 11, closedUntil: null }).fields).toEqual({
      openHour: 11,
      closedUntil: null,
    });
  });
});

describe("mapOrder", () => {
  test("keeps a null selectedPortion but drops other nulls", () => {
    const { fields } = mapOrder({
      items: [{ id: "m1", name: "Бууз", price: 1000, quantity: 2, selectedPortion: null }],
      total: 2000,
      orderType: "pickup",
      status: "pending",
      timestamp: "2026-10-14T07:00:00.000Z",
      notes: null,
    });
    expect(fields).toEqual({
      items: [{ id: "m1", name: "Бууз", price: 1000, quantity: 2, selectedPortion: null }],
      total: 2000,
      orderType: "pickup",
      status: "pending",
      timestamp: "2026-10-14T07:00:00.000Z",
    });
  });
});

describe("dataUrlToBlob", () => {
  test("decodes base64 uploads with their mime type", async () => {
    const blob = dataUrlToBlob("data:image/jpeg;base64,/9j/");
    expect(blob.type).toBe("image/jpeg");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("rejects anything that is not a data URL", () => {
    expect(() => dataUrlToBlob("https://example.com/a.jpg")).toThrow();
  });
});

describe("import upserts", () => {
  const item = {
    name: "Бууз",
    description: "",
    price: 1000,
    category: "Mongolian" as const,
    tags: [],
    available: true,
    legacyId: "fs-buuz",
  };

  test("re-running converges on one row per Firestore doc", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.migrations.firestoreImport.upsertMenuItem, { item });
    await t.mutation(internal.migrations.firestoreImport.upsertMenuItem, {
      item: { ...item, price: 1200 },
    });
    const rows = await t.run((ctx) => ctx.db.query("menu").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(1200);
  });

  test("a re-run keeps unchanged photos, replaces changed ones, and removes deleted dishes", async () => {
    const t = convexTest(schema, modules);
    const source = { projectId: "p", databaseId: "d", apiKey: "k" };
    /** Stub Firestore's runQuery to return these menu docs. */
    const firestoreMenu = (docs: { id: string; name: string; image: string }[]) =>
      vi.stubGlobal("fetch", async () =>
        Response.json(
          docs.map((d) => ({
            document: {
              name: `projects/p/databases/d/documents/menu/${d.id}`,
              fields: {
                name: { stringValue: d.name },
                price: { integerValue: "1000" },
                category: { stringValue: "Mongolian" },
                available: { booleanValue: true },
                image: { stringValue: d.image },
              },
            },
          })),
        ),
      );
    const run = () => t.action(internal.migrations.firestoreImport.importPublicData, { source, collections: ["menu"] });
    const rows = () => t.run((ctx) => ctx.db.query("menu").collect());
    const fileExists = (ref: unknown) =>
      t.run(async (ctx) => (await ctx.storage.getUrl((ref as { storageId: Id<"_storage"> }).storageId)) !== null);
    const native = await t.run((ctx) =>
      ctx.db.insert("menu", { name: "Made in Convex", description: "", price: 1, category: "Drinks", tags: [], available: true }),
    );

    firestoreMenu([
      { id: "a", name: "A", image: "data:image/png;base64,AAAA" },
      { id: "b", name: "B", image: "data:image/png;base64,BBBB" },
      { id: "demo", name: "Demo", image: "data:image/png;base64,CCCC" },
    ]);
    await run();
    const first = new Map((await rows()).map((r) => [r.legacyId, r]));
    expect(first.size).toBe(4);

    // B's photo changed and Demo was deleted in Firestore.
    firestoreMenu([
      { id: "a", name: "A", image: "data:image/png;base64,AAAA" },
      { id: "b", name: "B", image: "data:image/png;base64,DDDD" },
    ]);
    const report = await run();
    expect(report.menu).toMatchObject({ read: 2, imported: 2, removed: ["Demo"] });
    const second = new Map((await rows()).map((r) => [r.legacyId, r]));
    expect([...second.keys()].sort()).toEqual(["a", "b", undefined].sort());
    expect(second.get("a")?.image).toEqual(first.get("a")?.image);
    expect(second.get("b")?.image).not.toEqual(first.get("b")?.image);
    expect(await fileExists(first.get("b")?.image)).toBe(false);
    expect(await fileExists(first.get("demo")?.image)).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(native))).not.toBeNull();

    // A failed read prunes nothing.
    vi.stubGlobal("fetch", async () => new Response("denied", { status: 403 }));
    expect((await run()).menu).toMatchObject({ error: expect.stringMatching(/403/) });
    expect(await rows()).toHaveLength(3);
  });

  test("the schema validator rejects a document Firestore let through", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.migrations.firestoreImport.upsertMenuItem, {
        // @ts-expect-error — an unknown category, as an untyped Firestore doc could hold
        item: { ...item, category: "Desserts" },
      }),
    ).rejects.toThrow();
  });
});

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { decodeFields } from "../lib/firestoreRest";
import { dataUrlToBlob, mapMenuItem, mapOrder, mapStoreSettings } from "./firestoreMappers";

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

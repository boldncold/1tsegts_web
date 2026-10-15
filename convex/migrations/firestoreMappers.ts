/**
 * Firestore document → Convex row, for the one-off import. Pure.
 *
 * Firestore never enforced a document shape, so these copy only the fields the
 * Convex schema declares (anything else is reported as dropped, e.g. the stray
 * `id` field some menu docs carry) and drop nulls, which Convex optional fields
 * reject — `updateDoc(..., { pool: null })` is how the admin cleared a field.
 * Type and enum checking is left to the mutations' argument validators, which
 * are the schema's own field definitions.
 */

import { menuFields, orderFields, storeSettingsFields } from "../schema";

type Data = Record<string, unknown>;

export interface Mapped {
  fields: Data;
  /** Source keys that have no home in the schema. */
  dropped: string[];
}

export interface MappedMenuItem extends Mapped {
  /** Data URL (an upload) or http(s) URL, resolved to an imageRef by the action. */
  imageSource?: string;
  sideImageSources: string[];
}

const MENU_KEYS = Object.keys(menuFields).filter(
  (k) => !["image", "sideImages", "legacyId"].includes(k),
);
const ORDER_KEYS = Object.keys(orderFields).filter(
  (k) => !["items", "qpayDeeplinks", "legacyId"].includes(k),
);
const SETTINGS_KEYS = Object.keys(storeSettingsFields);
const PORTION_KEYS = ["name", "price", "available"];
const ORDER_ITEM_KEYS = [
  "id",
  "name",
  "price",
  "quantity",
  "packaging",
  "packagingPrice",
  "selectedPortion",
];
const DEEPLINK_KEYS = ["name", "description", "logo", "link"];

function pick(data: Data, keys: readonly string[], keepNull: readonly string[] = []): Data {
  const out: Data = {};
  for (const key of keys) {
    const value = data[key];
    if (value === undefined) continue;
    if (value === null && !keepNull.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

function droppedKeys(data: Data, kept: readonly string[]): string[] {
  return Object.keys(data).filter((k) => !kept.includes(k));
}

function isObject(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mapMenuItem(data: Data): MappedMenuItem {
  const fields = pick(data, MENU_KEYS);
  // Both required by the Convex schema; older docs may predate them.
  if (!Array.isArray(fields.tags)) fields.tags = [];
  if (typeof fields.description !== "string") fields.description = "";
  if (Array.isArray(fields.portions)) {
    fields.portions = fields.portions.filter(isObject).map((p) => pick(p, PORTION_KEYS));
  }
  return {
    fields,
    dropped: droppedKeys(data, [...MENU_KEYS, "image", "sideImages"]),
    imageSource: typeof data.image === "string" && data.image ? data.image : undefined,
    sideImageSources: Array.isArray(data.sideImages)
      ? data.sideImages.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [],
  };
}

export function mapStoreSettings(data: Data): Mapped {
  return {
    // null is meaningful here: "no closure scheduled".
    fields: pick(data, SETTINGS_KEYS, ["closedUntil", "noClosedDayUntil"]),
    dropped: droppedKeys(data, SETTINGS_KEYS),
  };
}

export function mapOrder(data: Data): Mapped {
  const fields = pick(data, ORDER_KEYS);
  fields.items = Array.isArray(data.items)
    ? data.items.filter(isObject).map((item) => {
        // The admin "add order" form writes selectedPortion: null — keep it.
        const line = pick(item, ORDER_ITEM_KEYS, ["selectedPortion"]);
        if (isObject(line.selectedPortion)) {
          line.selectedPortion = pick(line.selectedPortion, PORTION_KEYS);
        }
        return line;
      })
    : [];
  if (Array.isArray(data.qpayDeeplinks)) {
    fields.qpayDeeplinks = data.qpayDeeplinks
      .filter(isObject)
      .map((d) => pick(d, DEEPLINK_KEYS));
  }
  return {
    fields,
    dropped: droppedKeys(data, [...ORDER_KEYS, "items", "qpayDeeplinks"]),
  };
}

/** `data:image/jpeg;base64,...` (what the admin uploader produced) → Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("not a data URL");
  const [, mime, isBase64, payload] = match;
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

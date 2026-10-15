/**
 * Server-side order pricing — the only place an order's amount is decided.
 *
 * The client sends what the customer picked (menu item, quantity, portion,
 * packaging); every price comes from the menu row. Mirrors the cart total in
 * src/context/CartContext.tsx, and replaces functions/src/orderPricing.ts,
 * which could only re-price an order the browser had already written.
 */

import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { orderItem } from "../validators";

/** The base-price choice the menu UI shows ahead of an item's real portions. */
const DEFAULT_PORTION = "Default";

export interface CartLine {
  /** A Convex menu id — or a Firestore id from a cart saved before the migration. */
  menuId: string;
  quantity: number;
  portionName?: string;
  packaging?: boolean;
}

export type PricedItem = Infer<typeof orderItem>;

export type PricingResult =
  | { ok: true; items: PricedItem[]; chargedMnt: number }
  | { ok: false; reason: string };

/** Price cart lines against menu rows keyed by the line's menuId. Pure. */
export function priceCart(
  lines: readonly CartLine[],
  menu: ReadonlyMap<string, Doc<"menu">>,
): PricingResult {
  if (lines.length === 0) return { ok: false, reason: "no_items" };

  const items: PricedItem[] = [];
  let subtotal = 0;

  for (const line of lines) {
    // A negative or fractional quantity would let one line cancel out another.
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      return { ok: false, reason: `bad_quantity:${line.menuId}` };
    }
    const row = menu.get(line.menuId);
    if (!row) return { ok: false, reason: `unknown_item:${line.menuId}` };

    let unitPrice = row.price;
    let selectedPortion: PricedItem["selectedPortion"];
    if (line.portionName !== undefined) {
      const portion = row.portions?.find((p) => p.name === line.portionName);
      if (portion) {
        unitPrice = portion.price;
        selectedPortion = { name: portion.name, price: portion.price };
      } else if (line.portionName === DEFAULT_PORTION) {
        // The menu UI offers the base price as a pseudo-portion named
        // 'Default' ahead of the real ones (MenuSection, TraditionalMenuSection).
        selectedPortion = { name: DEFAULT_PORTION, price: unitPrice };
      } else {
        return { ok: false, reason: `unknown_portion:${line.menuId}` };
      }
    }

    const packagingPrice = row.packagingPrice ?? 0;
    const packed = line.packaging === true;
    subtotal += unitPrice * line.quantity + (packed ? packagingPrice * line.quantity : 0);

    items.push({
      id: row._id,
      name: row.name,
      price: unitPrice,
      quantity: line.quantity,
      ...(line.packaging !== undefined ? { packaging: line.packaging } : {}),
      packagingPrice,
      ...(selectedPortion ? { selectedPortion } : {}),
    });
  }

  return { ok: true, items, chargedMnt: Math.round(subtotal) };
}

/**
 * Load the menu rows the lines reference, keyed by the id as sent. Firestore
 * ids are resolved through legacyId so carts saved in a browser before the
 * cutover still check out.
 */
export async function loadMenuFor(
  ctx: QueryCtx,
  lines: readonly CartLine[],
): Promise<Map<string, Doc<"menu">>> {
  const menu = new Map<string, Doc<"menu">>();
  for (const menuId of new Set(lines.map((l) => l.menuId))) {
    const id = ctx.db.normalizeId("menu", menuId);
    const row = id
      ? await ctx.db.get(id)
      : await ctx.db
          .query("menu")
          .withIndex("by_legacyId", (q) => q.eq("legacyId", menuId))
          .unique();
    if (row) menu.set(menuId, row);
  }
  return menu;
}

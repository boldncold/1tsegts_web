/**
 * Server-side order pricing.
 *
 * Order docs are written by the browser, so every amount on them — items[].price,
 * total, amountMnt, adminDiscountMnt — is customer-controlled. Billing that amount
 * would let anyone order a full meal and pay ₮100 for it. This recomputes the
 * charge from the menu docs instead, mirroring the `total` formula in
 * src/context/CartContext.tsx and the discount clamp in CartDrawer.tsx.
 *
 * Used by: createQpayInvoice. The cash and bank-transfer rails still carry the
 * client's total — a human sees those before any food is handed over — until
 * order creation itself moves server-side.
 */

import type { Firestore } from 'firebase-admin/firestore';

/** The menu-doc fields that decide a price. */
export interface MenuPricing {
  name?: string;
  price?: number;
  packagingPrice?: number;
  portions?: { name: string; price: number }[];
}

export interface PricedItem {
  id: string;
  name: string;
  price: number; // unit price — the portion's price when a portion was chosen
  quantity: number;
  packaging?: boolean;
  packagingPrice: number;
  selectedPortion?: { name: string; price: number };
}

export type PricingResult =
  | {
      ok: true;
      items: PricedItem[];
      subtotalMnt: number;
      discountMnt: number;
      chargedMnt: number;
    }
  | { ok: false; reason: string };

interface RawLine {
  id?: unknown;
  name?: unknown;
  quantity?: unknown;
  packaging?: unknown;
  selectedPortion?: { name?: unknown } | null;
}

/**
 * Price an order's items against the live menu. Pure — the caller loads the menu.
 *
 * `discountMnt` must already be authorized by the caller (admin test orders
 * only); it is clamped to the subtotal exactly as CartDrawer does.
 */
export function priceOrderItems(
  rawItems: unknown,
  menu: ReadonlyMap<string, MenuPricing>,
  discountMnt: number,
): PricingResult {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, reason: 'no_items' };
  }

  const items: PricedItem[] = [];
  let subtotal = 0;

  for (const raw of rawItems as RawLine[]) {
    const id = raw?.id;
    if (typeof id !== 'string' || !id) return { ok: false, reason: 'bad_item_id' };

    // A negative or fractional quantity would let one line cancel out another.
    const quantity = raw.quantity;
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1) {
      return { ok: false, reason: `bad_quantity:${id}` };
    }

    const menuItem = menu.get(id);
    if (!menuItem || typeof menuItem.price !== 'number') {
      return { ok: false, reason: `unknown_item:${id}` };
    }

    let unitPrice = menuItem.price;
    let selectedPortion: PricedItem['selectedPortion'];
    if (raw.selectedPortion != null) {
      const portionName = raw.selectedPortion.name;
      const portion = menuItem.portions?.find((p) => p.name === portionName);
      if (!portion || typeof portion.price !== 'number') {
        return { ok: false, reason: `unknown_portion:${id}` };
      }
      unitPrice = portion.price;
      selectedPortion = { name: portion.name, price: portion.price };
    }

    const packagingPrice = menuItem.packagingPrice ?? 0;
    const packed = raw.packaging === true;
    subtotal += unitPrice * quantity + (packed ? packagingPrice * quantity : 0);

    items.push({
      id,
      name: menuItem.name ?? (typeof raw.name === 'string' ? raw.name : id),
      price: unitPrice,
      quantity,
      ...(typeof raw.packaging === 'boolean' ? { packaging: raw.packaging } : {}),
      packagingPrice,
      ...(selectedPortion ? { selectedPortion } : {}),
    });
  }

  const requested = Number.isFinite(discountMnt) && discountMnt > 0 ? discountMnt : 0;
  const discount = Math.max(0, Math.min(requested, Math.floor(subtotal)));
  const charged = Math.round(Math.max(0, subtotal - discount));

  return { ok: true, items, subtotalMnt: subtotal, discountMnt: discount, chargedMnt: charged };
}

/** Load the menu docs an order's items reference, keyed by doc id. */
export async function loadMenuPricing(
  db: Firestore,
  rawItems: unknown,
): Promise<Map<string, MenuPricing>> {
  const ids = Array.isArray(rawItems)
    ? [
        ...new Set(
          rawItems
            .map((line) => (line as RawLine)?.id)
            // A '/' would make doc() resolve a different path; such an id simply
            // stays unknown and priceOrderItems rejects it.
            .filter((id): id is string => typeof id === 'string' && !!id && !id.includes('/')),
        ),
      ]
    : [];

  const menu = new Map<string, MenuPricing>();
  if (ids.length === 0) return menu;

  const snaps = await db.getAll(...ids.map((id) => db.doc(`menu/${id}`)));
  for (const snap of snaps) {
    if (snap.exists) menu.set(snap.id, snap.data() as MenuPricing);
  }
  return menu;
}

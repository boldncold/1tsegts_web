// Unit tests for the server-side pricing that createQpayInvoice bills from.
// Run: npm test (builds to lib/ first). Uses node:test — no extra dependency.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceOrderItems } from '../lib/orderPricing.js';

const menu = new Map([
  ['khuushuur', { name: 'Хуушуур', price: 3500, packagingPrice: 500 }],
  [
    'tsuivan',
    {
      name: 'Цуйван',
      price: 12000,
      portions: [
        { name: 'Small', price: 9000 },
        { name: 'Large', price: 15000 },
      ],
    },
  ],
  ['tea', { name: 'Сүүтэй цай', price: 2000 }],
]);

test('prices from the menu, not from the client', () => {
  const r = priceOrderItems([{ id: 'khuushuur', name: 'x', price: 1, quantity: 2 }], menu, 0);
  assert.equal(r.ok, true);
  assert.equal(r.chargedMnt, 7000);
  assert.equal(r.items[0].price, 3500);
  assert.equal(r.items[0].name, 'Хуушуур');
});

test('uses the live portion price, matched by name', () => {
  const r = priceOrderItems(
    [{ id: 'tsuivan', quantity: 1, selectedPortion: { name: 'Large', price: 1 } }],
    menu,
    0,
  );
  assert.equal(r.chargedMnt, 15000);
  assert.deepEqual(r.items[0].selectedPortion, { name: 'Large', price: 15000 });
});

test("treats the menu UI's 'Default' pseudo-portion as the base price", () => {
  // MenuSection pre-selects { name: 'Default', price: item.price } for items
  // with portions; it is not one of the menu doc's portions.
  const r = priceOrderItems(
    [{ id: 'tsuivan', quantity: 2, selectedPortion: { name: 'Default', price: 1 } }],
    menu,
    0,
  );
  assert.equal(r.ok, true);
  assert.equal(r.chargedMnt, 2 * 12000);
  assert.deepEqual(r.items[0].selectedPortion, { name: 'Default', price: 12000 });
});

test('charges packaging only when packaging is true', () => {
  const packed = priceOrderItems([{ id: 'khuushuur', quantity: 3, packaging: true }], menu, 0);
  const notPacked = priceOrderItems(
    // CartDrawer writes packagingPrice on every line, packed or not.
    [{ id: 'khuushuur', quantity: 3, packaging: false, packagingPrice: 500 }],
    menu,
    0,
  );
  assert.equal(packed.chargedMnt, 3 * 3500 + 3 * 500);
  assert.equal(notPacked.chargedMnt, 3 * 3500);
});

test('rejects quantities that could cancel out another line', () => {
  for (const quantity of [-1, 0, 1.5, '2', NaN, Infinity]) {
    const r = priceOrderItems(
      [
        { id: 'tsuivan', quantity: 1 },
        { id: 'tea', quantity },
      ],
      menu,
      0,
    );
    assert.equal(r.ok, false, `quantity ${String(quantity)} should be rejected`);
    assert.match(r.reason, /^bad_quantity:/);
  }
});

test('rejects items and portions that are not on the menu', () => {
  assert.equal(priceOrderItems([{ id: 'ghost', quantity: 1 }], menu, 0).reason, 'unknown_item:ghost');
  assert.equal(
    priceOrderItems([{ id: 'tsuivan', quantity: 1, selectedPortion: { name: 'Huge' } }], menu, 0)
      .reason,
    'unknown_portion:tsuivan',
  );
  assert.equal(priceOrderItems([], menu, 0).reason, 'no_items');
  assert.equal(priceOrderItems(undefined, menu, 0).reason, 'no_items');
});

test('clamps an authorized discount to the subtotal, like CartDrawer', () => {
  const partial = priceOrderItems([{ id: 'tea', quantity: 2 }], menu, 1500);
  assert.equal(partial.discountMnt, 1500);
  assert.equal(partial.chargedMnt, 2500);

  const over = priceOrderItems([{ id: 'tea', quantity: 1 }], menu, 99999);
  assert.equal(over.discountMnt, 2000);
  assert.equal(over.chargedMnt, 0);

  const negative = priceOrderItems([{ id: 'tea', quantity: 1 }], menu, -500);
  assert.equal(negative.discountMnt, 0);
  assert.equal(negative.chargedMnt, 2000);
});

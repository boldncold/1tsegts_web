/**
 * Firestore rules tests — run under the emulator:
 *   firebase emulators:exec --only firestore --project demo-test "node scripts/test-rules.mjs"
 *
 * Covers the payment-forgery, paid-order-deletion, and settings rules.
 * Exits non-zero on the first failing assertion.
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

const baseOrder = {
  items: [{ id: 'x', name: 'huushuur', price: 3000, quantity: 1 }],
  total: 3000,
  orderType: 'pickup',
  status: 'pending',
  timestamp: new Date().toISOString(),
};

let passed = 0;
async function check(name, promise) {
  await promise;
  passed += 1;
  console.log(`  ok ${name}`);
}

const anon = env.unauthenticatedContext().firestore();
// Hardcoded-owner admin path in isAdmin() — email + verified flag.
const admin = env
  .authenticatedContext('owner-uid', {
    email: 'boldsaihanlolor@gmail.com',
    email_verified: true,
  })
  .firestore();

console.log('orders — create:');
await check(
  'anon cash order (no payment fields) allowed',
  assertSucceeds(setDoc(doc(anon, 'orders/cash1'), baseOrder)),
);
await check(
  'anon qpay order AWAITING_PAYMENT allowed',
  assertSucceeds(
    setDoc(doc(anon, 'orders/qpay1'), {
      ...baseOrder,
      paymentMethod: 'qpay',
      paymentStatus: 'AWAITING_PAYMENT',
      amountMnt: 3000,
    }),
  ),
);
await check(
  'anon order pre-marked CONFIRMED denied',
  assertFails(
    setDoc(doc(anon, 'orders/forged1'), {
      ...baseOrder,
      paymentMethod: 'qpay',
      paymentStatus: 'CONFIRMED',
    }),
  ),
);
await check(
  'anon order with paidVia/paidAt denied',
  assertFails(
    setDoc(doc(anon, 'orders/forged2'), {
      ...baseOrder,
      paidVia: 'qpay',
      paidAt: new Date().toISOString(),
    }),
  ),
);
await check(
  'admin zero-charge test order CONFIRMED allowed',
  assertSucceeds(
    setDoc(doc(admin, 'orders/admin1'), {
      ...baseOrder,
      isTest: true,
      paymentStatus: 'CONFIRMED',
      paidVia: 'admin_manual',
    }),
  ),
);

console.log('orders — delete:');
// Seed one paid and one unpaid pending order with rules disabled.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'orders/unpaid1'), {
    ...baseOrder,
    paymentMethod: 'qpay',
    paymentStatus: 'AWAITING_PAYMENT',
  });
  await setDoc(doc(db, 'orders/paid1'), {
    ...baseOrder,
    paymentMethod: 'qpay',
    paymentStatus: 'CONFIRMED',
  });
});
await check(
  'anon delete of unpaid pending order allowed',
  assertSucceeds(deleteDoc(doc(anon, 'orders/unpaid1'))),
);
await check(
  'anon delete of CONFIRMED order denied',
  assertFails(deleteDoc(doc(anon, 'orders/paid1'))),
);
await check(
  'admin delete of CONFIRMED order allowed',
  assertSucceeds(deleteDoc(doc(admin, 'orders/paid1'))),
);

console.log('settings:');
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'settings/store'), { open: true });
});
await check(
  'anon read of settings/store allowed',
  assertSucceeds(getDoc(doc(anon, 'settings/store'))),
);
await check(
  'anon write of settings/store denied',
  assertFails(setDoc(doc(anon, 'settings/store'), { open: false })),
);
await check(
  'admin write of settings/store allowed',
  assertSucceeds(setDoc(doc(admin, 'settings/store'), { open: true })),
);

await env.cleanup();
console.log(`\nall ${passed} rules assertions passed`);

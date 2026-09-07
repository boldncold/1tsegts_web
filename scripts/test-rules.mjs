/**
 * Firestore rules tests — run under the emulator:
 *   firebase emulators:exec --only firestore --project demo-test "node scripts/test-rules.mjs"
 *
 * Covers the payment-forgery, payment-field-update, paid-order-deletion, and
 * settings rules.
 * Exits non-zero on the first failing assertion.
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';

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
  'admin order pre-marked CONFIRMED denied (no client writes CONFIRMED)',
  assertFails(
    setDoc(doc(admin, 'orders/admin1'), {
      ...baseOrder,
      isTest: true,
      paymentStatus: 'CONFIRMED',
      paidVia: 'admin_manual',
    }),
  ),
);
await check(
  'admin zero-charge test order AWAITING_PAYMENT allowed',
  assertSucceeds(
    setDoc(doc(admin, 'orders/admin2'), {
      ...baseOrder,
      isTest: true,
      paymentStatus: 'AWAITING_PAYMENT',
      amountMnt: 0,
    }),
  ),
);

console.log('orders — update (payment fields are server-only):');
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'orders/upd1'), {
    ...baseOrder,
    paymentMethod: 'bank_transfer',
    paymentStatus: 'AWAITING_PAYMENT',
  });
  await setDoc(doc(db, 'orders/upd2'), {
    ...baseOrder,
    paymentMethod: 'bank_transfer',
    paymentStatus: 'EXPIRED',
  });
  // Separate doc for the customer-cancel assertions: that rule requires the
  // order to still be `pending`, and upd1 gets advanced to `preparing` above.
  await setDoc(doc(db, 'orders/upd3'), {
    ...baseOrder,
    paymentMethod: 'bank_transfer',
    paymentStatus: 'AWAITING_PAYMENT',
  });
});
await check(
  'admin advancing kitchen status allowed',
  assertSucceeds(updateDoc(doc(admin, 'orders/upd1'), { status: 'preparing' })),
);
await check(
  'admin writing paymentStatus denied',
  assertFails(updateDoc(doc(admin, 'orders/upd1'), { paymentStatus: 'CONFIRMED' })),
);
await check(
  'admin confirming an EXPIRED order denied',
  assertFails(
    updateDoc(doc(admin, 'orders/upd2'), {
      paymentStatus: 'CONFIRMED',
      paidAt: new Date().toISOString(),
      paidVia: 'admin_manual',
    }),
  ),
);
await check(
  'admin writing matchedTxId denied',
  assertFails(updateDoc(doc(admin, 'orders/upd1'), { matchedTxId: 'tx-123' })),
);
await check(
  'admin forging paidBy attribution denied',
  assertFails(
    updateDoc(doc(admin, 'orders/upd1'), { paidBy: 'someone.else@example.com' }),
  ),
);
await check(
  'anon creating an order with paidBy denied',
  assertFails(
    setDoc(doc(anon, 'orders/forged3'), {
      ...baseOrder,
      paymentMethod: 'cash',
      paidBy: 'owner@example.com',
    }),
  ),
);
await check(
  'anon cash order with no payment fields still allowed',
  assertSucceeds(
    setDoc(doc(anon, 'orders/cash2'), { ...baseOrder, paymentMethod: 'cash' }),
  ),
);
await check(
  'admin smuggling paymentStatus alongside status denied',
  assertFails(
    updateDoc(doc(admin, 'orders/upd1'), {
      status: 'preparing',
      paymentStatus: 'CONFIRMED',
    }),
  ),
);
await check(
  'anon writing paymentStatus denied',
  assertFails(updateDoc(doc(anon, 'orders/upd3'), { paymentStatus: 'CONFIRMED' })),
);
await check(
  'anon cancelling own pending order still allowed',
  assertSucceeds(updateDoc(doc(anon, 'orders/upd3'), { status: 'cancelled' })),
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

console.log('bank_transactions:');
const manualTx = {
  source: 'manual',
  amountMnt: 12000,
  direction: 'credit',
  description: 'transfer GR-7K2M9Q',
  postedAt: new Date().toISOString(),
  receivedAt: new Date().toISOString(),
  matchStatus: 'unmatched',
};
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'bank_transactions/seed1'), manualTx);
});
await check(
  'anon read of bank_transactions denied',
  assertFails(getDoc(doc(anon, 'bank_transactions/seed1'))),
);
await check(
  'admin read of bank_transactions allowed',
  assertSucceeds(getDoc(doc(admin, 'bank_transactions/seed1'))),
);
await check(
  'admin manual entry allowed',
  assertSucceeds(setDoc(doc(admin, 'bank_transactions/man1'), manualTx)),
);
await check(
  'admin entry claiming a non-manual source denied',
  assertFails(
    setDoc(doc(admin, 'bank_transactions/man2'), {
      ...manualTx,
      source: 'automated_import',
    }),
  ),
);
await check(
  'admin entry pre-marked reconciled denied',
  assertFails(
    setDoc(doc(admin, 'bank_transactions/man3'), {
      ...manualTx,
      matchStatus: 'reconciled',
      matchedOrderId: 'order-123',
    }),
  ),
);
await check(
  'admin updating matchStatus denied (server owns it)',
  assertFails(updateDoc(doc(admin, 'bank_transactions/seed1'), { matchStatus: 'reconciled' })),
);
await check(
  'anon create of bank_transactions denied',
  assertFails(setDoc(doc(anon, 'bank_transactions/anon1'), manualTx)),
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

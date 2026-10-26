# Plan: refuse unavailable dishes on the server

Status: **proposed, not implemented.** Touches order creation, so per CLAUDE.md
it gets a plan and a review before code.

## The gap

`priceCart` (`convex/lib/orderPricing.ts`) checks that a dish exists, the
quantity and the portion — but not whether the dish can be ordered right now.
Every availability rule lives only in the browser (`getDynamicStatus` in
`src/lib/utils.ts`, the portion filter in `MenuSection`, `isStoreOpen`):

| Rule | Enforced in browser | Enforced on server |
|---|---|---|
| `status: 'hidden'` | yes | **no** |
| `sold_out_today` until `statusUntil` | yes | **no** |
| `todayOnly` past `statusUntil` | yes | **no** |
| `scheduledDays` (weekly schedule) | yes | **no** |
| portion `available: false` | yes | **no** |
| store closed (hours, closed days, `closedUntil`) | yes | **no** |

Anyone calling `orders.create` directly (devtools, a stale tab, the new
cached menu showing a dish for a second after it sold out) can order a dish
the kitchen doesn't have. Money is still correct; the kitchen is not.

## Proposed change

1. **Move the rules to shared code.** `getDynamicStatus` and `isStoreOpen`
   become pure functions in a module both `src/` and `convex/` import (e.g.
   `convex/lib/availability.ts`, re-exported from `src/lib/utils.ts`), so the
   browser and the server can never disagree.
2. **Fix the day-of-week bug on the way.** `getDynamicStatus` uses
   `new Date().getDay()` — the *device's* time zone. The server runs in UTC,
   so between 00:00 and 08:00 Ulaanbaatar time it would see yesterday. Use
   Ulaanbaatar time explicitly, as `isStoreOpen` already does.
3. **Check in `priceCart`**, which every order path already goes through:
   new failure reasons `unavailable_item:<id>` and `unavailable_portion:<id>`.
   `priceCart` takes `now` as an argument so it stays pure and testable.
4. **Store hours** checked in `orders.create` (customer path only), with a
   new `STORE_CLOSED` error the cart shows in Mongolian.
5. **Admins bypass** (counter orders, admin test orders): staff sometimes
   ring up a dish that is marked sold out for the website.
6. **Cart UX:** map the new errors to clear messages ("Энэ хоол дууссан
   байна") and remove the dish from the cart, like the existing
   "menu has changed" path.

## Risks

- **Blocking real orders by mistake** is the main risk: a rule that's wrong
  on the server turns into lost sales. Mitigation: shared code (step 1), a
  test for every rule in both directions, and a dev-deployment run-through.
- **Time zones** (step 2): test at 07:59 and 08:01 Ulaanbaatar time with a
  fake clock.
- **QPay invoices** are created from an order that's already been priced, so
  an invoice can't reach QPay for an unavailable dish. Nothing changes in
  `qpay.ts` or `payments.ts`.

## Tests (convex/orders.test.ts)

For each row of the table above: one order that is accepted and one that is
refused. Plus: admin counter order for a sold-out dish is accepted; an
order placed at 23:59 vs 00:01 Ulaanbaatar time on a scheduled day.

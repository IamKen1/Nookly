# Customer Profiles & Loyalty Points — Design

Date: 2026-11-18
Status: Approved, not yet implemented

## Why

The Bloom plan lists "Customer profiles & loyalty points" on the pricing page,
but the product only has a bare `Customer` table (used by the Rx flow) and an
unused `Customer.loyaltyPoints` column. Nothing earns, redeems, or shows points,
and there is no customers screen.

## Decisions

| Question | Decision |
|---|---|
| Who gets it | Plan flag `featureLoyalty`. Off for every plan at launch; ticked later from the ops console Plans tab. |
| Who turns it on | The owner, per pharmacy (`LoyaltySettings.enabled`, off by default). |
| Earning rate | Owner-editable, default ₱50 = 1 point. |
| Redemption value | Owner-editable, default 1 point = ₱1. |
| How redemption is treated | As a **payment** (like a voucher), not a discount. `totalAmount` and VAT do not change. |
| What earns points | Only the money actually paid: `totalAmount − pointsAmount`. |
| Rounding when earning | Round down. ₱449 at ₱50/point = 8 points. |
| Returns | Proportional. Earned points are taken back (rounded up), redeemed points are given back (rounded down). The balance never goes below zero. |
| Voids | Fully reversed. |

## Data model

### Plan

- `featureLoyalty Boolean @default(false)`. Shown as a checkbox in the ops console Plans tab
  and wired into `src/lib/plan-gating.ts` as `FeatureKey "loyalty"`.

### LoyaltySettings (new, one row per tenant)

- `tenantId` (unique)
- `enabled Boolean @default(false)`
- `pesosPerPoint Decimal(10,2) @default(50)`: pesos spent to earn 1 point. Must be > 0.
- `pesoValuePerPoint Decimal(10,2) @default(1)`: peso value of 1 point when redeemed. Must be > 0.

If a tenant has no row, it is treated as disabled with the defaults above.

### Sale (new columns)

- `pointsRedeemed Int @default(0)`
- `pointsAmount Decimal(10,2) @default(0)`: the peso value of the redeemed points,
  saved with the sale so old receipts don't change when the owner changes the rate.
- `pointsEarned Int @default(0)`

Money actually received = `totalAmount − pointsAmount`.

### LoyaltyTransaction (new ledger)

- `tenantId`, `customerId`, `saleId?`, `userId`
- `type`: `EARN | REDEEM | RETURN | VOID | ADJUST`
- `points Int` (signed: + adds, − deducts)
- `balanceAfter Int`
- `reason String?` (required for `ADJUST`)
- `createdAt`
- Indexes: `[tenantId, customerId, createdAt]`, `[saleId]`

`Customer.loyaltyPoints` stays as the stored balance. It is updated in the same
DB transaction as every ledger row, so the two never drift.

## POS & checkout

- When loyalty is enabled, the checkout modal shows a **Customer** field: search
  by name or phone, or quick-add (first name, last name, phone). It is optional,
  so walk-ins still work. If an Rx is linked, its customer is attached automatically.
- After a customer is picked, the modal shows their balance, e.g. "Juan Dela Cruz · 120 pts (₱120)".
- **Use points** input: whole points only. The max is the lower of the customer's
  balance and the points needed to pay the whole total. The rest is paid by cash or
  e-wallet as today. If points cover the whole total, no cash is needed.
- Picking or quick-adding a customer at checkout only needs `pos_checkout`.

### Server rules (`POST /api/sales`)

All inside the existing sale transaction:

1. Ignore all points fields unless the plan has `featureLoyalty` and `LoyaltySettings.enabled` is on.
2. Re-read the customer's balance in the transaction. Reject if `pointsRedeemed`
   is more than the balance or worth more than the total. A conditional decrement
   (`where loyaltyPoints >= n`) guards against two sales spending the same points.
3. `pointsAmount = pointsRedeemed × pesoValuePerPoint`, rounded to 2 decimals.
4. Validate cash or e-wallet against `totalAmount − pointsAmount`, not `totalAmount`.
5. `pointsEarned = floor((totalAmount − pointsAmount) ÷ pesosPerPoint)`.
6. Write the `REDEEM` and `EARN` ledger rows and update `Customer.loyaltyPoints`.

The browser never decides how many points are earned.

## Void & return

- **Void** (`/api/sales/[id]/void`): write a `VOID` row that takes back
  `pointsEarned` and gives back `pointsRedeemed`.
- **Return** (`/api/sales/[id]/return`), using the existing `ratio`:
  - take back `ceil(pointsEarned × ratio)`
  - give back `floor(pointsRedeemed × ratio)`
  - net change written as one `RETURN` row. The balance stays at 0 or above.
  - The refund paid out = return total − (given-back points × the sale's per-point value).
  - Save `pointsRedeemed`, `pointsAmount`, and `pointsEarned` on the RET- sale as negatives,
    so drawer totals stay correct.

## Cash drawer & reports

`src/lib/shift-reading.ts` and any per-payment-method totals use
`totalAmount − pointsAmount` (money actually received). This fixes the expected
cash in the drawer, which today is the plain sum of `totalAmount` for cash sales.
Add a **Paid with points** line to the shift reading.

Gross sales and VAT reports don't change, because `totalAmount` doesn't change.

## Receipt

When a sale has a customer and loyalty data, add these lines under the total
(on new receipts and reprints, from the saved sale columns):

```
Points used:    100 (−₱100.00)
Amount paid:    ₱400.00
Points earned:  8 · Balance: 28
```

## Customers page (`/customers`)

Gated by `featureLoyalty` and the new `customers` permission.

- **List:** search by name or phone. Columns: name, phone, points balance, last
  purchase, total spent.
- **Profile:** editable contact details (name, phone, email, address, birthday),
  purchase history (links to receipts), points history (from the ledger), and
  the customer's Rx records if any.
- **Adjust points:** +/− points with a required reason. Needs `customers_adjust_points`.
- Customers are deactivated, never deleted, so old sales and Rx stay intact.

## Settings › Loyalty Points

Owner only. Has the on/off switch, `pesosPerPoint`, and `pesoValuePerPoint`, with
a live example ("₱500 purchase earns 10 points; 10 points = ₱10"). If the plan
doesn't include loyalty, it shows an upgrade message.

## Permissions

Added to `src/lib/permissions-shared.ts`:

- `customers` (path `/customers`): view and edit customers.
  Default: Admin, Manager, Pharmacist, Pharmacy Tech.
- `customers_adjust_points` (parent `customers`): manual point adjustments.
  Default: Admin. The owner always has it.

## Turning it off

- **Owner turns loyalty off:** earning and redeeming stop, and points are hidden
  in POS and on receipts. Balances are kept. The Customers page stays (it is part
  of the plan) but hides points columns.
- **Plan downgraded to Sprout:** the Customers page and loyalty are hidden. Data is
  kept and comes back on upgrade.

## Rollout

1. Prisma migration (new columns and tables, `featureLoyalty`).
2. `featureLoyalty` stays off on every plan, in the seed and in production.
   The owner of Nookly ticks it per plan from the ops console when ready.
3. Production migrate uses the direct `db.prisma.io` host, not the pooled URL.

## Testing (local DB)

- Earning and rounding (₱449 → 8 points; custom rates).
- Partial redeem and full redeem (no cash needed).
- Two sales at once using the same customer's points: only one succeeds.
- Void and partial return: ledger rows, balance never below 0, refund amount.
- Shift reading: expected drawer cash excludes points; "Paid with points" line.
- Receipt and reprint show the saved values after the owner changes the rate.
- Owner turns loyalty off; plan downgraded to Sprout and upgraded back.

## Out of scope (for now)

Point expiry, tiers, birthday bonuses, per-product earn rates, SMS of balances.

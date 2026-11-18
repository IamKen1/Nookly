# Customer Profiles & Loyalty Points — Implementation Plan

Design: [2026-11-18-loyalty-points-design.md](2026-11-18-loyalty-points-design.md)

Work happens on a branch, `feature/loyalty-points`. All testing uses a local
`npx prisma dev` database, never the production DB that `.env` points at. Local
servers run with `EMAIL_DISABLED=1`. Read the relevant guide in
`node_modules/next/dist/docs/` before touching routing or pages.

Money-path bar: sales with no points must produce exactly the same totals,
drawer amounts, reports, and receipts as today.

## Phase 1: Schema and gating

1. `prisma/schema.prisma`
   - `Plan.featureLoyalty Boolean @default(false)`
   - New `LoyaltySettings` model (tenant 1:1) and `Tenant.loyaltySettings` relation.
   - New `LoyaltyTransaction` model and `LoyaltyTxnType` enum; relations on Tenant, Customer, Sale, User.
   - `Sale.pointsRedeemed Int @default(0)`, `Sale.pointsAmount Decimal(10,2) @default(0)`, `Sale.pointsEarned Int @default(0)`.
2. Migration `add_loyalty_points`. It does not tick `featureLoyalty` on any plan.
3. `prisma/seed.ts`: left alone. The column defaults to false, and keeping it out of the seed's
   upsert means a re-seed never unticks a choice made in the ops console (same as `featureStaffCode`).
4. `src/lib/plan-gating.ts`: add `loyalty` to `FeatureKey`, `FEATURE_COLUMN`, the upgrade label, and `loadPlanGates`.
5. Ops console: `src/components/admin/PlansTab.tsx` and `src/app/api/nk-ops-72fq9/plans/*` handle the new flag.
6. New `src/lib/loyalty.ts`:
   - `getLoyaltyConfig(tenantId)`: returns `{ planHasIt, enabled, pesosPerPoint, pesoValuePerPoint }`. Active only when both the plan flag and `enabled` are on.
   - `pointsEarnedFor(amountPaid, pesosPerPoint)`: floor; 0 for amounts ≤ 0.
   - `pointsToPesos(points, pesoValuePerPoint)`: rounded to 2 decimals.
   - `applyPoints(tx, { tenantId, customerId, saleId?, userId, type, points, reason? })`:
     conditional update (`loyaltyPoints >= -points` for deductions), then writes the ledger row with `balanceAfter`.
     Throws `InsufficientPointsError` if the conditional update hits no row.
   - Unit tests for the pure helpers.

## Phase 2: Settings › Loyalty Points

1. `GET/PUT /api/settings/loyalty`: owner only, plan-gated on write. Validates both rates > 0 and ≤ sensible caps.
2. `src/components/settings/LoyaltySettingsForm.tsx`: switch, two rate inputs, live example line.
3. `SettingsClient.tsx`: new `loyalty` tab, visible to the owner; shows an upgrade note when the plan lacks it.
   `src/app/settings/page.tsx` passes the plan flag and current settings.

## Phase 3: Checkout (server)

`src/app/api/sales/route.ts`:

1. Accept `pointsToRedeem?: number`.
2. Load the loyalty config. If it isn't active, ignore points entirely.
3. Validate: whole number ≥ 0, a customer is attached, `pointsToPesos(n) ≤ totalAmount`.
4. `amountDue = totalAmount − pointsAmount`. Cash check and `changeGiven` use `amountDue`.
   If `amountDue` is 0, accept no `cashReceived` and skip the e-wallet reference check.
5. Inside `placeSale`, after the sale row is created:
   `applyPoints(REDEEM, −n)`, then `applyPoints(EARN, +pointsEarnedFor(amountDue))`.
   Save `pointsRedeemed`, `pointsAmount`, `pointsEarned` on the sale.
   Map `InsufficientPointsError` to a 409 with "The customer's points changed. Check the balance and try again."
6. Earning needs a customer. A sale with no customer earns nothing.

## Phase 4: Checkout (POS UI)

1. New `src/components/pos/CustomerPicker.tsx`: search via `GET /api/customers?search=` (returns `loyaltyPoints`), quick-add via `POST /api/customers`.
2. `CheckoutModal.tsx`: shown only when loyalty is active. Customer picker, balance line, "Use points" input with a Max button,
   "Amount due" replacing the total for the cash/e-wallet step. Pre-fill the customer from a linked Rx.
3. `src/app/pos/page.tsx` passes the loyalty config to the client.
4. Sale result shows points used, earned, and new balance.

## Phase 5: Void and return

1. `void/route.ts`: if the sale has points, `applyPoints(VOID, +pointsRedeemed − pointsEarned)`, clamped so the balance stays ≥ 0.
2. `return/route.ts`: compute `earnBack = ceil(pointsEarned × ratio)`, `redeemBack = floor(pointsRedeemed × ratio)`;
   one `RETURN` ledger row, clamped at 0. Save negatives on the RET- sale.
   Refund shown to the cashier = return total − `pointsToPesos(redeemBack)` at the sale's saved rate
   (`pointsAmount ÷ pointsRedeemed`).

## Phase 6: Drawer, reports, receipts

1. `src/lib/shift-reading.ts`: per-method totals and `cashSalesTotal` use `totalAmount − pointsAmount`. Add `pointsTotal` ("Paid with points").
   Show it in `ShiftModal.tsx` and `ShiftsClient.tsx`.
2. `src/app/api/shifts/daily-closing/route.ts`, `src/lib/reports/sales.ts`, `src/lib/reports/operations.ts`, `src/lib/dashboard-data.ts`:
   wherever amounts are grouped by payment method, use money received and add a "Points" row. Gross sales and VAT stay on `totalAmount`.
3. `src/lib/receipt-data.ts`, `src/types/receipt.ts`, `src/lib/receipt.ts`, thermal print (`src/lib/printer/print-receipt.ts`), and the sale email
   in `src/lib/notifications.ts`: points lines from the saved sale columns. The balance line uses the ledger row's `balanceAfter` for this sale.
4. `src/components/sales/SalesClient.tsx`: show points on the sale detail.

## Phase 7: Customers page

1. `src/lib/permissions-shared.ts`: `customers` and `customers_adjust_points` modules with the agreed defaults.
2. `src/app/customers/page.tsx` (list) and `src/app/customers/[id]/page.tsx` (profile), using `requirePagePermission("customers")` and the plan flag.
3. APIs:
   - `GET /api/customers` gains paging and `lastPurchaseAt` / `totalSpent` (aggregate over completed sales net of returns).
   - `GET/PATCH /api/customers/[id]`: details and edit; deactivate via `isActive`.
   - `GET /api/customers/[id]/history`: sales and ledger, paged.
   - `POST /api/customers/[id]/points`: manual `ADJUST`, needs `customers_adjust_points`, reason required.
4. Sidebar nav entry, hidden without the plan flag or the permission. Points columns hidden when the owner has loyalty off.

## Phase 8: Verify and ship

1. Local DB scenarios from the design's Testing section, plus:
   - Replay a set of no-points sales through old and new code; totals, drawer, reports, and receipts must match exactly.
   - Old code on the new schema still works (deploy safety).
2. `npm run build` and lint.
3. Show the user, get approval.
4. Apply the migration to prod via the direct `db.prisma.io` host, then merge to `main`.

## Order of work

Phases 1 → 2 → 3 → 5 → 6 are the money path and go first, tested together.
Phase 4 (POS UI) and Phase 7 (Customers page) are mostly UI and can be built in parallel once Phase 1 lands.

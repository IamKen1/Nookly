# Nookly

**Nookly** is a multi-tenant, subscription-based point-of-sale platform built for
Philippine drugstores and pharmacies. Every pharmacy that signs up gets its own
isolated workspace on a shared database — inventory, staff, sales, and settings
never cross tenant boundaries — with billing built around three plans (Sprout,
Bloom, Empire) that gate features like prescriptions, analytics, alerts, and
multi-branch support.

This is a private production repository. Do not make it public, and do not
commit `.env` or any real credentials.

## Feature overview

**Point of sale**
- Barcode-scanning POS with grid/list product views, category filters, and a
  live cart with directly-editable quantities.
- VAT-inclusive pricing with Senior/PWD/Student/Employee discount handling.
- Prescription-gated checkout — Rx-only items require an attached prescription,
  created inline at checkout (search-or-create customer/doctor) or by
  reusing an existing pending prescription for refills.
- Cash, card, and split payment methods, with change calculation.
- Sale voids and partial/full returns, with stock and batch reversal.
- Shift management: cashiers optionally declare a starting cash float, get a
  live "X-reading" of sales-so-far at any time, and close out with a counted
  cash amount that's checked against the expected total.
- GCash/Maya e-wallet cash-in / cash-out logging as a service distinct from
  product sales, with its own fee tracking, folded into the shift's cash
  reconciliation.
- Acknowledgement-Receipt (AR) printing/PDF — Nookly is not BIR-accredited, so
  every receipt carries a fixed non-accreditation disclaimer.

**Inventory & catalog**
- Product catalog with categories, suppliers, barcode, drug schedule, and
  prescription-required flags.
- Per-branch stock levels, stock adjustments with an audit trail
  (`StockMovement`), and batch/expiration tracking consumed FEFO
  (first-expiring-first-out) at checkout.
- Bulk import/export via spreadsheet templates.

**Prescriptions & customers**
- Doctor and customer records, prescription history, and refill tracking.

**Reporting**
- Sales dashboard, income statement, inventory valuation, and sales-summary
  reports, daily/weekly/monthly/annually.
- Shift & cash reports: a daily-closing view (per-cashier cash variance for
  the day) and a Daily/Weekly/Monthly/Yearly trends view with charts and CSV
  export, covering net sales, cash variance, and e-wallet volume/fees.

**Multi-branch & staffing**
- Store (branch) management, role-based staff accounts (Owner, Admin,
  Pharmacist, Pharmacy Tech, Cashier, Manager), and per-plan branch/user/product
  limits.

**Billing**
- Self-serve trial signup; plan changes go through a manual request-and-confirm
  workflow (no in-app payment collection) so a human confirms payment before a
  plan activates.

**Support**
- In-app "report a problem" ticketing for tenants, with a threaded inbox-style
  view for platform admins to respond and manage status.

**Platform operations**
- A separate, non-public admin console for the Nookly team: tenant management
  (suspend/reactivate/impersonate), platform admin grants, plan configuration
  (pricing, limits, and a feature checklist that drives both gating and the
  public pricing page), support inbox, and an append-only audit log.
- Access is deliberately not discoverable from the app's normal navigation and
  requires both a database-flagged admin account and a separate unlock step —
  ask a teammate for the console's path and passphrase, they are intentionally
  not documented here.

## Architecture

- **Stack**: Next.js (App Router, Turbopack) · Prisma ORM · PostgreSQL ·
  TailwindCSS · JWT session cookies.
- **Multi-tenancy**: shared database, every operational table carries a
  `tenantId` column (see `prisma/schema.prisma`). `Store` represents a branch;
  `ProductStock` tracks per-branch inventory so a single-branch tenant and a
  many-branch tenant use the same data model.
- **Billing model**: `Plan` (catalog, admin-configurable), `Subscription`
  (per-tenant status/cycle), `Invoice` (billing history), `PlanChangeRequest`
  (manual upgrade/downgrade workflow).
- **Auth**: JWT session cookie carrying `{ userId, tenantId, storeId, role }`.
  Login requires a workspace slug + email/username + password, since usernames
  are only unique per-tenant, not globally. Sessions can be short-lived
  (browser session) or "remembered" (30 days).
- **Every API route** re-derives the session from the request and scopes every
  Prisma query by `tenantId` (and `storeId` where applicable) — there is no
  implicit tenant context, it's explicit in every handler.

## Getting started

```bash
cp .env.example .env
# fill in DATABASE_URL at minimum; see .env.example for the rest

npm install
npm run db:migrate   # applies all migrations
npm run db:seed      # seeds the Sprout/Bloom/Empire plans
npm run dev
```

Visit `http://localhost:3000` for the marketing/pricing site, `/signup` to
provision a new tenant (creates a Tenant, main Store, OWNER user, and a
14-day-trial Subscription), and `/dashboard` after logging in.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | `prisma generate` + production build |
| `npm run start` | Start the production server |
| `npm run lint` | Lint the codebase |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:seed` | Seed the plan catalog |
| `npm run db:seed:demo` | Seed demo/sample data |
| `npm run db:reset` | Reset the database and reseed |

## Security notes

- `.env` is git-ignored — never commit real database URLs, JWT secrets, or the
  admin console passphrase. Rotate any credential that's ever accidentally
  committed.
- The platform admin console's URL and unlock passphrase are intentionally
  omitted from this README and from in-app navigation. Get them from a
  teammate directly.
- Treat `PLATFORM_ADMIN_EMAILS` and `ADMIN_ACCESS_KEY` in `.env` as sensitive —
  they gate the ops console described above.

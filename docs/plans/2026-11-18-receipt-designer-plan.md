# Receipt Designer — Implementation Plan

Design: [2026-11-18-receipt-designer-design.md](2026-11-18-receipt-designer-design.md)

Branch `feature/receipt-designer` from `main`. Test against the local
`nookly-test4` database only; local servers run with `EMAIL_DISABLED=1`.
Read the relevant guide in `node_modules/next/dist/docs/` before touching
routing or pages.

Bar: tenants without an enabled design print exactly what they print today.

## Phase 1: Schema, gating, engine core

1. `Plan.featureReceiptDesigner`; `ReceiptTemplate` model; migration (additive, ticks nothing).
2. Ops console Plans tab + API; `plan-gating.ts` feature key `receiptDesigner`.
3. `src/lib/receipt-designer/types.ts`: block, totals-line and style types, theme, print mode, `version`.
   `style.ts`: theme → block → line inheritance.
4. `src/lib/receipt-designer/presets.ts`: Nookly Classic, Chain drugstore, Compact, Promo.
5. `src/lib/receipt-designer/layout.ts`: (`blocks`, `paperWidth`, `ReceiptData`) → lines.
   Pure, no DOM. Column-aware wrapping and label/amount rows.
6. `src/lib/receipt-designer/totals.ts`: catalog of totals lines, each a function of `ReceiptData`.
7. `src/lib/receipt-designer/validate.ts`: block schema, title rules, size limits, version upgrade.
8. Unit tests (node:test via tsx), including Classic preset vs today's thermal text.

## Phase 2: Outputs

1. `escpos.ts` (text mode): lines → bytes (init, Font A/B, GS ! sizes, bold, underline,
   inverse, align, cut). Uses `escPosSafeText`. Column math accounts for Font B and size multipliers.
1b. `image-mode.ts`: render the HTML receipt to a canvas at 384/576 dots with the chosen fonts
   (FontFace API, Google Fonts), dither, send as GS v 0 bands.
2. `raster.ts`: image → 1-bit dithered GS v 0 at 384 dots (58mm) / 576 dots (80mm).
   Browser-side (canvas) since printing happens in the browser.
3. Code 128 via GS k; QR rendered with `qrcode` to a canvas, then rasterized.
4. `html.ts`: lines → receipt HTML (browser print + preview), same styling as today's receipt page.
5. Byte-snapshot tests.

## Phase 3: Wiring the print paths

1. `/api/sales/[id]/receipt`: include `{ template }` when the plan flag and `enabled` are on.
2. New `src/lib/receipt-designer/render.ts` `renderReceipt(data, template)`:
   designer engine with try/catch fallback to today's generators.
3. Route every print path through it: `PosClient.printReceiptForSale`,
   `printer/print-receipt.ts`, Sales reprint, cashier dashboard.
4. Verify the not-enabled path is unchanged.

## Phase 4: Designer API

1. `GET/PUT /api/settings/receipt-template`: owner only, plan-gated; validates via `validate.ts`;
   saves `draftBlocks`, or publishes (`blocks` + `enabled`), or reverts (`enabled = false`).
2. `GET /api/settings/receipt-template/sample?kind=regular|scpwd|points|ewallet|recent`:
   sample `ReceiptData` (recent = the tenant's latest sale, via `buildReceiptDataForSale`).
3. Logo upload into `ReceiptSettings.logoUrl` via `/api/upload`.

## Phase 5: Designer UI

1. Add `@dnd-kit/core`, `@dnd-kit/sortable`, `qrcode`, `jsbarcode` (exact versions).
2. `src/app/settings/receipt-designer/page.tsx` (owner + plan gate).
3. Components: block palette, sortable preview, block settings panel with a style editor
   (font, size, color, bold/underline/italic/inverse, spacing; options limited by print mode),
   theme panel, print-mode switch with its warnings,
   totals line editor (add / reorder / rename / style / group / hide-when-zero),
   top bar (width, preset, sample sale, test print, warnings, Use this design, Revert).
4. Entry point from Settings › Receipt.
5. Debounced draft autosave.

## Phase 6: Verify and ship

1. Local DB end to end: design, publish, sell, print (HTML), reprint, revert.
2. Not-enabled and plan-off tenants: identical receipts.
3. `npm run build`, lint on new files.
4. Owner test prints on real 58mm and 80mm printers, text and image mode, USB and Bluetooth.
5. Migration to prod via the direct host, then merge to `main`. No plan ticked.

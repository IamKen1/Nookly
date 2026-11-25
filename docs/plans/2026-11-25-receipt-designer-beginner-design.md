# Receipt designer: beginner-friendly ("parang laro") — design

Date: 2026-11-25 · Builds on 2026-11-18-receipt-designer-design.md and commit 567f40f.

## Goal
A first-time owner can make the receipt they want without reading anything:
start from a guided setup, then change things by clicking the receipt itself.
Every advanced setting stays (the side panel), so experts lose nothing.
Computations stay **display only**: the designer changes what the receipt
shows, never what the POS charges (user confirmed 2026-11-25).

## 1. Direct editing on the preview
- Click a part of the receipt → it's selected and a floating toolbar appears
  above it: Bold · Bigger/Smaller · Align · ALL CAPS · Move up/down ·
  Duplicate · Delete · ⋯ More (the side panel).
- Double-click text → edit it right there (text, titles, labels of values,
  totals lines, headings). Enter saves, Esc cancels.
- Totals lines are individually clickable: rows carry `lineId`, the preview
  wraps each line, and the toolbar shows where the number comes from
  ("= Total amount due") with a picker to switch the value or use a formula.

## 2. Tiles
The palette becomes colorful categories (Store, Sale details, Items, Totals,
Payment, SC/PWD, Loyalty, Decorations). Each tile shows a tiny live preview of
what it prints with the sample sale. Click to add below the selection, or
drag onto the receipt. A tile can add several parts at once (e.g. VAT summary).

All UI copy is English (user, 2026-11-25).

## 3. Checklist
The legal/usability warnings become a checklist with progress (Total, SC/PWD
discount, VAT exemption, SC/PWD name & ID, AR number, BIR notice — always on).
Each missing item has an "Add it" button. Other advice stays as notes.

## 4. Guided setup (wizard)
Five steps with a live preview: style → paper → money & dates → item lines →
extras at the bottom (VAT summary, barcode, thank-you, QR, SC/PWD lines).
Opens by itself the first time (no draft, nothing published) and from a
"Guided setup" button. Finishing applies the design (undoable) with confetti.

## 5. Apply to POS (decided 2026-11-25, replaces "display only")
When an owner changes a computation in the designer, they're asked
"Apply this to your POS too?". Yes = new sales are charged that way. Old
sales always reprint their saved figures (never recomputed).
Allowed, in build order:
1. **Discount settings**: rate, percent/fixed, cap, VAT-exempt — edits the
   same Discount records the POS uses. System SC/PWD stays 20% + VAT-exempt.
2. **Total rounding** (new POS setting): nearest ₱0.25 / ₱0.50 / ₱1.00; the
   rounding difference is saved on the sale and shown as its own line.
3. **Own formulas → charged amount** (user chose this against advice).
   Guardrails to design in that phase: never applies to SC/PWD or other
   VAT-exempt-discount sales (legal computation wins); the difference is saved
   on the sale as a named adjustment so Sales, shift readings and reports stay
   in agreement with the drawer; preview shows before/after on sample sales
   before the owner confirms; one switch turns it off.

### Apply to POS — detailed design (decided 2026-11-25)
- One pure function `applyPricing` (src/lib/pricing.ts) used by checkout
  screen and server: computed total → owner formula (if on) → rounding.
- Rounding: **down only, cash sales only**, step ₱0.25/₱0.50/₱1.00; never
  rounds a positive total to ₱0.
- Formula: never on SC/PWD or VAT-exempt-discount sales; may only use sale
  values known before payment; result ignored (computed total charged) when
  invalid or more than **±20%** from the computed total.
- The difference is spread across VATable / non-VAT parts and VAT is
  recomputed, so VATable + VAT + non-VAT = total still holds for every report.
- Sale gets `adjustmentAmount`, `adjustmentLabel`, `roundingAmount` (default
  0 → old sales unchanged). New `PricingSettings` table per workspace.
- With everything off, results must be identical to today (randomized test).

## Build order
Direct editing → tiles → checklist → wizard. Unit tests for the engine pieces
(lineId, checklist, tile/wizard builders); browser check of the designer.

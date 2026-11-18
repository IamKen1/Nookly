# Receipt Designer — Design

Date: 2026-11-18
Status: Approved, not yet implemented

## Why

Owners want to design their own receipts: choose what shows, in what order,
how totals and discounts are laid out, and add a logo, QR code, barcode and
promos. Receipts today come from fixed code (`src/lib/receipt.ts`) with a
handful of toggles in Settings › Receipt.

## Decisions

| Question | Decision |
|---|---|
| Who gets it | Plan flag `featureReceiptDesigner`, off for every plan until ticked in the ops console. |
| Who designs | The owner. |
| Current users | Untouched. Without an enabled design, receipts come from today's code, unchanged. |
| Paper | 58mm (32 chars) and 80mm (48 chars) thermal, picked in the designer. Browser print (HTML) also renders the design. |
| Branches | One design per pharmacy. Branch name and address fill in automatically, as today. |
| Layout model | Vertical blocks, drag to reorder. Not a free canvas: thermal printers print line by line. |
| Styling | Font, size, color, bold, underline, inverse, etc. on every block and totals line. What the thermal printer honors depends on the print mode the owner picks. |
| Print modes | **Text** (default, fast): printer's Font A/B, 1×–8× size, bold, underline, inverse. **Image**: whole receipt printed as a picture — any font from a curated list, any size, grays; slower, especially on Bluetooth. |
| Color | Full color in the preview and browser print. Thermal is black only: colors become black (text mode) or dithered grays (image mode). |
| Totals | Fully up to the owner: pick lines from a fixed catalog, reorder, rename, style, group, hide when zero. No custom formulas. |
| SC/PWD / Total lines | Warning in the designer if removed; not enforced. |
| Brand presets | Layout styles only, with generic names. No real chain names, logos or branding. |
| BIR | "Not a BIR-accredited receipt" notice is locked at the bottom. Titles "Official Receipt" and "Sales Invoice" are refused. |

## Data model

### Plan

- `featureReceiptDesigner Boolean @default(false)`. Ops console checkbox; not in the seed.

### ReceiptTemplate (new, one per tenant)

- `tenantId` (unique)
- `enabled Boolean @default(false)`: "Use this design". Off = today's receipt.
- `paperWidth Int @default(58)`: 58 or 80.
- `printMode String @default("TEXT")`: `TEXT` or `IMAGE`.
- `theme Json`: design-wide defaults (font, size, color, line spacing) that blocks inherit.
- `blocks Json`: the published design.
- `draftBlocks Json?`: unsaved work in the designer; never printed.
- `version Int @default(1)`: format version for future migrations of `blocks`.
- `updatedAt`, `updatedByUserId`

The logo stays in `ReceiptSettings.logoUrl` (column exists, unused today), uploaded
through the existing `/api/upload`.

## Blocks

Common settings on every block: visible, align (left/center/right), label
overrides, spacing above/below, and the style settings below.

## Styling

Every block and every totals line has a style; anything left unset inherits
the design's theme. The designer shows what each mode will actually print.

| Setting | Text mode (thermal) | Image mode (thermal) | Preview & browser print |
|---|---|---|---|
| Font | Font A (normal) or Font B (small, ~42 cols on 58mm) | Curated list (e.g. Inter, Roboto, Poppins, Montserrat, Roboto Mono, Courier Prime, Playfair, Pacifico) | Same as the mode |
| Size | Width 1×–8× and height 1×–8×, separately | Any pt size | Same |
| Bold, underline | Yes | Yes, plus italic | Yes |
| Inverse (white on black) | Yes | Yes | Yes |
| Text / background color | Prints black | Dithered grays | Full color |
| Letter / line spacing | Line spacing only | Both | Both |

Image mode is printed as one dithered black-and-white picture of the whole
receipt. The designer warns that it's slower (several seconds over
Bluetooth), that very small text may blur, and that large black areas wear
cheap printers faster.

| Block | Settings |
|---|---|
| Logo | width (% of paper), align |
| Store info | name, address (branch-aware), contact, TIN, permit, accreditation, serial — each on/off |
| Title | text; refuses "Official Receipt" / "Sales Invoice" |
| Sale details | AR no., date, time, cashier, customer, branch — each on/off, reorderable |
| Items | qty × price, line total, V/N marker, generic name, "Total items" line |
| Totals | ordered list of lines (below) |
| SC/PWD info | name, ID, signature line; shows only on SC/PWD sales |
| Payment | method, reference, cash, change |
| Loyalty | points earned, balance; shows only when the sale has points |
| Remarks | dosage / instructions |
| Custom text | free text (multi-line); any number, any position |
| QR code | content (URL/text), size, caption |
| Barcode | AR number, Code 128, height |
| Divider | dashes, double, blank |
| Footer | message. The BIR notice always prints after it and can't be removed. |

Blocks with nothing to show (no SC/PWD, no points, no remarks, no reference) are skipped.

### Totals lines

The owner builds the Totals block from this catalog. Every value is read from
the saved sale, so receipts always match sales, shift readings and reports.

- Before discount: gross total, VATable gross, non-VAT gross, item count, quantity
- Discount: discount (with name/rate), VAT removed (SC/PWD), total savings
- Breakdown: VATable sales, VAT-exempt sales, zero-rated sales, non-VAT sales, 12% VAT
- Due: total amount due, points used, amount paid
- Payment: cash, change, e-wallet reference
- Heading: a text row to start a group (e.g. "VAT BREAKDOWN")

Per line: label, bold, large, minus sign, divider above, hide when zero.
Presets are starting lists: "Detailed" (today's step-by-step), "VAT summary",
"Simple".

Warnings (not enforced): no Total line; SC/PWD sale preview missing the
discount or VAT-exempt line.

## Presets

Starting designs, fully editable after picking:

- **Nookly Classic**: block-for-block copy of today's receipt.
- **Chain drugstore**: VAT summary, V/N per item, barcode at the bottom.
- **Compact**: fewest lines, saves paper.
- **Promo**: large custom text and a QR code.

## Designer screen

Settings › Receipt › "Receipt designer", full-screen, desktop/tablet.

- Left: block palette (drag in).
- Center: live preview at the chosen width; drag to reorder, click to select.
- Right: settings for the selected block; the Totals line editor lives here.
- Top bar: paper width, preset, sample sale (regular, SC/PWD, with points,
  e-wallet, or a real recent sale), Test print, warnings.
- Edits save to `draftBlocks`. "Use this design" copies the draft to `blocks`
  and sets `enabled`. "Revert to Nookly receipt" sets `enabled = false`.

## Rendering

One engine, `src/lib/receipt-designer/`, turns (`blocks`, `paperWidth`,
`ReceiptData`) into:

1. **Lines**: an intermediate list of styled rows and images, shared by both outputs.
2. **ESC/POS bytes, text mode**: Font A/B, GS ! sizes, bold, underline,
   inverse (GS B), alignment; logo and QR as raster images (GS v 0,
   dithered); barcode via GS k Code 128.
3. **ESC/POS bytes, image mode**: the HTML/canvas rendering of the whole
   receipt at 384 dots (58mm) or 576 dots (80mm), dithered and sent as raster
   bands, then cut.
4. **HTML**: the same lines with full fonts and colors, for browser print and
   the designer preview. In text mode the preview uses the printer's monospace
   grid and shows exactly the characters that will print.

Fonts for image mode load from Google Fonts with the FontFace API before
rendering; if a font fails to load, a system fallback is used.

### Choosing the receipt

A single `renderReceipt(data)` is used by every print path (POS after a sale,
`printReceiptAnywhere`, Sales reprint, cashier dashboard):

- plan has `featureReceiptDesigner` **and** template `enabled` → designer engine
- otherwise → today's `generateThermalReceiptText` / `generateReceiptHTML`, unchanged

`/api/sales/[id]/receipt` adds the template (if active) to its response so
the client knows which engine to use.

### Errors

- If the designer engine throws, print today's receipt instead and log it.
  Printing at the counter never fails because of a design.
- Logo fails to load → skipped.
- A `blocks` value from an older `version` is upgraded on read.

## Not affected

Tenants without the plan flag or without an enabled design: same code path,
same output, byte for byte. Verified by comparing today's output with the
"not enabled" path across sample sales.

## Testing

- Unit: line layout at 32 and 48 columns (wrapping, right-aligned amounts,
  long product names), every totals line against `ReceiptData`, hide-when-zero,
  title validation, version upgrade.
- "Nookly Classic" preset vs today's thermal output across sample sales
  (regular, SC/PWD, custom discount, points, e-wallet, return).
- ESC/POS: byte snapshots for text styles (fonts, sizes, underline, inverse),
  raster image header and size, Code 128, image-mode banding.
- Style inheritance: theme → block → totals line.
- Fallback: corrupt template → today's receipt.
- Not enabled / plan without flag → identical to today.
- Manual: test print on a real 58mm and 80mm printer (owner's device), in
  both modes, over USB and Bluetooth; time image-mode prints.

## Out of scope (for now)

Per-branch designs, A4 invoices, custom formulas, multiple saved designs,
email receipts using the design.

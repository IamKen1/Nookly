# Receipt designer: real printer test checklist

The receipt designer has only been tested on screen and in automated tests, never on a real thermal printer. Before turning on **Receipt designer** for more plans, run this checklist on each kind of printer customers use: at least one **58mm** and one **80mm**, over **USB** (desktop Chrome or Edge) and over **Bluetooth** (Android Chrome).

Do it on a test workspace, or at a store outside business hours. Write the result next to each box (✅ / ❌ plus a photo). A photo of the printed paper next to the screen is the most useful thing to send back.

## 0. Before you start

- [ ] Printer model, paper width (58 / 80mm), connection (USB / Bluetooth), device and browser written down.
- [ ] The printer prints the **standard Nookly receipt** fine from the POS. If it doesn't, stop: that's a printer setup problem, not the designer.
- [ ] Settings › Receipt designer opens, and the printer is connected (printer button at the top of the POS).

## 1. Test page and calibration (Receipt settings › Printer on this device)

- [ ] **Print a test page** prints completely: ruler lines, sizes, styles, QR code, barcode, gray scale and the edge strip.
- [ ] Ruler, **Font A**: the line wraps after ___ characters. Expected: 32 on 58mm, 48 on 80mm. If different, enter the real number in "Font A characters".
- [ ] Ruler, **Font B**: the line wraps after ___ characters. Expected: 42 on 58mm, 64 on 80mm. If different, enter it.
- [ ] Edge strip: no marks missing on the left or right. If the left edge is cut off, raise the **Left margin** slider, print again, and note the value that works.
- [ ] The QR code scans with a phone camera, and the barcode scans with the store's barcode scanner.

## 2. Text mode (the default; fast)

Pick **Text** as the print mode. For each look in the **Gallery** (Nookly Classic, Chain drugstore, POS register, Compact, Promo), press **Test print** with the preview set to **Regular sale**:

- [ ] Every line fits on one line the same way it does on screen. No line spills onto an extra line, and the columns line up.
- [ ] Bold, underline, white-on-black (inverse) and the **2× / 3×** sizes print as shown.
- [ ] **Font B** (small) lines print small, not as Font A.
- [ ] The ₱ sign prints as "P", or the design has no peso sign (the printer has no ₱ character).
- [ ] The cutter cuts below the last line, not through it, and there's no long blank tail.
- [ ] The barcode of the AR number (Chain drugstore) scans.
- [ ] The QR code (Promo) scans and opens the link typed in the designer.

## 3. Image mode (any font; slower)

Switch to **Image**, then test print **Nookly Classic** and **Promo**:

- [ ] The whole receipt prints as one picture, sharp and not stretched or squashed.
- [ ] Gray text and backgrounds come out readable (dithered), not as solid black blocks.
- [ ] Time from tap to finished paper: USB ___ s, Bluetooth ___ s. More than ~10 s on Bluetooth is too slow for a counter; note it.
- [ ] The logo (Receipt settings › Logo) prints clearly at the chosen width.

## 4. Real sales and reprints

Press **Use this design**, then at the POS:

- [ ] A cash sale prints right after checkout with the design, and the change on paper matches the screen.
- [ ] An e-wallet sale shows the wallet and reference no.
- [ ] A **senior citizen / PWD** sale: VAT-exempt lines, 20% discount, ID and name, signature lines all present; the amounts match the checkout screen.
- [ ] A sale with **loyalty points** shows points used, earned and the balance.
- [ ] A sale with a **prescription**: Rx no., doctor and PRC no. print if those pieces are on the design; lot and expiry print for items received through "Receive batch".
- [ ] **Sales › Print** reprints an old sale with the design and the same amounts as when it was sold.
- [ ] A **return** (RET-…) prints "RETURN / REFUND" and "For AR-…" at the top, with negative amounts.
- [ ] A **voided** sale prints "*** VOIDED ***" at the top.
- [ ] If a branch has its own design (Design for: <branch>), a sale at that branch prints it, and a sale at another branch prints the main design.

## 5. What the POS charges (only if you turn these on)

- [ ] Cash rounding ₱0.25: a ₱548.15 cash sale charges ₱548.00, and the receipt shows "Rounding -0.15". The same cart paid by e-wallet stays ₱548.15.
- [ ] A price formula limited to e-wallet sales changes e-wallet sales only, and the receipt shows its line.
- [ ] Undo both from "Changes to the POS" when done. The next sale charges the standard amount.

## 6. Falling back

- [ ] **More › Go back to the standard Nookly receipt**: the next sale prints the standard receipt.
- [ ] Turn the printer off and print: the browser print dialog opens instead, with the same design, and nothing is lost.

## What to send back

For any ❌: the printer model, connection, print mode, which look or sale, a photo of the paper next to the screen, and the calibration numbers you used. If a printer gets text wrong but image mode works (or the reverse), say so. That points straight at the cause: text-mode commands such as sizes and Font B, versus picture data.

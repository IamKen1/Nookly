// Run: npx tsx --test src/lib/receipt-designer/wizard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIZARD_ITEMS, WIZARD_STYLES, WIZARD_TOTALS, answersFor, buildFromAnswers, type WizardAnswers } from "./wizard";
import { designChecklist, sanitizeTemplate } from "./validate";
import { layoutReceipt } from "./layout";
import { toPrintedLines } from "./textmode";
import { sampleReceipt, type SampleKind } from "./samples";

const store = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", contactNumber: "0917", tin: "123-456", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};
const cashier = { firstName: "Ana", lastName: "Reyes" };
const text = (t: ReturnType<typeof buildFromAnswers>, kind: SampleKind = "scpwd", pricing?: Parameters<typeof sampleReceipt>[5]) =>
  toPrintedLines(layoutReceipt(t, sampleReceipt(kind, store, cashier, null, null, pricing)), t.paperWidth)
    .map((l) => (l.kind === "text" ? l.text : `[${l.kind}]`))
    .join("\n");

test("every combination of style, items, totals, letters and item count is valid and complete", () => {
  for (const s of WIZARD_STYLES)
    for (const it of WIZARD_ITEMS)
      for (const tot of WIZARD_TOTALS)
        for (const letters of ["VN", "TX", "none"] as const)
          for (const itemCount of ["none", "line", "stars"] as const) {
            const a: WizardAnswers = { ...answersFor(s.key), items: it.key, totals: tot.key, letters, itemCount };
            const t = buildFromAnswers(a, store);
            const name = `${s.key}/${it.key}/${tot.key}/${letters}/${itemCount}`;
            assert.deepEqual(sanitizeTemplate(t).errors, [], name);
            assert.deepEqual(designChecklist(t).filter((c) => !c.done).map((c) => c.key), [], `${name}: checklist`);
            for (const kind of ["regular", "scpwd", "points", "ewallet"] as const) text(t, kind);
          }
});

test("answers show on the receipt", () => {
  const a = { ...answersFor("classic", 80), peso: false, date: "MM-DD-YY" as const, allCaps: true, labels: "register" as const, letters: "TX" as const, itemCount: "stars" as const };
  const out = text(buildFromAnswers(a, store), "regular");
  assert.ok(!out.includes("₱"), "no peso sign");
  assert.ok(out.includes("VAT REG TIN:123-456"), "register labels");
  assert.ok(out === out.toUpperCase(), "ALL CAPS");
  assert.match(out, /\d\.\d\d T/, "T for VATable");
  assert.match(out, /\*\* 42 ITEM\(S\) \*\*/);

  const extras = buildFromAnswers({ ...answersFor("classic"), vatSummary: true, barcode: true, qrLink: "https://fb.com/botika", message: "Get well soon!", promoText: "SALE!" }, store);
  const e = text(extras);
  assert.match(e, /VAT-Exempt Sale +\(X\)/);
  assert.ok(e.includes("[barcode]") && e.includes("[qr]") && e.includes("Get well soon!") && e.includes("SALE!"));
  assert.equal(extras.blocks.at(-1)!.type, "footer", "the notice stays last");

  const fewer = buildFromAnswers({ ...answersFor("classic"), storeFields: { address: true, contact: false, tin: false, permit: false, accreditation: false, serial: false }, showTitle: false }, store);
  const f = text(fewer, "regular");
  assert.ok(!f.includes("TIN") && !f.includes("0917") && !f.includes("AR\n"));
});

test("simple and register totals show the price formula and rounding when they apply", () => {
  for (const totals of ["simple", "register"] as const) {
    const t = buildFromAnswers({ ...answersFor("classic"), totals }, store);
    const out = text(t, "regular", { roundingStep: 1, rule: { label: "Service fee", expr: "total * 1.02" } });
    assert.match(out, /Service fee:/, totals);
    assert.match(out, /Rounding:/, totals);
    assert.ok(!/Rounding:|Service fee/.test(text(t, "regular")), `${totals}: nothing when off`);
  }
});

test("register style keeps its own look: no ₱, T/X letters, short time", () => {
  const t = buildFromAnswers(answersFor("register", 80), store);
  assert.equal(t.theme.format?.time, "h:mmA");
  assert.match(text(t), /\d\.\d\dX/);
});

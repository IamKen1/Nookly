// Run: npx tsx --test src/lib/receipt-designer/wizard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIZARD_ITEMS, WIZARD_STYLES, answersFor, buildFromAnswers } from "./wizard";
import { designChecklist, sanitizeTemplate } from "./validate";
import { layoutReceipt } from "./layout";
import { toPrintedLines } from "./textmode";
import { sampleReceipt } from "./samples";

const store = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};
const text = (t: ReturnType<typeof buildFromAnswers>) =>
  toPrintedLines(layoutReceipt(t, sampleReceipt("scpwd", store, { firstName: "A", lastName: "B" }, null)), t.paperWidth)
    .map((l) => (l.kind === "text" ? l.text : `[${l.kind}]`))
    .join("\n");

test("every style and item choice gives a valid, complete receipt", () => {
  for (const s of WIZARD_STYLES) {
    for (const it of WIZARD_ITEMS) {
      for (const w of [58, 80] as const) {
        const t = buildFromAnswers({ ...answersFor(s.key, w), items: it.key }, store);
        const { errors } = sanitizeTemplate(t);
        assert.deepEqual(errors, [], `${s.key}/${it.key}`);
        assert.deepEqual(designChecklist(t).filter((c) => !c.done).map((c) => c.key), [], `${s.key}/${it.key}: checklist`);
        text(t);
      }
    }
  }
});

test("answers change the receipt: ₱, date, extras", () => {
  const plain = buildFromAnswers({ ...answersFor("classic"), peso: false, date: "MM-DD-YY" }, store);
  assert.ok(!text(plain).includes("₱"));
  assert.equal(plain.theme.format?.date, "MM-DD-YY");

  const extras = buildFromAnswers({ ...answersFor("classic"), vatSummary: true, barcode: true, qrLink: "https://fb.com/botika", message: "Get well soon!" }, store);
  const out = text(extras);
  assert.match(out, /VAT-Exempt Sale +\(X\)/);
  assert.ok(out.includes("[barcode]") && out.includes("[qr]") && out.includes("Get well soon!"));
  // The notice and footer stay last.
  assert.equal(extras.blocks.at(-1)!.type, "footer");

  const none = buildFromAnswers({ ...answersFor("register"), vatSummary: false, barcode: false, qrLink: "" }, store);
  assert.ok(!/\(X\)/.test(text(none)));
  const promoNoQr = buildFromAnswers({ ...answersFor("promo"), qrLink: "" }, store);
  assert.ok(!promoNoQr.blocks.some((b) => b.type === "qr"));
});

test("register style keeps its own look: no ₱, T/X letters, short time", () => {
  const t = buildFromAnswers(answersFor("register", 80), store);
  assert.equal(t.theme.format?.time, "h:mmA");
  assert.match(text(t), /\d\.\d\dX/);
});

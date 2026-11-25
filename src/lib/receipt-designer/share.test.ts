// Run: npx tsx --test src/lib/receipt-designer/share.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReceiptStoreSettings } from "@/types/receipt";
import { buildPreset, PRESETS } from "./presets";
import { newField, valueLine } from "./blocks";
import { designFile, readDesignFile } from "./share";
import type { Block, Template } from "./types";

const store: ReceiptStoreSettings = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};

test("a saved design opens back exactly as it was", () => {
  for (const p of PRESETS) {
    const t = buildPreset(p.key, store, 80);
    const r = readDesignFile(JSON.stringify(designFile(t)), []);
    assert.equal(r.problem, null);
    assert.deepEqual(r.template, t, p.key);
    assert.deepEqual(r.errors, []);
  }
  // A bare design (no file wrapper) opens too.
  const t = buildPreset("classic", store, 58);
  assert.deepEqual(readDesignFile(JSON.stringify(t), []).template, t);
});

test("branch conditions only keep this workspace's branches", () => {
  const t: Template = buildPreset("classic", store, 58);
  const totals = t.blocks.find((b) => b.type === "totals") as Extract<Block, { type: "totals" }>;
  const design: Template = {
    ...t,
    blocks: [
      newField("branch", { showWhen: { branches: ["ours", "theirs"] } }),
      newField("cashier", { showWhen: { branches: ["theirs"] } }),
      newField("customer", { showWhen: { branches: ["theirs"], saleTypes: ["cash"] } }),
      { ...totals, lines: [{ ...valueLine("totalDue"), showWhen: { branches: ["theirs"] } }] },
    ],
  };
  const r = readDesignFile(JSON.stringify(designFile(design)), ["ours"]);
  const [a, b, c, d] = r.template!.blocks;
  assert.deepEqual(a.showWhen, { branches: ["ours"] });
  assert.equal(b.showWhen, undefined, "nothing left to check: always prints");
  assert.deepEqual(c.showWhen, { saleTypes: ["cash"] });
  assert.equal((d as typeof totals).lines[0].showWhen, undefined);
  assert.equal(r.droppedBranchConditions, 4);
});

test("anything else is refused or cleaned like a save", () => {
  assert.match(readDesignFile("not json", []).problem ?? "", /isn't a receipt design/);
  assert.match(readDesignFile("{}", []).problem ?? "", /no receipt design/);
  assert.match(readDesignFile(JSON.stringify({ kind: "nookly-receipt-design", template: { blocks: "x" } }), []).problem ?? "", /no receipt design/);
  // Wording that can't be on a Nookly receipt comes back as an error to fix, like when saving.
  const t = buildPreset("classic", store, 58);
  const bad = { ...t, blocks: [...t.blocks, { ...newField("receiptNo"), label: "OFFICIAL RECEIPT NO:" }] };
  const r = readDesignFile(JSON.stringify(designFile(bad)), []);
  assert.ok(r.template);
  assert.ok(r.errors.length > 0, "flagged");
});

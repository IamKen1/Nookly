// Run: npx tsx --test src/lib/receipt-designer/tiles.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TILES, TILE_CATEGORIES, makeTile } from "./tiles";
import { sanitizeTemplate } from "./validate";
import { layoutReceipt } from "./layout";
import { sampleReceipt, SAMPLE_KINDS, type SampleKind } from "./samples";

const store = {
  storeName: "Botika", receiptTitle: "AR", addressLine1: "Rizal Ave.", footerMessage: "Salamat!",
  showVatBreakdown: true, showCashierName: true, showCustomerName: true, includeOrderRemarks: true,
};

test("every tile adds valid parts with fresh ids, in a known category", () => {
  let n = 0;
  const uid = () => `id${n++}`;
  const ids = new Set<string>();
  for (const tile of TILES) {
    assert.ok(TILE_CATEGORIES.some((c) => c.key === tile.category), tile.id);
    const blocks = makeTile(tile, uid);
    assert.ok(blocks.length > 0, tile.id);
    for (const b of blocks) {
      assert.ok(!ids.has(b.id), `${tile.id}: id reused`);
      ids.add(b.id);
    }
    const { template, errors } = sanitizeTemplate({ paperWidth: 58, blocks });
    assert.deepEqual(errors, [], tile.id);
    assert.equal(template.blocks.length, blocks.length, `${tile.id}: a part didn't survive saving`);
    for (const kind of SAMPLE_KINDS.filter((k) => k.key !== "recent")) {
      layoutReceipt(template, sampleReceipt(kind.key as SampleKind, store, { firstName: "A", lastName: "B" }, null));
    }
  }
  assert.equal(new Set(TILES.map((t) => t.id)).size, TILES.length, "tile ids are unique");
});

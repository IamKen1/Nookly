// Run: npx tsx --test src/lib/loyalty-math.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pointsEarnedFor,
  pointsToPesos,
  maxRedeemablePoints,
  pointsForReturn,
  pointsForNextReturn,
  savedValuePerPoint,
  validateRate,
} from "./loyalty-math";

test("earning rounds down on the money paid", () => {
  assert.equal(pointsEarnedFor(449, 50), 8);
  assert.equal(pointsEarnedFor(450, 50), 9);
  assert.equal(pointsEarnedFor(400, 50), 8);
  assert.equal(pointsEarnedFor(49.99, 50), 0);
  assert.equal(pointsEarnedFor(0, 50), 0);
  assert.equal(pointsEarnedFor(-100, 50), 0);
  assert.equal(pointsEarnedFor(100, 0), 0);
});

test("earning has no float drift", () => {
  assert.equal(pointsEarnedFor(0.3, 0.1), 3);
  assert.equal(pointsEarnedFor(100.1, 33.37), 2); // 2.9997 → 2
  assert.equal(pointsEarnedFor(100.11, 33.37), 3); // exactly 3
  assert.equal(pointsEarnedFor(1234.56, 12.35), 99); // 99.96 → 99
  assert.equal(pointsEarnedFor(1235, 12.35), 100);
});

test("points to pesos", () => {
  assert.equal(pointsToPesos(100, 1), 100);
  assert.equal(pointsToPesos(3, 0.1), 0.3);
  assert.equal(pointsToPesos(7, 0.25), 1.75);
  assert.equal(pointsToPesos(0, 1), 0);
});

test("max redeemable is capped by balance and by the total", () => {
  assert.equal(maxRedeemablePoints(120, 500, 1), 120);
  assert.equal(maxRedeemablePoints(1000, 500, 1), 500);
  assert.equal(maxRedeemablePoints(1000, 499.5, 1), 499); // can't overpay
  assert.equal(maxRedeemablePoints(1000, 10, 0.25), 40);
  assert.equal(maxRedeemablePoints(0, 500, 1), 0);
});

test("returns take earned points back rounded up, give used points back rounded down", () => {
  assert.deepEqual(pointsForReturn(8, 100, 0.4), { earnBack: 4, redeemBack: 40 });
  assert.deepEqual(pointsForReturn(9, 15, 0.5), { earnBack: 5, redeemBack: 7 });
  assert.deepEqual(pointsForReturn(10, 10, 0.1 + 0.2), { earnBack: 3, redeemBack: 3 });
  assert.deepEqual(pointsForReturn(8, 100, 1), { earnBack: 8, redeemBack: 100 });
  assert.deepEqual(pointsForReturn(8, 100, 0), { earnBack: 0, redeemBack: 0 });
});

test("several partial returns never move more than the sale earned or used", () => {
  // 1 point earned, 2 used; returned in three equal parts.
  let earnBack = 0;
  let redeemBack = 0;
  for (const cum of [1 / 3, 2 / 3, 1]) {
    const next = pointsForNextReturn(1, 2, cum, earnBack, redeemBack);
    earnBack += next.earnBack;
    redeemBack += next.redeemBack;
  }
  assert.equal(earnBack, 1);
  assert.equal(redeemBack, 2);

  // 9 earned, 15 used; returned 40% then 60%.
  const a = pointsForNextReturn(9, 15, 0.4, 0, 0);
  const b = pointsForNextReturn(9, 15, 1, a.earnBack, a.redeemBack);
  assert.deepEqual(a, { earnBack: 4, redeemBack: 6 });
  assert.equal(a.earnBack + b.earnBack, 9);
  assert.equal(a.redeemBack + b.redeemBack, 15);
});

test("saved value per point", () => {
  assert.equal(savedValuePerPoint(100, 100), 1);
  assert.equal(savedValuePerPoint(40, 10), 0.25);
  assert.equal(savedValuePerPoint(0, 0), 0);
});

test("rate validation", () => {
  assert.deepEqual(validateRate(50, "x"), { ok: true, value: 50 });
  assert.deepEqual(validateRate("0.25", "x"), { ok: true, value: 0.25 });
  assert.equal(validateRate(0, "x").ok, false);
  assert.equal(validateRate(-1, "x").ok, false);
  assert.equal(validateRate("abc", "x").ok, false);
  assert.equal(validateRate(1.234, "x").ok, false);
  assert.equal(validateRate(1e9, "x").ok, false);
});

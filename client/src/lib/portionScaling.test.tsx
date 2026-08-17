/**
 * Portion-scaling math (food-analysis fixes, Aug 2026 — Commit 2 / Fix 4)
 *
 * The motivating bug: "1 can tuna" resolved to Nutritionix's 172 g can
 * (~41 g protein) with no way to see or correct the size. These tests pin
 * the gram-edit and quantity-scaling behavior of the confirm UI.
 */

import { describe, it, expect } from "vitest";
import { isContainerUnit, scaleByGrams, scaleByQuantity, type ScalableItem } from "./portionScaling";

// The real tuna item as Nutritionix returned it on Aug 16
const tuna: ScalableItem = {
  quantity: 1,
  servingWeightGrams: 172,
  calories: 220,
  protein: 40.6,
  fat: 5.1,
  totalCarbs: 0,
  fiber: 0,
  netCarbs: 0,
  _baseCal: 220,
  _basePro: 40.6,
  _baseFat: 5.1,
  _baseTotalCarbs: 0,
  _baseFiber: 0,
  _baseNetCarbs: 0,
  _baseGrams: 172,
};

describe("isContainerUnit", () => {
  it("matches the ambiguous container words, including plurals and compounds", () => {
    for (const unit of ["can", "cans", "bar", "package", "bottle", "slice", "jar", "pouch", "container", "serving", "bottle (16.9 oz)"]) {
      expect(isContainerUnit(unit), unit).toBe(true);
    }
  });

  it("does not match measured units", () => {
    for (const unit of ["cup", "tbsp", "tablespoon", "oz", "g", "gram", "ml", null, undefined, ""]) {
      expect(isContainerUnit(unit as any), String(unit)).toBe(false);
    }
  });
});

describe("scaleByGrams", () => {
  it("rescales the 172 g tuna can down to a 142 g can", () => {
    const scaled = scaleByGrams(tuna, 142);
    expect(scaled.servingWeightGrams).toBe(142);
    expect(scaled.quantity).toBe(1);
    // 220 * 142/172 ≈ 182; 40.6 * 142/172 ≈ 33.5
    expect(scaled.calories).toBe(Math.round((220 / 172) * 142));
    expect(scaled.protein).toBeCloseTo(33.5, 1);
    expect(scaled.fat).toBeCloseTo(4.2, 1);
  });

  it("repeated gram edits scale from the original analysis, not compounding drift", () => {
    const once = { ...tuna, ...scaleByGrams(tuna, 50) };
    const back = { ...once, ...scaleByGrams(once, 172) };
    expect(back.calories).toBe(220);
    expect(back.protein).toBeCloseTo(40.6, 1);
  });

  it("is a no-op for items with no gram basis", () => {
    const noGrams = { ...tuna, servingWeightGrams: null, _baseGrams: null };
    const scaled = scaleByGrams(noGrams, 100);
    expect(scaled.calories).toBe(tuna.calories);
    expect(scaled.servingWeightGrams).toBeNull();
  });

  it("ignores non-positive gram targets", () => {
    const scaled = scaleByGrams(tuna, 0);
    expect(scaled.calories).toBe(tuna.calories);
    expect(scaled.servingWeightGrams).toBe(172);
  });
});

describe("scaleByQuantity", () => {
  it("scales grams and macros together for gram-bearing items", () => {
    const scaled = scaleByQuantity(tuna, 2);
    expect(scaled.quantity).toBe(2);
    expect(scaled.servingWeightGrams).toBe(344);
    expect(scaled.calories).toBe(440);
    expect(scaled.protein).toBeCloseTo(81.2, 1);
  });

  it("a corrected gram size survives quantity changes", () => {
    // User fixes the can to 142 g, then logs 2 cans
    const fixed = { ...tuna, ...scaleByGrams(tuna, 142) };
    const two = scaleByQuantity(fixed, 2);
    expect(two.servingWeightGrams).toBe(284);
    expect(two.calories).toBe(Math.round((220 / 172) * 284));
  });

  it("falls back to per-unit base scaling for gram-less items", () => {
    const noGrams: ScalableItem = {
      ...tuna,
      servingWeightGrams: null,
      _baseGrams: null,
      _baseCal: 100,
      _basePro: 10,
      _baseFat: 2,
      _baseTotalCarbs: 5,
      _baseFiber: 1,
      _baseNetCarbs: 4,
    };
    const scaled = scaleByQuantity(noGrams, 3);
    expect(scaled.quantity).toBe(3);
    expect(scaled.calories).toBe(300);
    expect(scaled.protein).toBe(30);
    expect(scaled.servingWeightGrams).toBeNull();
  });
});

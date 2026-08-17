/**
 * Parent/child aggregate invariant (food-analysis fixes, Aug 2026 — Commit 5 / Fix 1)
 *
 * Today's Nutrition sums parent-row macros only; the meal detail shows child
 * items. computeAggregateMacros is the single arithmetic both meal-save
 * paths (POST and PUT /api/food/meal) use to keep them in agreement.
 */

import { describe, it, expect } from "vitest";
import { computeAggregateMacros } from "../services/mealAggregate";

describe("computeAggregateMacros", () => {
  it("sums item macros and mirrors netCarbs into the legacy carbs alias", () => {
    const agg = computeAggregateMacros([
      { calories: 220, protein: 40.6, fat: 5.1, totalCarbs: 0, fiber: 0, netCarbs: 0 },
      { calories: 187, protein: 0.3, fat: 20.6, totalCarbs: 0.2, fiber: 0, netCarbs: 0.2 },
      { calories: 200, protein: 12, fat: 8, totalCarbs: 23, fiber: 5, netCarbs: 18 },
    ]);
    expect(agg.calories).toBe(607);
    expect(agg.protein).toBeCloseTo(52.9, 5);
    expect(agg.fat).toBeCloseTo(33.7, 5);
    expect(agg.totalCarbs).toBeCloseTo(23.2, 5);
    expect(agg.fiber).toBe(5);
    expect(agg.netCarbs).toBeCloseTo(18.2, 5);
    expect(agg.carbs).toBe(agg.netCarbs);
  });

  it("treats missing, null, and non-numeric values as zero", () => {
    const agg = computeAggregateMacros([
      { calories: 100 },
      { calories: null, protein: undefined, fat: NaN as any, netCarbs: "abc" as any },
      {},
    ]);
    expect(agg.calories).toBe(100);
    expect(agg.protein).toBe(0);
    expect(agg.fat).toBe(0);
    expect(agg.netCarbs).toBe(0);
  });

  it("empty items produce an all-zero aggregate", () => {
    const agg = computeAggregateMacros([]);
    expect(Object.values(agg).every((v) => v === 0)).toBe(true);
  });

  it("editing one item's macros changes the aggregate by exactly the delta (the desync bug)", () => {
    // The Aug 16 scenario: tuna corrected from the 172 g can to a 142 g can
    const before = [
      { calories: 220, protein: 40.6, fat: 5.1, totalCarbs: 0, fiber: 0, netCarbs: 0 },
      { calories: 187, protein: 0.3, fat: 20.6, totalCarbs: 0.2, fiber: 0, netCarbs: 0.2 },
    ];
    const after = [
      { calories: 182, protein: 33.5, fat: 4.2, totalCarbs: 0, fiber: 0, netCarbs: 0 },
      before[1],
    ];
    const aggBefore = computeAggregateMacros(before);
    const aggAfter = computeAggregateMacros(after);
    expect(aggBefore.protein - aggAfter.protein).toBeCloseTo(40.6 - 33.5, 5);
    expect(aggBefore.calories - aggAfter.calories).toBe(220 - 182);
  });
});

/**
 * Serving-weight capture (food-analysis fixes, Aug 2026 — Commit 1)
 *
 * Nutritionix's natural-language endpoint resolves container words ("1 can
 * tuna") to a specific gram weight invisibly. These tests lock in that
 * analyzeNaturalText captures serving_weight_grams and alt_measures into the
 * item shape (camelCase), so the confirm UI can expose and correct the
 * resolved portion instead of silently trusting it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nutritionLookup } from "../services/nutritionLookup";

describe("analyzeNaturalText serving-weight capture", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockNixResponse(foods: any[]) {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ foods }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as any;
  }

  it("captures serving_weight_grams and alt_measures in camelCase", async () => {
    mockNixResponse([
      {
        food_name: "can tuna",
        serving_qty: 1,
        serving_unit: "can",
        serving_weight_grams: 172,
        nf_calories: 220.16,
        nf_protein: 40.63,
        nf_total_fat: 5.11,
        nf_total_carbohydrate: 0,
        nf_dietary_fiber: 0,
        brand_name: null,
        alt_measures: [
          { serving_weight: 85, measure: "oz", seq: 1, qty: 3 },
          { serving_weight: 172, measure: "can", seq: 2, qty: 1 },
          { serving_weight: 100, measure: "g", seq: null, qty: 100 },
        ],
      },
    ]);

    const items = await nutritionLookup.analyzeNaturalText(`serving-weight-tuna-${Date.now()}`);
    expect(items).not.toBeNull();
    expect(items!).toHaveLength(1);

    const item = items![0];
    expect(item.servingWeightGrams).toBe(172);
    expect(item.altMeasures).toEqual([
      { qty: 3, measure: "oz", servingWeightGrams: 85 },
      { qty: 1, measure: "can", servingWeightGrams: 172 },
      { qty: 100, measure: "g", servingWeightGrams: 100 },
    ]);
  });

  it("is null-safe when the response has no weight or alt_measures", async () => {
    mockNixResponse([
      {
        food_name: "mystery food",
        serving_qty: 1,
        serving_unit: "serving",
        nf_calories: 100,
        nf_protein: 5,
        nf_total_fat: 2,
        nf_total_carbohydrate: 10,
        nf_dietary_fiber: 1,
        brand_name: null,
      },
    ]);

    const items = await nutritionLookup.analyzeNaturalText(`serving-weight-missing-${Date.now()}`);
    expect(items).not.toBeNull();
    expect(items![0].servingWeightGrams).toBeNull();
    expect(items![0].altMeasures).toBeNull();
  });

  it("drops malformed alt_measures rows and nulls an empty result", async () => {
    mockNixResponse([
      {
        food_name: "odd food",
        serving_qty: 1,
        serving_unit: "piece",
        serving_weight_grams: 50,
        nf_calories: 80,
        nf_protein: 3,
        nf_total_fat: 1,
        nf_total_carbohydrate: 12,
        nf_dietary_fiber: 2,
        brand_name: null,
        alt_measures: [
          { serving_weight: "not-a-number", measure: "cup", qty: 1 },
          { measure: "slice" },
          null,
        ],
      },
    ]);

    const items = await nutritionLookup.analyzeNaturalText(`serving-weight-malformed-${Date.now()}`);
    expect(items).not.toBeNull();
    expect(items![0].servingWeightGrams).toBe(50);
    expect(items![0].altMeasures).toBeNull();
  });
});

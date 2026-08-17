/**
 * Image-path enrichment via lookupItemDetailed (food-analysis follow-ups,
 * Aug 2026 — item 4). Photo entries previously routed through the old
 * per-item lookup, which discarded gram weights the API already returned.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nutritionLookup } from "../services/nutritionLookup";

const nixFood = (name: string, overrides: Record<string, any> = {}) => ({
  food_name: name,
  serving_qty: 1,
  serving_unit: "serving",
  serving_weight_grams: 100,
  nf_calories: 100,
  nf_protein: 5,
  nf_total_fat: 3,
  nf_total_carbohydrate: 10,
  nf_dietary_fiber: 1,
  brand_name: null,
  tags: { item: name },
  ...overrides,
});

describe("enrichFoodsDetected via lookupItemDetailed", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("vision items gain gram weight + alt measures and accurate provenance", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      const json = (p: any) => new Response(JSON.stringify(p), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.includes("/v2/search/")) return json({ branded: [], foods: [] });
      if (u.includes("trackapi.nutritionix.com")) {
        return json({
          foods: [
            nixFood("grilled chicken breast", {
              serving_weight_grams: 174,
              nf_calories: 284,
              nf_protein: 53.4,
              alt_measures: [{ serving_weight: 87, measure: "half breast", seq: 1, qty: 1 }],
            }),
          ],
        });
      }
      return json({ products: [], foods: [] });
    }) as any;

    const enriched = await nutritionLookup.enrichFoodsDetected([
      {
        name: `grilled chicken breast ${Date.now()}`,
        quantity: 1,
        unit: "breast",
        calories: 280,
        protein: 50,
        fat: 6,
        totalCarbs: 0,
        fiber: 0,
        netCarbs: 0,
        source: "ai_estimate",
      },
    ]);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].source).toBe("verified");
    expect(enriched[0].sourceName).toBe("Nutritionix");
    expect(enriched[0].servingWeightGrams).toBe(174);
    expect(enriched[0].altMeasures).toEqual([{ qty: 1, measure: "half breast", servingWeightGrams: 87 }]);
    expect(enriched[0].calories).toBe(284);
    // Photo items never carry the typed-text partial-match flag
    expect((enriched[0] as any).matchQuality).toBeUndefined();
  });

  it("still rejects wildly-mismatched lookups and keeps the AI estimate", async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      const json = (p: any) => new Response(JSON.stringify(p), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.includes("/v2/search/")) return json({ branded: [], foods: [] });
      if (u.includes("trackapi.nutritionix.com")) {
        return json({ foods: [nixFood("egg noodles", { nf_calories: 800, nf_protein: 30 })] });
      }
      return json({ products: [], foods: [] });
    }) as any;

    const enriched = await nutritionLookup.enrichFoodsDetected([
      { name: `egg ${Date.now()}`, quantity: 1, unit: "large", calories: 70, protein: 6, fat: 5, totalCarbs: 0, fiber: 0, netCarbs: 0 },
    ]);

    expect(enriched[0].source).toBe("ai_estimate");
    expect(enriched[0].calories).toBe(70);
  });
});

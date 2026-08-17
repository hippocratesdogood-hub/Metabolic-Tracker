/**
 * Stage-2 unification (food-analysis follow-ups, Aug 2026 — Part 2)
 *
 * When ANTHROPIC_API_KEY is set, text analysis switches to the LLM branch:
 * Haiku parses the sentence, then each item resolves through
 * lookupItemDetailed. These tests pin that the Phase-2 fixes survive that
 * switch: grams + alt measures come through, the branded database is
 * consulted before the caller invents an estimate, provenance is accurate,
 * and partial salvage is labeled. Everything here runs without an
 * Anthropic key — the resolver only needs Nutritionix credentials.
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

describe("lookupItemDetailed (stage-2 resolver)", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockApi(fx: {
    natural?: (body: any) => any;
    instant?: () => any;
    item?: () => any;
    offUsda?: boolean;
  }) {
    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      const json = (payload: any) =>
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.includes("trackapi.nutritionix.com/v2/search/instant")) return json(fx.instant ? fx.instant() : { branded: [] });
      if (u.includes("trackapi.nutritionix.com/v2/search/item")) return json(fx.item ? fx.item() : { foods: [] });
      if (u.includes("trackapi.nutritionix.com")) return json(fx.natural ? fx.natural(JSON.parse(init.body)) : { foods: [] });
      // Open Food Facts / USDA endpoints — empty results unless enabled
      return json({ products: [], foods: [] });
    }) as any;
  }

  it("returns the full item shape with grams and alt measures (Fix 4 survives the LLM path)", async () => {
    mockApi({
      natural: () => ({
        foods: [
          nixFood("can tuna", {
            serving_unit: "can",
            serving_weight_grams: 172,
            nf_calories: 220,
            nf_protein: 40.6,
            alt_measures: [
              { serving_weight: 85, measure: "oz", seq: 1, qty: 3 },
              { serving_weight: 172, measure: "can", seq: 2, qty: 1 },
            ],
          }),
        ],
      }),
    });

    const item = await nutritionLookup.lookupItemDetailed(`tuna-${Date.now()}`, 1, "can");
    expect(item).not.toBeNull();
    expect(item!.servingWeightGrams).toBe(172);
    expect(item!.altMeasures).toEqual([
      { qty: 3, measure: "oz", servingWeightGrams: 85 },
      { qty: 1, measure: "can", servingWeightGrams: 172 },
    ]);
    expect(item!.source).toBe("verified");
    expect(item!.sourceName).toBe("Nutritionix");
  });

  it("consults the branded database before giving up (Fix 3 survives — the RxBar case)", async () => {
    mockApi({
      natural: () => ({ foods: [] }),
      instant: () => ({ branded: [{ nix_item_id: "rx-1", brand_name: "RxBar", food_name: "Chocolate Sea Salt Bar" }] }),
      item: () => ({
        foods: [
          nixFood("Chocolate Sea Salt Bar", {
            brand_name: "RxBar",
            serving_unit: "bar",
            serving_weight_grams: 52,
            nf_calories: 200,
            nf_protein: 12,
            tags: null,
          }),
        ],
      }),
    });

    const item = await nutritionLookup.lookupItemDetailed(`RxBar-${Date.now()}`, 1, "serving");
    expect(item).not.toBeNull();
    expect(item!.brand).toBe("RxBar");
    expect(item!.calories).toBe(200);
    expect(item!.source).toBe("verified");
  });

  it("labels partial salvage on the per-item path (loose-match detection survives)", async () => {
    mockApi({ natural: () => ({ foods: [nixFood("wafer")] }) });

    const item = await nutritionLookup.lookupItemDetailed(`zzqx flurbganitz wafer ${Date.now()}`, 1, "serving");
    expect(item).not.toBeNull();
    expect(item!.matchQuality).toBe("loose");
    expect(item!.matchedFrom).toEqual(["wafer"]);
  });

  it("upgrades a generic match to the branded product when the name covers the item", async () => {
    mockApi({
      natural: () => ({ foods: [nixFood("protein bar")] }),
      instant: () => ({ branded: [{ nix_item_id: "q-1", brand_name: "Quest", food_name: "Protein Bar, S'mores" }] }),
      item: () => ({
        foods: [
          nixFood("Protein Bar, S'mores", {
            brand_name: "Quest",
            serving_unit: "bar",
            serving_weight_grams: 60,
            nf_calories: 190,
            nf_protein: 21,
            tags: null,
          }),
        ],
      }),
    });

    const item = await nutritionLookup.lookupItemDetailed(`quest protein bar ${Date.now()}`, 1, "bar");
    expect(item).not.toBeNull();
    expect(item!.brand).toBe("Quest");
    expect(item!.matchQuality).toBeUndefined();
  });

  it("merges a multi-food response under the parsed name; grams sum only when all parts have them", async () => {
    mockApi({
      natural: () => ({
        foods: [
          nixFood("ham", { serving_weight_grams: 50, nf_calories: 80 }),
          nixFood("cheese", { serving_weight_grams: 30, nf_calories: 110 }),
        ],
      }),
    });

    const item = await nutritionLookup.lookupItemDetailed(`ham and cheese ${Date.now()}`, 1, "serving");
    expect(item).not.toBeNull();
    expect(item!.calories).toBe(190);
    expect(item!.servingWeightGrams).toBe(80);
  });

  it("returns null when nothing resolves, so the caller can LLM-estimate", async () => {
    mockApi({ natural: () => ({ foods: [] }) });

    const item = await nutritionLookup.lookupItemDetailed(`glorbnak-${Date.now()}`, 1, "serving");
    expect(item).toBeNull();
  });

  it("requires no ANTHROPIC_API_KEY anywhere in the chain", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      mockApi({ natural: () => ({ foods: [nixFood("eggs")] }) });
      const item = await nutritionLookup.lookupItemDetailed(`eggs-${Date.now()}`, 2, "large");
      expect(item).not.toBeNull();
      expect(item!.name).toBe("eggs");
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

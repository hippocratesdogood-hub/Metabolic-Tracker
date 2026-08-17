/**
 * Branded second-pass lookup (food-analysis fixes, Aug 2026 — Commit 4 / Fix 3)
 *
 * RXBAR exists only in Nutritionix's branded database, which the natural
 * (common-foods) endpoint never searches. Phrases the natural parser can't
 * resolve now get a second pass: /v2/search/instant → nix_item_id →
 * /v2/search/item, labeled with the real source (verified / Nutritionix +
 * brand) rather than an AI-estimate chip.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nutritionLookup } from "../services/nutritionLookup";

const RXBAR_ITEM = {
  food_name: "Chocolate Sea Salt Bar",
  brand_name: "RxBar",
  serving_qty: 1,
  serving_unit: "bar",
  serving_weight_grams: 52,
  nf_calories: 200,
  nf_protein: 12,
  nf_total_fat: 8,
  nf_total_carbohydrate: 23,
  nf_dietary_fiber: 5,
  nix_item_id: "560d65a15ad577cc23904afc",
};

describe("searchBrandedFood", () => {
  const realFetch = global.fetch;
  let requests: string[];

  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
    requests = [];
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockBrandedApi({ found = true }: { found?: boolean } = {}) {
    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      requests.push(u);
      const json = (payload: any) =>
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.includes("/v2/search/instant")) {
        // Headers must stay de-identified here too
        const headerKeys = Object.keys(init?.headers ?? {}).map((k: string) => k.toLowerCase()).sort();
        expect(headerKeys).toEqual(["x-app-id", "x-app-key"]);
        // brand_name is present on live instant results; the default
        // acceptance requires the member's text to name it.
        return json(found ? { common: [], branded: [{ nix_item_id: RXBAR_ITEM.nix_item_id, brand_name: RXBAR_ITEM.brand_name, food_name: RXBAR_ITEM.food_name }] } : { common: [], branded: [] });
      }
      if (u.includes("/v2/search/item")) {
        return json({ foods: [RXBAR_ITEM] });
      }
      // natural/nutrients (integrated test): tuna resolves, RxBar errors
      return json({
        foods: [
          {
            food_name: "can tuna", serving_qty: 1, serving_unit: "can", serving_weight_grams: 172,
            nf_calories: 220, nf_protein: 40.6, nf_total_fat: 5.1, nf_total_carbohydrate: 0, nf_dietary_fiber: 0, brand_name: null,
          },
        ],
        errors: [{ original_text: JSON.parse(init.body).query.split("\n").pop(), err_code: 101 }],
      });
    }) as any;
  }

  it("resolves an RxBar via instant search + item lookup with accurate source labeling", async () => {
    mockBrandedApi();
    const item = await nutritionLookup.searchBrandedFood("1 RxBar");
    expect(item).not.toBeNull();
    expect(item!.name).toBe("RxBar Chocolate Sea Salt Bar");
    expect(item!.source).toBe("verified");
    expect(item!.sourceName).toBe("Nutritionix");
    expect(item!.brand).toBe("RxBar");
    expect(item!.calories).toBe(200);
    expect(item!.protein).toBe(12);
    expect(item!.totalCarbs).toBe(23);
    expect(item!.servingWeightGrams).toBe(52);
    expect(item!.confidence).toBeLessThan(0.95); // name-similarity match, not exact parse
    expect(requests.some((u) => u.includes("nix_item_id=560d65a15ad577cc23904afc"))).toBe(true);
  });

  it("scales a leading count: '2 rxbar' doubles macros and grams", async () => {
    mockBrandedApi();
    const item = await nutritionLookup.searchBrandedFood("2 rxbar");
    expect(item).not.toBeNull();
    expect(item!.quantity).toBe(2);
    expect(item!.calories).toBe(400);
    expect(item!.protein).toBe(24);
    expect(item!.servingWeightGrams).toBe(104);
  });

  it("rejects a candidate whose brand the member never named (brand-conflict guard)", async () => {
    mockBrandedApi();
    // Instant returns an RxBar product, but the member's phrase names no
    // brand at all: must fall through rather than substitute.
    const item = await nutritionLookup.searchBrandedFood("2 CountBar");
    expect(item).toBeNull();
  });

  it("returns null when the branded database has no match", async () => {
    mockBrandedApi({ found: false });
    const item = await nutritionLookup.searchBrandedFood("1 NoSuchBrandBar");
    expect(item).toBeNull();
  });

  it("analyzeNaturalTextDetailed folds branded hits back into items (end-to-end RxBar case)", async () => {
    mockBrandedApi();
    const result = await nutritionLookup.analyzeNaturalTextDetailed(
      `1 can tuna, 1 IntegRxBar-${Math.floor(Math.random() * 1e9)}`,
    );
    expect(result).not.toBeNull();
    expect(result!.unresolved).toEqual([]);
    const names = result!.items.map((i) => i.name);
    expect(names).toContain("can tuna");
    expect(names).toContain("RxBar Chocolate Sea Salt Bar");
  });
});

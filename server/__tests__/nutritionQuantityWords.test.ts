/**
 * Sept 7 2026 production finds, pinned against the deployed pipeline shapes:
 *
 *  1. "two Quest bars" → 1 bar (160 kcal) while "3 Quest bars" → 3 bars. The
 *     branded second pass stripped only numeral counts; a number word fell
 *     through and the result was silently scaled by 1.
 *  2. "a chipotle chicken bowl" → chipotle pepper (14 kcal) + 3 oz chicken
 *     (187 kcal) = 201 kcal, every word "matched" (coverage 1.0), nothing
 *     flagged. Nutritionix's own parse; caught now by the container
 *     plausibility heuristic.
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

const questBar = nixFood("Quest Bars Protein Bar, Lemon Cream Pie", {
  serving_unit: "bar",
  serving_weight_grams: 60,
  nf_calories: 160,
  nf_protein: 21,
  nf_total_fat: 6,
  nf_total_carbohydrate: 23,
  nf_dietary_fiber: 12,
  brand_name: "Quest Nutrition",
  nix_item_id: "quest-lemon",
});

type Fixture = {
  natural: (body: any) => any;
  instant?: (url: string) => any;
  item?: (url: string) => any;
};

const realFetch = global.fetch;
function mockApi(fx: Fixture) {
  global.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const json = (payload: any) =>
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/v2/search/instant")) return json(fx.instant ? fx.instant(u) : { branded: [], common: [] });
    if (u.includes("/v2/search/item")) return json(fx.item ? fx.item(u) : { foods: [] });
    return json(fx.natural(JSON.parse(init.body)));
  }) as any;
}

// Unique suffix defeats the in-memory result cache between cases; digits and
// '#' are not content tokens, so coverage and container detection are unaffected.
const uniq = (s: string) => `${s} #${Math.random().toString().slice(2, 8)}`;

const questFixture: Fixture = {
  // Quest exists only in the branded database: the natural parser returns nothing.
  natural: () => ({ foods: [] }),
  instant: (u) =>
    decodeURIComponent(u).toLowerCase().includes("quest")
      ? { common: [], branded: [{ nix_item_id: "quest-lemon", brand_name: "Quest Nutrition", food_name: "Quest Bars Protein Bar, Lemon Cream Pie" }] }
      : { common: [], branded: [] },
  item: () => ({ foods: [questBar] }),
};

describe("branded path — written-out quantities", () => {
  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("REGRESSION: 'two Quest bars' scales ×2 exactly like '2 Quest bars'", async () => {
    mockApi(questFixture);
    const words = await nutritionLookup.analyzeNaturalTextDetailed(uniq("two Quest bars"));
    const digits = await nutritionLookup.analyzeNaturalTextDetailed(uniq("2 Quest bars"));
    for (const r of [words, digits]) {
      expect(r).not.toBeNull();
      expect(r!.unresolved).toEqual([]);
      expect(r!.items).toHaveLength(1);
      expect(r!.items[0].quantity).toBe(2);
      expect(r!.items[0].calories).toBe(320);
      expect(r!.items[0].quantityAssumed).toBeUndefined();
    }
  });

  it("'a couple of Quest bars' → 2, 'half a Quest bar' → 0.5", async () => {
    mockApi(questFixture);
    const couple = await nutritionLookup.analyzeNaturalTextDetailed(uniq("a couple of Quest bars"));
    expect(couple!.items[0].quantity).toBe(2);
    expect(couple!.items[0].calories).toBe(320);
    const half = await nutritionLookup.analyzeNaturalTextDetailed(uniq("half a Quest bar"));
    expect(half!.items[0].quantity).toBe(0.5);
    expect(half!.items[0].calories).toBe(80);
  });

  it("no stated quantity → 1, and the assumption is flagged instead of silent", async () => {
    mockApi(questFixture);
    const r = await nutritionLookup.analyzeNaturalTextDetailed(uniq("Quest bars"));
    expect(r!.items).toHaveLength(1);
    expect(r!.items[0].quantity).toBe(1);
    expect(r!.items[0].quantityAssumed).toBe(true);
  });
});

describe("container plausibility heuristic in the natural path", () => {
  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("REGRESSION (live find): 'a chipotle chicken bowl' → pepper + chicken (201 kcal) is labeled 'Check this'", async () => {
    mockApi({
      natural: () => ({
        foods: [
          nixFood("chipotle", { serving_unit: "pepper", nf_calories: 14 }),
          nixFood("chicken", { serving_qty: 3, serving_unit: "oz", nf_calories: 187 }),
        ],
      }),
      // No branded candidate names Chipotle, so the upgrade guard declines (as it did live).
      instant: () => ({ common: [], branded: [{ nix_item_id: "bettr", brand_name: "Bettr Bowl", food_name: "Chipotle Chicken Bowl" }] }),
    });
    const r = await nutritionLookup.analyzeNaturalTextDetailed(uniq("a chipotle chicken bowl"));
    expect(r).not.toBeNull();
    expect(r!.items).toHaveLength(2);
    for (const it of r!.items) {
      expect(it.matchQuality).toBe("loose");
      expect(it.looseReason).toBe("container_kcal");
      expect(it.containerWord).toBe("bowl");
      expect(it.matchedFrom).toEqual(["chipotle", "chicken"]);
      expect(it.originalInput).toContain("a chipotle chicken bowl");
    }
  });

  it("a container line with a plausible total is not flagged", async () => {
    mockApi({
      natural: () => ({ foods: [nixFood("chicken burrito", { nf_calories: 920 })] }),
    });
    const r = await nutritionLookup.analyzeNaturalTextDetailed(uniq("chicken burrito"));
    expect(r!.items[0].matchQuality).toBeUndefined();
    expect(r!.items[0].looseReason).toBeUndefined();
  });

  it("a low-calorie non-container line is not flagged", async () => {
    mockApi({ natural: () => ({ foods: [nixFood("eggs", { serving_qty: 2, serving_unit: "large", nf_calories: 143 })] }) });
    const r = await nutritionLookup.analyzeNaturalTextDetailed(uniq("two eggs"));
    expect(r!.items[0].matchQuality).toBeUndefined();
  });
});

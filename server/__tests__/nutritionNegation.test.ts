/**
 * Negation guard (Sept 2026). Live find on staging: "leftover teriyaki bowl
 * from that place no rice" → 1 bowl rice, 411 kcal, nothing flagged. The
 * natural parser ignores negation and the total was plausible enough to pass
 * the container check. Patients managing carbs type "no bun / no rice / no
 * cheese" constantly. Flag only — no automatic removal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nutritionLookup } from "../services/nutritionLookup";
import { negatedTerms, negatedItemWord } from "../services/matchCoverage";

describe("negatedTerms", () => {
  it("extracts the excluded food after common cues", () => {
    expect(negatedTerms("leftover teriyaki bowl from that place no rice")).toEqual(["rice"]);
    expect(negatedTerms("burger no bun")).toEqual(["bun"]);
    expect(negatedTerms("side salad without dressing")).toEqual(["dressing"]);
    expect(negatedTerms("latte w/o sugar")).toEqual(["sugar"]);
    expect(negatedTerms("tacos, hold the cheese")).toEqual(["cheese"]);
    expect(negatedTerms("burrito bowl skip the sour cream")).toEqual(["sour", "cream"]);
    expect(negatedTerms("without the brown rice")).toEqual(["brown", "rice"]);
  });

  it("ignores negation that stops at a connector, and text with no negation", () => {
    expect(negatedTerms("eggs no and toast")).toEqual([]);
    expect(negatedTerms("in n out double double")).toEqual([]);
    expect(negatedTerms("chicken and rice")).toEqual([]);
  });
});

describe("negatedItemWord — canonical name, not a mention", () => {
  it("flags an item that IS the negated food", () => {
    expect(negatedItemWord("rice", ["rice"])).toBe("rice");
    expect(negatedItemWord("brown rice", ["rice"])).toBe("rice");
    expect(negatedItemWord("bun", ["bun"])).toBe("bun");
  });

  it("does not flag a dish that merely contains the word", () => {
    // Nutritionix's canonical item for the In-N-Out upgrade is the burger,
    // so a suffix like "(Bun Replaced with Lettuce)" is never consulted.
    expect(negatedItemWord("double-double", ["bun"])).toBeNull();
    expect(negatedItemWord("chicken fried rice", ["egg"])).toBeNull();
  });
});

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

const realFetch = global.fetch;
function mockNatural(foodsFor: (q: string) => any[]) {
  global.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const json = (p: any) => new Response(JSON.stringify(p), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/v2/search/instant")) return json({ branded: [], common: [] });
    if (u.includes("/v2/search/item")) return json({ foods: [] });
    return json({ foods: foodsFor(JSON.parse(init.body).query) });
  }) as any;
}
const uniq = (s: string) => `${s} #${Math.random().toString().slice(2, 8)}`;

describe("analyzeNaturalTextDetailed negation pass", () => {
  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("REGRESSION (live find): 'teriyaki bowl no rice' flags the rice, not the teriyaki", async () => {
    mockNatural(() => [
      nixFood("teriyaki sauce", { serving_unit: "tbsp", nf_calories: 16 }),
      nixFood("rice", { serving_unit: "bowl", nf_calories: 411 }),
    ]);
    const r = await nutritionLookup.analyzeNaturalTextDetailed(uniq("leftover teriyaki bowl from that place no rice"));
    expect(r).not.toBeNull();
    const rice = r!.items.find((i) => i.name === "rice")!;
    const teriyaki = r!.items.find((i) => i.name === "teriyaki sauce")!;
    expect(rice.matchQuality).toBe("loose");
    expect(rice.looseReason).toBe("negated_item");
    expect(rice.negatedWord).toBe("rice");
    expect(rice.calories).toBe(411); // flag only — never removed
    expect(teriyaki.matchQuality).toBeUndefined();
  });

  it("'burger no bun' flags the bun", async () => {
    mockNatural(() => [nixFood("hamburger", { nf_calories: 350 }), nixFood("bun", { nf_calories: 140 })]);
    const r = await nutritionLookup.analyzeNaturalTextDetailed(uniq("burger no bun"));
    expect(r!.items.find((i) => i.name === "bun")!.looseReason).toBe("negated_item");
    expect(r!.items.find((i) => i.name === "hamburger")!.matchQuality).toBeUndefined();
  });

  it("nothing flagged when the excluded food was not logged", async () => {
    mockNatural(() => [nixFood("chicken burrito", { nf_calories: 920 })]);
    const r = await nutritionLookup.analyzeNaturalTextDetailed(uniq("chicken burrito no cheese"));
    expect(r!.items[0].matchQuality).toBeUndefined();
  });
});

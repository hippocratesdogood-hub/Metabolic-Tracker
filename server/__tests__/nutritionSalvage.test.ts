/**
 * Partial-salvage detection (food-analysis follow-ups, Aug 2026)
 *
 * The failure shape: Nutritionix's natural parser salvages one known word
 * from a phrase it didn't understand and returns it as a verified food —
 * "zzqx flurbganitz wafer" → "wafer", "in n out double double no bun" → a
 * 140-kcal "bun" — with no signal in the response that most of the phrase
 * was lost. Detection is token coverage; recovery order is: branded
 * upgrade first (the phrase is often a real product), loose-match label
 * only for what's left.
 *
 * The three live-battery regression cases (In-N-Out + the two planted
 * controls) are pinned here with the real API shapes observed Aug 17 2026.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nutritionLookup } from "../services/nutritionLookup";
import { contentTokens, coverageFor, LOOSE_MATCH_THRESHOLD } from "../services/matchCoverage";

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

describe("matchCoverage primitives", () => {
  it("substring matching absorbs typos, shorthand, and stem variants", () => {
    expect(coverageFor("2 tablespoons mayo", ["mayonnaise"]).coverage).toBe(1);
    expect(coverageFor("2 eggss", ["eggs"]).coverage).toBe(1);
    expect(coverageFor("chickenbreast", ["chicken breast"]).coverage).toBe(1);
  });

  it("drops quantities, units, connectors, dictation filler, and cooking descriptors", () => {
    expect(contentTokens("um I had 2 large slices of homemade sourdough this morning")).toEqual(["sourdough"]);
    expect(contentTokens("1/2 c rice w chicken")).toEqual(["rice", "chicken"]);
  });

  it("scores the wafer control at 1/3", () => {
    const { coverage, unmatched } = coverageFor("zzqx flurbganitz wafer", ["wafer"]);
    expect(coverage).toBeCloseTo(1 / 3, 5);
    expect(unmatched).toEqual(["zzqx", "flurbganitz"]);
    expect(coverage).toBeLessThan(LOOSE_MATCH_THRESHOLD);
  });
});

describe("analyzeNaturalTextDetailed partial-salvage pass", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  type Fixture = {
    natural: (body: any) => any;
    instant?: (url: string) => any;
    item?: (url: string) => any;
  };

  function mockApi(fx: Fixture) {
    global.fetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      const json = (payload: any) =>
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.includes("/v2/search/instant")) return json(fx.instant ? fx.instant(u) : { branded: [] });
      if (u.includes("/v2/search/item")) return json(fx.item ? fx.item(u) : { foods: [] });
      return json(fx.natural(JSON.parse(init.body)));
    }) as any;
  }

  it("REGRESSION (planted control): the salvaged wafer is labeled a loose match", async () => {
    mockApi({ natural: () => ({ foods: [nixFood("wafer", { serving_qty: 8, serving_unit: "wafers" })] }) });

    const result = await nutritionLookup.analyzeNaturalTextDetailed(
      `zzqx flurbganitz wafer #${Math.random()}`.replace(/0\./, ""),
    );
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].matchQuality).toBe("loose");
    expect(result!.items[0].matchedFrom).toEqual(["wafer"]);
    expect(result!.unresolved).toEqual([]);
  });

  it("REGRESSION (live find): 'in n out double double no bun' upgrades to the real In-N-Out item, not a loose bun", async () => {
    mockApi({
      natural: () => ({ foods: [nixFood("bun", { nf_calories: 140 })] }),
      instant: () => ({
        branded: [
          {
            nix_item_id: "innout-dd",
            brand_name: "In-N-Out Burger",
            food_name: "Double-Double, Protein Style (Bun Replaced with Lettuce)",
          },
        ],
      }),
      item: () => ({
        foods: [
          nixFood("Double-Double, Protein Style (Bun Replaced with Lettuce)", {
            brand_name: "In-N-Out Burger",
            serving_unit: "burger",
            serving_weight_grams: 265,
            nf_calories: 520,
            nf_protein: 33,
            nf_total_fat: 39,
            nf_total_carbohydrate: 11,
            tags: null,
          }),
        ],
      }),
    });

    const result = await nutritionLookup.analyzeNaturalTextDetailed(`in n out double double no bun +${Math.random()}`);
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    const item = result!.items[0];
    expect(item.brand).toBe("In-N-Out Burger");
    expect(item.calories).toBe(520);
    expect(item.matchQuality).toBeUndefined();
    expect(item.source).toBe("verified");
  });

  it("REGRESSION (planted control): a one-word brand overlap is NOT enough to upgrade — Maverik gummies stay a loose match", async () => {
    mockApi({
      natural: () => ({ foods: [nixFood("gummies")] }),
      instant: () => ({
        branded: [
          // brand overlaps 'fuel' but the product name covers only half the line
          { nix_item_id: "maverik-1", brand_name: "Maverik Adventure Fuel", food_name: "Grizzly Gummies" },
        ],
      }),
    });

    const result = await nutritionLookup.analyzeNaturalTextDetailed(`morning fuel stack gummies +${Math.random()}`);
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].matchQuality).toBe("loose");
    expect(result!.items[0].matchedFrom).toEqual(["gummies"]);
  });

  it("upgrades 'quest protein bar' (generic match, cov 0.5) to the real Quest product with no flag", async () => {
    mockApi({
      natural: () => ({ foods: [nixFood("protein bar")] }),
      instant: () => ({
        branded: [{ nix_item_id: "quest-1", brand_name: "Quest", food_name: "Protein Bar, S'mores" }],
      }),
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

    const result = await nutritionLookup.analyzeNaturalTextDetailed(`quest protein bar +${Math.random()}`);
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].brand).toBe("Quest");
    expect(result!.items[0].protein).toBe(21);
    expect(result!.items[0].matchQuality).toBeUndefined();
  });

  it("full-coverage ordinary lines are untouched: no upgrade call, no flag", async () => {
    const fetchSpy = vi.fn();
    mockApi({
      natural: () => ({
        foods: [nixFood("eggs"), nixFood("bacon")],
      }),
      instant: () => {
        fetchSpy();
        return { branded: [] };
      },
    });

    const result = await nutritionLookup.analyzeNaturalTextDetailed(`2 eggs and bacon +${Math.random()}`);
    expect(result!.items).toHaveLength(2);
    expect(result!.items.every((i) => i.matchQuality === undefined)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("multi-line meals attribute coverage per line via original_input", async () => {
    mockApi({
      natural: (body) => {
        if (body.line_delimited) {
          return {
            foods: [
              nixFood("can tuna", { metadata: { original_input: "1 can tuna" } }),
              nixFood("wafer", { metadata: { original_input: "zzqx flurbganitz wafer" } }),
            ],
          };
        }
        return { foods: [] };
      },
    });

    const result = await nutritionLookup.analyzeNaturalTextDetailed(
      `1 can tuna, zzqx flurbganitz wafer +${Math.random()}`,
    );
    expect(result!.items).toHaveLength(2);
    const tuna = result!.items.find((i) => i.name === "can tuna")!;
    const wafer = result!.items.find((i) => i.name === "wafer")!;
    expect(tuna.matchQuality).toBeUndefined();
    expect(wafer.matchQuality).toBe("loose");
  });
});

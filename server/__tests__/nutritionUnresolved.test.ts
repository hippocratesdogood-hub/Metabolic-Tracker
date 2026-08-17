/**
 * Unresolved-phrase detection (food-analysis fixes, Aug 2026 — Commit 3 / Fix 2)
 *
 * The motivating bug: "1 can tuna, 2 tablespoons mayo, 1 RxBar" silently
 * lost the RxBar — Nutritionix's natural endpoint omits phrases it can't
 * parse, and nothing in our code noticed. analyzeNaturalTextDetailed uses
 * line_delimited mode so the API itself reports per-line failures:
 *   err_code 101 → no foods on the line → unresolved
 *   err_code 100 → multiple foods on one line → re-sent plain and merged
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nutritionLookup } from "../services/nutritionLookup";

const nixFood = (name: string, overrides: Record<string, any> = {}) => ({
  food_name: name,
  serving_qty: 1,
  serving_unit: "serving",
  serving_weight_grams: 100,
  nf_calories: 100,
  nf_protein: 10,
  nf_total_fat: 5,
  nf_total_carbohydrate: 8,
  nf_dietary_fiber: 2,
  brand_name: null,
  ...overrides,
});

describe("analyzeNaturalTextDetailed unresolved reporting", () => {
  const realFetch = global.fetch;
  let calls: Array<{ body: any }>;

  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
    calls = [];
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(handler: (body: any) => { status?: number; json?: any }) {
    global.fetch = vi.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ body });
      const { status = 200, json = {} } = handler(body);
      return new Response(JSON.stringify(json), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;
  }

  it("reports err_code 101 lines as unresolved (the RxBar case)", async () => {
    mockFetch((body) => {
      expect(body.line_delimited).toBe(true);
      return {
        json: {
          foods: [
            nixFood("can tuna", { serving_unit: "can", serving_weight_grams: 172 }),
            nixFood("mayo", { serving_unit: "tablespoons", serving_qty: 2 }),
          ],
          errors: [
            { original_text: "1 RxBar", warning: "no foods detected", err_code: 101 },
          ],
        },
      };
    });

    const result = await nutritionLookup.analyzeNaturalTextDetailed(
      `1 can tuna, 2 tablespoons mayo, 1 RxBar [${Date.now()}]`,
    );
    expect(result).not.toBeNull();
    expect(result!.items.map((i) => i.name)).toEqual(["can tuna", "mayo"]);
    expect(result!.unresolved).toEqual(["1 RxBar"]);
  });

  it("re-sends err_code 100 (multi-food) lines as a plain query and merges", async () => {
    mockFetch((body) => {
      if (body.line_delimited) {
        return {
          json: {
            foods: [nixFood("apple")],
            errors: [
              { original_text: "tuna and rice", warning: "multiple foods", err_code: 100 },
            ],
          },
        };
      }
      // The plain re-send of the multi-food line
      expect(body.query).toBe("tuna and rice");
      return { json: { foods: [nixFood("tuna"), nixFood("rice")] } };
    });

    const result = await nutritionLookup.analyzeNaturalTextDetailed(
      `tuna and rice, 1 apple [${Date.now()}]`,
    );
    expect(result).not.toBeNull();
    expect(result!.items.map((i) => i.name).sort()).toEqual(["apple", "rice", "tuna"]);
    expect(result!.unresolved).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[1].body.line_delimited).toBeUndefined();
  });

  it("marks an err_code 100 line unresolved when the plain re-send also finds nothing", async () => {
    mockFetch((body) =>
      body.line_delimited
        ? {
            json: {
              foods: [],
              errors: [{ original_text: "mystery combo", err_code: 100 }],
            },
          }
        : { json: { foods: [] } },
    );

    const result = await nutritionLookup.analyzeNaturalTextDetailed(
      `mystery combo, [${Date.now()}]`,
    );
    expect(result!.unresolved).toEqual(["mystery combo"]);
  });

  it("single-line input with no foods is unresolved without line_delimited", async () => {
    mockFetch((body) => {
      expect(body.line_delimited).toBeUndefined();
      return { json: { foods: [] } };
    });

    const query = `1 UnknownBrandBar [${Date.now()}]`;
    const result = await nutritionLookup.analyzeNaturalTextDetailed(query);
    expect(result!.items).toEqual([]);
    expect(result!.unresolved).toEqual([query]);
  });

  it("surfaces every line as unresolved on a hard request failure instead of returning null", async () => {
    mockFetch(() => ({ status: 500 }));

    const result = await nutritionLookup.analyzeNaturalTextDetailed(
      `first item [${Date.now()}], second item`,
    );
    expect(result).not.toBeNull();
    expect(result!.items).toEqual([]);
    expect(result!.unresolved).toHaveLength(2);
  });

  it("analyzeNaturalText wrapper keeps its legacy items-or-null shape", async () => {
    mockFetch((body) =>
      body.line_delimited
        ? { json: { foods: [nixFood("egg")], errors: [{ original_text: "gone", err_code: 101 }] } }
        : { json: { foods: [] } },
    );

    const items = await nutritionLookup.analyzeNaturalText(`egg, gone [${Date.now()}]`);
    expect(items).not.toBeNull();
    expect(items!.map((i) => i.name)).toEqual(["egg"]);

    const none = await nutritionLookup.analyzeNaturalText(`nothing-here-${Date.now()}`);
    expect(none).toBeNull();
  });
});

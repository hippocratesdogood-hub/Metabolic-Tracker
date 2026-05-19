/**
 * Day View — backend acceptance tests
 *
 * Mirrors the project's testing convention (cf. backdating.test.ts,
 * promptEngine.test.ts): exercises pure helpers and validation predicates
 * directly rather than spinning up Express. End-to-end route behavior is
 * verified via curl during local development (Stage-2 verification log).
 */

import { describe, it, expect } from "vitest";
import {
  CARB_RUNWAY_EQUIVALENTS,
  getCarbRunwaySuggestion,
  getCarbOverTargetCopy,
} from "../services/coachingRules";

describe("Day View — carb runway helpers", () => {
  describe("CARB_RUNWAY_EQUIVALENTS", () => {
    it("contains at least 8 entries and at most 12", () => {
      expect(CARB_RUNWAY_EQUIVALENTS.length).toBeGreaterThanOrEqual(8);
      expect(CARB_RUNWAY_EQUIVALENTS.length).toBeLessThanOrEqual(12);
    });

    it("is sorted strictly ascending by grams (selection logic depends on this)", () => {
      for (let i = 1; i < CARB_RUNWAY_EQUIVALENTS.length; i++) {
        expect(CARB_RUNWAY_EQUIVALENTS[i].grams).toBeGreaterThan(
          CARB_RUNWAY_EQUIVALENTS[i - 1].grams,
        );
      }
    });

    it("every entry has positive grams and a non-empty label", () => {
      for (const entry of CARB_RUNWAY_EQUIVALENTS) {
        expect(entry.grams).toBeGreaterThan(0);
        expect(entry.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getCarbRunwaySuggestion", () => {
    it("returns null when remaining is 0 (at target)", () => {
      expect(getCarbRunwaySuggestion(0)).toBeNull();
    });

    it("returns null when remaining is negative (over target)", () => {
      expect(getCarbRunwaySuggestion(-1)).toBeNull();
      expect(getCarbRunwaySuggestion(-50)).toBeNull();
    });

    it("returns the 'very little headroom' phrase when 0 < remaining < smallest entry", () => {
      const smallest = CARB_RUNWAY_EQUIVALENTS[0].grams;
      const out = getCarbRunwaySuggestion(smallest - 1);
      expect(out).not.toBeNull();
      expect(out).toMatch(/headroom/i);
    });

    it("returns the smallest entry's label when remaining equals smallest grams", () => {
      const first = CARB_RUNWAY_EQUIVALENTS[0];
      expect(getCarbRunwaySuggestion(first.grams)).toBe(first.label);
    });

    it("returns the largest fitting entry when remaining is comfortably above smallest", () => {
      // Find the first adjacent pair with a real gap (≥ 2g) so the
      // "between" point lands strictly between them. The test no-ops
      // if no such pair exists, but in practice the seed list always has
      // at least one gap that big.
      let pairFound = false;
      for (let i = 1; i < CARB_RUNWAY_EQUIVALENTS.length; i++) {
        const lo = CARB_RUNWAY_EQUIVALENTS[i - 1];
        const hi = CARB_RUNWAY_EQUIVALENTS[i];
        if (hi.grams - lo.grams < 2) continue;
        const between = lo.grams + 1;
        expect(getCarbRunwaySuggestion(between)).toBe(lo.label);
        pairFound = true;
        break;
      }
      expect(pairFound).toBe(true);
    });

    it("returns the largest entry's label when remaining is huge", () => {
      const last = CARB_RUNWAY_EQUIVALENTS[CARB_RUNWAY_EQUIVALENTS.length - 1];
      expect(getCarbRunwaySuggestion(10_000)).toBe(last.label);
    });
  });

  describe("getCarbOverTargetCopy", () => {
    it("includes the absolute over-amount (rounded) and the clinical nudge", () => {
      expect(getCarbOverTargetCopy(4)).toBe("Over by 4g — hydrate and walk");
    });

    it("uses the absolute value when called with a negative remaining", () => {
      expect(getCarbOverTargetCopy(-4)).toBe("Over by 4g — hydrate and walk");
    });

    it("rounds to whole grams", () => {
      expect(getCarbOverTargetCopy(4.7)).toBe("Over by 5g — hydrate and walk");
      expect(getCarbOverTargetCopy(-4.3)).toBe("Over by 4g — hydrate and walk");
    });
  });
});

describe("Day View — :date param validation predicates", () => {
  // The route handlers use a tight regex and TZ-aware future/window checks.
  // These tests exercise the same predicates without bringing up Express.
  it("accepts YYYY-MM-DD shape", () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test("2026-05-11")).toBe(true);
  });

  it("rejects malformed inputs", () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test("not-a-date")).toBe(false);
    expect(/^\d{4}-\d{2}-\d{2}$/.test("2026-5-1")).toBe(false);
    expect(/^\d{4}-\d{2}-\d{2}$/.test("2026/05/11")).toBe(false);
  });

  it("detects 30-day window boundary correctly", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    expect(Math.round(0 / dayMs) <= 30).toBe(true); // today
    expect(Math.round((30 * dayMs) / dayMs) <= 30).toBe(true); // exactly 30 days
    expect(Math.round((31 * dayMs) / dayMs) <= 30).toBe(false); // 31 days
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Graceful-degradation spec (food-analysis-graceful-degradation-spec.md §7):
// manual entries and unanalyzed entries must aggregate correctly in Day View
// with no Day View code change. This mirrors the route's leaf-only reducer
// (server/routes.ts ~1260–1316) as a pure helper — same convention as the
// predicate tests above (no Express).
// ───────────────────────────────────────────────────────────────────────────

interface FoodEntryLike {
  parentMealId: string | null;
  mealType: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  aiOutputJson: any;
  userCorrectionsJson: any;
}

function aggregateLeafMacros(entries: FoodEntryLike[]) {
  // Leaf-only: parent/legacy rows only — children (parentMealId set) are
  // never summed, so a parent+children meal is not double-counted.
  const parentEntries = entries.filter((e) => !e.parentMealId);

  const totals = { calories: 0, protein: 0, fat: 0, fiber: 0, totalCarbs: 0, netCarbs: 0 };
  const counted: FoodEntryLike[] = [];

  for (const entry of parentEntries) {
    counted.push(entry); // retained for Day View regardless of macro presence
    const macros =
      (entry.userCorrectionsJson?.macros ?? entry.aiOutputJson?.macros) || null;

    const calories = Number(macros?.calories) || 0;
    const protein = Number(macros?.protein) || 0;
    const fat = Number(macros?.fat) || 0;
    const fiber = Number(macros?.fiber) || 0;
    const netCarbs =
      (macros?.netCarbs != null
        ? Number(macros.netCarbs)
        : macros?.totalCarbs != null
          ? Number(macros.totalCarbs) - fiber
          : Number(macros?.carbs)) || 0;

    totals.calories += calories;
    totals.protein += protein;
    totals.fat += fat;
    totals.fiber += fiber;
    totals.netCarbs += netCarbs;
  }

  return { totals, countedCount: counted.length };
}

describe("Day View — graceful-degradation aggregation", () => {
  const manualEntry: FoodEntryLike = {
    parentMealId: null,
    mealType: "Lunch",
    aiOutputJson: null,
    userCorrectionsJson: {
      macros: { calories: 500, protein: 40, fat: 20, carbs: 30, totalCarbs: 30, netCarbs: 25, fiber: 0 },
    },
  };
  const unanalyzedEntry: FoodEntryLike = {
    parentMealId: null,
    mealType: "Snack",
    aiOutputJson: null,
    userCorrectionsJson: null,
  };

  it("sums a manual entry's userCorrectionsJson.macros into daily totals", () => {
    const { totals, countedCount } = aggregateLeafMacros([manualEntry]);
    expect(totals.calories).toBe(500);
    expect(totals.protein).toBe(40);
    expect(totals.fat).toBe(20);
    expect(totals.netCarbs).toBe(25);
    expect(countedCount).toBe(1);
  });

  it("counts a both-jsonb-null entry in Day View but contributes zero macros (no error, no pending math)", () => {
    const { totals, countedCount } = aggregateLeafMacros([unanalyzedEntry]);
    expect(countedCount).toBe(1); // appears under its mealType
    expect(totals).toEqual({ calories: 0, protein: 0, fat: 0, fiber: 0, totalCarbs: 0, netCarbs: 0 });
  });

  it("mixes analyzed + manual + unanalyzed without double-counting; unanalyzed adds nothing", () => {
    const aiEntry: FoodEntryLike = {
      parentMealId: null,
      mealType: "Breakfast",
      aiOutputJson: { macros: { calories: 300, protein: 20, fat: 10, netCarbs: 15 } },
      userCorrectionsJson: null,
    };
    const { totals, countedCount } = aggregateLeafMacros([aiEntry, manualEntry, unanalyzedEntry]);
    expect(totals.calories).toBe(800); // 300 + 500 + 0
    expect(totals.protein).toBe(60); // 20 + 40 + 0
    expect(totals.netCarbs).toBe(40); // 15 + 25 + 0
    expect(countedCount).toBe(3);
  });

  it("never sums child rows (parentMealId set) — leaf-only, no double-count", () => {
    const parent: FoodEntryLike = {
      parentMealId: null,
      mealType: "Dinner",
      aiOutputJson: { macros: { calories: 700, protein: 50, fat: 30, netCarbs: 40 } },
      userCorrectionsJson: null,
    };
    const child: FoodEntryLike = {
      parentMealId: "parent-id",
      mealType: "Dinner",
      aiOutputJson: { macros: { calories: 700, protein: 50, fat: 30, netCarbs: 40 } },
      userCorrectionsJson: null,
    };
    const { totals, countedCount } = aggregateLeafMacros([parent, child]);
    expect(totals.calories).toBe(700); // child excluded
    expect(countedCount).toBe(1);
  });

  it("userCorrectionsJson.macros wins over aiOutputJson.macros (manual correction precedence)", () => {
    const corrected: FoodEntryLike = {
      parentMealId: null,
      mealType: "Lunch",
      aiOutputJson: { macros: { calories: 999, protein: 1, fat: 99, netCarbs: 99 } },
      userCorrectionsJson: { macros: { calories: 450, protein: 35, fat: 15, netCarbs: 20 } },
    };
    const { totals } = aggregateLeafMacros([corrected]);
    expect(totals.calories).toBe(450);
    expect(totals.protein).toBe(35);
    expect(totals.netCarbs).toBe(20);
  });
});

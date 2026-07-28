import { describe, it, expect } from "vitest";
import {
  calculateMacroTargets,
  evaluateFlags,
  validateInputs,
  FLAG_CODES,
  type MacroCalcInput,
} from "../services/macroCalculator";

const WOMAN_SPEC_EXAMPLE: MacroCalcInput = {
  // Spec §4 worked example: 52-year-old woman, 5'6", 210 lb, waist 42",
  // neck 14", hip 46", lightly active
  sex: "female",
  heightIn: 66,
  weightLb: 210,
  waistIn: 42,
  neckIn: 14,
  hipIn: 46,
  activityLevel: "light",
};

describe("macroCalculator — worked examples", () => {
  it("reproduces the spec §4 worked example (women)", () => {
    const result = calculateMacroTargets(WOMAN_SPEC_EXAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bodyFatPct).toBeCloseTo(48.9, 1);
    expect(result.lbmLb).toBeCloseTo(107.2, 1);
    expect(result.targets.proteinG).toBe(130);
    expect(result.targets.netCarbsG).toBe(60);
    expect(result.targets.fatG).toBe(120);
    // Calories are restated from the rounded macros so the four numbers the
    // member sees reconcile exactly: 130×4 + 60×4 + 120×9 = 1840
    expect(result.targets.calories).toBe(1840);
    expect(result.flags).toEqual([]);
  });

  it("second women's worked example: 5'4\", 165 lb, waist 34, neck 13, hip 42, sedentary", () => {
    // Hand-derived: BF% = 163.205·log10(63) − 97.684·log10(64) − 78.387 = 38.8
    // LBM = 165 × 0.6116 = 100.9 lb → 45.77 kg; BMR = 1358.7; TDEE ×1.2 = 1630.5
    // raw cal = 1548.9; protein 121.1 → 120; fat (1548.9−484.4−240)/9 = 91.6 → 90
    // calories restated = 480 + 240 + 810 = 1530
    const result = calculateMacroTargets({
      sex: "female",
      heightIn: 64,
      weightLb: 165,
      waistIn: 34,
      neckIn: 13,
      hipIn: 42,
      activityLevel: "sedentary",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bodyFatPct).toBeCloseTo(38.8, 1);
    expect(result.targets.proteinG).toBe(120);
    expect(result.targets.netCarbsG).toBe(60);
    expect(result.targets.fatG).toBe(90);
    expect(result.targets.calories).toBe(1530);
    expect(result.flags).toEqual([]);
  });

  it("men's worked example: 5'9\", 190 lb, waist 38, neck 15.5, lightly active", () => {
    // Hand-derived: BF% = 86.010·log10(22.5) − 70.041·log10(69) + 36.76 = 24.3
    // LBM = 190 × 0.7573 = 143.9 lb → 65.27 kg; BMR = 1779.8; TDEE ×1.375 = 2447.2
    // raw cal = 2324.9; protein 172.7 → 175; fat (2324.9−690.7−240)/9 = 154.9 → 155
    // calories restated = 700 + 240 + 1395 = 2335
    const result = calculateMacroTargets({
      sex: "male",
      heightIn: 69,
      weightLb: 190,
      waistIn: 38,
      neckIn: 15.5,
      activityLevel: "light",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bodyFatPct).toBeCloseTo(24.3, 1);
    expect(result.lbmLb).toBeCloseTo(143.9, 1);
    expect(result.targets.proteinG).toBe(175);
    expect(result.targets.netCarbsG).toBe(60);
    expect(result.targets.fatG).toBe(155);
    expect(result.targets.calories).toBe(2335);
    expect(result.flags).toEqual([]);
  });

  it("calories always equal the sum of the rounded macros", () => {
    const samples: MacroCalcInput[] = [
      WOMAN_SPEC_EXAMPLE,
      { sex: "male", heightIn: 72, weightLb: 250, waistIn: 44, neckIn: 17, activityLevel: "moderate" },
      { sex: "female", heightIn: 62, weightLb: 140, waistIn: 30, neckIn: 12.5, hipIn: 39, activityLevel: "very" },
    ];
    for (const input of samples) {
      const result = calculateMacroTargets(input);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const { proteinG, netCarbsG, fatG, calories } = result.targets;
      expect(calories).toBe(proteinG * 4 + netCarbsG * 4 + fatG * 9);
    }
  });
});

describe("macroCalculator — blocking guard rails", () => {
  const validMale: MacroCalcInput = {
    sex: "male",
    heightIn: 70,
    weightLb: 200,
    waistIn: 40,
    neckIn: 16,
    activityLevel: "moderate",
  };

  it("blocks men whose waist is not larger than neck, with the spec message", () => {
    for (const neckIn of [40, 42]) {
      const result = calculateMacroTargets({ ...validMale, neckIn });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors.waistIn).toMatch(/waist should be larger than neck/i);
    }
  });

  it("blocks women when waist + hip − neck is not positive", () => {
    const result = calculateMacroTargets({
      sex: "female",
      heightIn: 66,
      weightLb: 150,
      waistIn: 2,
      neckIn: 6,
      hipIn: 3,
      activityLevel: "light",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.waistIn).toMatch(/waist should be larger than neck/i);
  });

  it("blocks zero, negative, and non-numeric measurements with field-level messages", () => {
    const cases: Array<[Partial<MacroCalcInput>, string]> = [
      [{ waistIn: 0 }, "waistIn"],
      [{ neckIn: -2 }, "neckIn"],
      [{ weightLb: NaN }, "weightLb"],
      [{ heightIn: undefined as unknown as number }, "heightIn"],
    ];
    for (const [override, field] of cases) {
      const result = calculateMacroTargets({ ...validMale, ...override });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors[field]).toBeTruthy();
    }
  });

  it("blocks heights outside 48–84 inches (unit-error rail)", () => {
    for (const heightIn of [47, 85, 170]) {
      const result = calculateMacroTargets({ ...validMale, heightIn });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors.heightIn).toBeTruthy();
    }
  });

  it("blocks weights outside 70–700 lb", () => {
    for (const weightLb of [65, 750]) {
      const result = calculateMacroTargets({ ...validMale, weightLb });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.fieldErrors.weightLb).toBeTruthy();
    }
  });

  it("requires hip for women", () => {
    const errors = validateInputs({
      sex: "female",
      heightIn: 64,
      weightLb: 160,
      waistIn: 33,
      neckIn: 13,
      activityLevel: "light",
    });
    expect(errors.hipIn).toBeTruthy();
  });
});

describe("macroCalculator — review flags", () => {
  const targets = { proteinG: 150, netCarbsG: 60, fatG: 100, calories: 1740 };

  it("flags implausibly low body fat (below 3 men / 8 women, exclusive)", () => {
    expect(evaluateFlags("male", 2.9, targets)).toContain(FLAG_CODES.BF_LOW);
    expect(evaluateFlags("male", 3.0, targets)).toEqual([]);
    expect(evaluateFlags("female", 7.9, targets)).toContain(FLAG_CODES.BF_LOW);
    expect(evaluateFlags("female", 8.0, targets)).toEqual([]);
  });

  it("flags implausibly high body fat (above 60 men / 65 women, exclusive)", () => {
    expect(evaluateFlags("male", 60.1, targets)).toContain(FLAG_CODES.BF_HIGH);
    expect(evaluateFlags("male", 60.0, targets)).toEqual([]);
    expect(evaluateFlags("female", 65.1, targets)).toContain(FLAG_CODES.BF_HIGH);
    expect(evaluateFlags("female", 65.0, targets)).toEqual([]);
  });

  it("flags calorie targets below the clinical floor (1400 men / 1200 women)", () => {
    expect(evaluateFlags("male", 25, { ...targets, calories: 1399 })).toContain(FLAG_CODES.CALORIES_LOW);
    expect(evaluateFlags("male", 25, { ...targets, calories: 1400 })).toEqual([]);
    expect(evaluateFlags("female", 35, { ...targets, calories: 1199 })).toContain(FLAG_CODES.CALORIES_LOW);
    expect(evaluateFlags("female", 35, { ...targets, calories: 1200 })).toEqual([]);
  });

  it("flags fat below 40 g and protein above 250 g", () => {
    expect(evaluateFlags("male", 25, { ...targets, fatG: 39 })).toContain(FLAG_CODES.FAT_LOW);
    expect(evaluateFlags("male", 25, { ...targets, fatG: 40 })).toEqual([]);
    expect(evaluateFlags("male", 25, { ...targets, proteinG: 255 })).toContain(FLAG_CODES.PROTEIN_HIGH);
    expect(evaluateFlags("male", 25, { ...targets, proteinG: 250 })).toEqual([]);
  });

  it("a flag-tripping calculation still computes and returns its target", () => {
    // Small sedentary woman: lands under the 1200-calorie floor but must
    // still produce a working target (spec §5: flags never block)
    const result = calculateMacroTargets({
      sex: "female",
      heightIn: 60,
      weightLb: 80,
      waistIn: 24,
      neckIn: 12,
      hipIn: 32,
      activityLevel: "sedentary",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.targets.calories).toBe(1190);
    expect(result.flags).toEqual([FLAG_CODES.CALORIES_LOW]);
  });
});

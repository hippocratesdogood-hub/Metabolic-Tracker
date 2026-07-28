/**
 * Macro target calculator (macro-calculator-spec.md).
 *
 * Pure functions — no DB, no I/O. All inputs are imperial (inches / pounds);
 * unit conversion happens at the route boundary via shared/units.ts.
 *
 * Pipeline: Navy circumference body fat → lean body mass → Katch-McArdle BMR
 * → activity-multiplied TDEE → 5% deficit → protein from LBM, fixed net carbs,
 * fat as the remainder.
 */

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very";

export interface MacroCalcInput {
  sex: Sex;
  heightIn: number;
  weightLb: number;
  waistIn: number;
  neckIn: number;
  hipIn?: number; // required for female
  activityLevel: ActivityLevel;
}

export interface MacroCalcTargets {
  proteinG: number;
  netCarbsG: number;
  fatG: number;
  calories: number;
}

export type MacroCalcResult =
  | { ok: false; fieldErrors: Record<string, string> }
  | {
      ok: true;
      bodyFatPct: number;
      lbmLb: number;
      targets: MacroCalcTargets;
      flags: string[];
    };

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

const NET_CARBS_G = 60; // fixed for every member; with the 14h overnight fast this lands in mild ketosis territory

// GLP-1 members are already eating well below maintenance involuntarily
// because the medication suppressed appetite. A prescribed deficit stacks on
// top of a pharmacological one, and aggressive deficits drive the lean mass
// loss this program exists to prevent. 5% is a nudge, not a restriction.
const DEFICIT_MULTIPLIER = 0.95;

const PROTEIN_PER_LB_LBM = 1.2;

const LB_PER_KG = 2.20462;

// Flag codes stored in macro_calculations.flags. Human-readable labels live
// client-side in the review queue.
export const FLAG_CODES = {
  BF_LOW: "bf_low",
  BF_HIGH: "bf_high",
  CALORIES_LOW: "calories_low",
  FAT_LOW: "fat_low",
  PROTEIN_HIGH: "protein_high",
} as const;

const MEASUREMENT_MISMATCH_MSG =
  "Those measurements don't look right — waist should be larger than neck. Check both and try again.";

function roundTo5(value: number): number {
  return Math.round(value / 5) * 5;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Blocking guard rails (spec §5). Returns field-level messages; an empty
 * object means the calculation may proceed.
 */
export function validateInputs(input: MacroCalcInput): Record<string, string> {
  const errors: Record<string, string> = {};

  const positives: Array<[keyof MacroCalcInput, string]> = [
    ["heightIn", "Height must be a positive number."],
    ["weightLb", "Weight must be a positive number."],
    ["waistIn", "Waist must be a positive number."],
    ["neckIn", "Neck must be a positive number."],
  ];
  for (const [field, message] of positives) {
    if (!isPositiveFinite(input[field])) errors[field] = message;
  }

  if (input.sex === "female" && !isPositiveFinite(input.hipIn)) {
    errors.hipIn = "Hip measurement is required and must be a positive number.";
  }

  // Range rails — almost always unit errors
  if (!errors.heightIn && (input.heightIn < 48 || input.heightIn > 84)) {
    errors.heightIn = "Height should be between 48 and 84 inches — double-check the units.";
  }
  if (!errors.weightLb && (input.weightLb < 70 || input.weightLb > 700)) {
    errors.weightLb = "Weight should be between 70 and 700 pounds — double-check the units.";
  }

  // Circumference sanity — the Navy equation's log10 argument must be positive
  if (!errors.waistIn && !errors.neckIn) {
    if (input.sex === "male" && input.waistIn - input.neckIn <= 0) {
      errors.waistIn = MEASUREMENT_MISMATCH_MSG;
    }
    if (
      input.sex === "female" &&
      isPositiveFinite(input.hipIn) &&
      input.waistIn + input.hipIn - input.neckIn <= 0
    ) {
      errors.waistIn = MEASUREMENT_MISMATCH_MSG;
    }
  }

  return errors;
}

/**
 * Review flags (spec §5). Evaluated against the values as stored/shown —
 * a flagged target still saves and still works; it just surfaces at the top
 * of the review queue. The member is never shown these.
 */
export function evaluateFlags(
  sex: Sex,
  bodyFatPct: number,
  targets: MacroCalcTargets,
): string[] {
  const flags: string[] = [];
  const bfFloor = sex === "male" ? 3 : 8;
  const bfCeiling = sex === "male" ? 60 : 65;
  const calorieFloor = sex === "male" ? 1400 : 1200;

  if (bodyFatPct < bfFloor) flags.push(FLAG_CODES.BF_LOW);
  if (bodyFatPct > bfCeiling) flags.push(FLAG_CODES.BF_HIGH);
  if (targets.calories < calorieFloor) flags.push(FLAG_CODES.CALORIES_LOW);
  if (targets.fatG < 40) flags.push(FLAG_CODES.FAT_LOW);
  if (targets.proteinG > 250) flags.push(FLAG_CODES.PROTEIN_HIGH);

  return flags;
}

export function calculateMacroTargets(input: MacroCalcInput): MacroCalcResult {
  const fieldErrors = validateInputs(input);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  // Step 1 — body fat %, Navy circumference method
  const bodyFatPct =
    input.sex === "male"
      ? 86.010 * Math.log10(input.waistIn - input.neckIn) -
        70.041 * Math.log10(input.heightIn) +
        36.76
      : 163.205 * Math.log10(input.waistIn + input.hipIn! - input.neckIn) -
        97.684 * Math.log10(input.heightIn) -
        78.387;

  // Step 2 — lean body mass
  const lbmLb = input.weightLb * (1 - bodyFatPct / 100);
  const lbmKg = lbmLb / LB_PER_KG;

  // Step 3 — Katch-McArdle BMR (derives from lean mass, which we have; runs
  // lower than Mifflin for anyone carrying meaningful body fat)
  const bmr = 370 + 21.6 * lbmKg;

  // Steps 4–5 — TDEE and the fixed clinical deficit
  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];
  const rawCalories = tdee * DEFICIT_MULTIPLIER;

  // Steps 6–8 — protein from LBM, fixed carbs, fat absorbs the remainder
  const rawProteinG = lbmLb * PROTEIN_PER_LB_LBM;
  const rawFatG = (rawCalories - rawProteinG * 4 - NET_CARBS_G * 4) / 9;

  // Rounding: protein/fat to nearest 5 g (the body-fat estimate doesn't
  // support gram precision), then calories RESTATED from the rounded macros
  // so the four numbers the member sees reconcile exactly, and the stored
  // target matches what was shown.
  const proteinG = roundTo5(rawProteinG);
  const fatG = roundTo5(rawFatG);
  const calories = proteinG * 4 + NET_CARBS_G * 4 + fatG * 9;

  const targets: MacroCalcTargets = { proteinG, netCarbsG: NET_CARBS_G, fatG, calories };

  return {
    ok: true,
    bodyFatPct: Math.round(bodyFatPct * 10) / 10,
    lbmLb: Math.round(lbmLb * 10) / 10,
    targets,
    flags: evaluateFlags(input.sex, bodyFatPct, targets),
  };
}

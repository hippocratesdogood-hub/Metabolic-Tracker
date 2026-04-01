/**
 * Deterministic Meal Quality Score
 *
 * Scores each meal based on the patient's stored macro targets and eating window.
 * Replaces the LLM-generated qualityScore with a consistent, explainable formula.
 *
 * Formula:
 *   Each meal should contribute ~1/3 of daily targets.
 *   proteinScore  = min((protein_g / (target/3)) × 100, 100)
 *   netCarbsScore = max(0, 100 − (net_carbs_g / (target/3)) × 100)  — lower is better
 *   fatScore      = min((fat_g / (target/3)) × 100, 100)
 *   rawScore      = proteinScore × 0.45 + netCarbsScore × 0.40 + fatScore × 0.15
 *
 * Hard ceiling: if net_carbs_g > 30, cap at 40
 * Timing penalty: if outside eating window, subtract 15 (floor 0)
 */

export interface MealScoreInput {
  proteinG: number;
  netCarbsG: number;
  fatG: number;
  eatenAt: Date;   // when the meal was consumed (preferred)
  loggedAt?: Date;  // system timestamp (fallback if eatenAt is null)
}

export interface PatientTargets {
  proteinTargetG: number;
  netCarbTargetG: number;
  fatTargetG: number;
  eatingWindowStart: string; // "HH:MM"
  eatingWindowEnd: string;   // "HH:MM"
  timezone: string;
}

export interface ScoreBreakdown {
  proteinScore: number;
  netCarbsScore: number;
  fatScore: number;
  hardCeilApplied: boolean;
  timingPenaltyApplied: boolean;
  outsideEatingWindow: boolean;
}

export interface MealScoreResult {
  qualityScore: number;
  scoreBreakdown: ScoreBreakdown;
}

/**
 * Parse "HH:MM" string to hours + fractional minutes (e.g., "08:30" → 8.5)
 */
function parseTimeToHours(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

/**
 * Check if a timestamp falls within the eating window in the patient's timezone.
 */
function isWithinEatingWindow(
  loggedAt: Date,
  windowStart: string,
  windowEnd: string,
  timezone: string
): boolean {
  // Get the hour of day in the patient's timezone
  const timeStr = loggedAt.toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const loggedHour = parseTimeToHours(timeStr);
  const startHour = parseTimeToHours(windowStart);
  const endHour = parseTimeToHours(windowEnd);

  // Handle normal window (e.g., 08:00–20:00)
  if (startHour <= endHour) {
    return loggedHour >= startHour && loggedHour <= endHour;
  }
  // Handle overnight window (e.g., 20:00–08:00) — unlikely but defensive
  return loggedHour >= startHour || loggedHour <= endHour;
}

/**
 * Calculate the deterministic meal quality score.
 */
export function calculateMealScore(
  meal: MealScoreInput,
  targets: PatientTargets
): MealScoreResult {
  const perMealProtein = targets.proteinTargetG / 3;
  const perMealCarbs = targets.netCarbTargetG / 3;
  const perMealFat = targets.fatTargetG / 3;

  // Component scores
  const proteinScore = perMealProtein > 0
    ? Math.min((meal.proteinG / perMealProtein) * 100, 100)
    : 0;

  const netCarbsScore = perMealCarbs > 0
    ? Math.max(0, 100 - (meal.netCarbsG / perMealCarbs) * 100)
    : (meal.netCarbsG === 0 ? 100 : 0);

  const fatScore = perMealFat > 0
    ? Math.min((meal.fatG / perMealFat) * 100, 100)
    : 0;

  // Weighted composite
  let rawScore = (proteinScore * 0.45) + (netCarbsScore * 0.40) + (fatScore * 0.15);

  // Hard ceiling: net carbs > 30g caps score at 40
  const hardCeilApplied = meal.netCarbsG > 30;
  if (hardCeilApplied) {
    rawScore = Math.min(rawScore, 40);
  }

  // Timing penalty — use eatenAt (preferred), fall back to loggedAt
  const mealTime = meal.eatenAt || meal.loggedAt || new Date();
  const outsideEatingWindow = !isWithinEatingWindow(
    mealTime,
    targets.eatingWindowStart,
    targets.eatingWindowEnd,
    targets.timezone
  );
  const timingPenaltyApplied = outsideEatingWindow;
  if (timingPenaltyApplied) {
    rawScore = Math.max(0, rawScore - 15);
  }

  return {
    qualityScore: Math.round(rawScore),
    scoreBreakdown: {
      proteinScore: Math.round(proteinScore),
      netCarbsScore: Math.round(netCarbsScore),
      fatScore: Math.round(fatScore),
      hardCeilApplied,
      timingPenaltyApplied,
      outsideEatingWindow,
    },
  };
}

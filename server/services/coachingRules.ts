/**
 * Coaching Rules Evaluator
 *
 * Evaluates patient food log data against clinical coaching rules and returns
 * triggered flags. These flags feed into the AI coaching prompt assembly pipeline
 * as the TRIGGERED RULE FLAGS TODAY section.
 *
 * Design: Pure evaluation — no LLM calls, no side effects. Takes structured data
 * in, returns an array of flag objects out.
 *
 * Constants:
 *   FASTING_HOURS_TARGET = 14 (same for all patients per Dr. Larson's protocol)
 */

// ============================================================================
// Types
// ============================================================================

export interface CoachingContext {
  // Patient profile
  programPhase: "active" | "maintenance";
  glp1Status: boolean;
  activeWeeks: number;

  // Targets (from macro_targets)
  proteinTarget: number;      // grams
  carbsTarget: number;        // grams (daily target)
  netCarbsThreshold: number;  // grams (glucose variability warning threshold)
  targetMealCount: number;

  // Today's data
  today: {
    proteinG: number;
    netCarbsG: number;
    fatG: number;
    calories: number;
    mealCount: number;
    mealTimestamps: Date[];   // timestamps of each meal logged today
  };

  // Recent history (last 7 days, most recent first)
  recentDays: {
    date: string;             // YYYY-MM-DD
    proteinG: number;
    netCarbsG: number;
    mealCount: number;
    firstMealTime: Date | null;
    lastMealTime: Date | null;
  }[];
}

export type FlagSeverity = "info" | "warning" | "alert" | "escalate";

export interface CoachingFlag {
  id: string;
  severity: FlagSeverity;
  category: "protein" | "carbs" | "timing" | "pattern" | "positive";
  message: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

const FASTING_HOURS_TARGET = 14;
const PROTEIN_LOW_THRESHOLD = 0.80;       // under 80% of target
const PROTEIN_PATTERN_DAYS = 2;            // consecutive days low triggers pattern flag
const LATE_EATING_HOUR = 20.5;             // 8:30 PM
const FIRST_MEAL_DELAY_HOURS = 5;          // hours after midnight before first meal is "delayed"
const PROTEIN_STREAK_DAYS = 3;             // consecutive days hitting target = positive flag
const CARB_UNDER_THRESHOLD_STREAK = 5;     // consecutive days under threshold = positive flag

// ============================================================================
// Rule Evaluators
// ============================================================================

function evaluateProteinRules(ctx: CoachingContext): CoachingFlag[] {
  const flags: CoachingFlag[] = [];
  const { today, proteinTarget, recentDays } = ctx;

  if (proteinTarget <= 0 || today.mealCount === 0) return flags;

  const proteinPct = today.proteinG / proteinTarget;
  const deficit = proteinTarget - today.proteinG;

  // RULE: Protein under 80% of target today
  if (proteinPct < PROTEIN_LOW_THRESHOLD) {
    flags.push({
      id: "PROTEIN_UNDER_TARGET",
      severity: "warning",
      category: "protein",
      message: `Protein at ${Math.round(proteinPct * 100)}% of target — add ${Math.round(deficit)}g today`,
      data: { proteinG: today.proteinG, target: proteinTarget, pct: Math.round(proteinPct * 100) },
    });
  }

  // RULE: Protein low 2+ consecutive days (pattern detection)
  const consecutiveLowDays = countConsecutive(recentDays, (d) =>
    d.mealCount > 0 && d.proteinG / proteinTarget < PROTEIN_LOW_THRESHOLD
  );
  if (consecutiveLowDays >= PROTEIN_PATTERN_DAYS) {
    flags.push({
      id: "PROTEIN_LOW_PATTERN",
      severity: "alert",
      category: "pattern",
      message: `Protein under target ${consecutiveLowDays} days in a row — prioritize protein first at next meal`,
      data: { consecutiveDays: consecutiveLowDays },
    });
  }

  // POSITIVE: Protein target met 3+ consecutive days
  const consecutiveMetDays = countConsecutive(recentDays, (d) =>
    d.mealCount > 0 && d.proteinG / proteinTarget >= PROTEIN_LOW_THRESHOLD
  );
  if (consecutiveMetDays >= PROTEIN_STREAK_DAYS) {
    flags.push({
      id: "PROTEIN_STREAK",
      severity: "info",
      category: "positive",
      message: `Protein on target ${consecutiveMetDays} days running`,
      data: { consecutiveDays: consecutiveMetDays },
    });
  }

  return flags;
}

function evaluateCarbRules(ctx: CoachingContext): CoachingFlag[] {
  const flags: CoachingFlag[] = [];
  const { today, netCarbsThreshold, proteinTarget, recentDays } = ctx;

  if (today.mealCount === 0) return flags;

  // RULE: Carbs exceed glucose variability threshold
  if (netCarbsThreshold > 0 && today.netCarbsG > netCarbsThreshold) {
    flags.push({
      id: "CARB_THRESHOLD_EXCEEDED",
      severity: "warning",
      category: "carbs",
      message: `Net carbs (${Math.round(today.netCarbsG)}g) exceeded threshold (${netCarbsThreshold}g) — expect glucose variability`,
      data: { netCarbsG: today.netCarbsG, threshold: netCarbsThreshold },
    });
  }

  // RULE: High carbs + low protein combination
  const proteinPct = proteinTarget > 0 ? today.proteinG / proteinTarget : 1;
  if (netCarbsThreshold > 0 && today.netCarbsG > netCarbsThreshold && proteinPct < PROTEIN_LOW_THRESHOLD) {
    flags.push({
      id: "HIGH_CARB_LOW_PROTEIN",
      severity: "alert",
      category: "carbs",
      message: "High carbs with low protein increases fat storage risk — rebalance next meal",
      data: { netCarbsG: today.netCarbsG, proteinPct: Math.round(proteinPct * 100) },
    });
  }

  // POSITIVE: Carbs under threshold 5+ consecutive days
  if (netCarbsThreshold > 0) {
    const consecutiveUnder = countConsecutive(recentDays, (d) =>
      d.mealCount > 0 && d.netCarbsG <= netCarbsThreshold
    );
    if (consecutiveUnder >= CARB_UNDER_THRESHOLD_STREAK) {
      flags.push({
        id: "CARB_COMPLIANCE_STREAK",
        severity: "info",
        category: "positive",
        message: `Carbs under threshold ${consecutiveUnder} days straight — great discipline`,
        data: { consecutiveDays: consecutiveUnder },
      });
    }
  }

  return flags;
}

function evaluateTimingRules(ctx: CoachingContext): CoachingFlag[] {
  const flags: CoachingFlag[] = [];
  const { today, proteinTarget } = ctx;

  if (today.mealTimestamps.length === 0) return flags;

  const sorted = [...today.mealTimestamps].sort((a, b) => a.getTime() - b.getTime());
  const firstMeal = sorted[0];
  const lastMeal = sorted[sorted.length - 1];

  const firstMealHour = firstMeal.getHours() + firstMeal.getMinutes() / 60;
  const lastMealHour = lastMeal.getHours() + lastMeal.getMinutes() / 60;

  // RULE: Late eating (after 8:30 PM)
  if (lastMealHour >= LATE_EATING_HOUR) {
    flags.push({
      id: "LATE_EATING",
      severity: "warning",
      category: "timing",
      message: "Late eating may impair glucose control and sleep",
      data: { lastMealHour: lastMealHour.toFixed(1) },
    });
  }

  // RULE: First meal delayed + low protein
  // "Delayed" = first meal after the fasting window should have closed
  // If fasting target is 14h and last meal yesterday was at 7pm, eating window opens at 9am
  // Simplified: flag if first meal is after noon and protein is low
  const proteinPct = proteinTarget > 0 ? today.proteinG / proteinTarget : 1;
  if (firstMealHour >= 12 && proteinPct < PROTEIN_LOW_THRESHOLD) {
    flags.push({
      id: "DELAYED_FIRST_MEAL_LOW_PROTEIN",
      severity: "warning",
      category: "timing",
      message: "Delayed first meal with low protein often leads to overeating later",
      data: { firstMealHour: firstMealHour.toFixed(1), proteinPct: Math.round(proteinPct * 100) },
    });
  }

  // RULE: Fasting window check (using yesterday's last meal → today's first meal)
  if (ctx.recentDays.length > 0 && ctx.recentDays[0].lastMealTime) {
    const yesterdayLastMeal = ctx.recentDays[0].lastMealTime;
    const fastingHours = (firstMeal.getTime() - yesterdayLastMeal.getTime()) / (1000 * 60 * 60);

    if (fastingHours < FASTING_HOURS_TARGET && fastingHours > 0) {
      flags.push({
        id: "FASTING_WINDOW_SHORT",
        severity: "warning",
        category: "timing",
        message: `Fasting window was ${fastingHours.toFixed(1)}h (target: ${FASTING_HOURS_TARGET}h)`,
        data: { fastingHours: parseFloat(fastingHours.toFixed(1)), target: FASTING_HOURS_TARGET },
      });
    } else if (fastingHours >= FASTING_HOURS_TARGET) {
      flags.push({
        id: "FASTING_WINDOW_MET",
        severity: "info",
        category: "positive",
        message: `Fasting window met: ${fastingHours.toFixed(1)}h`,
        data: { fastingHours: parseFloat(fastingHours.toFixed(1)) },
      });
    }
  }

  // RULE: Exceeded target meal count (between-meal eating)
  if (ctx.targetMealCount > 0 && today.mealCount > ctx.targetMealCount) {
    flags.push({
      id: "EXCESS_MEALS",
      severity: "warning",
      category: "timing",
      message: `${today.mealCount} meals today (target: ${ctx.targetMealCount}) — avoid between-meal eating`,
      data: { mealCount: today.mealCount, target: ctx.targetMealCount },
    });
  }

  return flags;
}

// ============================================================================
// Escalation Rules
// ============================================================================

function evaluateEscalationRules(flags: CoachingFlag[], ctx: CoachingContext): CoachingFlag[] {
  const escalationFlags: CoachingFlag[] = [];

  // ESCALATE: Carb threshold exceeded 3+ days AND protein pattern
  const hasProteinPattern = flags.some(f => f.id === "PROTEIN_LOW_PATTERN");
  const hasCarbExcess = flags.some(f => f.id === "CARB_THRESHOLD_EXCEEDED");

  if (hasProteinPattern && hasCarbExcess) {
    const consecutiveHighCarb = countConsecutive(ctx.recentDays, (d) =>
      ctx.netCarbsThreshold > 0 && d.mealCount > 0 && d.netCarbsG > ctx.netCarbsThreshold
    );
    if (consecutiveHighCarb >= 3) {
      escalationFlags.push({
        id: "ESCALATE_TO_PHYSICIAN_REVIEW",
        severity: "escalate",
        category: "pattern",
        message: "Sustained high carbs with low protein — Dr. Larson may want to review this at next check-in",
        data: { carbDays: consecutiveHighCarb, proteinPatternDays: flags.find(f => f.id === "PROTEIN_LOW_PATTERN")?.data?.consecutiveDays },
      });
    }
  }

  return escalationFlags;
}

// ============================================================================
// Main Evaluator
// ============================================================================

/**
 * Evaluate all coaching rules and return triggered flags.
 * Flags are sorted by severity (escalate > alert > warning > info) then by category.
 */
export function evaluateCoachingRules(ctx: CoachingContext): CoachingFlag[] {
  const flags: CoachingFlag[] = [
    ...evaluateProteinRules(ctx),
    ...evaluateCarbRules(ctx),
    ...evaluateTimingRules(ctx),
  ];

  // Escalation rules evaluate based on already-triggered flags
  flags.push(...evaluateEscalationRules(flags, ctx));

  // Sort: escalate first, then alert, warning, info. Positive flags last.
  const severityOrder: Record<FlagSeverity, number> = { escalate: 0, alert: 1, warning: 2, info: 3 };
  flags.sort((a, b) => {
    // Positive flags always last
    if (a.category === "positive" && b.category !== "positive") return 1;
    if (b.category === "positive" && a.category !== "positive") return -1;
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return flags;
}

/**
 * Format flags for inclusion in the AI coaching prompt.
 * Returns a string block for the TRIGGERED RULE FLAGS TODAY section.
 */
export function formatFlagsForPrompt(flags: CoachingFlag[]): string {
  if (flags.length === 0) {
    return "No flags triggered — all metrics within normal range today.";
  }

  return flags
    .map(f => `[${f.severity.toUpperCase()}] ${f.id}: ${f.message}`)
    .join("\n");
}

/**
 * Derive program phase from start date + optional override.
 */
export function deriveProgramPhase(
  programStartDate: Date | null,
  override: string | null
): { phase: "active" | "maintenance"; activeWeeks: number } {
  if (override === "active" || override === "maintenance") {
    const weeks = programStartDate
      ? Math.floor((Date.now() - programStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      : 0;
    return { phase: override, activeWeeks: Math.max(0, weeks) };
  }

  if (!programStartDate) {
    return { phase: "active", activeWeeks: 0 };
  }

  const weeks = Math.floor((Date.now() - programStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return {
    phase: weeks >= 12 ? "maintenance" : "active",
    activeWeeks: Math.max(0, weeks),
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Count consecutive days (from most recent) where predicate is true.
 */
function countConsecutive(
  days: CoachingContext["recentDays"],
  predicate: (day: CoachingContext["recentDays"][0]) => boolean
): number {
  let count = 0;
  for (const day of days) {
    if (predicate(day)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

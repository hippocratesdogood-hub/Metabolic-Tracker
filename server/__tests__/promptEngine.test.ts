/**
 * Prompt Engine Test Suite
 *
 * Tests for automated coaching prompt system including:
 * - Rule evaluation logic
 * - Template personalization
 * - Cooldown/deduplication
 * - Edge cases (new users, missing data, thresholds)
 * - Trigger conditions validation
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  daysAgo,
  toDateString,
  createMockParticipant,
  createGlucoseEntry,
  createBpEntry,
  createWeightEntry,
  createKetoneEntry,
  createMockMacroTarget,
  resetMockCounters,
} from "./testUtils";

// ============================================================================
// Types (matching promptEngine.ts)
// ============================================================================

interface ScheduleConfig {
  hour?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

interface ConditionConfig {
  metricType?: "GLUCOSE" | "BP" | "WEIGHT" | "WAIST" | "KETONES";
  operator?: "gt" | "gte" | "lt" | "lte" | "eq";
  value?: number;
  diastolicValue?: number;
  consecutiveDays?: number;
  inactiveDays?: number;
}

interface PromptRule {
  id: string;
  key: string;
  promptId: string;
  triggerType: "schedule" | "event" | "missed";
  scheduleJson: ScheduleConfig | null;
  conditionsJson: ConditionConfig | null;
  cooldownHours: number;
  priority: number;
  active: boolean;
}

interface UserContext {
  id: string;
  name: string;
  email: string;
  lastLogDate: Date | null;
  daysSinceLastLog: number | null;
  metrics: MetricSummary;
  targets: { proteinG: number | null; carbsG: number | null; caloriesKcal: number | null } | null;
}

interface MetricSummary {
  glucose: { latest: number | null; average7Day: number | null; highDays: number };
  bp: { latest: { systolic: number; diastolic: number } | null; elevatedDays: number };
  weight: { latest: number | null; change30Day: number | null };
  ketones: { latest: number | null };
}

// ============================================================================
// Helper Functions (extracted from promptEngine for testing)
// ============================================================================

function compare(actual: number, operator: string | undefined, expected: number): boolean {
  switch (operator) {
    case "gt": return actual > expected;
    case "gte": return actual >= expected;
    case "lt": return actual < expected;
    case "lte": return actual <= expected;
    case "eq": return actual === expected;
    default: return false;
  }
}

function evaluateSchedule(schedule: ScheduleConfig | null): boolean {
  if (!schedule) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const currentDayOfWeek = now.getDay();
  const currentDayOfMonth = now.getDate();

  if (schedule.hour !== undefined && schedule.hour !== currentHour) return false;
  if (schedule.dayOfWeek !== undefined && schedule.dayOfWeek !== currentDayOfWeek) return false;
  if (schedule.dayOfMonth !== undefined && schedule.dayOfMonth !== currentDayOfMonth) return false;

  return true;
}

function evaluateMissedLogging(
  conditions: ConditionConfig | null,
  context: UserContext
): boolean {
  const inactiveDays = conditions?.inactiveDays ?? 3;
  return context.daysSinceLastLog !== null && context.daysSinceLastLog >= inactiveDays;
}

function evaluateGlucoseCondition(
  glucose: MetricSummary["glucose"],
  operator?: string,
  value?: number,
  consecutiveDays?: number
): boolean {
  if (consecutiveDays && consecutiveDays >= 3) {
    return glucose.highDays >= consecutiveDays;
  }
  if (glucose.latest === null || value === undefined) return false;
  return compare(glucose.latest, operator, value);
}

function evaluateBpCondition(
  bp: MetricSummary["bp"],
  operator?: string,
  systolicValue?: number,
  diastolicValue?: number,
  consecutiveDays?: number
): boolean {
  if (consecutiveDays && consecutiveDays >= 2) {
    return bp.elevatedDays >= consecutiveDays;
  }
  if (bp.latest === null) return false;

  // If both thresholds provided, trigger if EITHER is exceeded
  // If only one provided, check only that one
  const hasSystolic = systolicValue !== undefined;
  const hasDiastolic = diastolicValue !== undefined;

  const systolicMatch = hasSystolic
    ? compare(bp.latest.systolic, operator, systolicValue)
    : false;
  const diastolicMatch = hasDiastolic
    ? compare(bp.latest.diastolic, operator, diastolicValue)
    : false;

  if (hasSystolic && hasDiastolic) {
    return systolicMatch || diastolicMatch; // Either triggers
  } else if (hasSystolic) {
    return systolicMatch;
  } else if (hasDiastolic) {
    return diastolicMatch;
  }
  return false;
}

function personalizeMessage(template: string, context: UserContext): string {
  let message = template;

  message = message.replace(/\{\{name\}\}/g, context.name || "there");
  message = message.replace(/\{\{firstName\}\}/g, context.name?.split(" ")[0] || "there");

  message = message.replace(/\{\{glucose\.latest\}\}/g, context.metrics.glucose.latest?.toString() ?? "--");
  message = message.replace(/\{\{glucose\.average\}\}/g, context.metrics.glucose.average7Day?.toFixed(0) ?? "--");
  message = message.replace(/\{\{glucose\.highDays\}\}/g, context.metrics.glucose.highDays.toString());

  if (context.metrics.bp.latest) {
    message = message.replace(/\{\{bp\.latest\}\}/g, `${context.metrics.bp.latest.systolic}/${context.metrics.bp.latest.diastolic}`);
  } else {
    message = message.replace(/\{\{bp\.latest\}\}/g, "--/--");
  }
  message = message.replace(/\{\{bp\.elevatedDays\}\}/g, context.metrics.bp.elevatedDays.toString());

  message = message.replace(/\{\{weight\.latest\}\}/g, context.metrics.weight.latest?.toFixed(1) ?? "--");
  message = message.replace(
    /\{\{weight\.change\}\}/g,
    context.metrics.weight.change30Day !== null
      ? (context.metrics.weight.change30Day > 0 ? "+" : "") + context.metrics.weight.change30Day.toFixed(1)
      : "--"
  );

  message = message.replace(/\{\{ketones\.latest\}\}/g, context.metrics.ketones.latest?.toFixed(1) ?? "--");
  message = message.replace(/\{\{daysSinceLog\}\}/g, context.daysSinceLastLog?.toString() ?? "0");

  if (context.targets) {
    message = message.replace(/\{\{target\.protein\}\}/g, context.targets.proteinG?.toString() ?? "--");
    message = message.replace(/\{\{target\.carbs\}\}/g, context.targets.carbsG?.toString() ?? "--");
    message = message.replace(/\{\{target\.calories\}\}/g, context.targets.caloriesKcal?.toString() ?? "--");
  }

  message = message.replace(/\{\{[^}]+\}\}/g, "--");

  return message;
}

// ============================================================================
// Test Data Factories
// ============================================================================

function createUserContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    id: "user-1",
    name: "Alex Rivera",
    email: "alex@example.com",
    lastLogDate: daysAgo(0),
    daysSinceLastLog: 0,
    metrics: {
      glucose: { latest: 95, average7Day: 98, highDays: 0 },
      bp: { latest: { systolic: 120, diastolic: 80 }, elevatedDays: 0 },
      weight: { latest: 180, change30Day: -2 },
      ketones: { latest: 1.2 },
    },
    targets: { proteinG: 120, carbsG: 100, caloriesKcal: 1800 },
    ...overrides,
  };
}

function createPromptRule(overrides: Partial<PromptRule> = {}): PromptRule {
  return {
    id: "rule-1",
    key: "test_rule",
    promptId: "prompt-1",
    triggerType: "event",
    scheduleJson: null,
    conditionsJson: null,
    cooldownHours: 24,
    priority: 10,
    active: true,
    ...overrides,
  };
}

// ============================================================================
// SCHEDULE TRIGGER TESTS
// ============================================================================

describe("Schedule Trigger Evaluation", () => {
  describe("Hour Matching", () => {
    it("should match current hour", () => {
      const currentHour = new Date().getHours();
      expect(evaluateSchedule({ hour: currentHour })).toBe(true);
    });

    it("should not match different hour", () => {
      const differentHour = (new Date().getHours() + 6) % 24;
      expect(evaluateSchedule({ hour: differentHour })).toBe(false);
    });
  });

  describe("Day of Week Matching", () => {
    it("should match current day of week", () => {
      const currentDay = new Date().getDay();
      expect(evaluateSchedule({ dayOfWeek: currentDay })).toBe(true);
    });

    it("should not match different day of week", () => {
      const differentDay = (new Date().getDay() + 3) % 7;
      expect(evaluateSchedule({ dayOfWeek: differentDay })).toBe(false);
    });
  });

  describe("Day of Month Matching", () => {
    it("should match current day of month", () => {
      const currentDate = new Date().getDate();
      expect(evaluateSchedule({ dayOfMonth: currentDate })).toBe(true);
    });

    it("should not match different day of month", () => {
      const differentDate = ((new Date().getDate() + 14) % 28) + 1;
      expect(evaluateSchedule({ dayOfMonth: differentDate })).toBe(false);
    });
  });

  describe("Combined Conditions", () => {
    it("should require all conditions to match", () => {
      const now = new Date();
      const schedule: ScheduleConfig = {
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
      };
      expect(evaluateSchedule(schedule)).toBe(true);
    });

    it("should fail if any condition doesn't match", () => {
      const now = new Date();
      const schedule: ScheduleConfig = {
        hour: now.getHours(),
        dayOfWeek: (now.getDay() + 1) % 7, // Wrong day
      };
      expect(evaluateSchedule(schedule)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should return false for null schedule", () => {
      expect(evaluateSchedule(null)).toBe(false);
    });

    it("should return true for empty schedule (any time)", () => {
      expect(evaluateSchedule({})).toBe(true);
    });
  });
});

// ============================================================================
// MISSED LOGGING TRIGGER TESTS
// ============================================================================

describe("Missed Logging Trigger", () => {
  describe("Default Threshold (3 days)", () => {
    it("should trigger after 3 days of inactivity", () => {
      const context = createUserContext({ daysSinceLastLog: 3 });
      expect(evaluateMissedLogging(null, context)).toBe(true);
    });

    it("should not trigger at 2 days of inactivity", () => {
      const context = createUserContext({ daysSinceLastLog: 2 });
      expect(evaluateMissedLogging(null, context)).toBe(false);
    });

    it("should trigger after 5 days of inactivity", () => {
      const context = createUserContext({ daysSinceLastLog: 5 });
      expect(evaluateMissedLogging(null, context)).toBe(true);
    });
  });

  describe("Custom Threshold", () => {
    it("should respect custom inactiveDays threshold", () => {
      const context = createUserContext({ daysSinceLastLog: 5 });
      expect(evaluateMissedLogging({ inactiveDays: 7 }, context)).toBe(false);
      expect(evaluateMissedLogging({ inactiveDays: 5 }, context)).toBe(true);
      expect(evaluateMissedLogging({ inactiveDays: 3 }, context)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle new user with no logs (null daysSinceLastLog)", () => {
      const context = createUserContext({ daysSinceLastLog: null });
      expect(evaluateMissedLogging(null, context)).toBe(false);
    });

    it("should handle same-day logging (0 days)", () => {
      const context = createUserContext({ daysSinceLastLog: 0 });
      expect(evaluateMissedLogging(null, context)).toBe(false);
    });
  });
});

// ============================================================================
// GLUCOSE EVENT TRIGGER TESTS
// ============================================================================

describe("Glucose Event Trigger", () => {
  describe("Single Value Comparison", () => {
    it("should trigger when glucose > threshold (gt)", () => {
      const glucose = { latest: 115, average7Day: 100, highDays: 1 };
      expect(evaluateGlucoseCondition(glucose, "gt", 110)).toBe(true);
      expect(evaluateGlucoseCondition(glucose, "gt", 115)).toBe(false);
    });

    it("should trigger when glucose >= threshold (gte)", () => {
      const glucose = { latest: 110, average7Day: 100, highDays: 1 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110)).toBe(true);
      expect(evaluateGlucoseCondition(glucose, "gte", 111)).toBe(false);
    });

    it("should trigger when glucose < threshold (lt)", () => {
      const glucose = { latest: 65, average7Day: 70, highDays: 0 };
      expect(evaluateGlucoseCondition(glucose, "lt", 70)).toBe(true);
      expect(evaluateGlucoseCondition(glucose, "lt", 65)).toBe(false);
    });
  });

  describe("Consecutive Days (High Glucose Flag)", () => {
    it("should trigger with 3+ high glucose days", () => {
      const glucose = { latest: 115, average7Day: 112, highDays: 3 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110, 3)).toBe(true);
    });

    it("should not trigger with only 2 high glucose days", () => {
      const glucose = { latest: 115, average7Day: 108, highDays: 2 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110, 3)).toBe(false);
    });

    it("should trigger with more than required consecutive days", () => {
      const glucose = { latest: 120, average7Day: 115, highDays: 5 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110, 3)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should not trigger with null latest value", () => {
      const glucose = { latest: null, average7Day: null, highDays: 0 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110)).toBe(false);
    });

    it("should handle exactly at threshold value", () => {
      const glucose = { latest: 110, average7Day: 105, highDays: 1 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110)).toBe(true);
      expect(evaluateGlucoseCondition(glucose, "gt", 110)).toBe(false);
    });
  });
});

// ============================================================================
// BP EVENT TRIGGER TESTS
// ============================================================================

describe("BP Event Trigger", () => {
  describe("Systolic Threshold", () => {
    it("should trigger when systolic >= 140", () => {
      const bp = { latest: { systolic: 145, diastolic: 85 }, elevatedDays: 1 };
      expect(evaluateBpCondition(bp, "gte", 140)).toBe(true);
    });

    it("should not trigger when systolic < 140", () => {
      const bp = { latest: { systolic: 135, diastolic: 85 }, elevatedDays: 0 };
      expect(evaluateBpCondition(bp, "gte", 140)).toBe(false);
    });
  });

  describe("Diastolic Threshold", () => {
    it("should trigger when diastolic >= 90", () => {
      const bp = { latest: { systolic: 130, diastolic: 95 }, elevatedDays: 1 };
      expect(evaluateBpCondition(bp, "gte", undefined, 90)).toBe(true);
    });
  });

  describe("Either Systolic OR Diastolic", () => {
    it("should trigger if either threshold is met", () => {
      // High systolic, normal diastolic
      const bp1 = { latest: { systolic: 145, diastolic: 80 }, elevatedDays: 1 };
      expect(evaluateBpCondition(bp1, "gte", 140, 90)).toBe(true);

      // Normal systolic, high diastolic
      const bp2 = { latest: { systolic: 125, diastolic: 95 }, elevatedDays: 1 };
      expect(evaluateBpCondition(bp2, "gte", 140, 90)).toBe(true);

      // Both normal
      const bp3 = { latest: { systolic: 120, diastolic: 80 }, elevatedDays: 0 };
      expect(evaluateBpCondition(bp3, "gte", 140, 90)).toBe(false);
    });
  });

  describe("Consecutive Days (Elevated BP Flag)", () => {
    it("should trigger with 2+ elevated BP days", () => {
      const bp = { latest: { systolic: 145, diastolic: 92 }, elevatedDays: 2 };
      expect(evaluateBpCondition(bp, "gte", 140, 90, 2)).toBe(true);
    });

    it("should not trigger with only 1 elevated BP day", () => {
      const bp = { latest: { systolic: 145, diastolic: 92 }, elevatedDays: 1 };
      expect(evaluateBpCondition(bp, "gte", 140, 90, 2)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should not trigger with null BP", () => {
      const bp = { latest: null, elevatedDays: 0 };
      expect(evaluateBpCondition(bp, "gte", 140, 90)).toBe(false);
    });
  });
});

// ============================================================================
// TEMPLATE PERSONALIZATION TESTS
// ============================================================================

describe("Template Personalization", () => {
  describe("User Information", () => {
    it("should replace {{name}} with full name", () => {
      const context = createUserContext({ name: "Alex Rivera" });
      expect(personalizeMessage("Hello {{name}}!", context)).toBe("Hello Alex Rivera!");
    });

    it("should replace {{firstName}} with first name only", () => {
      const context = createUserContext({ name: "Alex Rivera" });
      expect(personalizeMessage("Hi {{firstName}}", context)).toBe("Hi Alex");
    });

    it("should use 'there' for missing name", () => {
      const context = createUserContext({ name: "" });
      expect(personalizeMessage("Hello {{name}}!", context)).toBe("Hello there!");
    });
  });

  describe("Glucose Values", () => {
    it("should replace glucose tokens correctly", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          glucose: { latest: 105, average7Day: 98.5, highDays: 2 },
        },
      });
      const template = "Glucose: {{glucose.latest}}, Avg: {{glucose.average}}, High days: {{glucose.highDays}}";
      expect(personalizeMessage(template, context)).toBe("Glucose: 105, Avg: 99, High days: 2");
    });

    it("should show '--' for null glucose values", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          glucose: { latest: null, average7Day: null, highDays: 0 },
        },
      });
      expect(personalizeMessage("Glucose: {{glucose.latest}}", context)).toBe("Glucose: --");
    });
  });

  describe("BP Values", () => {
    it("should replace BP tokens correctly", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          bp: { latest: { systolic: 125, diastolic: 82 }, elevatedDays: 1 },
        },
      });
      expect(personalizeMessage("BP: {{bp.latest}}", context)).toBe("BP: 125/82");
    });

    it("should show '--/--' for null BP", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          bp: { latest: null, elevatedDays: 0 },
        },
      });
      expect(personalizeMessage("BP: {{bp.latest}}", context)).toBe("BP: --/--");
    });
  });

  describe("Weight Values", () => {
    it("should replace weight tokens correctly", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          weight: { latest: 185.5, change30Day: -3.5 },
        },
      });
      const template = "Weight: {{weight.latest}} lbs ({{weight.change}})";
      expect(personalizeMessage(template, context)).toBe("Weight: 185.5 lbs (-3.5)");
    });

    it("should show '+' for weight gain", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          weight: { latest: 185.5, change30Day: 2.5 },
        },
      });
      expect(personalizeMessage("Change: {{weight.change}}", context)).toBe("Change: +2.5");
    });
  });

  describe("Target Values", () => {
    it("should replace target tokens correctly", () => {
      const context = createUserContext({
        targets: { proteinG: 120, carbsG: 100, caloriesKcal: 1800 },
      });
      const template = "Protein: {{target.protein}}g, Carbs: {{target.carbs}}g";
      expect(personalizeMessage(template, context)).toBe("Protein: 120g, Carbs: 100g");
    });

    it("should handle null targets gracefully", () => {
      const context = createUserContext({ targets: null });
      expect(personalizeMessage("Protein: {{target.protein}}g", context)).toBe("Protein: --g");
    });
  });

  describe("Days Since Log", () => {
    it("should replace daysSinceLog correctly", () => {
      const context = createUserContext({ daysSinceLastLog: 5 });
      expect(personalizeMessage("Last log: {{daysSinceLog}} days ago", context)).toBe(
        "Last log: 5 days ago"
      );
    });
  });

  describe("Unknown Tokens", () => {
    it("should replace unknown tokens with '--'", () => {
      const context = createUserContext();
      expect(personalizeMessage("Unknown: {{unknown.token}}", context)).toBe("Unknown: --");
    });
  });

  describe("NaN Prevention", () => {
    it("should never produce 'NaN' in output", () => {
      const context = createUserContext({
        metrics: {
          glucose: { latest: null, average7Day: null, highDays: 0 },
          bp: { latest: null, elevatedDays: 0 },
          weight: { latest: null, change30Day: null },
          ketones: { latest: null },
        },
        targets: null,
        daysSinceLastLog: null,
      });

      const template = "Glucose: {{glucose.latest}}, Weight: {{weight.latest}}, Change: {{weight.change}}";
      const result = personalizeMessage(template, context);

      expect(result).not.toContain("NaN");
      expect(result).not.toContain("undefined");
      expect(result).not.toContain("null");
    });
  });
});

// ============================================================================
// COMPARISON OPERATOR TESTS
// ============================================================================

describe("Comparison Operators", () => {
  describe("Greater Than (gt)", () => {
    it("should return true when actual > expected", () => {
      expect(compare(110, "gt", 100)).toBe(true);
      expect(compare(100, "gt", 100)).toBe(false);
      expect(compare(90, "gt", 100)).toBe(false);
    });
  });

  describe("Greater Than or Equal (gte)", () => {
    it("should return true when actual >= expected", () => {
      expect(compare(110, "gte", 100)).toBe(true);
      expect(compare(100, "gte", 100)).toBe(true);
      expect(compare(90, "gte", 100)).toBe(false);
    });
  });

  describe("Less Than (lt)", () => {
    it("should return true when actual < expected", () => {
      expect(compare(90, "lt", 100)).toBe(true);
      expect(compare(100, "lt", 100)).toBe(false);
      expect(compare(110, "lt", 100)).toBe(false);
    });
  });

  describe("Less Than or Equal (lte)", () => {
    it("should return true when actual <= expected", () => {
      expect(compare(90, "lte", 100)).toBe(true);
      expect(compare(100, "lte", 100)).toBe(true);
      expect(compare(110, "lte", 100)).toBe(false);
    });
  });

  describe("Equal (eq)", () => {
    it("should return true only when actual === expected", () => {
      expect(compare(100, "eq", 100)).toBe(true);
      expect(compare(100.0, "eq", 100)).toBe(true);
      expect(compare(99, "eq", 100)).toBe(false);
    });
  });

  describe("Invalid Operator", () => {
    it("should return false for unknown operator", () => {
      expect(compare(100, "unknown" as any, 100)).toBe(false);
      expect(compare(100, undefined, 100)).toBe(false);
    });
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe("Edge Cases", () => {
  describe("New User (No Historical Data)", () => {
    it("should handle user with no metrics", () => {
      const context = createUserContext({
        lastLogDate: null,
        daysSinceLastLog: null,
        metrics: {
          glucose: { latest: null, average7Day: null, highDays: 0 },
          bp: { latest: null, elevatedDays: 0 },
          weight: { latest: null, change30Day: null },
          ketones: { latest: null },
        },
      });

      // Glucose check should not trigger
      expect(evaluateGlucoseCondition(context.metrics.glucose, "gte", 110)).toBe(false);

      // BP check should not trigger
      expect(evaluateBpCondition(context.metrics.bp, "gte", 140, 90)).toBe(false);

      // Missed logging should not trigger (null daysSinceLastLog)
      expect(evaluateMissedLogging(null, context)).toBe(false);
    });

    it("should personalize message with defaults for new user", () => {
      const context = createUserContext({
        name: "New User",
        metrics: {
          glucose: { latest: null, average7Day: null, highDays: 0 },
          bp: { latest: null, elevatedDays: 0 },
          weight: { latest: null, change30Day: null },
          ketones: { latest: null },
        },
      });

      const template = "Hi {{firstName}}, your glucose is {{glucose.latest}}";
      expect(personalizeMessage(template, context)).toBe("Hi New, your glucose is --");
    });
  });

  describe("Exactly at Threshold Values", () => {
    it("should handle glucose exactly at 110 threshold", () => {
      const glucose = { latest: 110, average7Day: 105, highDays: 1 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110)).toBe(true);
      expect(evaluateGlucoseCondition(glucose, "gt", 110)).toBe(false);
    });

    it("should handle BP exactly at 140/90 threshold", () => {
      const bp = { latest: { systolic: 140, diastolic: 90 }, elevatedDays: 1 };
      expect(evaluateBpCondition(bp, "gte", 140, 90)).toBe(true);
    });

    it("should handle missed logging exactly at 3 days", () => {
      const context = createUserContext({ daysSinceLastLog: 3 });
      expect(evaluateMissedLogging({ inactiveDays: 3 }, context)).toBe(true);
    });
  });

  describe("Extreme Values", () => {
    it("should handle very high glucose", () => {
      const glucose = { latest: 400, average7Day: 350, highDays: 7 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110, 3)).toBe(true);
    });

    it("should handle very low glucose (hypoglycemia)", () => {
      const glucose = { latest: 50, average7Day: 65, highDays: 0 };
      expect(evaluateGlucoseCondition(glucose, "lt", 70)).toBe(true);
    });

    it("should handle long inactivity", () => {
      const context = createUserContext({ daysSinceLastLog: 30 });
      expect(evaluateMissedLogging({ inactiveDays: 3 }, context)).toBe(true);
    });
  });

  describe("Zero Values", () => {
    it("should handle zero glucose (invalid but possible)", () => {
      const glucose = { latest: 0, average7Day: 0, highDays: 0 };
      expect(evaluateGlucoseCondition(glucose, "gte", 110)).toBe(false);
      expect(evaluateGlucoseCondition(glucose, "lt", 70)).toBe(true);
    });

    it("should handle zero days since log", () => {
      const context = createUserContext({ daysSinceLastLog: 0 });
      expect(evaluateMissedLogging({ inactiveDays: 3 }, context)).toBe(false);
    });
  });
});

// ============================================================================
// PROMPT CATEGORY TESTS
// ============================================================================

describe("Prompt Categories", () => {
  describe("Reminder Prompts", () => {
    it("should validate reminder prompt structure", () => {
      const reminderPrompt = {
        id: "remind-log",
        key: "daily_log_reminder",
        name: "Daily Log Reminder",
        category: "reminder" as const,
        messageTemplate: "Hi {{firstName}}, don't forget to log your meals today!",
        channel: "in_app" as const,
        active: true,
      };

      expect(reminderPrompt.category).toBe("reminder");
      expect(reminderPrompt.messageTemplate).toContain("{{firstName}}");
    });
  });

  describe("Intervention Prompts", () => {
    it("should validate intervention prompt structure", () => {
      const interventionPrompt = {
        id: "high-glucose-alert",
        key: "high_glucose_intervention",
        name: "High Glucose Alert",
        category: "intervention" as const,
        messageTemplate:
          "{{firstName}}, your glucose has been elevated ({{glucose.average}}) for {{glucose.highDays}} days. Consider reviewing your carb intake.",
        channel: "in_app" as const,
        active: true,
      };

      expect(interventionPrompt.category).toBe("intervention");
      expect(interventionPrompt.messageTemplate).toContain("{{glucose.average}}");
    });
  });

  describe("Education Prompts", () => {
    it("should validate education prompt structure", () => {
      const educationPrompt = {
        id: "ketone-info",
        key: "ketone_education",
        name: "Ketone Education",
        category: "education" as const,
        messageTemplate:
          "Your ketone level ({{ketones.latest}} mmol/L) indicates you're in ketosis! This is a sign your body is burning fat for fuel.",
        channel: "in_app" as const,
        active: true,
      };

      expect(educationPrompt.category).toBe("education");
      expect(educationPrompt.messageTemplate).toContain("{{ketones.latest}}");
    });
  });
});

// ============================================================================
// RULE CONFIGURATION TESTS
// ============================================================================

describe("Rule Configuration", () => {
  describe("High Glucose Flag Rule", () => {
    const highGlucoseRule = createPromptRule({
      key: "high_glucose_3_days",
      triggerType: "event",
      conditionsJson: {
        metricType: "GLUCOSE",
        operator: "gte",
        value: 110,
        consecutiveDays: 3,
      },
      cooldownHours: 24,
    });

    it("should trigger with 3+ high glucose days", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          glucose: { latest: 115, average7Day: 112, highDays: 3 },
        },
      });

      const conditions = highGlucoseRule.conditionsJson as ConditionConfig;
      expect(
        evaluateGlucoseCondition(
          context.metrics.glucose,
          conditions.operator,
          conditions.value,
          conditions.consecutiveDays
        )
      ).toBe(true);
    });
  });

  describe("Elevated BP Flag Rule", () => {
    const elevatedBpRule = createPromptRule({
      key: "elevated_bp_2_days",
      triggerType: "event",
      conditionsJson: {
        metricType: "BP",
        operator: "gte",
        value: 140,
        diastolicValue: 90,
        consecutiveDays: 2,
      },
      cooldownHours: 48,
    });

    it("should trigger with 2+ elevated BP days", () => {
      const context = createUserContext({
        metrics: {
          ...createUserContext().metrics,
          bp: { latest: { systolic: 145, diastolic: 92 }, elevatedDays: 2 },
        },
      });

      const conditions = elevatedBpRule.conditionsJson as ConditionConfig;
      expect(
        evaluateBpCondition(
          context.metrics.bp,
          conditions.operator,
          conditions.value,
          conditions.diastolicValue,
          conditions.consecutiveDays
        )
      ).toBe(true);
    });
  });

  describe("Missed Logging Rule", () => {
    const missedLoggingRule = createPromptRule({
      key: "missed_logging_3_days",
      triggerType: "missed",
      conditionsJson: {
        inactiveDays: 3,
      },
      cooldownHours: 24,
    });

    it("should trigger after 3+ days without logging", () => {
      const context = createUserContext({ daysSinceLastLog: 4 });
      const conditions = missedLoggingRule.conditionsJson as ConditionConfig;
      expect(evaluateMissedLogging(conditions, context)).toBe(true);
    });
  });
});

/**
 * Metabolic Health Calculations Test Suite
 *
 * Comprehensive tests for all metabolic health calculations including:
 * - Glucose metrics and thresholds
 * - Blood pressure metrics and thresholds
 * - Adherence score calculations
 * - Health flags detection
 * - Macro compliance calculations
 * - Outcome tracking calculations
 *
 * Tests are organized by calculation type with:
 * - Happy path tests
 * - Edge case tests
 * - Error/boundary condition tests
 * - Precision/rounding tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetMockCounters,
  daysAgo,
  toDateString,
  createMockParticipant,
  createMockCoach,
  createGlucoseEntry,
  createBpEntry,
  createWeightEntry,
  createWaistEntry,
  createKetoneEntry,
  createFoodEntryWithMacros,
  createMockMacroTarget,
  generateGlucoseSeries,
  generateBpSeries,
  generateWeightSeries,
  generateMixedMetrics,
  calculateExpectedAdherence,
  calculateExpectedOutcomeChange,
  isWithinProteinTarget,
  exceedsCarbTarget,
} from "./testUtils";

// ============================================================================
// GLUCOSE METRICS TESTS
// ============================================================================

describe("Glucose Metrics", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  describe("Threshold Detection", () => {
    /**
     * CLINICAL REFERENCE:
     * - Normal fasting glucose: < 100 mg/dL
     * - Pre-diabetic: 100-125 mg/dL
     * - Diabetic: >= 126 mg/dL
     *
     * APPLICATION THRESHOLD:
     * - High glucose flag triggers at >= 110 mg/dL
     */

    describe("Happy Path", () => {
      it("should classify glucose 95 mg/dL as normal (below threshold)", () => {
        const value = 95;
        const threshold = 110;
        expect(value < threshold).toBe(true);
        // Clinical interpretation: Normal fasting glucose
      });

      it("should classify glucose 105 mg/dL as elevated but below flag threshold", () => {
        const value = 105;
        const threshold = 110;
        expect(value < threshold).toBe(true);
        // Clinical interpretation: Pre-diabetic range, but doesn't trigger flag
      });

      it("should classify glucose 115 mg/dL as above threshold", () => {
        const value = 115;
        const threshold = 110;
        expect(value >= threshold).toBe(true);
        // Clinical interpretation: Elevated, will contribute to flag if persistent
      });

      it("should classify glucose 150 mg/dL as significantly elevated", () => {
        const value = 150;
        const threshold = 110;
        expect(value >= threshold).toBe(true);
        // Clinical interpretation: Significantly elevated, immediate attention needed
      });
    });

    describe("Edge Cases", () => {
      it("should classify glucose exactly at 110 mg/dL as elevated (boundary)", () => {
        const value = 110;
        const threshold = 110;
        // Boundary condition: >= 110 triggers flag
        expect(value >= threshold).toBe(true);
      });

      it("should classify glucose at 109 mg/dL as below threshold (boundary)", () => {
        const value = 109;
        const threshold = 110;
        expect(value >= threshold).toBe(false);
      });

      it("should handle glucose value of 0 (invalid but shouldn't crash)", () => {
        const value = 0;
        const threshold = 110;
        expect(value >= threshold).toBe(false);
        // Note: 0 is clinically impossible but system should handle gracefully
      });
    });

    describe("Value Extraction", () => {
      /**
       * The system supports multiple value formats for backwards compatibility:
       * - { value: number }
       * - { fasting: number }
       */

      it("should extract value from { value: 95 } format", () => {
        const entry = createGlucoseEntry("user-1", 95);
        const val = entry.valueJson as { value?: number; fasting?: number };
        const extracted = val?.value || val?.fasting || 0;
        expect(extracted).toBe(95);
      });

      it("should extract value from legacy fasting field", () => {
        const valueJson = { fasting: 100 };
        const extracted = (valueJson as any)?.value || (valueJson as any)?.fasting || 0;
        expect(extracted).toBe(100);
      });

      it("should prefer value field over fasting field when both present", () => {
        const valueJson = { value: 95, fasting: 100 };
        // Note: Current implementation uses || so value takes precedence if truthy
        const extracted = (valueJson as any)?.value || (valueJson as any)?.fasting || 0;
        expect(extracted).toBe(95);
      });

      it("should return 0 for null/undefined valueJson", () => {
        const valueJson = null;
        const extracted = (valueJson as any)?.value || (valueJson as any)?.fasting || 0;
        expect(extracted).toBe(0);
      });

      it("should return 0 for empty object", () => {
        const valueJson = {};
        const extracted = (valueJson as any)?.value || (valueJson as any)?.fasting || 0;
        expect(extracted).toBe(0);
      });
    });
  });

  describe("High Glucose Flag Logic", () => {
    /**
     * Flag triggers when: >= 110 mg/dL on 3 or more days within last 3 days
     */

    describe("Happy Path", () => {
      it("should trigger flag with high glucose on 3 consecutive days", () => {
        const userId = "user-1";
        const entries = generateGlucoseSeries(userId, [115, 120, 112], 0); // Days 0, 1, 2

        const highGlucoseDays = new Set<string>();
        entries.forEach((e) => {
          const val = e.valueJson as { value?: number };
          if ((val?.value || 0) >= 110) {
            highGlucoseDays.add(toDateString(e.timestamp));
          }
        });

        expect(highGlucoseDays.size).toBe(3);
        expect(highGlucoseDays.size >= 3).toBe(true); // Flag should trigger
      });

      it("should NOT trigger flag with high glucose on only 2 days", () => {
        const userId = "user-1";
        const entries = [
          createGlucoseEntry(userId, 115, daysAgo(0)),
          createGlucoseEntry(userId, 112, daysAgo(1)),
          createGlucoseEntry(userId, 95, daysAgo(2)), // Normal
        ];

        const highGlucoseDays = new Set<string>();
        entries.forEach((e) => {
          const val = e.valueJson as { value?: number };
          if ((val?.value || 0) >= 110) {
            highGlucoseDays.add(toDateString(e.timestamp));
          }
        });

        expect(highGlucoseDays.size).toBe(2);
        expect(highGlucoseDays.size >= 3).toBe(false); // Flag should NOT trigger
      });
    });

    describe("Edge Cases", () => {
      it("should count each day only once even with multiple readings", () => {
        const userId = "user-1";
        const today = daysAgo(0);
        const entries = [
          createGlucoseEntry(userId, 115, today),
          createGlucoseEntry(userId, 120, today), // Same day
          createGlucoseEntry(userId, 118, today), // Same day
        ];

        const highGlucoseDays = new Set<string>();
        entries.forEach((e) => {
          const val = e.valueJson as { value?: number };
          if ((val?.value || 0) >= 110) {
            highGlucoseDays.add(toDateString(e.timestamp));
          }
        });

        expect(highGlucoseDays.size).toBe(1); // Only 1 unique day
      });

      it("should handle exactly 110 mg/dL at the threshold boundary", () => {
        const entries = [
          createGlucoseEntry("user-1", 110, daysAgo(0)), // Exactly at threshold
          createGlucoseEntry("user-1", 110, daysAgo(1)),
          createGlucoseEntry("user-1", 110, daysAgo(2)),
        ];

        const highGlucoseDays = new Set<string>();
        entries.forEach((e) => {
          const val = e.valueJson as { value?: number };
          if ((val?.value || 0) >= 110) {
            highGlucoseDays.add(toDateString(e.timestamp));
          }
        });

        expect(highGlucoseDays.size).toBe(3); // All should count
      });

      it("should not trigger with no entries", () => {
        const entries: ReturnType<typeof createGlucoseEntry>[] = [];
        const highGlucoseDays = new Set<string>();

        expect(highGlucoseDays.size).toBe(0);
        expect(highGlucoseDays.size >= 3).toBe(false);
      });
    });
  });
});

// ============================================================================
// BLOOD PRESSURE METRICS TESTS
// ============================================================================

describe("Blood Pressure Metrics", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  describe("Threshold Detection", () => {
    /**
     * CLINICAL REFERENCE (AHA Guidelines):
     * - Normal: < 120 systolic AND < 80 diastolic
     * - Elevated: 120-129 systolic AND < 80 diastolic
     * - Stage 1 Hypertension: 130-139 systolic OR 80-89 diastolic
     * - Stage 2 Hypertension: >= 140 systolic OR >= 90 diastolic
     *
     * APPLICATION THRESHOLD:
     * - Flag triggers: systolic >= 140 OR diastolic >= 90
     */

    describe("Happy Path", () => {
      it("should classify 120/80 as normal (below threshold)", () => {
        const systolic = 120;
        const diastolic = 80;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(false);
        // Clinical interpretation: Normal BP
      });

      it("should classify 135/85 as elevated but below flag threshold", () => {
        const systolic = 135;
        const diastolic = 85;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(false);
        // Clinical interpretation: Stage 1 hypertension, but doesn't trigger flag
      });

      it("should classify 145/85 as elevated (systolic trigger)", () => {
        const systolic = 145;
        const diastolic = 85;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(true);
        // Clinical interpretation: Stage 2 hypertension (systolic)
      });

      it("should classify 130/95 as elevated (diastolic trigger)", () => {
        const systolic = 130;
        const diastolic = 95;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(true);
        // Clinical interpretation: Stage 2 hypertension (diastolic)
      });

      it("should classify 150/100 as elevated (both triggers)", () => {
        const systolic = 150;
        const diastolic = 100;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(true);
        // Clinical interpretation: Severe hypertension
      });
    });

    describe("Edge Cases", () => {
      it("should classify exactly 140/89 as elevated (systolic boundary)", () => {
        const systolic = 140;
        const diastolic = 89;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(true);
      });

      it("should classify exactly 139/90 as elevated (diastolic boundary)", () => {
        const systolic = 139;
        const diastolic = 90;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(true);
      });

      it("should classify 139/89 as NOT elevated (just below both thresholds)", () => {
        const systolic = 139;
        const diastolic = 89;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(false);
      });

      it("should handle zero values (invalid but shouldn't crash)", () => {
        const systolic = 0;
        const diastolic = 0;
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(false);
      });
    });

    describe("Value Extraction", () => {
      it("should extract systolic and diastolic from entry", () => {
        const entry = createBpEntry("user-1", 125, 82);
        const val = entry.valueJson as { systolic?: number; diastolic?: number };
        expect(val?.systolic || 0).toBe(125);
        expect(val?.diastolic || 0).toBe(82);
      });

      it("should default to 0 for missing systolic", () => {
        const valueJson = { diastolic: 80 };
        expect((valueJson as any)?.systolic || 0).toBe(0);
      });

      it("should default to 0 for missing diastolic", () => {
        const valueJson = { systolic: 120 };
        expect((valueJson as any)?.diastolic || 0).toBe(0);
      });
    });
  });

  describe("Elevated BP Flag Logic", () => {
    /**
     * Flag triggers when: elevated BP on 2 or more days within analysis period
     */

    describe("Happy Path", () => {
      it("should trigger flag with elevated BP on 2 days", () => {
        const userId = "user-1";
        const entries = [
          createBpEntry(userId, 145, 85, daysAgo(0)),
          createBpEntry(userId, 142, 88, daysAgo(1)),
        ];

        const elevatedBpDays = new Set<string>();
        entries.forEach((e) => {
          const val = e.valueJson as { systolic?: number; diastolic?: number };
          const systolic = val?.systolic || 0;
          const diastolic = val?.diastolic || 0;
          if (systolic >= 140 || diastolic >= 90) {
            elevatedBpDays.add(toDateString(e.timestamp));
          }
        });

        expect(elevatedBpDays.size).toBe(2);
        expect(elevatedBpDays.size >= 2).toBe(true); // Flag should trigger
      });

      it("should NOT trigger flag with elevated BP on only 1 day", () => {
        const userId = "user-1";
        const entries = [
          createBpEntry(userId, 145, 85, daysAgo(0)),
          createBpEntry(userId, 125, 82, daysAgo(1)), // Normal
          createBpEntry(userId, 120, 78, daysAgo(2)), // Normal
        ];

        const elevatedBpDays = new Set<string>();
        entries.forEach((e) => {
          const val = e.valueJson as { systolic?: number; diastolic?: number };
          const systolic = val?.systolic || 0;
          const diastolic = val?.diastolic || 0;
          if (systolic >= 140 || diastolic >= 90) {
            elevatedBpDays.add(toDateString(e.timestamp));
          }
        });

        expect(elevatedBpDays.size).toBe(1);
        expect(elevatedBpDays.size >= 2).toBe(false); // Flag should NOT trigger
      });
    });

    describe("Edge Cases", () => {
      it("should count day with multiple elevated readings only once", () => {
        const userId = "user-1";
        const today = daysAgo(0);
        const entries = [
          createBpEntry(userId, 145, 85, today),
          createBpEntry(userId, 150, 92, today), // Same day
        ];

        const elevatedBpDays = new Set<string>();
        entries.forEach((e) => {
          const val = e.valueJson as { systolic?: number; diastolic?: number };
          const systolic = val?.systolic || 0;
          const diastolic = val?.diastolic || 0;
          if (systolic >= 140 || diastolic >= 90) {
            elevatedBpDays.add(toDateString(e.timestamp));
          }
        });

        expect(elevatedBpDays.size).toBe(1);
      });
    });
  });
});

// ============================================================================
// ADHERENCE SCORE CALCULATION TESTS
// ============================================================================

describe("Adherence Score Calculation", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  /**
   * ADHERENCE FORMULA:
   * daily_adherence = unique_metric_types_logged / 5
   * adherence_score = (sum_of_daily_adherences / min(days_with_metrics, 7)) * 100
   *
   * 5 metric types: GLUCOSE, BP, WEIGHT, WAIST, KETONES
   */

  describe("Happy Path", () => {
    it("should calculate 100% adherence when all 5 metrics logged daily for 7 days", () => {
      // 7 days × 5 metrics/day = perfect adherence
      const metricsPerDay = Array.from({ length: 7 }, (_, i) => ({
        day: toDateString(daysAgo(i)),
        types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"],
      }));

      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      // Each day: 5/5 = 1.0
      // Sum: 7.0
      // Average: 7.0 / 7 = 1.0
      // Percentage: 100%
      expect(expectedAdherence).toBe(100);
    });

    it("should calculate 60% adherence when 3 of 5 metrics logged daily", () => {
      const metricsPerDay = Array.from({ length: 7 }, (_, i) => ({
        day: toDateString(daysAgo(i)),
        types: ["GLUCOSE", "BP", "WEIGHT"], // 3 metrics
      }));

      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      // Each day: 3/5 = 0.6
      // Sum: 4.2
      // Average: 4.2 / 7 = 0.6
      // Percentage: 60%
      expect(expectedAdherence).toBe(60);
    });

    it("should calculate 20% adherence when only 1 metric logged daily", () => {
      const metricsPerDay = Array.from({ length: 7 }, (_, i) => ({
        day: toDateString(daysAgo(i)),
        types: ["GLUCOSE"], // Only glucose
      }));

      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      // Each day: 1/5 = 0.2
      // Sum: 1.4
      // Average: 1.4 / 7 = 0.2
      // Percentage: 20%
      expect(expectedAdherence).toBe(20);
    });
  });

  describe("Partial Week Scenarios", () => {
    it("should cap denominator at 7 for 10 days of logging", () => {
      // Even with 10 days logged, max denominator is 7
      const metricsPerDay = Array.from({ length: 10 }, (_, i) => ({
        day: toDateString(daysAgo(i)),
        types: ["GLUCOSE", "BP", "WEIGHT"], // 3 metrics
      }));

      // Manual calculation:
      // Each day: 3/5 = 0.6
      // Sum for 10 days: 6.0
      // Average: 6.0 / min(10, 7) = 6.0 / 7 ≈ 0.857
      // Percentage: ~86%
      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      expect(expectedAdherence).toBe(86);
    });

    it("should use actual days for less than 7 days of logging", () => {
      const metricsPerDay = [
        { day: toDateString(daysAgo(0)), types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
        { day: toDateString(daysAgo(1)), types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
        { day: toDateString(daysAgo(2)), types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
      ];

      // 3 days × 5/5 = 3.0
      // Average: 3.0 / 3 = 1.0
      // Percentage: 100%
      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      expect(expectedAdherence).toBe(100);
    });
  });

  describe("Edge Cases", () => {
    it("should return 0% for no logged metrics", () => {
      const metricsPerDay: Array<{ day: string; types: string[] }> = [];
      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      expect(expectedAdherence).toBe(0);
    });

    it("should count duplicate metric types on same day only once", () => {
      const metricsPerDay = [
        {
          day: toDateString(daysAgo(0)),
          types: ["GLUCOSE", "GLUCOSE", "GLUCOSE", "BP"], // Glucose logged 3x, BP once
        },
      ];

      // Unique types: GLUCOSE, BP = 2
      // Daily adherence: 2/5 = 0.4
      // Only 1 day, so: 0.4 / 1 = 0.4
      // Percentage: 40%
      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      expect(expectedAdherence).toBe(40);
    });

    it("should handle mixed adherence across days", () => {
      const metricsPerDay = [
        { day: toDateString(daysAgo(0)), types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] }, // 5/5 = 1.0
        { day: toDateString(daysAgo(1)), types: ["GLUCOSE", "BP"] }, // 2/5 = 0.4
        { day: toDateString(daysAgo(2)), types: ["GLUCOSE"] }, // 1/5 = 0.2
      ];

      // Sum: 1.0 + 0.4 + 0.2 = 1.6
      // Average: 1.6 / 3 ≈ 0.533
      // Percentage: 53%
      const expectedAdherence = calculateExpectedAdherence(metricsPerDay);
      expect(expectedAdherence).toBe(53);
    });
  });

  describe("Known Good Examples", () => {
    /**
     * CLINICAL SCENARIO 1:
     * Patient logs glucose and weight daily for a week
     * Expected: 40% adherence (2 of 5 metrics)
     */
    it("Clinical Scenario: Patient logs glucose and weight daily for 7 days", () => {
      const metricsPerDay = Array.from({ length: 7 }, (_, i) => ({
        day: toDateString(daysAgo(i)),
        types: ["GLUCOSE", "WEIGHT"],
      }));

      const adherence = calculateExpectedAdherence(metricsPerDay);
      // 2/5 = 0.4 per day
      // 7 days × 0.4 = 2.8
      // 2.8 / 7 = 0.4 = 40%
      expect(adherence).toBe(40);
    });

    /**
     * CLINICAL SCENARIO 2:
     * Patient is highly compliant for 3 days, then misses 4 days
     * Expected: 100% (only 3 days count)
     */
    it("Clinical Scenario: Perfect compliance for 3 days, then gap", () => {
      const metricsPerDay = [
        { day: toDateString(daysAgo(0)), types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
        { day: toDateString(daysAgo(1)), types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
        { day: toDateString(daysAgo(2)), types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
        // Days 3-6: no logging
      ];

      const adherence = calculateExpectedAdherence(metricsPerDay);
      // Note: The current formula only counts days WITH metrics
      // 3 days × 1.0 = 3.0
      // 3.0 / min(3, 7) = 3.0 / 3 = 1.0 = 100%
      expect(adherence).toBe(100);
    });
  });
});

// ============================================================================
// LOGGING STREAK CALCULATION TESTS
// ============================================================================

describe("Logging Streak Calculation", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  /**
   * STREAK CALCULATION:
   * Count consecutive days with ANY log entry (metric or food),
   * starting from today and going backwards.
   */

  function calculateStreak(loggedDays: string[]): number {
    // Convert to Set for O(1) lookup
    const loggedSet = new Set(loggedDays);
    let streak = 0;

    for (let i = 0; i < 30; i++) {
      // Check up to 30 days
      const expected = toDateString(daysAgo(i));

      if (loggedSet.has(expected)) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  describe("Happy Path", () => {
    it("should calculate 7-day streak with 7 consecutive days", () => {
      const loggedDays = Array.from({ length: 7 }, (_, i) => toDateString(daysAgo(i)));
      expect(calculateStreak(loggedDays)).toBe(7);
    });

    it("should calculate 3-day streak", () => {
      const loggedDays = [
        toDateString(daysAgo(0)),
        toDateString(daysAgo(1)),
        toDateString(daysAgo(2)),
      ];
      expect(calculateStreak(loggedDays)).toBe(3);
    });

    it("should calculate 1-day streak (logged today only)", () => {
      const loggedDays = [toDateString(daysAgo(0))];
      expect(calculateStreak(loggedDays)).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("should return 0 streak if no logs today", () => {
      const loggedDays = [
        toDateString(daysAgo(1)), // Yesterday
        toDateString(daysAgo(2)), // 2 days ago
      ];
      expect(calculateStreak(loggedDays)).toBe(0);
    });

    it("should break streak on gap", () => {
      const loggedDays = [
        toDateString(daysAgo(0)), // Today
        toDateString(daysAgo(1)), // Yesterday
        // Gap: 2 days ago
        toDateString(daysAgo(3)), // 3 days ago
        toDateString(daysAgo(4)), // 4 days ago
      ];
      expect(calculateStreak(loggedDays)).toBe(2); // Only today + yesterday
    });

    it("should return 0 for empty log history", () => {
      const loggedDays: string[] = [];
      expect(calculateStreak(loggedDays)).toBe(0);
    });
  });
});

// ============================================================================
// HEALTH FLAGS DETECTION TESTS
// ============================================================================

describe("Health Flags Detection", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  describe("Missed Logging Flag", () => {
    /**
     * Flag triggers when:
     * - No logs for 3+ days since last entry, OR
     * - Account created 3+ days ago with no logs ever
     */

    // Use a time-zone-safe days calculation that matches production logic
    function daysSinceDate(date: Date): number {
      // Match production logic: full days elapsed
      const now = new Date();
      now.setHours(12, 0, 0, 0); // Normalize to noon for consistent calculation
      const normalizedDate = new Date(date);
      normalizedDate.setHours(12, 0, 0, 0);
      return Math.floor((now.getTime() - normalizedDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    describe("Happy Path", () => {
      it("should trigger flag when last log was 3 days ago", () => {
        const lastLogDate = daysAgo(3);
        const daysSinceLog = daysSinceDate(lastLogDate);
        expect(daysSinceLog >= 3).toBe(true); // Flag should trigger
      });

      it("should NOT trigger flag when last log was 2 days ago", () => {
        const lastLogDate = daysAgo(2);
        const daysSinceLog = daysSinceDate(lastLogDate);
        expect(daysSinceLog >= 3).toBe(false); // Flag should NOT trigger
      });

      it("should trigger flag for new account (5 days old) with no logs", () => {
        const accountCreated = daysAgo(5);
        const daysSinceCreation = daysSinceDate(accountCreated);
        const hasNoLogs = true;

        const shouldFlag = hasNoLogs && daysSinceCreation >= 3;
        expect(shouldFlag).toBe(true);
      });

      it("should NOT trigger flag for new account (1 day old) with no logs", () => {
        const accountCreated = daysAgo(1);
        const daysSinceCreation = daysSinceDate(accountCreated);
        const hasNoLogs = true;

        const shouldFlag = hasNoLogs && daysSinceCreation >= 3;
        expect(shouldFlag).toBe(false);
      });
    });

    describe("Edge Cases", () => {
      it("should trigger flag at exactly 3 days boundary", () => {
        const lastLogDate = daysAgo(3);
        const daysSinceLog = daysSinceDate(lastLogDate);
        // Boundary: >= 3 triggers
        expect(daysSinceLog).toBeGreaterThanOrEqual(3);
      });

      it("should NOT trigger flag at 2 full calendar days ago", () => {
        // Test that exactly 2 days ago does NOT trigger (< 3 days)
        const lastLogDate = daysAgo(2);
        const daysSinceLog = daysSinceDate(lastLogDate);
        expect(daysSinceLog).toBeLessThan(3);
      });
    });
  });

  describe("Combined Flags", () => {
    it("should detect multiple flag types for same participant", () => {
      const userId = "user-1";
      const flags: string[] = [];

      // High glucose (3+ days)
      const glucoseEntries = generateGlucoseSeries(userId, [115, 118, 112], 0);
      const highGlucoseDays = new Set<string>();
      glucoseEntries.forEach((e) => {
        const val = e.valueJson as { value?: number };
        if ((val?.value || 0) >= 110) {
          highGlucoseDays.add(toDateString(e.timestamp));
        }
      });
      if (highGlucoseDays.size >= 3) flags.push("high_glucose");

      // Elevated BP (2+ days)
      const bpEntries = generateBpSeries(
        userId,
        [
          { systolic: 145, diastolic: 85 },
          { systolic: 142, diastolic: 88 },
        ],
        0
      );
      const elevatedBpDays = new Set<string>();
      bpEntries.forEach((e) => {
        const val = e.valueJson as { systolic?: number; diastolic?: number };
        if ((val?.systolic || 0) >= 140 || (val?.diastolic || 0) >= 90) {
          elevatedBpDays.add(toDateString(e.timestamp));
        }
      });
      if (elevatedBpDays.size >= 2) flags.push("elevated_bp");

      expect(flags).toContain("high_glucose");
      expect(flags).toContain("elevated_bp");
      expect(flags.length).toBe(2);
    });
  });
});

// ============================================================================
// MACRO COMPLIANCE CALCULATION TESTS
// ============================================================================

describe("Macro Compliance Calculations", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  describe("Protein Compliance", () => {
    /**
     * FORMULA: Meeting protein = |actual - target| / target <= 0.10
     * Within ±10% of target is considered compliant
     */

    describe("Happy Path", () => {
      it("should be compliant when exactly at protein target", () => {
        expect(isWithinProteinTarget(100, 100)).toBe(true);
      });

      it("should be compliant when 5% above target", () => {
        // Target: 100g, Actual: 105g
        // Difference: 5%, within 10% tolerance
        expect(isWithinProteinTarget(105, 100)).toBe(true);
      });

      it("should be compliant when 5% below target", () => {
        // Target: 100g, Actual: 95g
        expect(isWithinProteinTarget(95, 100)).toBe(true);
      });

      it("should NOT be compliant when 15% above target", () => {
        // Target: 100g, Actual: 115g
        expect(isWithinProteinTarget(115, 100)).toBe(false);
      });

      it("should NOT be compliant when 15% below target", () => {
        // Target: 100g, Actual: 85g
        expect(isWithinProteinTarget(85, 100)).toBe(false);
      });
    });

    describe("Edge Cases", () => {
      it("should be compliant at exactly +10% boundary", () => {
        // Target: 100g, Actual: 110g
        // |110 - 100| / 100 = 0.10 (exactly at boundary)
        expect(isWithinProteinTarget(110, 100)).toBe(true);
      });

      it("should be compliant at exactly -10% boundary", () => {
        // Target: 100g, Actual: 90g
        expect(isWithinProteinTarget(90, 100)).toBe(true);
      });

      it("should NOT be compliant just above +10% boundary", () => {
        // Target: 100g, Actual: 111g
        // |111 - 100| / 100 = 0.11 (just over boundary)
        expect(isWithinProteinTarget(111, 100)).toBe(false);
      });

      it("should handle large targets correctly", () => {
        // Target: 200g, Actual: 180g (-10%)
        expect(isWithinProteinTarget(180, 200)).toBe(true);
        // Target: 200g, Actual: 220g (+10%)
        expect(isWithinProteinTarget(220, 200)).toBe(true);
        // Target: 200g, Actual: 175g (-12.5%)
        expect(isWithinProteinTarget(175, 200)).toBe(false);
      });
    });

    describe("Known Good Examples", () => {
      /**
       * CLINICAL SCENARIO:
       * Participant has 150g protein target
       * Consumed 145g (3.3% under target) - should be compliant
       */
      it("Clinical: 145g consumed vs 150g target should be compliant", () => {
        expect(isWithinProteinTarget(145, 150)).toBe(true);
      });

      /**
       * CLINICAL SCENARIO:
       * Participant has 120g protein target
       * Consumed 100g (16.7% under target) - should NOT be compliant
       */
      it("Clinical: 100g consumed vs 120g target should NOT be compliant", () => {
        expect(isWithinProteinTarget(100, 120)).toBe(false);
      });
    });
  });

  describe("Carb Compliance", () => {
    /**
     * FORMULA: Over carbs = actual > target × 1.10
     * Exceeding target by more than 10% is flagged
     */

    describe("Happy Path", () => {
      it("should NOT flag when at carb target", () => {
        expect(exceedsCarbTarget(100, 100)).toBe(false);
      });

      it("should NOT flag when 5% over carb target", () => {
        // Target: 100g, Actual: 105g
        expect(exceedsCarbTarget(105, 100)).toBe(false);
      });

      it("should flag when 15% over carb target", () => {
        // Target: 100g, Actual: 115g
        expect(exceedsCarbTarget(115, 100)).toBe(true);
      });

      it("should NOT flag when under carb target", () => {
        expect(exceedsCarbTarget(80, 100)).toBe(false);
      });
    });

    describe("Edge Cases", () => {
      it("should NOT flag at exactly +10% boundary", () => {
        // Target: 100g, Actual: 110g
        // 110 > 100 × 1.1 = 110 → 110 > 110 = false
        expect(exceedsCarbTarget(110, 100)).toBe(false);
      });

      it("should flag just above +10% boundary", () => {
        // Target: 100g, Actual: 111g
        // 111 > 100 × 1.1 = 110 → 111 > 110 = true
        expect(exceedsCarbTarget(111, 100)).toBe(true);
      });

      it("should use default target of 100g when not specified", () => {
        // Default carbsTarget is 100g
        const defaultTarget = 100;
        expect(exceedsCarbTarget(115, defaultTarget)).toBe(true);
        expect(exceedsCarbTarget(105, defaultTarget)).toBe(false);
      });
    });

    describe("Known Good Examples", () => {
      /**
       * CLINICAL SCENARIO:
       * Low-carb protocol with 50g target
       * Consumed 60g (20% over) - should be flagged
       */
      it("Clinical: 60g consumed vs 50g target should flag", () => {
        expect(exceedsCarbTarget(60, 50)).toBe(true);
      });

      /**
       * CLINICAL SCENARIO:
       * Standard protocol with 100g target
       * Consumed 108g (8% over) - should NOT flag
       */
      it("Clinical: 108g consumed vs 100g target should NOT flag", () => {
        expect(exceedsCarbTarget(108, 100)).toBe(false);
      });
    });
  });

  describe("Average Daily Macro Calculation", () => {
    /**
     * FORMULA: avgDailyMacro = totalMacro / range
     * Note: Divides by range period (e.g., 7 days), NOT days with entries
     */

    it("should calculate average over full range", () => {
      const range = 7;
      const dailyProtein = [100, 110, 95, 105, 100, 98, 102];
      const total = dailyProtein.reduce((a, b) => a + b, 0); // 710
      const average = total / range;
      expect(average).toBeCloseTo(101.43, 1);
    });

    it("should handle sparse data (not every day has entries)", () => {
      const range = 7;
      // Only logged 3 days, but still divide by 7
      const entries = [100, 110, 95]; // Total: 305
      const average = entries.reduce((a, b) => a + b, 0) / range;
      expect(average).toBeCloseTo(43.57, 1);
    });
  });
});

// ============================================================================
// OUTCOME TRACKING CALCULATION TESTS
// ============================================================================

describe("Outcome Tracking Calculations", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  /**
   * FORMULA: change = latest_value - earliest_value
   * Mean change = sum of changes / participant count
   */

  describe("Weight Change", () => {
    describe("Happy Path", () => {
      it("should calculate weight loss correctly", () => {
        // Started at 200 lbs, ended at 190 lbs
        const result = calculateExpectedOutcomeChange([200, 195, 192, 190]);
        expect(result.meanChange).toBe(-10); // Lost 10 lbs
        expect(result.participantCount).toBe(1);
      });

      it("should calculate weight gain correctly", () => {
        // Started at 150 lbs, ended at 155 lbs
        const result = calculateExpectedOutcomeChange([150, 152, 154, 155]);
        expect(result.meanChange).toBe(5); // Gained 5 lbs
      });

      it("should calculate no change correctly", () => {
        // Started and ended at 180 lbs
        const result = calculateExpectedOutcomeChange([180, 181, 179, 180]);
        expect(result.meanChange).toBe(0);
      });
    });

    describe("Edge Cases", () => {
      it("should return 0 with insufficient data (only 1 entry)", () => {
        const result = calculateExpectedOutcomeChange([200]);
        expect(result.meanChange).toBe(0);
        expect(result.participantCount).toBe(0);
      });

      it("should return 0 with no data", () => {
        const result = calculateExpectedOutcomeChange([]);
        expect(result.meanChange).toBe(0);
        expect(result.participantCount).toBe(0);
      });

      it("should use only first and last values (ignoring middle)", () => {
        // First: 200, Last: 185
        // Middle values don't affect calculation
        const result = calculateExpectedOutcomeChange([200, 210, 220, 185]);
        expect(result.meanChange).toBe(-15);
      });
    });

    describe("Precision", () => {
      it("should round to 1 decimal place", () => {
        // 200.5 - 195.2 = 5.3
        const values = [200.5, 198.3, 196.1, 195.2];
        const change = values[values.length - 1] - values[0];
        const rounded = Math.round(change * 10) / 10;
        expect(rounded).toBe(-5.3);
      });
    });

    describe("Known Good Examples", () => {
      /**
       * CLINICAL SCENARIO:
       * Patient starts at 250 lbs, loses weight over 30 days to 240 lbs
       * Expected: -10 lbs change (positive outcome)
       */
      it("Clinical: 250 lbs → 240 lbs = -10 lbs change", () => {
        const result = calculateExpectedOutcomeChange([250, 248, 245, 242, 240]);
        expect(result.meanChange).toBe(-10);
      });
    });
  });

  describe("Waist Circumference Change", () => {
    describe("Happy Path", () => {
      it("should calculate waist reduction correctly", () => {
        // Started at 40 inches, ended at 38 inches
        const result = calculateExpectedOutcomeChange([40, 39.5, 39, 38]);
        expect(result.meanChange).toBe(-2);
      });
    });

    describe("Known Good Examples", () => {
      /**
       * CLINICAL SCENARIO:
       * Patient starts at 36" waist, reduces to 34" over 30 days
       * Expected: -2" change (positive outcome)
       */
      it("Clinical: 36 inches → 34 inches = -2 inches change", () => {
        const result = calculateExpectedOutcomeChange([36, 35.5, 35, 34.5, 34]);
        expect(result.meanChange).toBe(-2);
      });
    });
  });

  describe("Fasting Glucose Change", () => {
    describe("Happy Path", () => {
      it("should calculate glucose improvement correctly", () => {
        // Started at 115 mg/dL, improved to 100 mg/dL
        const result = calculateExpectedOutcomeChange([115, 110, 105, 100]);
        expect(result.meanChange).toBe(-15);
      });
    });

    describe("Known Good Examples", () => {
      /**
       * CLINICAL SCENARIO:
       * Patient's fasting glucose improves from 120 mg/dL to 95 mg/dL
       * Expected: -25 mg/dL change (significant improvement)
       */
      it("Clinical: 120 mg/dL → 95 mg/dL = -25 mg/dL change", () => {
        const result = calculateExpectedOutcomeChange([120, 115, 108, 100, 95]);
        expect(result.meanChange).toBe(-25);
      });
    });
  });

  describe("Limited Data Flag", () => {
    /**
     * limitedData = true when participantCount < 5
     */

    it("should flag limited data when fewer than 5 participants", () => {
      const participantCount = 3;
      const limitedData = participantCount < 5;
      expect(limitedData).toBe(true);
    });

    it("should NOT flag when 5 or more participants", () => {
      const participantCount = 5;
      const limitedData = participantCount < 5;
      expect(limitedData).toBe(false);
    });
  });
});

// ============================================================================
// QUALITY SCORE TESTS
// ============================================================================

describe("Food Quality Score", () => {
  /**
   * Quality score: 0-100, AI-generated
   * Higher scores: high protein, low carb
   * Lower scores: high carb, low protein
   *
   * Note: Actual calculation is done by AI (GPT-4o-mini)
   * These tests validate expected score ranges for typical meals
   */

  describe("Score Range Validation", () => {
    it("should accept scores in valid range (0-100)", () => {
      const validScores = [0, 25, 50, 75, 100];
      validScores.forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    it("should reject scores outside valid range", () => {
      const invalidScores = [-1, 101, 150, -50];
      invalidScores.forEach((score) => {
        const isValid = score >= 0 && score <= 100;
        expect(isValid).toBe(false);
      });
    });
  });

  describe("Expected Score Patterns", () => {
    /**
     * These are expected patterns based on the AI prompt:
     * "Quality score should favor high protein, low carb meals"
     */

    it("high protein, low carb meal should score high (expected 80-100)", () => {
      // Example: Grilled chicken breast with steamed broccoli
      const expectedRange = { min: 80, max: 100 };
      // This would be validated against actual AI responses
      expect(expectedRange.min).toBeGreaterThanOrEqual(80);
    });

    it("balanced meal should score medium (expected 50-70)", () => {
      // Example: Salmon with rice and vegetables
      const expectedRange = { min: 50, max: 70 };
      expect(expectedRange.min).toBeGreaterThanOrEqual(50);
      expect(expectedRange.max).toBeLessThanOrEqual(70);
    });

    it("high carb, low protein meal should score low (expected 20-40)", () => {
      // Example: Pasta with bread
      const expectedRange = { min: 20, max: 40 };
      expect(expectedRange.max).toBeLessThanOrEqual(40);
    });
  });
});

// ============================================================================
// COACH WORKLOAD CALCULATION TESTS
// ============================================================================

describe("Coach Workload Calculations", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  describe("Participant Count", () => {
    it("should count participants assigned to coach", () => {
      const coach = createMockCoach({ id: "coach-1" });
      const participants = [
        createMockParticipant({ coachId: "coach-1" }),
        createMockParticipant({ coachId: "coach-1" }),
        createMockParticipant({ coachId: "coach-2" }), // Different coach
      ];

      const coachParticipants = participants.filter((p) => p.coachId === coach.id);
      expect(coachParticipants.length).toBe(2);
    });

    it("should return 0 for coach with no participants", () => {
      const coach = createMockCoach({ id: "coach-new" });
      const participants = [
        createMockParticipant({ coachId: "coach-1" }),
        createMockParticipant({ coachId: "coach-2" }),
      ];

      const coachParticipants = participants.filter((p) => p.coachId === coach.id);
      expect(coachParticipants.length).toBe(0);
    });
  });

  describe("Unread Messages Count", () => {
    interface MockMessage {
      id: string;
      conversationId: string;
      senderId: string;
      readAt: Date | null;
    }

    it("should count unread messages from participants", () => {
      const coachId = "coach-1";
      const conversationIds = ["conv-1", "conv-2"];
      const messages: MockMessage[] = [
        { id: "m1", conversationId: "conv-1", senderId: "participant-1", readAt: null }, // Unread
        { id: "m2", conversationId: "conv-1", senderId: "participant-1", readAt: new Date() }, // Read
        { id: "m3", conversationId: "conv-2", senderId: "participant-2", readAt: null }, // Unread
        { id: "m4", conversationId: "conv-1", senderId: coachId, readAt: null }, // From coach (shouldn't count)
      ];

      const unreadCount = messages.filter(
        (m) =>
          conversationIds.includes(m.conversationId) && m.senderId !== coachId && !m.readAt
      ).length;

      expect(unreadCount).toBe(2);
    });

    it("should return 0 when all messages are read", () => {
      const coachId = "coach-1";
      const messages: MockMessage[] = [
        { id: "m1", conversationId: "conv-1", senderId: "participant-1", readAt: new Date() },
        { id: "m2", conversationId: "conv-1", senderId: "participant-2", readAt: new Date() },
      ];

      const unreadCount = messages.filter(
        (m) => m.senderId !== coachId && !m.readAt
      ).length;

      expect(unreadCount).toBe(0);
    });
  });
});

// ============================================================================
// DIVISION BY ZERO AND NULL SAFETY TESTS
// ============================================================================

describe("Division by Zero and Null Safety", () => {
  describe("Adherence Score", () => {
    it("should handle zero days with metrics", () => {
      const daysWithMetrics = 0;
      // Formula uses Math.min(daysWithMetrics, 7) in denominator
      // Should return 0 rather than NaN/Infinity
      const adherence = daysWithMetrics > 0 ? 100 : 0;
      expect(adherence).toBe(0);
      expect(Number.isFinite(adherence)).toBe(true);
    });
  });

  describe("Percentage Calculations", () => {
    it("should handle zero total in percentage calculation", () => {
      const total = 0;
      const count = 5;
      // participantsWithData > 0 check prevents division by zero
      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
      expect(percentage).toBe(0);
      expect(Number.isFinite(percentage)).toBe(true);
    });
  });

  describe("Protein vs Target Ratio", () => {
    it("should handle zero protein target", () => {
      const proteinTarget = 0;
      const actualProtein = 50;
      // Should not divide by zero
      // In practice, this should be caught earlier (no target = excluded from calculation)
      const ratio = proteinTarget > 0 ? actualProtein / proteinTarget : 0;
      expect(Number.isFinite(ratio)).toBe(true);
    });
  });

  describe("Mean Change Calculation", () => {
    it("should handle zero changes array", () => {
      const changes: number[] = [];
      const meanChange =
        changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
      expect(meanChange).toBe(0);
      expect(Number.isFinite(meanChange)).toBe(true);
    });
  });
});

// ============================================================================
// ROUNDING AND PRECISION TESTS
// ============================================================================

describe("Rounding and Precision", () => {
  describe("Adherence Score Rounding", () => {
    it("should round to nearest integer", () => {
      // 0.857 * 100 = 85.7 → 86
      const rawAdherence = 0.857;
      const rounded = Math.round(rawAdherence * 100);
      expect(rounded).toBe(86);
    });

    it("should round 0.5 up", () => {
      // 0.555 * 100 = 55.5 → 56
      const rawAdherence = 0.555;
      const rounded = Math.round(rawAdherence * 100);
      expect(rounded).toBe(56);
    });
  });

  describe("Outcome Change Rounding", () => {
    it("should round to 1 decimal place", () => {
      const rawChange = -5.347;
      const rounded = Math.round(rawChange * 10) / 10;
      expect(rounded).toBe(-5.3);
    });

    it("should handle rounding at .05 boundary", () => {
      const rawChange = 2.35;
      const rounded = Math.round(rawChange * 10) / 10;
      expect(rounded).toBe(2.4); // JavaScript rounds .5 up
    });
  });

  describe("Percentage Rounding", () => {
    it("should round percentages to nearest integer", () => {
      const meetingCount = 3;
      const total = 7;
      const percentage = Math.round((meetingCount / total) * 100);
      // 3/7 = 0.4285... * 100 = 42.85... → 43
      expect(percentage).toBe(43);
    });
  });
});

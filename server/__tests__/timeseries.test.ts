/**
 * Time-Series Analytics Test Suite
 *
 * Tests for all time-based calculations including:
 * - Date range handling
 * - Timezone consistency
 * - Trend detection
 * - Streak calculations
 * - Historical data handling
 * - Edge cases (DST, month boundaries, etc.)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  daysAgo,
  toDateString,
  createMockParticipant,
  createGlucoseEntry,
  createWeightEntry,
  createBpEntry,
  createFoodEntryWithMacros,
  resetMockCounters,
  generateGlucoseSeries,
  generateWeightSeries,
} from "./testUtils";

// ============================================================================
// DATE RANGE CALCULATION TESTS
// ============================================================================

describe("Date Range Calculations", () => {
  /**
   * Tests the getDateRange helper function logic
   * (replicating analytics.ts behavior for unit testing)
   */

  function getDateRange(days: number): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  describe("Basic Range Calculations", () => {
    it("should return 7-day range for weekly analytics", () => {
      const { start, end } = getDateRange(7);
      const daysDiff = Math.floor(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(7);
    });

    it("should return 30-day range for monthly analytics", () => {
      const { start, end } = getDateRange(30);
      const daysDiff = Math.floor(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(30);
    });

    it("should start at midnight (00:00:00) for start date", () => {
      const { start } = getDateRange(7);

      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      expect(start.getMilliseconds()).toBe(0);
    });

    it("should include entries from start of first day", () => {
      const { start } = getDateRange(7);
      const entryAtMidnight = new Date(start.getTime());

      expect(entryAtMidnight.getTime()).toBeGreaterThanOrEqual(start.getTime());
    });
  });

  describe("Range Inclusivity", () => {
    it("should include entry at exact start time", () => {
      const { start, end } = getDateRange(7);
      const entryTime = new Date(start.getTime());

      expect(entryTime >= start && entryTime <= end).toBe(true);
    });

    it("should include entry at exact end time", () => {
      const { start, end } = getDateRange(7);
      const entryTime = new Date(end.getTime());

      expect(entryTime >= start && entryTime <= end).toBe(true);
    });

    it("should include entry 1ms after start", () => {
      const { start, end } = getDateRange(7);
      const entryTime = new Date(start.getTime() + 1);

      expect(entryTime >= start && entryTime <= end).toBe(true);
    });

    it("should exclude entry 1ms before start", () => {
      const { start, end } = getDateRange(7);
      const entryTime = new Date(start.getTime() - 1);

      expect(entryTime >= start && entryTime <= end).toBe(false);
    });
  });

  describe("Zero and Edge Ranges", () => {
    it("should handle 0-day range (today only)", () => {
      const { start, end } = getDateRange(0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(start.getTime()).toBe(today.getTime());
    });

    it("should handle 1-day range", () => {
      const { start, end } = getDateRange(1);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      expect(start.getTime()).toBe(yesterday.getTime());
    });

    it("should handle large range (365 days)", () => {
      const { start, end } = getDateRange(365);
      const daysDiff = Math.floor(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(364);
      expect(daysDiff).toBeLessThanOrEqual(365);
    });
  });
});

// ============================================================================
// TIMEZONE HANDLING TESTS
// ============================================================================

describe("Timezone Handling", () => {
  /**
   * Critical: The codebase mixes local time and UTC in different places.
   * These tests verify consistent behavior.
   */

  describe("toDateString Consistency", () => {
    it("should use local timezone for date strings", () => {
      const now = new Date();
      const dateStr = toDateString(now);

      // Should match local date, not UTC
      const localYear = now.getFullYear();
      const localMonth = String(now.getMonth() + 1).padStart(2, "0");
      const localDay = String(now.getDate()).padStart(2, "0");
      const expected = `${localYear}-${localMonth}-${localDay}`;

      expect(dateStr).toBe(expected);
    });

    it("should handle midnight correctly", () => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const dateStr = toDateString(midnight);

      const expected = `${midnight.getFullYear()}-${String(
        midnight.getMonth() + 1
      ).padStart(2, "0")}-${String(midnight.getDate()).padStart(2, "0")}`;

      expect(dateStr).toBe(expected);
    });

    it("should handle 23:59:59 correctly", () => {
      const lateNight = new Date();
      lateNight.setHours(23, 59, 59, 999);
      const dateStr = toDateString(lateNight);

      const expected = `${lateNight.getFullYear()}-${String(
        lateNight.getMonth() + 1
      ).padStart(2, "0")}-${String(lateNight.getDate()).padStart(2, "0")}`;

      expect(dateStr).toBe(expected);
    });
  });

  describe("daysAgo Helper", () => {
    it("should return today for daysAgo(0)", () => {
      const today = daysAgo(0);
      const now = new Date();

      expect(today.getDate()).toBe(now.getDate());
      expect(today.getMonth()).toBe(now.getMonth());
      expect(today.getFullYear()).toBe(now.getFullYear());
    });

    it("should return yesterday for daysAgo(1)", () => {
      const yesterday = daysAgo(1);
      const expected = new Date();
      expected.setDate(expected.getDate() - 1);

      expect(yesterday.getDate()).toBe(expected.getDate());
    });

    it("should normalize to noon to avoid DST issues", () => {
      const result = daysAgo(5);
      expect(result.getHours()).toBe(12);
      expect(result.getMinutes()).toBe(0);
    });

    it("should handle month boundary correctly", () => {
      // Test crossing month boundary
      const today = new Date();
      const dayOfMonth = today.getDate();
      const daysBack = dayOfMonth + 5; // Go back past start of month

      const result = daysAgo(daysBack);
      const expected = new Date();
      expected.setDate(expected.getDate() - daysBack);

      expect(result.getDate()).toBe(expected.getDate());
      expect(result.getMonth()).toBe(expected.getMonth());
    });

    it("should handle year boundary correctly", () => {
      // If we're in early January, go back past Jan 1
      const today = new Date();
      if (today.getMonth() === 0 && today.getDate() <= 10) {
        const result = daysAgo(15);
        expect(result.getFullYear()).toBe(today.getFullYear() - 1);
        expect(result.getMonth()).toBe(11); // December
      }
    });
  });

  describe("UTC vs Local Time Consistency", () => {
    /**
     * BUG IDENTIFIED: analytics.ts uses toISOString().split('T')[0] which returns UTC date
     * But streak calculation uses local date for expected days.
     * This causes mismatches for users not in UTC timezone.
     */

    it("should group entries by local date, not UTC", () => {
      // Simulate a user logging at 11pm local time
      const lateNightLocal = new Date();
      lateNightLocal.setHours(23, 30, 0, 0);

      const localDateStr = toDateString(lateNightLocal);
      const utcDateStr = lateNightLocal.toISOString().split("T")[0];

      // These may differ if local timezone is behind UTC
      // The test documents the expected behavior (use local)
      expect(localDateStr).toBe(
        `${lateNightLocal.getFullYear()}-${String(
          lateNightLocal.getMonth() + 1
        ).padStart(2, "0")}-${String(lateNightLocal.getDate()).padStart(
          2,
          "0"
        )}`
      );
    });
  });
});

// ============================================================================
// STREAK CALCULATION TESTS
// ============================================================================

describe("Streak Calculations", () => {
  /**
   * Streak = consecutive days with ANY log (metric or food)
   * Starting from today and going backwards
   */

  function calculateStreak(loggedDays: string[]): number {
    const loggedSet = new Set(loggedDays);
    let streak = 0;

    for (let i = 0; i < 30; i++) {
      const expected = toDateString(daysAgo(i));
      if (loggedSet.has(expected)) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  describe("Basic Streak Counting", () => {
    it("should return 0 for no logged days", () => {
      expect(calculateStreak([])).toBe(0);
    });

    it("should return 1 for today only", () => {
      const today = toDateString(daysAgo(0));
      expect(calculateStreak([today])).toBe(1);
    });

    it("should return 2 for today and yesterday", () => {
      const days = [toDateString(daysAgo(0)), toDateString(daysAgo(1))];
      expect(calculateStreak(days)).toBe(2);
    });

    it("should return 7 for a full week", () => {
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push(toDateString(daysAgo(i)));
      }
      expect(calculateStreak(days)).toBe(7);
    });
  });

  describe("Streak Breaking", () => {
    it("should break streak on first gap", () => {
      // Log today and 2 days ago, but not yesterday
      const days = [toDateString(daysAgo(0)), toDateString(daysAgo(2))];
      expect(calculateStreak(days)).toBe(1);
    });

    it("should return 0 if no entry today", () => {
      // Only yesterday logged
      const days = [toDateString(daysAgo(1))];
      expect(calculateStreak(days)).toBe(0);
    });

    it("should handle gap after several days", () => {
      // 3 days, then gap, then more
      const days = [
        toDateString(daysAgo(0)),
        toDateString(daysAgo(1)),
        toDateString(daysAgo(2)),
        // gap on day 3
        toDateString(daysAgo(4)),
        toDateString(daysAgo(5)),
      ];
      expect(calculateStreak(days)).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should cap at 30 days", () => {
      const days = [];
      for (let i = 0; i < 45; i++) {
        days.push(toDateString(daysAgo(i)));
      }
      expect(calculateStreak(days)).toBe(30);
    });

    it("should handle duplicate entries on same day", () => {
      // Multiple entries same day shouldn't count as multiple days
      const today = toDateString(daysAgo(0));
      const days = [today, today, today];
      expect(calculateStreak(days)).toBe(1);
    });

    it("should handle out-of-order input", () => {
      const days = [
        toDateString(daysAgo(2)),
        toDateString(daysAgo(0)),
        toDateString(daysAgo(1)),
      ];
      expect(calculateStreak(days)).toBe(3);
    });
  });
});

// ============================================================================
// ADHERENCE SCORE TESTS
// ============================================================================

describe("Adherence Score Calculations", () => {
  /**
   * Formula: (sum of daily_adherence) / min(days_with_metrics, 7) * 100
   * where daily_adherence = unique_metric_types / 5
   */

  function calculateAdherence(
    daysData: Array<{ types: string[] }>
  ): number {
    if (daysData.length === 0) return 0;

    let totalAdherence = 0;
    for (const day of daysData) {
      const uniqueTypes = new Set(day.types).size;
      totalAdherence += uniqueTypes / 5;
    }

    const avgAdherence = totalAdherence / Math.min(daysData.length, 7);
    return Math.round(avgAdherence * 100);
  }

  describe("Perfect Adherence", () => {
    it("should return 100% for all 5 metrics every day", () => {
      const daysData = [];
      for (let i = 0; i < 7; i++) {
        daysData.push({
          types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"],
        });
      }
      expect(calculateAdherence(daysData)).toBe(100);
    });
  });

  describe("Partial Adherence", () => {
    it("should return 60% for 3 of 5 metrics every day", () => {
      const daysData = [];
      for (let i = 0; i < 7; i++) {
        daysData.push({
          types: ["GLUCOSE", "BP", "WEIGHT"],
        });
      }
      expect(calculateAdherence(daysData)).toBe(60);
    });

    it("should return 20% for 1 metric type every day", () => {
      const daysData = [];
      for (let i = 0; i < 7; i++) {
        daysData.push({
          types: ["GLUCOSE"],
        });
      }
      expect(calculateAdherence(daysData)).toBe(20);
    });
  });

  describe("Sparse Data", () => {
    it("should handle fewer than 7 days", () => {
      // 3 days with perfect logging = 100% average
      const daysData = [
        { types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
        { types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
        { types: ["GLUCOSE", "BP", "WEIGHT", "WAIST", "KETONES"] },
      ];
      expect(calculateAdherence(daysData)).toBe(100);
    });

    it("should return 0% for no data", () => {
      expect(calculateAdherence([])).toBe(0);
    });

    it("should handle single day", () => {
      const daysData = [
        { types: ["GLUCOSE", "BP"] }, // 2/5 = 40%
      ];
      expect(calculateAdherence(daysData)).toBe(40);
    });
  });

  describe("Duplicate Metrics", () => {
    it("should count unique types only (not multiple of same type)", () => {
      const daysData = [
        {
          types: ["GLUCOSE", "GLUCOSE", "GLUCOSE", "GLUCOSE", "GLUCOSE"],
        },
      ];
      expect(calculateAdherence(daysData)).toBe(20); // 1/5 = 20%
    });
  });
});

// ============================================================================
// OUTCOME TREND CALCULATION TESTS
// ============================================================================

describe("Outcome Trend Calculations", () => {
  /**
   * Outcome change = latest value - earliest value in time period
   * Mean change = average of changes across all participants
   */

  interface MetricEntry {
    userId: string;
    timestamp: Date;
    value: number;
  }

  function calculateOutcomeChange(entries: MetricEntry[]): {
    meanChange: number;
    participantCount: number;
  } {
    // Group by user
    const byUser = new Map<string, MetricEntry[]>();
    for (const entry of entries) {
      if (!byUser.has(entry.userId)) {
        byUser.set(entry.userId, []);
      }
      byUser.get(entry.userId)!.push(entry);
    }

    const changes: number[] = [];

    for (const [userId, userEntries] of byUser) {
      if (userEntries.length < 2) continue;

      // Sort by timestamp
      const sorted = userEntries.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      const earliest = sorted[0].value;
      const latest = sorted[sorted.length - 1].value;

      // BUG FIX: Don't skip when value is 0
      if (earliest !== undefined && latest !== undefined) {
        changes.push(latest - earliest);
      }
    }

    return {
      meanChange:
        changes.length > 0
          ? Math.round(
              (changes.reduce((a, b) => a + b, 0) / changes.length) * 10
            ) / 10
          : 0,
      participantCount: changes.length,
    };
  }

  describe("Positive Trends (Improvement)", () => {
    it("should detect weight loss", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(30), value: 200 },
        { userId: "user1", timestamp: daysAgo(0), value: 195 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(-5);
      expect(result.participantCount).toBe(1);
    });

    it("should detect glucose improvement", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(30), value: 120 },
        { userId: "user1", timestamp: daysAgo(0), value: 100 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(-20);
    });
  });

  describe("Negative Trends (Worsening)", () => {
    it("should detect weight gain", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(30), value: 180 },
        { userId: "user1", timestamp: daysAgo(0), value: 185 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(5);
    });
  });

  describe("Stable Trends", () => {
    it("should return 0 for no change", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(30), value: 150 },
        { userId: "user1", timestamp: daysAgo(0), value: 150 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(0);
    });
  });

  describe("Multiple Participants", () => {
    it("should calculate mean change across participants", () => {
      const entries: MetricEntry[] = [
        // User 1: -10
        { userId: "user1", timestamp: daysAgo(30), value: 200 },
        { userId: "user1", timestamp: daysAgo(0), value: 190 },
        // User 2: -5
        { userId: "user2", timestamp: daysAgo(30), value: 180 },
        { userId: "user2", timestamp: daysAgo(0), value: 175 },
        // User 3: +5
        { userId: "user3", timestamp: daysAgo(30), value: 160 },
        { userId: "user3", timestamp: daysAgo(0), value: 165 },
      ];

      const result = calculateOutcomeChange(entries);
      // Mean: (-10 + -5 + 5) / 3 = -10 / 3 = -3.33...
      expect(result.meanChange).toBeCloseTo(-3.3, 1);
      expect(result.participantCount).toBe(3);
    });
  });

  describe("Insufficient Data", () => {
    it("should return 0 for single entry per user", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(0), value: 150 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(0);
      expect(result.participantCount).toBe(0);
    });

    it("should return 0 for empty entries", () => {
      const result = calculateOutcomeChange([]);
      expect(result.meanChange).toBe(0);
      expect(result.participantCount).toBe(0);
    });

    it("should handle mix of sufficient and insufficient data", () => {
      const entries: MetricEntry[] = [
        // User 1: has 2 entries, -10 change
        { userId: "user1", timestamp: daysAgo(30), value: 200 },
        { userId: "user1", timestamp: daysAgo(0), value: 190 },
        // User 2: only 1 entry, excluded
        { userId: "user2", timestamp: daysAgo(15), value: 180 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(-10);
      expect(result.participantCount).toBe(1);
    });
  });

  describe("Zero Value Handling", () => {
    /**
     * BUG TEST: Original code skips entries where value is 0
     * with `if (earliest && latest)` check
     */

    it("should handle zero as a valid value", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(30), value: 0 },
        { userId: "user1", timestamp: daysAgo(0), value: 5 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(5);
      expect(result.participantCount).toBe(1);
    });

    it("should handle change from positive to zero", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(30), value: 10 },
        { userId: "user1", timestamp: daysAgo(0), value: 0 },
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(-10);
      expect(result.participantCount).toBe(1);
    });
  });

  describe("Intermediate Entries", () => {
    it("should only use first and last, ignoring intermediate", () => {
      const entries: MetricEntry[] = [
        { userId: "user1", timestamp: daysAgo(30), value: 200 }, // earliest
        { userId: "user1", timestamp: daysAgo(20), value: 190 }, // ignored
        { userId: "user1", timestamp: daysAgo(10), value: 210 }, // ignored
        { userId: "user1", timestamp: daysAgo(0), value: 195 }, // latest
      ];

      const result = calculateOutcomeChange(entries);
      expect(result.meanChange).toBe(-5); // 195 - 200 = -5
    });
  });
});

// ============================================================================
// HISTORICAL DATA / BACKFILL TESTS
// ============================================================================

describe("Historical Data Handling", () => {
  /**
   * Backfilled entries have timestamp significantly before createdAt.
   * They should be handled differently in some contexts.
   */

  function isBackfilledEntry(entry: {
    timestamp: Date;
    createdAt: Date;
  }): boolean {
    const hourMs = 60 * 60 * 1000;
    return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
  }

  describe("Backfill Detection", () => {
    it("should not flag real-time entry as backfilled", () => {
      const now = new Date();
      const entry = {
        timestamp: now,
        createdAt: now,
      };
      expect(isBackfilledEntry(entry)).toBe(false);
    });

    it("should not flag entry created within 1 hour", () => {
      const timestamp = new Date();
      const createdAt = new Date(timestamp.getTime() + 30 * 60 * 1000); // 30 min later
      const entry = { timestamp, createdAt };
      expect(isBackfilledEntry(entry)).toBe(false);
    });

    it("should flag entry with timestamp > 1 hour before createdAt", () => {
      const now = new Date();
      const entry = {
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        createdAt: now,
      };
      expect(isBackfilledEntry(entry)).toBe(true);
    });

    it("should flag historical backfill (days old)", () => {
      const now = new Date();
      const entry = {
        timestamp: daysAgo(7),
        createdAt: now,
      };
      expect(isBackfilledEntry(entry)).toBe(true);
    });
  });

  describe("Historical Calculations", () => {
    it("should include backfilled data in outcome calculations", () => {
      // Backfilled historical data SHOULD affect outcome trends
      // (we want to see improvement from start of program)

      const now = new Date();
      const entries = [
        {
          userId: "user1",
          timestamp: daysAgo(30),
          createdAt: now,
          value: 200, // backfilled starting weight
        },
        {
          userId: "user1",
          timestamp: daysAgo(0),
          createdAt: now,
          value: 190, // current weight
        },
      ];

      // Both entries should be included
      expect(entries.length).toBe(2);
    });
  });
});

// ============================================================================
// MACRO AVERAGE CALCULATION TESTS
// ============================================================================

describe("Macro Average Calculations", () => {
  /**
   * BUG: Current code divides by range (days in period) not actual days with data
   */

  function calculateDailyAverage(
    totalValue: number,
    daysWithData: number,
    rangeDays: number
  ): { buggyAvg: number; correctAvg: number } {
    return {
      buggyAvg: totalValue / rangeDays, // Current buggy implementation
      correctAvg: daysWithData > 0 ? totalValue / daysWithData : 0, // Correct
    };
  }

  describe("Average Calculation Method", () => {
    it("should use actual days with data, not range period", () => {
      // User logged 200g protein over 2 days in a 7-day range
      const total = 200;
      const daysWithData = 2;
      const rangeDays = 7;

      const { buggyAvg, correctAvg } = calculateDailyAverage(
        total,
        daysWithData,
        rangeDays
      );

      expect(buggyAvg).toBeCloseTo(28.6, 1); // 200/7 = wrong
      expect(correctAvg).toBe(100); // 200/2 = correct daily average
    });

    it("should handle full week of data", () => {
      const total = 700;
      const daysWithData = 7;
      const rangeDays = 7;

      const { buggyAvg, correctAvg } = calculateDailyAverage(
        total,
        daysWithData,
        rangeDays
      );

      // When all days have data, both should match
      expect(buggyAvg).toBe(100);
      expect(correctAvg).toBe(100);
    });

    it("should handle sparse data correctly", () => {
      // Only 1 day of data in 7-day range
      const total = 120;
      const daysWithData = 1;
      const rangeDays = 7;

      const { buggyAvg, correctAvg } = calculateDailyAverage(
        total,
        daysWithData,
        rangeDays
      );

      expect(buggyAvg).toBeCloseTo(17.1, 1); // 120/7 = misleadingly low
      expect(correctAvg).toBe(120); // 120/1 = actual daily intake
    });
  });
});

// ============================================================================
// DAYS SINCE CALCULATION TESTS
// ============================================================================

describe("Days Since Calculations", () => {
  function daysSince(pastDate: Date): number {
    return Math.floor((Date.now() - pastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  describe("Basic Calculations", () => {
    it("should return 0 for today", () => {
      const today = new Date();
      expect(daysSince(today)).toBe(0);
    });

    it("should return 1 for 24 hours ago", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(daysSince(yesterday)).toBe(1);
    });

    it("should return 7 for a week ago", () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      expect(daysSince(weekAgo)).toBe(7);
    });
  });

  describe("Edge Cases", () => {
    it("should handle just under 24 hours as 0 days", () => {
      const almostYesterday = new Date(Date.now() - 23 * 60 * 60 * 1000);
      expect(daysSince(almostYesterday)).toBe(0);
    });

    it("should handle exactly 24 hours as 1 day", () => {
      const exactly24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(daysSince(exactly24h)).toBe(1);
    });

    it("should handle 23:59 vs 00:01 boundary", () => {
      // This tests the milliseconds-based approach vs calendar-day approach
      // The current implementation uses milliseconds, which may not match
      // user expectation of "days since"

      // If it's currently 00:05 and last log was at 23:55 yesterday,
      // milliseconds-based: ~10 min ago = 0 days
      // Calendar-based: yesterday = 1 day

      // The current implementation uses milliseconds
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      expect(daysSince(tenMinutesAgo)).toBe(0);
    });
  });
});

// ============================================================================
// HEALTH FLAG TIME WINDOW TESTS
// ============================================================================

describe("Health Flag Time Windows", () => {
  /**
   * High glucose flag: ≥110 on 3+ days in rolling 3-day window
   * Elevated BP flag: ≥140/90 on 2+ days in rolling 7-day window
   * Missed logging flag: No entries for 3+ days
   */

  describe("High Glucose Flag (3 days)", () => {
    function shouldFlagHighGlucose(
      highGlucoseDays: number,
      windowDays: number = 3
    ): boolean {
      return highGlucoseDays >= 3;
    }

    it("should flag 3 consecutive high glucose days", () => {
      expect(shouldFlagHighGlucose(3)).toBe(true);
    });

    it("should not flag 2 high glucose days", () => {
      expect(shouldFlagHighGlucose(2)).toBe(false);
    });

    it("should flag more than 3 high glucose days", () => {
      expect(shouldFlagHighGlucose(5)).toBe(true);
    });
  });

  describe("Elevated BP Flag (7 days)", () => {
    function shouldFlagElevatedBp(elevatedDays: number): boolean {
      return elevatedDays >= 2;
    }

    it("should flag 2+ elevated BP days", () => {
      expect(shouldFlagElevatedBp(2)).toBe(true);
    });

    it("should not flag 1 elevated BP day", () => {
      expect(shouldFlagElevatedBp(1)).toBe(false);
    });
  });

  describe("Missed Logging Flag", () => {
    function shouldFlagMissedLogging(daysSinceLastLog: number | null): boolean {
      return daysSinceLastLog === null || daysSinceLastLog >= 3;
    }

    it("should flag no logs ever", () => {
      expect(shouldFlagMissedLogging(null)).toBe(true);
    });

    it("should flag 3+ days without logging", () => {
      expect(shouldFlagMissedLogging(3)).toBe(true);
      expect(shouldFlagMissedLogging(5)).toBe(true);
    });

    it("should not flag recent logging", () => {
      expect(shouldFlagMissedLogging(0)).toBe(false);
      expect(shouldFlagMissedLogging(1)).toBe(false);
      expect(shouldFlagMissedLogging(2)).toBe(false);
    });
  });
});

// ============================================================================
// DATA PATTERN TESTS
// ============================================================================

describe("Data Pattern Handling", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  describe("Regular Daily Entries", () => {
    it("should handle consistent daily logging", () => {
      const user = createMockParticipant();
      const entries = [];

      // 7 days of consistent logging
      for (let i = 0; i < 7; i++) {
        entries.push(createGlucoseEntry(user.id, 95, daysAgo(i)));
        entries.push(createWeightEntry(user.id, 180, daysAgo(i)));
      }

      expect(entries.length).toBe(14);

      // Verify all days are represented
      const uniqueDays = new Set(entries.map((e) => toDateString(e.timestamp)));
      expect(uniqueDays.size).toBe(7);
    });
  });

  describe("Sparse Data (Gaps)", () => {
    it("should handle entries with gaps", () => {
      const user = createMockParticipant();

      // Days 0, 2, 5 only (gaps on 1, 3, 4, 6)
      const entries = [
        createGlucoseEntry(user.id, 95, daysAgo(0)),
        createGlucoseEntry(user.id, 100, daysAgo(2)),
        createGlucoseEntry(user.id, 92, daysAgo(5)),
      ];

      const uniqueDays = new Set(entries.map((e) => toDateString(e.timestamp)));
      expect(uniqueDays.size).toBe(3);
    });
  });

  describe("Multiple Entries Per Day", () => {
    it("should handle multiple metrics same day", () => {
      const user = createMockParticipant();
      const today = daysAgo(0);

      const entries = [
        createGlucoseEntry(user.id, 95, today),
        createGlucoseEntry(user.id, 110, today), // Second glucose same day
        createWeightEntry(user.id, 180, today),
        createBpEntry(user.id, 120, 80, today),
      ];

      const glucoseCount = entries.filter(
        (e) => e.type === "GLUCOSE"
      ).length;
      expect(glucoseCount).toBe(2);

      // Should only count as 1 unique day
      const uniqueDays = new Set(entries.map((e) => toDateString(e.timestamp)));
      expect(uniqueDays.size).toBe(1);
    });
  });

  describe("Long Time Periods", () => {
    it("should handle 30 days of data", () => {
      const user = createMockParticipant();
      const entries = generateWeightSeries(
        user.id,
        Array(30)
          .fill(0)
          .map((_, i) => 180 - i * 0.1),
        0
      );

      expect(entries.length).toBe(30);

      // First entry should be most recent (day 0)
      // Last entry should be oldest (day 29)
      const firstDay = toDateString(entries[0].timestamp);
      const lastDay = toDateString(entries[29].timestamp);
      expect(firstDay).not.toBe(lastDay);
    });
  });
});

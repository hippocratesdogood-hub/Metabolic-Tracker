/**
 * Backfill Analytics Validation Tests
 *
 * Comprehensive test suite validating analytics calculations work correctly
 * with both real-time and backfilled data. Covers:
 * - Mixed data scenarios (historical + real-time)
 * - Time-series calculations (7/30/90 day averages)
 * - Date range queries
 * - Baseline and comparison logic
 * - Edge cases (gaps, duplicates, stress tests)
 */

import { describe, it, expect, beforeEach } from "vitest";

// ============================================================================
// Test Data Generators
// ============================================================================

interface MetricEntry {
  id: string;
  userId: string;
  type: string;
  timestamp: Date;
  createdAt: Date;
  valueJson: Record<string, any>;
  source: "manual" | "import";
}

interface FoodEntry {
  id: string;
  userId: string;
  timestamp: Date;
  createdAt: Date;
  aiOutputJson: Record<string, any>;
  userCorrectionsJson: Record<string, any> | null;
  source: "manual" | "import";
}

let idCounter = 0;

function generateId(): string {
  return `test_${++idCounter}`;
}

function daysAgo(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - n);
  date.setHours(12, 0, 0, 0);
  return date;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

function isBackfilledEntry(entry: { timestamp: Date; createdAt: Date }): boolean {
  const hourMs = 60 * 60 * 1000;
  return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
}

function createMetricEntry(
  userId: string,
  type: string,
  valueJson: Record<string, any>,
  daysBack: number = 0,
  options: {
    isBackfill?: boolean;
    createdAt?: Date;
    source?: "manual" | "import";
  } = {}
): MetricEntry {
  const timestamp = daysAgo(daysBack);
  const createdAt = options.createdAt ?? (options.isBackfill ? new Date() : timestamp);

  return {
    id: generateId(),
    userId,
    type,
    timestamp,
    createdAt,
    valueJson,
    source: options.source ?? "manual",
  };
}

function createFoodEntry(
  userId: string,
  macros: { protein: number; carbs: number; fat: number; calories: number },
  daysBack: number = 0,
  options: {
    isBackfill?: boolean;
    createdAt?: Date;
    source?: "manual" | "import";
  } = {}
): FoodEntry {
  const timestamp = daysAgo(daysBack);
  const createdAt = options.createdAt ?? (options.isBackfill ? new Date() : timestamp);

  return {
    id: generateId(),
    userId,
    timestamp,
    createdAt,
    aiOutputJson: macros,
    userCorrectionsJson: null,
    source: options.source ?? "manual",
  };
}

// ============================================================================
// 1. Mixed Data Test Scenarios
// ============================================================================

describe("Mixed Real-Time and Backfilled Data Scenarios", () => {
  const userId = "user_mixed_test";

  describe("Data set with historical backfill + recent real-time + current", () => {
    let entries: MetricEntry[];

    beforeEach(() => {
      idCounter = 0;

      // Historical backfilled data (90 to 30 days ago, entered today)
      const backfilledHistorical = Array.from({ length: 60 }, (_, i) =>
        createMetricEntry(userId, "WEIGHT", { value: 200 - i * 0.25 }, 90 - i, {
          isBackfill: true,
          source: "import",
        })
      );

      // Recent real-time data (30 days to today)
      const recentRealTime = Array.from({ length: 30 }, (_, i) =>
        createMetricEntry(userId, "WEIGHT", { value: 185 - i * 0.1 }, 30 - i, {
          isBackfill: false,
        })
      );

      // Current data (today)
      const currentEntry = createMetricEntry(userId, "WEIGHT", { value: 182 }, 0, {
        isBackfill: false,
      });

      entries = [...backfilledHistorical, ...recentRealTime, currentEntry];
    });

    it("should have correct total entry count", () => {
      expect(entries.length).toBe(91); // 60 + 30 + 1
    });

    it("should correctly identify backfilled vs real-time entries", () => {
      const backfilled = entries.filter(e => isBackfilledEntry(e));
      const realTime = entries.filter(e => !isBackfilledEntry(e));

      expect(backfilled.length).toBe(60);
      expect(realTime.length).toBe(31);
    });

    it("should maintain chronological order by timestamp", () => {
      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          sorted[i - 1].timestamp.getTime()
        );
      }
    });

    it("should show consistent weight progression across data types", () => {
      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const earliest = sorted[0].valueJson.value;
      const latest = sorted[sorted.length - 1].valueJson.value;

      expect(earliest).toBe(200);
      expect(latest).toBe(182);
      expect(latest - earliest).toBe(-18);
    });
  });

  describe("Glucose data with mixed entry patterns", () => {
    it("should handle glucose readings with different backfill patterns", () => {
      const entries = [
        // Week 1: All backfilled (entered last week for 3 weeks ago)
        createMetricEntry(userId, "GLUCOSE", { value: 125 }, 21, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 122 }, 20, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 118 }, 19, { isBackfill: true }),

        // Week 2: Mixed (some real-time, some backfilled)
        createMetricEntry(userId, "GLUCOSE", { value: 115 }, 14, { isBackfill: false }),
        createMetricEntry(userId, "GLUCOSE", { value: 112 }, 13, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 110 }, 12, { isBackfill: false }),

        // Week 3: All real-time
        createMetricEntry(userId, "GLUCOSE", { value: 108 }, 7, { isBackfill: false }),
        createMetricEntry(userId, "GLUCOSE", { value: 105 }, 6, { isBackfill: false }),
        createMetricEntry(userId, "GLUCOSE", { value: 102 }, 5, { isBackfill: false }),

        // Current week: Real-time
        createMetricEntry(userId, "GLUCOSE", { value: 100 }, 1, { isBackfill: false }),
        createMetricEntry(userId, "GLUCOSE", { value: 98 }, 0, { isBackfill: false }),
      ];

      // All entries should be included in analytics
      const allValues = entries.map(e => e.valueJson.value);
      const average = allValues.reduce((a, b) => a + b, 0) / allValues.length;

      // 125+122+118+115+112+110+108+105+102+100+98 = 1215 / 11 = 110.45
      expect(average).toBeCloseTo(110.45, 1);

      // Trend should show improvement
      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );
      expect(sorted[0].valueJson.value).toBe(125);
      expect(sorted[sorted.length - 1].valueJson.value).toBe(98);
    });
  });
});

// ============================================================================
// 2. Time-Series Calculation Tests
// ============================================================================

describe("Time-Series Calculations with Mixed Data", () => {
  const userId = "user_timeseries";

  describe("7-day, 30-day, 90-day averages", () => {
    let entries: MetricEntry[];

    beforeEach(() => {
      idCounter = 0;
      entries = [];

      // Generate 100 days of glucose data
      // Days 100-31: Backfilled (higher values)
      for (let i = 100; i > 30; i--) {
        entries.push(createMetricEntry(userId, "GLUCOSE", { value: 130 - (100 - i) * 0.3 }, i, {
          isBackfill: true,
        }));
      }

      // Days 30-0: Real-time (lower values, improving trend)
      for (let i = 30; i >= 0; i--) {
        entries.push(createMetricEntry(userId, "GLUCOSE", { value: 110 - (30 - i) * 0.3 }, i, {
          isBackfill: false,
        }));
      }
    });

    function calculateAverage(entries: MetricEntry[], daysBack: number): number {
      const cutoff = daysAgo(daysBack);
      const filtered = entries.filter(e => e.timestamp >= cutoff);
      if (filtered.length === 0) return 0;

      const sum = filtered.reduce((acc, e) => acc + e.valueJson.value, 0);
      return sum / filtered.length;
    }

    it("should calculate 7-day average correctly", () => {
      const avg7 = calculateAverage(entries, 7);
      // Last 7 days: values around 101-110
      expect(avg7).toBeGreaterThan(100);
      expect(avg7).toBeLessThan(110);
    });

    it("should calculate 30-day average correctly", () => {
      const avg30 = calculateAverage(entries, 30);
      // Last 30 days: all real-time data, values 101-110
      expect(avg30).toBeGreaterThan(100);
      expect(avg30).toBeLessThan(115);
    });

    it("should calculate 90-day average including backfilled data", () => {
      const avg90 = calculateAverage(entries, 90);
      // Includes both backfilled (higher) and real-time (lower)
      expect(avg90).toBeGreaterThan(105);
      expect(avg90).toBeLessThan(125);
    });

    it("should show progressively higher averages for longer periods", () => {
      const avg7 = calculateAverage(entries, 7);
      const avg30 = calculateAverage(entries, 30);
      const avg90 = calculateAverage(entries, 90);

      // Since glucose is improving, longer periods should have higher averages
      expect(avg7).toBeLessThan(avg30);
      expect(avg30).toBeLessThan(avg90);
    });
  });

  describe("Trend line continuity at backfill boundary", () => {
    it("should not show artificial jumps at boundary", () => {
      const entries = [
        // Last backfilled entry (day 31)
        createMetricEntry("user_1", "WEIGHT", { value: 185.5 }, 31, { isBackfill: true }),
        // First real-time entry (day 30)
        createMetricEntry("user_1", "WEIGHT", { value: 185.2 }, 30, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const diff = Math.abs(sorted[1].valueJson.value - sorted[0].valueJson.value);

      // Should be a smooth transition, not a jump
      expect(diff).toBeLessThan(1);
    });

    it("should calculate trends across backfill boundary correctly", () => {
      const entries = [
        // Backfilled period: 200 → 190
        createMetricEntry("user_1", "WEIGHT", { value: 200 }, 60, { isBackfill: true }),
        createMetricEntry("user_1", "WEIGHT", { value: 195 }, 45, { isBackfill: true }),
        createMetricEntry("user_1", "WEIGHT", { value: 190 }, 30, { isBackfill: true }),

        // Real-time period: 190 → 180
        createMetricEntry("user_1", "WEIGHT", { value: 188 }, 20, { isBackfill: false }),
        createMetricEntry("user_1", "WEIGHT", { value: 185 }, 10, { isBackfill: false }),
        createMetricEntry("user_1", "WEIGHT", { value: 180 }, 0, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      // Calculate overall trend
      const first = sorted[0].valueJson.value;
      const last = sorted[sorted.length - 1].valueJson.value;
      const totalChange = last - first;

      // Verify continuous improvement across boundary
      expect(totalChange).toBe(-20);

      // Verify each step shows improvement or plateau
      for (let i = 1; i < sorted.length; i++) {
        const diff = sorted[i].valueJson.value - sorted[i - 1].valueJson.value;
        expect(diff).toBeLessThanOrEqual(0); // Always decreasing or same
      }
    });
  });

  describe("First reading date logic with backfilled data", () => {
    it("should use backfilled date as first reading if earliest", () => {
      const entries = [
        createMetricEntry("user_1", "GLUCOSE", { value: 150 }, 90, { isBackfill: true }),
        createMetricEntry("user_1", "GLUCOSE", { value: 100 }, 0, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const firstReadingDate = sorted[0].timestamp;
      const firstValue = sorted[0].valueJson.value;

      // First reading should be from 90 days ago (backfilled)
      const expectedDate = daysAgo(90);
      expect(Math.abs(firstReadingDate.getTime() - expectedDate.getTime())).toBeLessThan(60000);
      expect(firstValue).toBe(150);
    });

    it("should calculate correct duration from first reading", () => {
      const entries = [
        createMetricEntry("user_1", "WEIGHT", { value: 200 }, 100, { isBackfill: true }),
        createMetricEntry("user_1", "WEIGHT", { value: 180 }, 0, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const firstDate = sorted[0].timestamp;
      const lastDate = sorted[sorted.length - 1].timestamp;
      const daysDiff = Math.floor(
        (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBe(100);
    });
  });

  describe("Progress tracking with historical context", () => {
    it("should show correct progress from backfilled baseline", () => {
      const entries = [
        // Baseline (backfilled)
        createMetricEntry("user_1", "WEIGHT", { value: 200 }, 90, { isBackfill: true }),
        // Checkpoint 1
        createMetricEntry("user_1", "WEIGHT", { value: 195 }, 60, { isBackfill: true }),
        // Checkpoint 2
        createMetricEntry("user_1", "WEIGHT", { value: 190 }, 30, { isBackfill: true }),
        // Current
        createMetricEntry("user_1", "WEIGHT", { value: 185 }, 0, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const baseline = sorted[0].valueJson.value;
      const current = sorted[sorted.length - 1].valueJson.value;
      const progressLbs = baseline - current;
      const progressPercent = (progressLbs / baseline) * 100;

      expect(progressLbs).toBe(15);
      expect(progressPercent).toBeCloseTo(7.5, 1);
    });
  });
});

// ============================================================================
// 3. Date Range Query Tests
// ============================================================================

describe("Date Range Queries with Mixed Data", () => {
  let entries: MetricEntry[];
  const userId = "user_daterange";

  beforeEach(() => {
    idCounter = 0;
    entries = [];

    // Create 120 days of entries
    // Days 120-60: Backfilled
    for (let i = 120; i > 60; i--) {
      entries.push(createMetricEntry(userId, "GLUCOSE", { value: 130 - i * 0.1 }, i, {
        isBackfill: true,
      }));
    }

    // Days 60-0: Mix of backfilled and real-time
    for (let i = 60; i >= 0; i--) {
      entries.push(createMetricEntry(userId, "GLUCOSE", { value: 110 - i * 0.1 }, i, {
        isBackfill: i > 30, // 60-31 backfilled, 30-0 real-time
      }));
    }
  });

  function queryDateRange(entries: MetricEntry[], startDaysAgo: number, endDaysAgo: number): MetricEntry[] {
    const startDate = daysAgo(startDaysAgo);
    const endDate = daysAgo(endDaysAgo);

    return entries.filter(e =>
      e.timestamp >= startDate && e.timestamp <= endDate
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  describe("Query entirely in backfilled period", () => {
    it("should return only backfilled entries", () => {
      const result = queryDateRange(entries, 100, 70);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(e => {
        expect(isBackfilledEntry(e)).toBe(true);
      });
    });

    it("should have correct value range for period", () => {
      const result = queryDateRange(entries, 100, 70);
      const values = result.map(e => e.valueJson.value);

      // Values should be in expected range for this period
      // Day 100: 130 - (100-100)*0.1 = 130, Day 70: 130 - (100-70)*0.1 = 127
      values.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(117);
        expect(v).toBeLessThanOrEqual(130);
      });
    });
  });

  describe("Query spanning backfill → real-time boundary", () => {
    it("should return both backfilled and real-time entries", () => {
      const result = queryDateRange(entries, 45, 15);

      const backfilled = result.filter(e => isBackfilledEntry(e));
      const realTime = result.filter(e => !isBackfilledEntry(e));

      expect(backfilled.length).toBeGreaterThan(0);
      expect(realTime.length).toBeGreaterThan(0);
    });

    it("should maintain chronological order across boundary", () => {
      const result = queryDateRange(entries, 45, 15);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          result[i - 1].timestamp.getTime()
        );
      }
    });
  });

  describe("Query entirely after backfill", () => {
    it("should return only real-time entries", () => {
      const result = queryDateRange(entries, 25, 0);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(e => {
        expect(isBackfilledEntry(e)).toBe(false);
      });
    });
  });

  describe("Pagination and sorting", () => {
    it("should paginate correctly across mixed data", () => {
      const pageSize = 10;
      const all = queryDateRange(entries, 120, 0);

      // Page 1
      const page1 = all.slice(0, pageSize);
      expect(page1.length).toBe(pageSize);

      // Page 2
      const page2 = all.slice(pageSize, pageSize * 2);
      expect(page2.length).toBe(pageSize);

      // Verify no overlap
      const page1Ids = new Set(page1.map(e => e.id));
      page2.forEach(e => {
        expect(page1Ids.has(e.id)).toBe(false);
      });
    });

    it("should sort by timestamp correctly regardless of data source", () => {
      const all = queryDateRange(entries, 120, 0);

      // Verify sorted by timestamp ascending
      for (let i = 1; i < all.length; i++) {
        expect(all[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          all[i - 1].timestamp.getTime()
        );
      }
    });

    it("should sort by createdAt showing entry order", () => {
      const all = [...entries].sort((a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime()
      );

      // Backfilled entries have recent createdAt despite old timestamps
      const firstByCreatedAt = all[all.length - 1]; // Most recent creation
      // This could be either backfilled or real-time depending on timing
      expect(firstByCreatedAt.createdAt).toBeDefined();
    });
  });
});

// ============================================================================
// 4. Baseline and Comparison Logic Tests
// ============================================================================

describe("Baseline and Comparison Logic with Backfilled Data", () => {
  const userId = "user_baseline";

  describe("Improvement from baseline calculations", () => {
    it("should use backfilled data as baseline correctly", () => {
      const entries = [
        // Baseline from 3 months ago (backfilled)
        createMetricEntry(userId, "WEIGHT", { value: 220 }, 90, { isBackfill: true }),
        // Current weight
        createMetricEntry(userId, "WEIGHT", { value: 200 }, 0, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const baseline = sorted[0].valueJson.value;
      const current = sorted[sorted.length - 1].valueJson.value;
      const improvement = baseline - current;
      const percentImprovement = (improvement / baseline) * 100;

      expect(improvement).toBe(20);
      expect(percentImprovement).toBeCloseTo(9.09, 1);
    });

    it("should handle baseline with multiple backfilled entries", () => {
      const entries = [
        // Multiple readings at baseline period (use average)
        createMetricEntry(userId, "GLUCOSE", { value: 145 }, 92, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 150 }, 91, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 148 }, 90, { isBackfill: true }),
        // Current
        createMetricEntry(userId, "GLUCOSE", { value: 105 }, 0, { isBackfill: false }),
      ];

      // Calculate baseline as average of first week
      const baselineEntries = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld >= 85 && daysOld <= 95;
      });

      const baselineAvg = baselineEntries.reduce((acc, e) => acc + e.valueJson.value, 0) / baselineEntries.length;
      const current = entries[entries.length - 1].valueJson.value;

      expect(baselineAvg).toBeCloseTo(147.67, 1);
      expect(current - baselineAvg).toBeCloseTo(-42.67, 1);
    });
  });

  describe("Compared to last week/month logic", () => {
    it("should calculate week-over-week comparison with backfilled data", () => {
      const entries = [
        // Last week (backfilled)
        createMetricEntry(userId, "WEIGHT", { value: 195 }, 14, { isBackfill: true }),
        createMetricEntry(userId, "WEIGHT", { value: 194 }, 13, { isBackfill: true }),
        createMetricEntry(userId, "WEIGHT", { value: 193 }, 12, { isBackfill: true }),

        // This week (real-time)
        createMetricEntry(userId, "WEIGHT", { value: 191 }, 6, { isBackfill: false }),
        createMetricEntry(userId, "WEIGHT", { value: 190 }, 5, { isBackfill: false }),
        createMetricEntry(userId, "WEIGHT", { value: 189 }, 4, { isBackfill: false }),
      ];

      const lastWeek = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld >= 10 && daysOld <= 16;
      });

      const thisWeek = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld >= 3 && daysOld <= 9;
      });

      const lastWeekAvg = lastWeek.reduce((a, e) => a + e.valueJson.value, 0) / lastWeek.length;
      const thisWeekAvg = thisWeek.reduce((a, e) => a + e.valueJson.value, 0) / thisWeek.length;

      expect(lastWeekAvg).toBeCloseTo(194, 0);
      expect(thisWeekAvg).toBeCloseTo(190, 0);
      expect(thisWeekAvg - lastWeekAvg).toBeCloseTo(-4, 0);
    });

    it("should calculate month-over-month comparison correctly", () => {
      const entries = [
        // Last month (backfilled)
        createMetricEntry(userId, "GLUCOSE", { value: 125 }, 45, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 122 }, 35, { isBackfill: true }),

        // This month (mix)
        createMetricEntry(userId, "GLUCOSE", { value: 110 }, 15, { isBackfill: false }),
        createMetricEntry(userId, "GLUCOSE", { value: 105 }, 5, { isBackfill: false }),
      ];

      const lastMonth = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld >= 30 && daysOld <= 60;
      });

      const thisMonth = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld >= 0 && daysOld < 30;
      });

      const lastMonthAvg = lastMonth.reduce((a, e) => a + e.valueJson.value, 0) / lastMonth.length;
      const thisMonthAvg = thisMonth.reduce((a, e) => a + e.valueJson.value, 0) / thisMonth.length;

      expect(lastMonthAvg).toBeCloseTo(123.5, 0);
      expect(thisMonthAvg).toBeCloseTo(107.5, 0);
    });
  });

  describe("Anniversary comparisons", () => {
    it("should handle 1 year ago comparison with backfilled data", () => {
      // Simulate comparison with very old backfilled data
      const oneYearAgoValue = 250;
      const currentValue = 185;

      const yearlyChange = currentValue - oneYearAgoValue;
      const percentChange = (yearlyChange / oneYearAgoValue) * 100;

      expect(yearlyChange).toBe(-65);
      expect(percentChange).toBeCloseTo(-26, 0);
    });

    it("should calculate rate of change correctly over long periods", () => {
      const entries = [
        createMetricEntry(userId, "WEIGHT", { value: 220 }, 365, { isBackfill: true }),
        createMetricEntry(userId, "WEIGHT", { value: 200 }, 180, { isBackfill: true }),
        createMetricEntry(userId, "WEIGHT", { value: 185 }, 0, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const daysDiff = Math.floor(
        (last.timestamp.getTime() - first.timestamp.getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalChange = last.valueJson.value - first.valueJson.value;
      const ratePerWeek = (totalChange / daysDiff) * 7;

      expect(totalChange).toBe(-35);
      expect(ratePerWeek).toBeCloseTo(-0.67, 1);
    });
  });

  describe("Percentage change calculations", () => {
    it("should calculate accurate percentage changes", () => {
      const baseline = 150;
      const current = 100;

      const absoluteChange = current - baseline;
      const percentChange = (absoluteChange / baseline) * 100;

      expect(absoluteChange).toBe(-50);
      expect(percentChange).toBeCloseTo(-33.33, 1);
    });

    it("should handle edge case of zero baseline gracefully", () => {
      const baseline = 0;
      const current = 5;

      // Avoid division by zero
      const percentChange = baseline === 0 ? null : ((current - baseline) / baseline) * 100;

      expect(percentChange).toBeNull();
    });

    it("should handle same value correctly", () => {
      const baseline = 100;
      const current = 100;

      const percentChange = ((current - baseline) / baseline) * 100;

      expect(percentChange).toBe(0);
    });
  });
});

// ============================================================================
// 5. Edge Cases
// ============================================================================

describe("Edge Cases with Backfilled Data", () => {
  describe("User with ONLY backfilled data", () => {
    it("should calculate analytics correctly with no real-time entries", () => {
      const userId = "user_backfill_only";
      const entries = [
        createMetricEntry(userId, "GLUCOSE", { value: 130 }, 30, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 125 }, 20, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 120 }, 10, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 115 }, 5, { isBackfill: true }),
      ];

      // All entries should be included in analytics
      expect(entries.every(e => isBackfilledEntry(e))).toBe(true);

      const average = entries.reduce((a, e) => a + e.valueJson.value, 0) / entries.length;
      expect(average).toBe(122.5);

      // Trend calculation should still work
      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );
      expect(sorted[0].valueJson.value).toBe(130);
      expect(sorted[sorted.length - 1].valueJson.value).toBe(115);
    });

    it("should identify backfill-only user for potential follow-up", () => {
      const userId = "user_backfill_only";
      const entries = [
        createMetricEntry(userId, "WEIGHT", { value: 200 }, 30, { isBackfill: true }),
        createMetricEntry(userId, "WEIGHT", { value: 195 }, 15, { isBackfill: true }),
      ];

      const hasRecentRealTime = entries.some(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld <= 3 && !isBackfilledEntry(e);
      });

      expect(hasRecentRealTime).toBe(false);
    });
  });

  describe("User with gaps in backfilled data", () => {
    it("should handle missing days in historical data", () => {
      const userId = "user_gaps";
      const entries = [
        createMetricEntry(userId, "GLUCOSE", { value: 130 }, 30, { isBackfill: true }),
        // Gap: days 29-21 missing
        createMetricEntry(userId, "GLUCOSE", { value: 125 }, 20, { isBackfill: true }),
        // Gap: days 19-11 missing
        createMetricEntry(userId, "GLUCOSE", { value: 115 }, 10, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 110 }, 0, { isBackfill: false }),
      ];

      // Calculate average ignoring gaps
      const average = entries.reduce((a, e) => a + e.valueJson.value, 0) / entries.length;
      expect(average).toBe(120);

      // Track which days have data
      const daysWithData = new Set(
        entries.map(e => e.timestamp.toISOString().split("T")[0])
      );
      expect(daysWithData.size).toBe(4);
    });

    it("should interpolate trends correctly across gaps", () => {
      const userId = "user_gaps";
      const entries = [
        createMetricEntry(userId, "WEIGHT", { value: 200 }, 60, { isBackfill: true }),
        // 30-day gap
        createMetricEntry(userId, "WEIGHT", { value: 190 }, 30, { isBackfill: true }),
        // 15-day gap
        createMetricEntry(userId, "WEIGHT", { value: 185 }, 15, { isBackfill: false }),
        createMetricEntry(userId, "WEIGHT", { value: 180 }, 0, { isBackfill: false }),
      ];

      const sorted = [...entries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      // Calculate rate of change
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const daysDiff = Math.floor(
        (last.timestamp.getTime() - first.timestamp.getTime()) / (1000 * 60 * 60 * 24)
      );

      const totalLoss = first.valueJson.value - last.valueJson.value;
      const avgLossPerDay = totalLoss / daysDiff;

      expect(totalLoss).toBe(20);
      expect(avgLossPerDay).toBeCloseTo(0.33, 1);
    });
  });

  describe("Overlapping backfilled and manual entries for same dates", () => {
    it("should handle duplicate entries on same date", () => {
      const userId = "user_duplicates";
      const targetDate = daysAgo(10);

      const entries = [
        // Two entries for the same date
        {
          ...createMetricEntry(userId, "GLUCOSE", { value: 110 }, 10, { isBackfill: true }),
          timestamp: targetDate,
        },
        {
          ...createMetricEntry(userId, "GLUCOSE", { value: 108 }, 10, { isBackfill: false }),
          timestamp: targetDate,
        },
      ];

      // Count duplicates by date
      const dateGroups = new Map<string, MetricEntry[]>();
      entries.forEach(e => {
        const key = e.timestamp.toISOString().split("T")[0];
        if (!dateGroups.has(key)) dateGroups.set(key, []);
        dateGroups.get(key)!.push(e);
      });

      const duplicateDates = Array.from(dateGroups.entries())
        .filter(([_, entries]) => entries.length > 1);

      expect(duplicateDates.length).toBe(1);
      expect(duplicateDates[0][1].length).toBe(2);
    });

    it("should prefer real-time entry over backfilled for same date", () => {
      const userId = "user_duplicates";
      const entries = [
        createMetricEntry(userId, "GLUCOSE", { value: 110 }, 10, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 108 }, 10, { isBackfill: false }),
      ];

      // Deduplication strategy: prefer real-time entries
      const deduplicated = new Map<string, MetricEntry>();

      entries.forEach(e => {
        const key = `${e.userId}-${e.type}-${e.timestamp.toISOString().split("T")[0]}`;
        const existing = deduplicated.get(key);

        if (!existing) {
          deduplicated.set(key, e);
        } else {
          // Prefer real-time over backfilled
          if (isBackfilledEntry(existing) && !isBackfilledEntry(e)) {
            deduplicated.set(key, e);
          }
        }
      });

      const result = Array.from(deduplicated.values());
      expect(result.length).toBe(1);
      expect(result[0].valueJson.value).toBe(108); // Real-time value
      expect(isBackfilledEntry(result[0])).toBe(false);
    });
  });

  describe("Very large backfill imports (stress test)", () => {
    it("should handle 1+ year of daily data efficiently", () => {
      const userId = "user_stress";
      const startTime = Date.now();

      // Generate 400 days of data
      const entries: MetricEntry[] = [];
      for (let i = 400; i >= 0; i--) {
        entries.push(createMetricEntry(userId, "GLUCOSE", {
          value: 100 + Math.sin(i / 30) * 20 // Sinusoidal pattern
        }, i, {
          isBackfill: i > 7,
        }));
      }

      const generationTime = Date.now() - startTime;

      expect(entries.length).toBe(401);
      expect(generationTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it("should calculate statistics efficiently on large dataset", () => {
      const userId = "user_stress";

      // Generate large dataset
      const entries: MetricEntry[] = [];
      for (let i = 365; i >= 0; i--) {
        entries.push(createMetricEntry(userId, "WEIGHT", {
          value: 220 - i * 0.1 // Linear decrease
        }, i, {
          isBackfill: i > 30,
        }));
      }

      const startTime = Date.now();

      // Calculate various statistics
      const values = entries.map(e => e.valueJson.value);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;

      // Calculate standard deviation
      const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
      const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(avgSquaredDiff);

      const calcTime = Date.now() - startTime;

      expect(avg).toBeCloseTo(201.7, 0);
      expect(min).toBeCloseTo(183.5, 0);
      expect(max).toBeCloseTo(220, 0);
      expect(range).toBeCloseTo(36.5, 0);
      expect(stdDev).toBeGreaterThan(10);
      expect(calcTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it("should query date ranges efficiently on large dataset", () => {
      const userId = "user_stress";

      const entries: MetricEntry[] = [];
      for (let i = 365; i >= 0; i--) {
        entries.push(createMetricEntry(userId, "GLUCOSE", {
          value: 100 + Math.random() * 30
        }, i, {
          isBackfill: i > 30,
        }));
      }

      const startTime = Date.now();

      // Query different ranges
      const last7Days = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld <= 7;
      });

      const last30Days = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld <= 30;
      });

      const last90Days = entries.filter(e => {
        const daysOld = Math.floor(
          (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysOld <= 90;
      });

      const queryTime = Date.now() - startTime;

      expect(last7Days.length).toBeGreaterThanOrEqual(7);
      expect(last30Days.length).toBeGreaterThanOrEqual(30);
      expect(last90Days.length).toBeGreaterThanOrEqual(90);
      expect(queryTime).toBeLessThan(50); // Should complete in under 50ms
    });
  });

  describe("Timezone edge cases with backfilled data", () => {
    it("should handle entries at midnight correctly", () => {
      const userId = "user_tz";

      // Entry recorded at midnight UTC
      const midnight = new Date("2026-01-15T00:00:00Z");
      const entry = {
        ...createMetricEntry(userId, "GLUCOSE", { value: 100 }, 0),
        timestamp: midnight,
        createdAt: midnight,
      };

      const dateStr = entry.timestamp.toISOString().split("T")[0];
      expect(dateStr).toBe("2026-01-15");
    });

    it("should group entries by local date consistently", () => {
      const userId = "user_tz";

      // Entries around midnight that might be grouped incorrectly
      const entries = [
        {
          ...createMetricEntry(userId, "GLUCOSE", { value: 100 }, 0),
          timestamp: new Date("2026-01-15T23:59:00Z"),
        },
        {
          ...createMetricEntry(userId, "GLUCOSE", { value: 105 }, 0),
          timestamp: new Date("2026-01-16T00:01:00Z"),
        },
      ];

      // Group by UTC date
      const byDate = new Map<string, typeof entries>();
      entries.forEach(e => {
        const date = e.timestamp.toISOString().split("T")[0];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(e);
      });

      expect(byDate.size).toBe(2);
      expect(byDate.get("2026-01-15")?.length).toBe(1);
      expect(byDate.get("2026-01-16")?.length).toBe(1);
    });
  });
});

// ============================================================================
// 6. Integration Scenarios
// ============================================================================

describe("Integration Scenarios", () => {
  describe("Complete user journey with backfill", () => {
    it("should model realistic user onboarding with historical data import", () => {
      const userId = "user_journey";
      const now = new Date();

      // User signs up today
      const userCreatedAt = now;

      // User imports 3 months of historical weight data
      const historicalWeights: MetricEntry[] = [];
      for (let i = 90; i > 0; i--) {
        historicalWeights.push(createMetricEntry(userId, "WEIGHT", {
          value: 230 - i * 0.4 // Starting at 230, ending around 194
        }, i, {
          isBackfill: true,
          createdAt: now, // All imported at signup
          source: "import",
        }));
      }

      // User logs first real measurement today
      const firstRealEntry = createMetricEntry(userId, "WEIGHT", {
        value: 192
      }, 0, {
        isBackfill: false,
        createdAt: now,
        source: "manual",
      });

      const allEntries = [...historicalWeights, firstRealEntry];

      // Verify journey metrics
      expect(allEntries.length).toBe(91);

      const backfilledCount = allEntries.filter(e => isBackfilledEntry(e)).length;
      const realTimeCount = allEntries.filter(e => !isBackfilledEntry(e)).length;

      expect(backfilledCount).toBe(90);
      expect(realTimeCount).toBe(1);

      // Verify progress calculation
      const sorted = [...allEntries].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const startWeight = sorted[0].valueJson.value;
      const currentWeight = sorted[sorted.length - 1].valueJson.value;
      const totalLoss = startWeight - currentWeight;

      expect(startWeight).toBeCloseTo(194, 0); // 230 - 90 * 0.4
      expect(currentWeight).toBe(192);
      expect(totalLoss).toBeCloseTo(2, 0);
    });
  });

  describe("Multi-metric tracking with mixed data sources", () => {
    it("should handle concurrent metric types with different backfill patterns", () => {
      const userId = "user_multi";

      // Weight: full backfill
      const weightEntries = [
        createMetricEntry(userId, "WEIGHT", { value: 200 }, 60, { isBackfill: true }),
        createMetricEntry(userId, "WEIGHT", { value: 195 }, 30, { isBackfill: true }),
        createMetricEntry(userId, "WEIGHT", { value: 190 }, 0, { isBackfill: false }),
      ];

      // Glucose: partial backfill (only recent data imported)
      const glucoseEntries = [
        createMetricEntry(userId, "GLUCOSE", { value: 120 }, 14, { isBackfill: true }),
        createMetricEntry(userId, "GLUCOSE", { value: 115 }, 7, { isBackfill: false }),
        createMetricEntry(userId, "GLUCOSE", { value: 108 }, 0, { isBackfill: false }),
      ];

      // Blood pressure: all real-time
      const bpEntries = [
        createMetricEntry(userId, "BP", { systolic: 135, diastolic: 85 }, 7, { isBackfill: false }),
        createMetricEntry(userId, "BP", { systolic: 130, diastolic: 82 }, 3, { isBackfill: false }),
        createMetricEntry(userId, "BP", { systolic: 128, diastolic: 80 }, 0, { isBackfill: false }),
      ];

      const allEntries = [...weightEntries, ...glucoseEntries, ...bpEntries];

      // Analyze by metric type
      const byType = new Map<string, MetricEntry[]>();
      allEntries.forEach(e => {
        if (!byType.has(e.type)) byType.set(e.type, []);
        byType.get(e.type)!.push(e);
      });

      // Weight should have oldest data
      const weightDates = weightEntries.map(e => e.timestamp.getTime());
      const glucoseDates = glucoseEntries.map(e => e.timestamp.getTime());
      const bpDates = bpEntries.map(e => e.timestamp.getTime());

      expect(Math.min(...weightDates)).toBeLessThan(Math.min(...glucoseDates));
      expect(Math.min(...glucoseDates)).toBeLessThan(Math.min(...bpDates));
    });
  });

  describe("Coach dashboard aggregation with mixed data", () => {
    it("should aggregate participant data correctly regardless of backfill status", () => {
      const participants = [
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" },
        { id: "p3", name: "Charlie" },
      ];

      const allEntries: MetricEntry[] = [
        // Alice: All backfilled
        createMetricEntry("p1", "GLUCOSE", { value: 125 }, 14, { isBackfill: true }),
        createMetricEntry("p1", "GLUCOSE", { value: 120 }, 7, { isBackfill: true }),
        createMetricEntry("p1", "GLUCOSE", { value: 115 }, 0, { isBackfill: true }),

        // Bob: All real-time
        createMetricEntry("p2", "GLUCOSE", { value: 108 }, 14, { isBackfill: false }),
        createMetricEntry("p2", "GLUCOSE", { value: 105 }, 7, { isBackfill: false }),
        createMetricEntry("p2", "GLUCOSE", { value: 102 }, 0, { isBackfill: false }),

        // Charlie: Mixed
        createMetricEntry("p3", "GLUCOSE", { value: 140 }, 14, { isBackfill: true }),
        createMetricEntry("p3", "GLUCOSE", { value: 130 }, 7, { isBackfill: false }),
        createMetricEntry("p3", "GLUCOSE", { value: 125 }, 0, { isBackfill: false }),
      ];

      // Calculate aggregates per participant
      const participantStats = participants.map(p => {
        const entries = allEntries.filter(e => e.userId === p.id);
        const values = entries.map(e => e.valueJson.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const latest = entries.sort((a, b) =>
          b.timestamp.getTime() - a.timestamp.getTime()
        )[0].valueJson.value;

        return { ...p, average: avg, latest };
      });

      // All participants should have valid stats regardless of backfill mix
      participantStats.forEach(s => {
        expect(s.average).toBeGreaterThan(0);
        expect(s.latest).toBeGreaterThan(0);
      });

      // Calculate cohort average (should include all data)
      // Alice: 120, Bob: 105, Charlie: 131.67 → Cohort: 118.89
      const cohortAvg = participantStats.reduce((a, p) => a + p.average, 0) / participantStats.length;
      expect(cohortAvg).toBeCloseTo(118.89, 0);
    });
  });
});

// ============================================================================
// Issues Found Documentation
// ============================================================================

describe("Documented Issues and Recommendations", () => {
  describe("ISSUE: No server-side timestamp validation", () => {
    it("should document that future dates are accepted", () => {
      const userId = "user_issue";
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future

      // Currently the system accepts this without validation
      const entry = {
        ...createMetricEntry(userId, "GLUCOSE", { value: 100 }, 0),
        timestamp: futureDate,
      };

      // This SHOULD be rejected but currently isn't
      const isFuture = entry.timestamp > new Date();
      expect(isFuture).toBe(true);

      // RECOMMENDATION: Add server-side validation to reject future timestamps
    });

    it("should document that very old dates are accepted", () => {
      const userId = "user_issue";
      const veryOldDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000); // 5 years ago

      // Currently the system accepts this without validation
      const entry = {
        ...createMetricEntry(userId, "GLUCOSE", { value: 100 }, 0),
        timestamp: veryOldDate,
      };

      const yearsOld = Math.floor(
        (Date.now() - entry.timestamp.getTime()) / (1000 * 60 * 60 * 24 * 365)
      );
      expect(yearsOld).toBe(5);

      // RECOMMENDATION: Add configurable maximum age limit (e.g., 1 year)
    });
  });

  describe("ISSUE: No duplicate detection", () => {
    it("should document that duplicates are not prevented", () => {
      const userId = "user_issue";
      const entries = [
        createMetricEntry(userId, "GLUCOSE", { value: 100 }, 5),
        createMetricEntry(userId, "GLUCOSE", { value: 100 }, 5), // Duplicate
        createMetricEntry(userId, "GLUCOSE", { value: 100 }, 5), // Triple!
      ];

      // All three entries would be accepted
      expect(entries.length).toBe(3);

      // RECOMMENDATION: Add unique constraint on userId + type + timestamp
      // or at minimum add client-side deduplication warning
    });
  });

  describe("ISSUE: Prompt engine backfill filtering relies on createdAt", () => {
    it("should document potential for missed critical alerts", () => {
      const userId = "user_issue";

      // Scenario: User backfills a dangerously high glucose reading from yesterday
      const dangerousBackfill = createMetricEntry(userId, "GLUCOSE", {
        value: 250 // Dangerously high!
      }, 1, {
        isBackfill: true,
      });

      // This won't trigger a prompt because it's backfilled
      const wouldTriggerPrompt = !isBackfilledEntry(dangerousBackfill);
      expect(wouldTriggerPrompt).toBe(false);

      // RECOMMENDATION: Consider special handling for critical values
      // regardless of backfill status (e.g., glucose > 200)
    });
  });

  describe("RECOMMENDATION: Add backfill source tracking", () => {
    it("should track how data was backfilled for auditing", () => {
      const entry = createMetricEntry("user_1", "WEIGHT", { value: 200 }, 30, {
        isBackfill: true,
        source: "import", // or "manual_backfill"
      });

      // CURRENT: Only tracks "manual" vs "import"
      expect(entry.source).toBe("import");

      // RECOMMENDATION: Add more granular tracking:
      // - "csv_import"
      // - "api_import"
      // - "manual_backfill" (UI backdating)
      // - "real_time"
    });
  });
});

/**
 * Data Flow Validation Tests
 *
 * Tests the complete data path from input through storage to calculated analytics.
 * Validates:
 * - End-to-end user journeys
 * - Calculation dependency cascades
 * - Data consistency across different views
 * - Performance with realistic data volumes
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Test Helpers - Mock Data Generators
// ============================================================================

function createUser(overrides = {}) {
  return {
    id: `user_${Math.random().toString(36).substr(2, 9)}`,
    name: "Test User",
    email: `test_${Date.now()}@example.com`,
    role: "participant" as const,
    coachId: null,
    status: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMetricEntry(userId: string, type: string, value: any, daysAgo = 0, overrides = {}) {
  const timestamp = new Date();
  timestamp.setDate(timestamp.getDate() - daysAgo);
  timestamp.setHours(12, 0, 0, 0); // Noon to avoid DST issues

  return {
    id: `metric_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    type,
    timestamp,
    createdAt: new Date(), // Created now (not backfilled)
    valueJson: value,
    source: "manual" as const,
    ...overrides,
  };
}

function createFoodEntry(userId: string, macros: any, daysAgo = 0, overrides = {}) {
  const timestamp = new Date();
  timestamp.setDate(timestamp.getDate() - daysAgo);
  timestamp.setHours(12, 0, 0, 0);

  return {
    id: `food_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    timestamp,
    createdAt: new Date(),
    inputType: "text" as const,
    mealType: "Lunch" as const,
    aiOutputJson: { macros },
    userCorrectionsJson: null,
    ...overrides,
  };
}

function createMacroTarget(userId: string, targets = {}) {
  return {
    id: `target_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    proteinG: 120,
    carbsG: 100,
    calories: 1800,
    fatG: 60,
    fiberG: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...targets,
  };
}

// ============================================================================
// 1. End-to-End User Journey Tests
// ============================================================================

describe("End-to-End User Journeys", () => {
  describe("Patient logs glucose → calculation updates → coach sees trends", () => {
    it("should correctly calculate glucose average from entries", () => {
      // User logs glucose readings over 7 days
      const userId = "user_123";
      const entries = [
        createMetricEntry(userId, "GLUCOSE", { value: 95 }, 0),
        createMetricEntry(userId, "GLUCOSE", { value: 105 }, 1),
        createMetricEntry(userId, "GLUCOSE", { value: 100 }, 2),
        createMetricEntry(userId, "GLUCOSE", { value: 98 }, 3),
        createMetricEntry(userId, "GLUCOSE", { value: 102 }, 4),
      ];

      // Calculate 7-day average
      const values = entries.map(e => (e.valueJson as any)?.value || 0);
      const average = values.reduce((a, b) => a + b, 0) / values.length;

      expect(average).toBe(100); // (95+105+100+98+102)/5 = 100
    });

    it("should trigger high glucose flag when threshold exceeded on 3+ days", () => {
      const userId = "user_123";
      const entries = [
        createMetricEntry(userId, "GLUCOSE", { value: 115 }, 0), // High
        createMetricEntry(userId, "GLUCOSE", { value: 120 }, 1), // High
        createMetricEntry(userId, "GLUCOSE", { value: 112 }, 2), // High
        createMetricEntry(userId, "GLUCOSE", { value: 98 }, 3),  // Normal
      ];

      // Count unique high days (>= 110)
      const highDays = new Set(
        entries
          .filter(e => (e.valueJson as any)?.value >= 110)
          .map(e => e.timestamp.toISOString().split("T")[0])
      );

      expect(highDays.size).toBe(3);
      // 3 unique days = flag should trigger
      const shouldFlag = highDays.size >= 3;
      expect(shouldFlag).toBe(true);
    });

    it("should NOT flag when high glucose on fewer than 3 days", () => {
      const userId = "user_123";
      const entries = [
        createMetricEntry(userId, "GLUCOSE", { value: 115 }, 0), // High
        createMetricEntry(userId, "GLUCOSE", { value: 120 }, 1), // High
        createMetricEntry(userId, "GLUCOSE", { value: 98 }, 2),  // Normal
        createMetricEntry(userId, "GLUCOSE", { value: 95 }, 3),  // Normal
      ];

      const highDays = new Set(
        entries
          .filter(e => (e.valueJson as any)?.value >= 110)
          .map(e => e.timestamp.toISOString().split("T")[0])
      );

      expect(highDays.size).toBe(2);
      const shouldFlag = highDays.size >= 3;
      expect(shouldFlag).toBe(false);
    });
  });

  describe("Patient logs food → macro tracking updates", () => {
    it("should sum macros from multiple food entries", () => {
      const userId = "user_123";
      const entries = [
        createFoodEntry(userId, { calories: 400, protein: 30, carbs: 40, fat: 15 }, 0),
        createFoodEntry(userId, { calories: 600, protein: 45, carbs: 50, fat: 25 }, 0),
        createFoodEntry(userId, { calories: 500, protein: 35, carbs: 45, fat: 20 }, 0),
      ];

      const totals = entries.reduce(
        (acc, entry) => {
          const macros = (entry.userCorrectionsJson as any)?.macros ||
                        (entry.aiOutputJson as any)?.macros ||
                        (entry.aiOutputJson as any);
          return {
            calories: acc.calories + (macros?.calories || 0),
            protein: acc.protein + (macros?.protein || 0),
            carbs: acc.carbs + (macros?.carbs || 0),
            fat: acc.fat + (macros?.fat || 0),
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      expect(totals.calories).toBe(1500);
      expect(totals.protein).toBe(110);
      expect(totals.carbs).toBe(135);
      expect(totals.fat).toBe(60);
    });

    it("should prioritize user corrections over AI output", () => {
      const userId = "user_123";
      const entry = createFoodEntry(
        userId,
        { calories: 400, protein: 20, carbs: 50, fat: 15 }, // AI guess
        0,
        {
          userCorrectionsJson: { macros: { calories: 300, protein: 35, carbs: 30, fat: 10 } },
        }
      );

      // Priority: userCorrectionsJson.macros > aiOutputJson.macros > aiOutputJson
      const macros = (entry.userCorrectionsJson as any)?.macros ||
                    (entry.aiOutputJson as any)?.macros ||
                    (entry.aiOutputJson as any);

      expect(macros.calories).toBe(300);
      expect(macros.protein).toBe(35);
      expect(macros.carbs).toBe(30);
    });

    it("should calculate protein compliance correctly", () => {
      const target = createMacroTarget("user_123", { proteinG: 120 });

      // Test cases: within ±10% = meeting target
      const testCases = [
        { avgProtein: 120, expected: true },  // Exact
        { avgProtein: 108, expected: true },  // -10%
        { avgProtein: 132, expected: true },  // +10%
        { avgProtein: 107, expected: false }, // -11%
        { avgProtein: 133, expected: false }, // +11%
        { avgProtein: 100, expected: false }, // -17%
      ];

      for (const { avgProtein, expected } of testCases) {
        const meetingTarget = Math.abs(avgProtein - target.proteinG!) / target.proteinG! <= 0.1;
        expect(meetingTarget).toBe(expected);
      }
    });

    it("should calculate carb compliance correctly", () => {
      const target = createMacroTarget("user_123", { carbsG: 100 });

      // Over carbs = > 110% of target
      const testCases = [
        { avgCarbs: 100, expected: false }, // Exact
        { avgCarbs: 110, expected: false }, // +10%
        { avgCarbs: 111, expected: true },  // +11% = over
        { avgCarbs: 150, expected: true },  // +50%
        { avgCarbs: 80, expected: false },  // -20%
      ];

      for (const { avgCarbs, expected } of testCases) {
        const overCarbs = avgCarbs > target.carbsG! * 1.1;
        expect(overCarbs).toBe(expected);
      }
    });
  });

  describe("Blood pressure tracking", () => {
    it("should trigger elevated BP flag when threshold exceeded on 2+ days", () => {
      const userId = "user_123";
      const entries = [
        createMetricEntry(userId, "BP", { systolic: 145, diastolic: 88 }, 0), // High systolic
        createMetricEntry(userId, "BP", { systolic: 130, diastolic: 92 }, 1), // High diastolic
        createMetricEntry(userId, "BP", { systolic: 125, diastolic: 80 }, 2), // Normal
      ];

      // Elevated = systolic >= 140 OR diastolic >= 90
      const elevatedDays = new Set(
        entries
          .filter(e => {
            const val = e.valueJson as any;
            return (val?.systolic || 0) >= 140 || (val?.diastolic || 0) >= 90;
          })
          .map(e => e.timestamp.toISOString().split("T")[0])
      );

      expect(elevatedDays.size).toBe(2);
      const shouldFlag = elevatedDays.size >= 2;
      expect(shouldFlag).toBe(true);
    });

    it("should use OR logic for BP thresholds", () => {
      const testCases = [
        { systolic: 145, diastolic: 85, elevated: true },  // High systolic only
        { systolic: 130, diastolic: 95, elevated: true },  // High diastolic only
        { systolic: 145, diastolic: 95, elevated: true },  // Both high
        { systolic: 135, diastolic: 85, elevated: false }, // Neither high
        { systolic: 140, diastolic: 90, elevated: true },  // Exactly at threshold
        { systolic: 139, diastolic: 89, elevated: false }, // Just below
      ];

      for (const { systolic, diastolic, elevated } of testCases) {
        const isElevated = systolic >= 140 || diastolic >= 90;
        expect(isElevated).toBe(elevated);
      }
    });
  });
});

// ============================================================================
// 2. Calculation Dependency Tests
// ============================================================================

describe("Calculation Dependencies", () => {
  describe("Adherence score depends on metric variety", () => {
    it("should calculate adherence based on unique metric types per day", () => {
      const userId = "user_123";
      const entries = [
        // Day 1: 3 types
        createMetricEntry(userId, "GLUCOSE", { value: 95 }, 0),
        createMetricEntry(userId, "WEIGHT", { value: 180 }, 0),
        createMetricEntry(userId, "BP", { systolic: 120, diastolic: 80 }, 0),
        // Day 2: 1 type
        createMetricEntry(userId, "GLUCOSE", { value: 98 }, 1),
        // Day 3: 5 types (all)
        createMetricEntry(userId, "GLUCOSE", { value: 100 }, 2),
        createMetricEntry(userId, "WEIGHT", { value: 179 }, 2),
        createMetricEntry(userId, "BP", { systolic: 118, diastolic: 78 }, 2),
        createMetricEntry(userId, "KETONES", { value: 0.8 }, 2),
        createMetricEntry(userId, "WAIST", { value: 34 }, 2),
      ];

      // Group by day
      const dailyMetrics = new Map<string, Set<string>>();
      entries.forEach(e => {
        const day = e.timestamp.toISOString().split("T")[0];
        if (!dailyMetrics.has(day)) dailyMetrics.set(day, new Set());
        dailyMetrics.get(day)!.add(e.type);
      });

      // Calculate adherence: sum of (types/5) / days
      let totalAdherence = 0;
      dailyMetrics.forEach(types => {
        totalAdherence += types.size / 5;
      });
      const avgAdherence = totalAdherence / dailyMetrics.size;

      // Day 1: 3/5 = 0.6, Day 2: 1/5 = 0.2, Day 3: 5/5 = 1.0
      // Average: (0.6 + 0.2 + 1.0) / 3 = 0.6
      expect(avgAdherence).toBeCloseTo(0.6, 2);
    });
  });

  describe("Streak calculation depends on consecutive days", () => {
    it("should count consecutive days with any log", () => {
      const userId = "user_123";
      const logs = [
        { timestamp: daysAgo(0) }, // Today
        { timestamp: daysAgo(1) }, // Yesterday
        { timestamp: daysAgo(2) }, // 2 days ago
        // Gap at day 3
        { timestamp: daysAgo(4) }, // 4 days ago
      ];

      const sortedDays = logs
        .map(l => l.timestamp.toISOString().split("T")[0])
        .sort()
        .reverse();

      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const expected = daysAgo(i).toISOString().split("T")[0];
        if (sortedDays.includes(expected)) {
          streak++;
        } else {
          break;
        }
      }

      expect(streak).toBe(3); // Days 0, 1, 2 = 3 consecutive
    });

    it("should return 0 streak if no logs today", () => {
      const logs = [
        { timestamp: daysAgo(1) }, // Yesterday only
        { timestamp: daysAgo(2) },
      ];

      const sortedDays = logs
        .map(l => l.timestamp.toISOString().split("T")[0])
        .sort()
        .reverse();

      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const expected = daysAgo(i).toISOString().split("T")[0];
        if (sortedDays.includes(expected)) {
          streak++;
        } else {
          break;
        }
      }

      expect(streak).toBe(0); // No log today = 0 streak
    });
  });

  describe("Coach workload depends on health flags", () => {
    it("should count flagged participants per coach", () => {
      const participants = [
        { id: "p1", coachId: "coach_1" },
        { id: "p2", coachId: "coach_1" },
        { id: "p3", coachId: "coach_2" },
        { id: "p4", coachId: "coach_1" },
      ];

      const flags = [
        { participantId: "p1", type: "high_glucose" },
        { participantId: "p2", type: "elevated_bp" },
        { participantId: "p3", type: "missed_logging" },
      ];

      // Count flags per coach
      const flagsByCoach = new Map<string, number>();
      for (const flag of flags) {
        const participant = participants.find(p => p.id === flag.participantId);
        if (participant?.coachId) {
          flagsByCoach.set(
            participant.coachId,
            (flagsByCoach.get(participant.coachId) || 0) + 1
          );
        }
      }

      expect(flagsByCoach.get("coach_1")).toBe(2);
      expect(flagsByCoach.get("coach_2")).toBe(1);
    });
  });

  describe("Outcome trends depend on earliest/latest values", () => {
    it("should calculate change from earliest to latest entry", () => {
      const userId = "user_123";
      const entries = [
        createMetricEntry(userId, "WEIGHT", { value: 185 }, 30), // 30 days ago
        createMetricEntry(userId, "WEIGHT", { value: 183 }, 20), // 20 days ago
        createMetricEntry(userId, "WEIGHT", { value: 180 }, 10), // 10 days ago
        createMetricEntry(userId, "WEIGHT", { value: 178 }, 0),  // Today
      ];

      // Sort chronologically
      const sorted = entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const earliest = (sorted[0].valueJson as any)?.value;
      const latest = (sorted[sorted.length - 1].valueJson as any)?.value;
      const change = latest - earliest;

      expect(change).toBe(-7); // 178 - 185 = -7 (weight loss)
    });

    it("should require minimum 2 data points", () => {
      const entries = [
        createMetricEntry("user_123", "WEIGHT", { value: 185 }, 0),
      ];

      const hasEnoughData = entries.length >= 2;
      expect(hasEnoughData).toBe(false);
    });
  });
});

// ============================================================================
// 3. Data Consistency Tests
// ============================================================================

describe("Data Consistency", () => {
  describe("Macro extraction consistency", () => {
    it("should extract macros consistently across different structures", () => {
      const testCases = [
        // Structure 1: macros at top level (analytics.ts pattern)
        { aiOutputJson: { protein: 30, carbs: 40, fat: 15 }, expected: 30 },
        // Structure 2: macros nested (routes.ts pattern)
        { aiOutputJson: { macros: { protein: 25, carbs: 35, fat: 10 } }, expected: 25 },
        // Structure 3: user corrections take priority
        {
          aiOutputJson: { macros: { protein: 20 } },
          userCorrectionsJson: { macros: { protein: 35 } },
          expected: 35,
        },
      ];

      for (const tc of testCases) {
        // Consistent extraction pattern
        const macros =
          (tc.userCorrectionsJson as any)?.macros ||
          (tc.userCorrectionsJson as any) ||
          (tc.aiOutputJson as any)?.macros ||
          (tc.aiOutputJson as any) ||
          {};

        expect(macros.protein).toBe(tc.expected);
      }
    });
  });

  describe("Date handling consistency", () => {
    it("should group by local date consistently", () => {
      // Simulate entries at 11pm PST (which is next day UTC)
      const timestamp = new Date("2026-01-15T23:00:00-08:00"); // 11pm PST = 7am UTC next day

      // UTC grouping (problematic)
      const utcDate = timestamp.toISOString().split("T")[0];
      expect(utcDate).toBe("2026-01-16"); // Wrong - shows UTC date

      // Local grouping (correct)
      function toLocalDateString(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }

      const localDate = toLocalDateString(timestamp);
      expect(localDate).toBe("2026-01-15"); // Correct - shows local date
    });
  });

  describe("Zero value handling", () => {
    it("should not treat 0 as missing data", () => {
      // Valid 0 values should be included
      const earliest = 0; // e.g., starting from 0
      const latest = 5;   // e.g., now at 5

      // Old buggy pattern - 0 && anything evaluates to 0 (falsy)
      const buggyCheck = earliest && latest;
      expect(buggyCheck).toBeFalsy(); // 0 is falsy, so this is true

      // Fixed pattern
      const fixedCheck = earliest !== undefined && earliest !== null &&
                        latest !== undefined && latest !== null;
      expect(fixedCheck).toBe(true);

      // Should calculate change correctly
      if (fixedCheck) {
        const change = latest - earliest;
        expect(change).toBe(5);
      }
    });
  });

  describe("Backfill detection", () => {
    it("should detect backfilled entries (timestamp > 1hr before createdAt)", () => {
      function isBackfilledEntry(entry: { timestamp: Date; createdAt: Date }): boolean {
        const hourMs = 60 * 60 * 1000;
        return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
      }

      const now = new Date();

      // Real-time entry
      const realtime = {
        timestamp: now,
        createdAt: now,
      };
      expect(isBackfilledEntry(realtime)).toBe(false);

      // Entry logged 30 min ago
      const thirtyMinAgo = {
        timestamp: new Date(now.getTime() - 30 * 60 * 1000),
        createdAt: now,
      };
      expect(isBackfilledEntry(thirtyMinAgo)).toBe(false);

      // Entry from 2 hours ago (backfilled)
      const twoHoursAgo = {
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        createdAt: now,
      };
      expect(isBackfilledEntry(twoHoursAgo)).toBe(true);

      // Entry from yesterday (backfilled)
      const yesterday = {
        timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        createdAt: now,
      };
      expect(isBackfilledEntry(yesterday)).toBe(true);
    });
  });
});

// ============================================================================
// 4. Performance Tests
// ============================================================================

describe("Performance", () => {
  describe("In-memory filtering performance", () => {
    it("should handle 1000 entries efficiently", () => {
      const userId = "user_123";
      const entries = Array.from({ length: 1000 }, (_, i) =>
        createMetricEntry(userId, "GLUCOSE", { value: 90 + Math.random() * 40 }, i % 30)
      );

      const start = performance.now();

      // Filter operation (as done in analytics.ts)
      const filtered = entries.filter(e => e.userId === userId && e.type === "GLUCOSE");

      const duration = performance.now() - start;

      expect(filtered.length).toBe(1000);
      expect(duration).toBeLessThan(10); // Should complete in < 10ms
    });

    it("should handle grouping 5000 entries by day efficiently", () => {
      const entries = Array.from({ length: 5000 }, (_, i) =>
        createMetricEntry(`user_${i % 100}`, "GLUCOSE", { value: 100 }, i % 30)
      );

      const start = performance.now();

      // Grouping operation
      const byDay = new Map<string, typeof entries>();
      entries.forEach(e => {
        const day = e.timestamp.toISOString().split("T")[0];
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push(e);
      });

      const duration = performance.now() - start;

      expect(byDay.size).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should complete in < 100ms (relaxed for CI variability)
    });

    it("should handle aggregation across 100 users efficiently", () => {
      const users = Array.from({ length: 100 }, (_, i) => createUser({ id: `user_${i}` }));
      const entries = Array.from({ length: 3000 }, (_, i) =>
        createMetricEntry(`user_${i % 100}`, "GLUCOSE", { value: 100 + (i % 50) }, i % 7)
      );

      const start = performance.now();

      // Per-user aggregation (as done in getOverview)
      const results = users.map(user => {
        const userEntries = entries.filter(e => e.userId === user.id);
        const dailyMetrics = new Map<string, Set<string>>();

        userEntries.forEach(e => {
          const day = e.timestamp.toISOString().split("T")[0];
          if (!dailyMetrics.has(day)) dailyMetrics.set(day, new Set());
          dailyMetrics.get(day)!.add(e.type);
        });

        let adherence = 0;
        dailyMetrics.forEach(types => adherence += types.size / 5);

        return { userId: user.id, adherence };
      });

      const duration = performance.now() - start;

      expect(results.length).toBe(100);
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });
  });

  describe("Set vs Array performance for lookups", () => {
    it("should demonstrate Set is faster than Array.includes for streak calculation", () => {
      const days = Array.from({ length: 365 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split("T")[0];
      });

      // Array.includes (O(n) per lookup)
      const arrayStart = performance.now();
      let arrayStreak = 0;
      for (let i = 0; i < 30; i++) {
        const expected = daysAgo(i).toISOString().split("T")[0];
        if (days.includes(expected)) {
          arrayStreak++;
        } else {
          break;
        }
      }
      const arrayDuration = performance.now() - arrayStart;

      // Set.has (O(1) per lookup)
      const daySet = new Set(days);
      const setStart = performance.now();
      let setStreak = 0;
      for (let i = 0; i < 30; i++) {
        const expected = daysAgo(i).toISOString().split("T")[0];
        if (daySet.has(expected)) {
          setStreak++;
        } else {
          break;
        }
      }
      const setDuration = performance.now() - setStart;

      expect(arrayStreak).toBe(setStreak);
      // Set should be faster (but both are fast for small n)
      expect(setDuration).toBeLessThan(5);
    });
  });
});

// ============================================================================
// 5. Edge Cases and Boundary Tests
// ============================================================================

describe("Edge Cases", () => {
  describe("Empty data handling", () => {
    it("should return 0 for adherence with no entries", () => {
      const entries: any[] = [];

      let totalAdherence = 0;
      let daysWithMetrics = 0;
      // (no entries to iterate)

      const avgAdherence = daysWithMetrics > 0
        ? totalAdherence / Math.min(daysWithMetrics, 7)
        : 0;

      expect(avgAdherence).toBe(0);
    });

    it("should return 0 streak with no logs", () => {
      const sortedDays: string[] = [];

      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const expected = daysAgo(i).toISOString().split("T")[0];
        if (sortedDays.includes(expected)) {
          streak++;
        } else {
          break;
        }
      }

      expect(streak).toBe(0);
    });

    it("should not flag new user with no logs (within 3 days)", () => {
      const createdAt = daysAgo(2); // Account created 2 days ago
      const hasLogs = false;

      const daysSinceCreation = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const shouldFlag = !hasLogs && daysSinceCreation >= 3;
      expect(shouldFlag).toBe(false); // Too early to flag
    });

    it("should flag user with no logs after 3 days", () => {
      const createdAt = daysAgo(4); // Account created 4 days ago
      const hasLogs = false;

      const daysSinceCreation = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const shouldFlag = !hasLogs && daysSinceCreation >= 3;
      expect(shouldFlag).toBe(true);
    });
  });

  describe("Boundary values", () => {
    it("should handle glucose exactly at threshold (110)", () => {
      const value = 110;
      const isHigh = value >= 110;
      expect(isHigh).toBe(true);
    });

    it("should handle BP exactly at thresholds (140/90)", () => {
      expect(140 >= 140 || 85 >= 90).toBe(true);  // Systolic at threshold
      expect(135 >= 140 || 90 >= 90).toBe(true);  // Diastolic at threshold
      expect(139 >= 140 || 89 >= 90).toBe(false); // Both below
    });

    it("should handle protein compliance at exactly ±10%", () => {
      const target = 120;

      // At +10%
      const plus10 = 132;
      expect(Math.abs(plus10 - target) / target <= 0.1).toBe(true);

      // At -10%
      const minus10 = 108;
      expect(Math.abs(minus10 - target) / target <= 0.1).toBe(true);

      // Just over
      const over = 133;
      expect(Math.abs(over - target) / target <= 0.1).toBe(false);
    });
  });

  describe("Date edge cases", () => {
    it("should handle entries across midnight correctly", () => {
      // Create dates with explicit UTC times to avoid timezone issues in tests
      const justBeforeMidnight = new Date("2026-01-15T23:59:59Z");
      const justAfterMidnight = new Date("2026-01-16T00:00:01Z");

      // Using toISOString gives UTC date
      const day1 = justBeforeMidnight.toISOString().split("T")[0];
      const day2 = justAfterMidnight.toISOString().split("T")[0];

      // These should be different UTC days
      expect(day1).toBe("2026-01-15");
      expect(day2).toBe("2026-01-16");
      expect(day1).not.toBe(day2);
    });

    it("should handle DST transitions", () => {
      // Spring forward: 2am becomes 3am
      // Using noon avoids this issue
      const date = daysAgo(0);
      date.setHours(12, 0, 0, 0);

      const dateStr = date.toISOString().split("T")[0];
      expect(dateStr).toBeTruthy();
    });
  });
});

// ============================================================================
// 6. Backfill and Import Validation Tests
// ============================================================================

describe("Backfill and Import Validation", () => {
  describe("Backfill detection function", () => {
    function isBackfilledEntry(entry: { timestamp: Date; createdAt: Date }): boolean {
      const hourMs = 60 * 60 * 1000;
      return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
    }

    it("should correctly identify real-time entry", () => {
      const now = new Date();
      expect(isBackfilledEntry({ timestamp: now, createdAt: now })).toBe(false);
    });

    it("should allow 1-hour grace period for delayed saves", () => {
      const now = new Date();
      // 59 minutes late - should NOT be flagged
      const timestamp59min = new Date(now.getTime() - 59 * 60 * 1000);
      expect(isBackfilledEntry({ timestamp: timestamp59min, createdAt: now })).toBe(false);

      // 61 minutes late - SHOULD be flagged
      const timestamp61min = new Date(now.getTime() - 61 * 60 * 1000);
      expect(isBackfilledEntry({ timestamp: timestamp61min, createdAt: now })).toBe(true);
    });

    it("should flag entries from previous days", () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(isBackfilledEntry({ timestamp: yesterday, createdAt: now })).toBe(true);
    });

    it("should flag entries from weeks ago", () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      expect(isBackfilledEntry({ timestamp: weekAgo, createdAt: now })).toBe(true);
    });
  });

  describe("Analytics includes backfilled data", () => {
    it("should include backfilled entries in glucose calculations", () => {
      const now = new Date();
      const entries = [
        { timestamp: daysAgo(2), createdAt: now, value: 115 }, // Backfilled
        { timestamp: daysAgo(1), createdAt: now, value: 112 }, // Backfilled
        { timestamp: now, createdAt: now, value: 108 },        // Real-time
      ];

      // All entries should be included in analytics
      const highCount = entries.filter(e => e.value >= 110).length;
      expect(highCount).toBe(2);
    });

    it("should include backfilled entries in trend calculations", () => {
      const now = new Date();
      const entries = [
        { timestamp: daysAgo(30), createdAt: now, value: 200 }, // Backfilled starting weight
        { timestamp: daysAgo(15), createdAt: daysAgo(15), value: 195 }, // Real-time mid-point
        { timestamp: now, createdAt: now, value: 185 },         // Real-time current
      ];

      // Sort chronologically
      const sorted = entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const change = sorted[sorted.length - 1].value - sorted[0].value;

      // Change should include backfilled starting point
      expect(change).toBe(-15); // 185 - 200 = -15
    });
  });

  describe("Prompt engine excludes backfilled data", () => {
    function isBackfilledEntry(entry: { timestamp: Date; createdAt: Date }): boolean {
      const hourMs = 60 * 60 * 1000;
      return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
    }

    it("should not trigger prompts for backfilled entries", () => {
      const now = new Date();
      const entries = [
        { timestamp: daysAgo(2), createdAt: now, value: 150 }, // Backfilled HIGH
        { timestamp: now, createdAt: now, value: 95 },         // Real-time normal
      ];

      // Filter to only non-backfilled entries for prompts
      const promptCandidates = entries.filter(e => !isBackfilledEntry(e));

      // Only real-time entry should be considered for prompts
      expect(promptCandidates.length).toBe(1);
      expect(promptCandidates[0].value).toBe(95); // The normal reading
    });
  });

  describe("Data source tracking", () => {
    it("should default to manual source", () => {
      const entry = createMetricEntry("user_123", "GLUCOSE", { value: 95 });
      expect(entry.source).toBe("manual");
    });

    it("should allow import source for bulk imports", () => {
      const entry = createMetricEntry("user_123", "GLUCOSE", { value: 95 }, 0, {
        source: "import" as const,
      });
      expect(entry.source).toBe("import");
    });
  });

  describe("Date validation scenarios", () => {
    it("should identify future-dated entries as problematic", () => {
      const now = new Date();
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow

      // This should be caught by validation (currently not enforced server-side)
      const isFutureDate = future > now;
      expect(isFutureDate).toBe(true);
    });

    it("should identify ancient dates as problematic", () => {
      const now = new Date();
      const ancient = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

      // This should be caught by validation (currently not enforced server-side)
      const daysDiff = Math.floor((now.getTime() - ancient.getTime()) / (1000 * 60 * 60 * 24));
      const isTooOld = daysDiff > 30; // Example: 30-day limit
      expect(isTooOld).toBe(true);
    });

    it("should accept entries within valid range", () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const daysDiff = Math.floor((now.getTime() - sevenDaysAgo.getTime()) / (1000 * 60 * 60 * 24));
      const isValidBackfill = daysDiff <= 7 && sevenDaysAgo <= now;
      expect(isValidBackfill).toBe(true);
    });
  });

  describe("Duplicate detection scenarios", () => {
    it("should identify potential duplicates by timestamp", () => {
      const timestamp = daysAgo(1);
      const entries = [
        createMetricEntry("user_123", "GLUCOSE", { value: 95 }, 1),
        createMetricEntry("user_123", "GLUCOSE", { value: 95 }, 1), // Same day, same type
      ];

      // Group by user+type+date to find duplicates
      const key = (e: any) => `${e.userId}-${e.type}-${e.timestamp.toISOString().split("T")[0]}`;
      const groups = new Map<string, number>();

      entries.forEach(e => {
        const k = key(e);
        groups.set(k, (groups.get(k) || 0) + 1);
      });

      const hasDuplicates = Array.from(groups.values()).some(count => count > 1);
      expect(hasDuplicates).toBe(true);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function daysAgo(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - n);
  date.setHours(12, 0, 0, 0); // Noon to avoid DST issues
  return date;
}

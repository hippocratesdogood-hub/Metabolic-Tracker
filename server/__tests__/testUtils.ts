/**
 * Test Utilities and Mock Data Factories
 *
 * Provides helper functions for creating test data that matches
 * the application's data structures.
 */

import type { User, MetricEntry, FoodEntry, MacroTarget } from "../../shared/schema";

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Creates a Date object for a specific number of days ago
 */
export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0); // Normalize to noon
  return date;
}

/**
 * Creates a Date object for a specific date string
 */
export function dateFromString(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00Z");
}

/**
 * Gets ISO date string (YYYY-MM-DD) for a date in local timezone
 * (matches the analytics.ts implementation)
 */
export function toDateString(date: Date): string {
  // Use local timezone to match how the analytics service calculates dates
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ============================================================================
// User Factories
// ============================================================================

let userIdCounter = 0;

export interface MockUserOptions {
  id?: string;
  role?: "participant" | "coach" | "admin";
  name?: string;
  email?: string;
  coachId?: string | null;
  createdAt?: Date;
}

export function createMockUser(options: MockUserOptions = {}): User {
  userIdCounter++;
  return {
    id: options.id ?? `user-${userIdCounter}`,
    role: options.role ?? "participant",
    name: options.name ?? `Test User ${userIdCounter}`,
    email: options.email ?? `user${userIdCounter}@test.com`,
    passwordHash: "hashed-password",
    phone: null,
    dateOfBirth: null,
    coachId: options.coachId ?? null,
    forcePasswordReset: false,
    status: "active",
    createdAt: options.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
}

export function createMockParticipant(options: MockUserOptions = {}): User {
  return createMockUser({ ...options, role: "participant" });
}

export function createMockCoach(options: MockUserOptions = {}): User {
  return createMockUser({ ...options, role: "coach" });
}

// ============================================================================
// Metric Entry Factories
// ============================================================================

let metricIdCounter = 0;

export interface MockMetricOptions {
  id?: string;
  userId: string;
  type: "GLUCOSE" | "BP" | "WEIGHT" | "WAIST" | "KETONES";
  timestamp?: Date;
  valueJson: Record<string, unknown>;
  notes?: string;
}

export function createMockMetricEntry(options: MockMetricOptions): MetricEntry {
  metricIdCounter++;
  return {
    id: options.id ?? `metric-${metricIdCounter}`,
    userId: options.userId,
    type: options.type,
    timestamp: options.timestamp ?? new Date(),
    valueJson: options.valueJson,
    notes: options.notes ?? null,
    source: "manual",
    createdAt: new Date(),
  };
}

// Glucose entry helpers
export function createGlucoseEntry(
  userId: string,
  value: number,
  timestamp?: Date
): MetricEntry {
  return createMockMetricEntry({
    userId,
    type: "GLUCOSE",
    timestamp,
    valueJson: { value, fasting: true },
  });
}

// Blood pressure entry helpers
export function createBpEntry(
  userId: string,
  systolic: number,
  diastolic: number,
  timestamp?: Date
): MetricEntry {
  return createMockMetricEntry({
    userId,
    type: "BP",
    timestamp,
    valueJson: { systolic, diastolic },
  });
}

// Weight entry helpers
export function createWeightEntry(
  userId: string,
  value: number,
  timestamp?: Date
): MetricEntry {
  return createMockMetricEntry({
    userId,
    type: "WEIGHT",
    timestamp,
    valueJson: { value },
  });
}

// Waist entry helpers
export function createWaistEntry(
  userId: string,
  value: number,
  timestamp?: Date
): MetricEntry {
  return createMockMetricEntry({
    userId,
    type: "WAIST",
    timestamp,
    valueJson: { value },
  });
}

// Ketone entry helpers
export function createKetoneEntry(
  userId: string,
  value: number,
  timestamp?: Date
): MetricEntry {
  return createMockMetricEntry({
    userId,
    type: "KETONES",
    timestamp,
    valueJson: { value },
  });
}

// ============================================================================
// Food Entry Factories
// ============================================================================

let foodIdCounter = 0;

export interface MockFoodOptions {
  id?: string;
  userId: string;
  timestamp?: Date;
  rawText?: string;
  aiOutputJson?: Record<string, unknown>;
  userCorrectionsJson?: Record<string, unknown>;
  mealType?: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  qualityScore?: number;
}

export function createMockFoodEntry(options: MockFoodOptions): FoodEntry {
  foodIdCounter++;
  return {
    id: options.id ?? `food-${foodIdCounter}`,
    userId: options.userId,
    timestamp: options.timestamp ?? new Date(),
    rawText: options.rawText ?? "Test meal",
    imageUrl: null,
    inputType: "text",
    aiOutputJson: options.aiOutputJson ?? null,
    userCorrectionsJson: options.userCorrectionsJson ?? null,
    mealType: options.mealType ?? "Lunch",
    qualityScore: options.qualityScore ?? null,
    createdAt: new Date(),
  };
}

// Helper to create food entry with macros
export function createFoodEntryWithMacros(
  userId: string,
  macros: { protein: number; carbs: number; fat?: number; calories?: number },
  timestamp?: Date,
  useCorrections = false
): FoodEntry {
  const macroData = {
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat ?? 10,
    calories: macros.calories ?? 300,
  };

  return createMockFoodEntry({
    userId,
    timestamp,
    aiOutputJson: useCorrections ? undefined : { macros: macroData, ...macroData },
    userCorrectionsJson: useCorrections ? macroData : undefined,
  });
}

// ============================================================================
// Macro Target Factories
// ============================================================================

let targetIdCounter = 0;

export interface MockMacroTargetOptions {
  id?: string;
  userId: string;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  caloriesKcal?: number;
}

export function createMockMacroTarget(options: MockMacroTargetOptions): MacroTarget {
  targetIdCounter++;
  return {
    id: options.id ?? `target-${targetIdCounter}`,
    userId: options.userId,
    proteinG: options.proteinG ?? null,
    carbsG: options.carbsG ?? null,
    fatG: options.fatG ?? null,
    caloriesKcal: options.caloriesKcal ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generates a series of glucose readings over multiple days
 */
export function generateGlucoseSeries(
  userId: string,
  values: number[],
  startDaysAgo: number = 0
): MetricEntry[] {
  return values.map((value, index) =>
    createGlucoseEntry(userId, value, daysAgo(startDaysAgo + index))
  );
}

/**
 * Generates a series of BP readings over multiple days
 */
export function generateBpSeries(
  userId: string,
  readings: Array<{ systolic: number; diastolic: number }>,
  startDaysAgo: number = 0
): MetricEntry[] {
  return readings.map((bp, index) =>
    createBpEntry(userId, bp.systolic, bp.diastolic, daysAgo(startDaysAgo + index))
  );
}

/**
 * Generates a series of weight readings over multiple days
 */
export function generateWeightSeries(
  userId: string,
  values: number[],
  startDaysAgo: number = 0
): MetricEntry[] {
  return values.map((value, index) =>
    createWeightEntry(userId, value, daysAgo(startDaysAgo + index))
  );
}

/**
 * Generates mixed metrics for adherence testing
 */
export function generateMixedMetrics(
  userId: string,
  daysData: Array<{
    daysAgo: number;
    types: Array<"GLUCOSE" | "BP" | "WEIGHT" | "WAIST" | "KETONES">;
  }>
): MetricEntry[] {
  const entries: MetricEntry[] = [];

  for (const day of daysData) {
    const timestamp = daysAgo(day.daysAgo);

    for (const type of day.types) {
      switch (type) {
        case "GLUCOSE":
          entries.push(createGlucoseEntry(userId, 95, timestamp));
          break;
        case "BP":
          entries.push(createBpEntry(userId, 120, 80, timestamp));
          break;
        case "WEIGHT":
          entries.push(createWeightEntry(userId, 180, timestamp));
          break;
        case "WAIST":
          entries.push(createWaistEntry(userId, 34, timestamp));
          break;
        case "KETONES":
          entries.push(createKetoneEntry(userId, 0.8, timestamp));
          break;
      }
    }
  }

  return entries;
}

// ============================================================================
// Calculation Helpers (for test verification)
// ============================================================================

/**
 * Manually calculates adherence score for verification
 * Formula: (sum of daily_adherence) / min(days_with_metrics, 7) * 100
 * where daily_adherence = unique_metric_types / 5
 */
export function calculateExpectedAdherence(
  metricsPerDay: Array<{ day: string; types: string[] }>
): number {
  if (metricsPerDay.length === 0) return 0;

  let totalAdherence = 0;
  for (const day of metricsPerDay) {
    const uniqueTypes = new Set(day.types).size;
    totalAdherence += uniqueTypes / 5;
  }

  const daysWithMetrics = metricsPerDay.length;
  const adherence = totalAdherence / Math.min(daysWithMetrics, 7);
  return Math.round(adherence * 100);
}

/**
 * Manually calculates outcome change for verification
 */
export function calculateExpectedOutcomeChange(
  values: number[]
): { meanChange: number; participantCount: number } {
  if (values.length < 2) {
    return { meanChange: 0, participantCount: 0 };
  }

  const change = values[values.length - 1] - values[0];
  return {
    meanChange: Math.round(change * 10) / 10,
    participantCount: 1,
  };
}

/**
 * Checks if protein intake is within target range (±10%)
 */
export function isWithinProteinTarget(
  actual: number,
  target: number
): boolean {
  return Math.abs(actual - target) / target <= 0.1;
}

/**
 * Checks if carb intake exceeds target by more than 10%
 */
export function exceedsCarbTarget(actual: number, target: number): boolean {
  return actual > target * 1.1;
}

// ============================================================================
// Reset Functions (for test isolation)
// ============================================================================

export function resetMockCounters(): void {
  userIdCounter = 0;
  metricIdCounter = 0;
  foodIdCounter = 0;
  targetIdCounter = 0;
}

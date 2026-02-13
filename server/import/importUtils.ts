/**
 * Data Import Utilities
 *
 * Core utilities for importing historical data into the Metabolic-Tracker system.
 * Supports CSV and JSON formats with comprehensive validation and error handling.
 */

import { z } from "zod";
import { db } from "../storage";
import { users, metricEntries, foodEntries } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MetricType = "BP" | "WAIST" | "GLUCOSE" | "KETONES" | "WEIGHT";
export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ImportError[];
  duplicates: number;
  /** Details of skipped duplicates for logging */
  duplicateDetails: DuplicateEntry[];
  warnings: string[];
  duration: number;
}

export interface DuplicateEntry {
  row: number;
  userEmail: string;
  timestamp: string;
  type: string;
  value: unknown;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  data?: unknown;
}

export interface ImportOptions {
  /** Skip duplicate detection (faster but may create duplicates) */
  skipDuplicateCheck?: boolean;
  /** Continue on error instead of stopping */
  continueOnError?: boolean;
  /** Batch size for database inserts */
  batchSize?: number;
  /** Dry run - validate without inserting */
  dryRun?: boolean;
  /** Log progress every N records */
  logInterval?: number;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Metric entry import schema
 * Validates raw import data before database insertion
 */
export const metricImportSchema = z.object({
  userEmail: z.string().email(),
  timestamp: z.string().or(z.date()).transform((val, ctx) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date format",
      });
      return z.NEVER;
    }
    return date;
  }),
  type: z.enum(["BP", "WAIST", "GLUCOSE", "KETONES", "WEIGHT"]),
  value: z.union([
    z.number(),
    z.object({
      systolic: z.number().min(50).max(300),
      diastolic: z.number().min(30).max(200),
    }),
  ]),
  notes: z.string().optional(),
});

/**
 * Food entry import schema
 * Validates raw import data for food entries
 */
export const foodImportSchema = z.object({
  userEmail: z.string().email(),
  timestamp: z.string().or(z.date()).transform((val, ctx) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date format",
      });
      return z.NEVER;
    }
    return date;
  }),
  mealType: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  description: z.string().min(1),
  calories: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  fiber: z.number().min(0).optional(),
});

export type MetricImportRow = z.infer<typeof metricImportSchema>;
export type FoodImportRow = z.infer<typeof foodImportSchema>;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate a single metric value based on type
 */
export function validateMetricValue(type: MetricType, value: unknown): { valid: boolean; message?: string } {
  switch (type) {
    case "WEIGHT":
      if (typeof value !== "number" || value < 20 || value > 1000) {
        return { valid: false, message: "Weight must be between 20-1000 lbs" };
      }
      break;
    case "GLUCOSE":
      if (typeof value !== "number" || value < 20 || value > 700) {
        return { valid: false, message: "Glucose must be between 20-700 mg/dL" };
      }
      break;
    case "KETONES":
      if (typeof value !== "number" || value < 0 || value > 20) {
        return { valid: false, message: "Ketones must be between 0-20 mmol/L" };
      }
      break;
    case "WAIST":
      if (typeof value !== "number" || value < 10 || value > 100) {
        return { valid: false, message: "Waist must be between 10-100 inches" };
      }
      break;
    case "BP":
      if (typeof value !== "object" || value === null) {
        return { valid: false, message: "Blood pressure must be an object with systolic and diastolic" };
      }
      const bp = value as { systolic?: number; diastolic?: number };
      if (!bp.systolic || bp.systolic < 50 || bp.systolic > 300) {
        return { valid: false, message: "Systolic must be between 50-300 mmHg" };
      }
      if (!bp.diastolic || bp.diastolic < 30 || bp.diastolic > 200) {
        return { valid: false, message: "Diastolic must be between 30-200 mmHg" };
      }
      break;
  }
  return { valid: true };
}

/**
 * Validate timestamp is reasonable (not in future, warns for very old)
 * Per product decision: Allow 5+ year data with warning, don't block
 */
export function validateTimestamp(timestamp: Date): { valid: boolean; message?: string; warning?: string } {
  const now = new Date();
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  if (timestamp > now) {
    return { valid: false, message: "Timestamp cannot be in the future" };
  }
  // Allow old data but include warning
  if (timestamp < fiveYearsAgo) {
    return { valid: true, warning: "Timestamp is more than 5 years old - data imported with warning" };
  }
  return { valid: true };
}

// ============================================================================
// USER LOOKUP
// ============================================================================

/**
 * Cache for user email to ID mapping
 */
const userCache = new Map<string, string>();

/**
 * Look up user ID by email with caching
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const cached = userCache.get(email);
  if (cached) return cached;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (user) {
    userCache.set(email, user.id);
    return user.id;
  }
  return null;
}

/**
 * Clear user cache (call between test runs or after user changes)
 */
export function clearUserCache(): void {
  userCache.clear();
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

/**
 * Check if a metric entry already exists (same user, type, timestamp within 1 minute)
 */
export async function isDuplicateMetric(
  userId: string,
  type: MetricType,
  timestamp: Date
): Promise<boolean> {
  const tolerance = 60 * 1000; // 1 minute tolerance
  const minTime = new Date(timestamp.getTime() - tolerance);
  const maxTime = new Date(timestamp.getTime() + tolerance);

  const existing = await db
    .select({ id: metricEntries.id })
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.userId, userId),
        eq(metricEntries.type, type),
        gte(metricEntries.timestamp, minTime),
        lte(metricEntries.timestamp, maxTime)
      )
    )
    .limit(1);

  return existing.length > 0;
}

/**
 * Check if a food entry already exists (same user, meal type, timestamp within 5 minutes)
 */
export async function isDuplicateFood(
  userId: string,
  mealType: MealType,
  timestamp: Date
): Promise<boolean> {
  const tolerance = 5 * 60 * 1000; // 5 minute tolerance
  const minTime = new Date(timestamp.getTime() - tolerance);
  const maxTime = new Date(timestamp.getTime() + tolerance);

  const existing = await db
    .select({ id: foodEntries.id })
    .from(foodEntries)
    .where(
      and(
        eq(foodEntries.userId, userId),
        eq(foodEntries.mealType, mealType),
        gte(foodEntries.timestamp, minTime),
        lte(foodEntries.timestamp, maxTime)
      )
    )
    .limit(1);

  return existing.length > 0;
}

// ============================================================================
// VALUE CONVERSION
// ============================================================================

/**
 * Convert metric value to valueJson format expected by database
 */
export function toValueJson(type: MetricType, value: number | { systolic: number; diastolic: number }): Record<string, unknown> {
  if (type === "BP") {
    return value as { systolic: number; diastolic: number };
  }
  return { value: value as number };
}

/**
 * Convert food entry to aiOutputJson format
 */
export function toFoodAiOutput(row: FoodImportRow): Record<string, unknown> {
  return {
    description: row.description,
    totalCalories: row.calories || 0,
    totalProtein: row.protein || 0,
    totalCarbs: row.carbs || 0,
    totalFat: row.fat || 0,
    totalFiber: row.fiber || 0,
    items: [
      {
        name: row.description,
        calories: row.calories || 0,
        protein: row.protein || 0,
        carbs: row.carbs || 0,
        fat: row.fat || 0,
        fiber: row.fiber || 0,
      },
    ],
    imported: true,
  };
}

// ============================================================================
// BATCH INSERT UTILITIES
// ============================================================================

/**
 * Insert records in batches with progress tracking
 */
export async function batchInsert<T>(
  records: T[],
  insertFn: (batch: T[]) => Promise<void>,
  options: { batchSize?: number; logInterval?: number } = {}
): Promise<void> {
  const { batchSize = 100, logInterval = 100 } = options;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await insertFn(batch);

    if (logInterval && (i + batch.length) % logInterval === 0) {
      console.log(`Processed ${i + batch.length}/${records.length} records...`);
    }
  }
}

// ============================================================================
// IMPORT STATISTICS
// ============================================================================

/**
 * Get import statistics for a date range
 */
export async function getImportStats(
  userId: string,
  from: Date,
  to: Date
): Promise<{
  metrics: { total: number; byType: Record<string, number> };
  food: { total: number; byMeal: Record<string, number> };
}> {
  const metrics = await db
    .select()
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.userId, userId),
        eq(metricEntries.source, "import"),
        gte(metricEntries.timestamp, from),
        lte(metricEntries.timestamp, to)
      )
    );

  const foods = await db
    .select()
    .from(foodEntries)
    .where(
      and(
        eq(foodEntries.userId, userId),
        gte(foodEntries.timestamp, from),
        lte(foodEntries.timestamp, to)
      )
    );

  const byType: Record<string, number> = {};
  for (const m of metrics) {
    byType[m.type] = (byType[m.type] || 0) + 1;
  }

  const byMeal: Record<string, number> = {};
  for (const f of foods) {
    byMeal[f.mealType] = (byMeal[f.mealType] || 0) + 1;
  }

  return {
    metrics: { total: metrics.length, byType },
    food: { total: foods.length, byMeal },
  };
}

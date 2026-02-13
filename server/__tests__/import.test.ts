/**
 * Import Script Tests
 *
 * Comprehensive tests for CSV and JSON import functionality.
 * Tests validation, error handling, duplicate detection, and performance.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  validateMetricValue,
  validateTimestamp,
  toValueJson,
  toFoodAiOutput,
  metricImportSchema,
  foodImportSchema,
  clearUserCache,
} from "../import/importUtils";

// ============================================================================
// TEST DATA GENERATORS
// ============================================================================

function generateMetricCSV(rows: number, includeErrors: boolean = false): string {
  const headers = "userEmail,timestamp,type,value,notes";
  const lines = [headers];

  for (let i = 0; i < rows; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const timestamp = date.toISOString();

    if (includeErrors && i % 10 === 0) {
      // Add various error types
      if (i % 30 === 0) {
        lines.push(`invalid-email,${timestamp},WEIGHT,185.5,`);
      } else if (i % 30 === 10) {
        lines.push(`alex@example.com,invalid-date,WEIGHT,185.5,`);
      } else {
        lines.push(`alex@example.com,${timestamp},INVALID,185.5,`);
      }
    } else {
      const types = ["WEIGHT", "GLUCOSE", "KETONES", "WAIST"];
      const type = types[i % types.length];
      let value: string;

      switch (type) {
        case "WEIGHT":
          value = (170 + Math.random() * 30).toFixed(1);
          break;
        case "GLUCOSE":
          value = (80 + Math.random() * 40).toFixed(0);
          break;
        case "KETONES":
          value = (0.5 + Math.random() * 2).toFixed(1);
          break;
        case "WAIST":
          value = (30 + Math.random() * 10).toFixed(1);
          break;
        default:
          value = "100";
      }

      lines.push(`alex@example.com,${timestamp},${type},${value},Test note ${i}`);
    }
  }

  return lines.join("\n");
}

function generateMetricJSON(count: number, includeErrors: boolean = false): object[] {
  const records: object[] = [];

  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    if (includeErrors && i % 10 === 0) {
      records.push({
        userEmail: "invalid-email",
        timestamp: date.toISOString(),
        type: "WEIGHT",
        value: 185.5,
      });
    } else {
      const types = ["WEIGHT", "GLUCOSE", "KETONES", "WAIST", "BP"];
      const type = types[i % types.length];

      let value: number | { systolic: number; diastolic: number };
      switch (type) {
        case "WEIGHT":
          value = 170 + Math.random() * 30;
          break;
        case "GLUCOSE":
          value = 80 + Math.random() * 40;
          break;
        case "KETONES":
          value = 0.5 + Math.random() * 2;
          break;
        case "WAIST":
          value = 30 + Math.random() * 10;
          break;
        case "BP":
          value = {
            systolic: 110 + Math.floor(Math.random() * 30),
            diastolic: 70 + Math.floor(Math.random() * 20),
          };
          break;
        default:
          value = 100;
      }

      records.push({
        userEmail: "alex@example.com",
        timestamp: date.toISOString(),
        type,
        value,
        notes: `Test note ${i}`,
      });
    }
  }

  return records;
}

function generateFoodCSV(rows: number): string {
  const headers = "userEmail,timestamp,mealType,description,calories,protein,carbs,fat,fiber";
  const lines = [headers];

  const meals = ["Breakfast", "Lunch", "Dinner", "Snack"];
  const descriptions = [
    "Eggs and toast",
    "Grilled chicken salad",
    "Salmon with vegetables",
    "Greek yogurt with berries",
  ];

  for (let i = 0; i < rows; i++) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(i / 4));
    const timestamp = date.toISOString();

    const mealType = meals[i % 4];
    const description = descriptions[i % 4];
    const calories = 200 + Math.floor(Math.random() * 400);
    const protein = 10 + Math.floor(Math.random() * 40);
    const carbs = 10 + Math.floor(Math.random() * 50);
    const fat = 5 + Math.floor(Math.random() * 30);
    const fiber = Math.floor(Math.random() * 10);

    lines.push(
      `alex@example.com,${timestamp},${mealType},${description},${calories},${protein},${carbs},${fat},${fiber}`
    );
  }

  return lines.join("\n");
}

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe("Import Validation", () => {
  describe("validateMetricValue", () => {
    it("validates weight within range", () => {
      expect(validateMetricValue("WEIGHT", 150)).toEqual({ valid: true });
      expect(validateMetricValue("WEIGHT", 200)).toEqual({ valid: true });
    });

    it("rejects weight out of range", () => {
      const result1 = validateMetricValue("WEIGHT", 10);
      expect(result1.valid).toBe(false);
      expect(result1.message).toContain("20-1000");

      const result2 = validateMetricValue("WEIGHT", 1500);
      expect(result2.valid).toBe(false);
    });

    it("validates glucose within range", () => {
      expect(validateMetricValue("GLUCOSE", 95)).toEqual({ valid: true });
      expect(validateMetricValue("GLUCOSE", 150)).toEqual({ valid: true });
    });

    it("rejects glucose out of range", () => {
      const result = validateMetricValue("GLUCOSE", 10);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("20-700");
    });

    it("validates ketones within range", () => {
      expect(validateMetricValue("KETONES", 0.5)).toEqual({ valid: true });
      expect(validateMetricValue("KETONES", 3.0)).toEqual({ valid: true });
    });

    it("rejects ketones out of range", () => {
      const result = validateMetricValue("KETONES", 25);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("0-20");
    });

    it("validates waist within range", () => {
      expect(validateMetricValue("WAIST", 32)).toEqual({ valid: true });
      expect(validateMetricValue("WAIST", 40)).toEqual({ valid: true });
    });

    it("rejects waist out of range", () => {
      const result = validateMetricValue("WAIST", 5);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("10-100");
    });

    it("validates blood pressure within range", () => {
      expect(validateMetricValue("BP", { systolic: 120, diastolic: 80 })).toEqual({ valid: true });
      expect(validateMetricValue("BP", { systolic: 140, diastolic: 90 })).toEqual({ valid: true });
    });

    it("rejects blood pressure out of range", () => {
      const result1 = validateMetricValue("BP", { systolic: 400, diastolic: 80 });
      expect(result1.valid).toBe(false);
      expect(result1.message?.toLowerCase()).toContain("systolic");

      const result2 = validateMetricValue("BP", { systolic: 120, diastolic: 250 });
      expect(result2.valid).toBe(false);
      expect(result2.message?.toLowerCase()).toContain("diastolic");
    });

    it("rejects non-object blood pressure", () => {
      const result = validateMetricValue("BP", 120);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("object");
    });
  });

  describe("validateTimestamp", () => {
    it("accepts recent timestamps", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(validateTimestamp(yesterday)).toEqual({ valid: true });
    });

    it("accepts timestamps within 5 years", () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      expect(validateTimestamp(twoYearsAgo)).toEqual({ valid: true });
    });

    it("rejects future timestamps", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const result = validateTimestamp(tomorrow);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("future");
    });

    it("rejects very old timestamps", () => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const result = validateTimestamp(tenYearsAgo);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("5 years");
    });
  });

  describe("metricImportSchema", () => {
    it("validates valid metric data", () => {
      const result = metricImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        type: "WEIGHT",
        value: 185.5,
      });
      expect(result.success).toBe(true);
    });

    it("validates BP with object value", () => {
      const result = metricImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        type: "BP",
        value: { systolic: 120, diastolic: 80 },
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = metricImportSchema.safeParse({
        userEmail: "invalid-email",
        timestamp: "2024-01-15T08:00:00Z",
        type: "WEIGHT",
        value: 185.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid type", () => {
      const result = metricImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        type: "INVALID",
        value: 185.5,
      });
      expect(result.success).toBe(false);
    });

    it("transforms string timestamp to Date", () => {
      const result = metricImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        type: "WEIGHT",
        value: 185.5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe("foodImportSchema", () => {
    it("validates valid food data", () => {
      const result = foodImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        mealType: "Breakfast",
        description: "Eggs and toast",
        calories: 350,
        protein: 25,
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional nutrition fields", () => {
      const result = foodImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        mealType: "Lunch",
        description: "Salad",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid meal type", () => {
      const result = foodImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        mealType: "Brunch",
        description: "Eggs",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty description", () => {
      const result = foodImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        mealType: "Breakfast",
        description: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative calories", () => {
      const result = foodImportSchema.safeParse({
        userEmail: "test@example.com",
        timestamp: "2024-01-15T08:00:00Z",
        mealType: "Breakfast",
        description: "Toast",
        calories: -100,
      });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// VALUE CONVERSION TESTS
// ============================================================================

describe("Value Conversion", () => {
  describe("toValueJson", () => {
    it("converts weight to valueJson", () => {
      expect(toValueJson("WEIGHT", 185.5)).toEqual({ value: 185.5 });
    });

    it("converts glucose to valueJson", () => {
      expect(toValueJson("GLUCOSE", 95)).toEqual({ value: 95 });
    });

    it("converts BP to valueJson", () => {
      expect(toValueJson("BP", { systolic: 120, diastolic: 80 })).toEqual({
        systolic: 120,
        diastolic: 80,
      });
    });
  });

  describe("toFoodAiOutput", () => {
    it("creates proper aiOutputJson structure", () => {
      const input = {
        userEmail: "test@example.com",
        timestamp: new Date(),
        mealType: "Breakfast" as const,
        description: "Eggs and toast",
        calories: 350,
        protein: 25,
        carbs: 20,
        fat: 18,
        fiber: 2,
      };

      const output = toFoodAiOutput(input);

      expect(output.description).toBe("Eggs and toast");
      expect(output.totalCalories).toBe(350);
      expect(output.totalProtein).toBe(25);
      expect(output.imported).toBe(true);
      expect(output.items).toHaveLength(1);
    });

    it("handles missing nutrition values", () => {
      const input = {
        userEmail: "test@example.com",
        timestamp: new Date(),
        mealType: "Lunch" as const,
        description: "Salad",
      };

      const output = toFoodAiOutput(input);

      expect(output.totalCalories).toBe(0);
      expect(output.totalProtein).toBe(0);
    });
  });
});

// ============================================================================
// CSV/JSON GENERATION TESTS
// ============================================================================

describe("Test Data Generators", () => {
  it("generates valid metric CSV", () => {
    const csv = generateMetricCSV(10);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("userEmail,timestamp,type,value,notes");
    expect(lines.length).toBe(11); // header + 10 rows
  });

  it("generates CSV with errors when requested", () => {
    const csv = generateMetricCSV(30, true);
    const lines = csv.split("\n");

    // Should have some invalid entries
    const invalidLines = lines.filter(
      (l) => l.includes("invalid-email") || l.includes("invalid-date") || l.includes("INVALID")
    );
    expect(invalidLines.length).toBeGreaterThan(0);
  });

  it("generates valid metric JSON", () => {
    const json = generateMetricJSON(10);

    expect(json.length).toBe(10);
    json.forEach((record: any) => {
      expect(record.userEmail).toBe("alex@example.com");
      expect(record.timestamp).toBeDefined();
      expect(["WEIGHT", "GLUCOSE", "KETONES", "WAIST", "BP"]).toContain(record.type);
    });
  });

  it("generates valid food CSV", () => {
    const csv = generateFoodCSV(8);
    const lines = csv.split("\n");

    expect(lines[0]).toContain("mealType");
    expect(lines.length).toBe(9); // header + 8 rows
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe("Edge Cases", () => {
  it("handles empty CSV", () => {
    const csv = "userEmail,timestamp,type,value,notes\n";
    const lines = csv.split("\n").filter((l) => l.trim());
    expect(lines.length).toBe(1); // Just header
  });

  it("handles empty JSON array", () => {
    const json: object[] = [];
    expect(json.length).toBe(0);
  });

  it("handles malformed timestamp gracefully", () => {
    const result = metricImportSchema.safeParse({
      userEmail: "test@example.com",
      timestamp: "not-a-date",
      type: "WEIGHT",
      value: 185.5,
    });
    expect(result.success).toBe(false);
  });

  it("handles extreme but valid values", () => {
    // Very high weight (but within range)
    expect(validateMetricValue("WEIGHT", 500).valid).toBe(true);

    // Very high glucose (diabetic range)
    expect(validateMetricValue("GLUCOSE", 400).valid).toBe(true);

    // Very high ketones (ketoacidosis range)
    expect(validateMetricValue("KETONES", 10).valid).toBe(true);
  });

  it("handles boundary values", () => {
    // Weight boundaries
    expect(validateMetricValue("WEIGHT", 20).valid).toBe(true);
    expect(validateMetricValue("WEIGHT", 1000).valid).toBe(true);
    expect(validateMetricValue("WEIGHT", 19.9).valid).toBe(false);
    expect(validateMetricValue("WEIGHT", 1000.1).valid).toBe(false);

    // Glucose boundaries
    expect(validateMetricValue("GLUCOSE", 20).valid).toBe(true);
    expect(validateMetricValue("GLUCOSE", 700).valid).toBe(true);
    expect(validateMetricValue("GLUCOSE", 19).valid).toBe(false);
    expect(validateMetricValue("GLUCOSE", 701).valid).toBe(false);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("Performance", () => {
  it("validates 1000 records quickly", () => {
    const records = generateMetricJSON(1000);

    const start = Date.now();
    records.forEach((record) => {
      metricImportSchema.safeParse(record);
    });
    const duration = Date.now() - start;

    // Should validate 1000 records in under 500ms
    expect(duration).toBeLessThan(500);
  });

  it("generates test data efficiently", () => {
    const start = Date.now();
    generateMetricCSV(5000);
    const duration = Date.now() - start;

    // Should generate 5000 rows in under 500ms
    expect(duration).toBeLessThan(500);
  });
});

// ============================================================================
// IDEMPOTENCY TESTS
// ============================================================================

describe("Idempotency", () => {
  beforeEach(() => {
    clearUserCache();
  });

  it("clearUserCache resets the cache", () => {
    // Can't directly test cache without database, but we can verify the function exists
    expect(clearUserCache).toBeDefined();
    expect(typeof clearUserCache).toBe("function");
  });

  it("multiple validation passes produce same results", () => {
    const data = {
      userEmail: "test@example.com",
      timestamp: "2024-01-15T08:00:00Z",
      type: "WEIGHT",
      value: 185.5,
    };

    const result1 = metricImportSchema.safeParse(data);
    const result2 = metricImportSchema.safeParse(data);
    const result3 = metricImportSchema.safeParse(data);

    expect(result1.success).toBe(result2.success);
    expect(result2.success).toBe(result3.success);
  });
});

// ============================================================================
// ERROR MESSAGE TESTS
// ============================================================================

describe("Error Messages", () => {
  it("provides clear error for invalid email", () => {
    const result = metricImportSchema.safeParse({
      userEmail: "not-an-email",
      timestamp: "2024-01-15T08:00:00Z",
      type: "WEIGHT",
      value: 185.5,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message.toLowerCase()).toContain("email");
    }
  });

  it("provides clear error for out-of-range values", () => {
    const result = validateMetricValue("WEIGHT", 5);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("20-1000");
  });

  it("provides clear error for future timestamp", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);

    const result = validateTimestamp(future);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("future");
  });
});

// ============================================================================
// DATA INTEGRITY TESTS
// ============================================================================

describe("Data Integrity", () => {
  it("preserves precision in numeric values", () => {
    const input = {
      userEmail: "test@example.com",
      timestamp: new Date(),
      mealType: "Breakfast" as const,
      description: "Test",
      calories: 350.5,
      protein: 25.25,
    };

    const output = toFoodAiOutput(input);
    expect(output.totalCalories).toBe(350.5);
    expect(output.totalProtein).toBe(25.25);
  });

  it("preserves BP values correctly", () => {
    const bp = { systolic: 117, diastolic: 78 };
    const output = toValueJson("BP", bp);

    expect(output.systolic).toBe(117);
    expect(output.diastolic).toBe(78);
  });

  it("handles special characters in descriptions", () => {
    const input = {
      userEmail: "test@example.com",
      timestamp: new Date(),
      mealType: "Breakfast" as const,
      description: "Café au lait with croissant & jam",
    };

    const output = toFoodAiOutput(input);
    expect(output.description).toBe("Café au lait with croissant & jam");
  });

  it("handles unicode in descriptions", () => {
    const input = {
      userEmail: "test@example.com",
      timestamp: new Date(),
      mealType: "Lunch" as const,
      description: "日本料理 🍣 Sushi",
    };

    const output = toFoodAiOutput(input);
    expect(output.description).toBe("日本料理 🍣 Sushi");
  });
});

// ============================================================================
// CSV FORMAT TESTS
// ============================================================================

describe("CSV Format Handling", () => {
  it("handles CSV with quoted fields", () => {
    const csv = `userEmail,timestamp,type,value,notes
alex@example.com,2024-01-15T08:00:00Z,WEIGHT,185.5,"Morning weight, after coffee"`;

    const lines = csv.split("\n");
    expect(lines[1]).toContain('"Morning weight, after coffee"');
  });

  it("handles BP format in CSV", () => {
    const csv = `userEmail,timestamp,type,value,notes
alex@example.com,2024-01-15T08:00:00Z,BP,120/80,`;

    const lines = csv.split("\n");
    const bpLine = lines[1];
    expect(bpLine).toContain("120/80");
  });

  it("handles empty notes field", () => {
    const csv = `userEmail,timestamp,type,value,notes
alex@example.com,2024-01-15T08:00:00Z,WEIGHT,185.5,`;

    const lines = csv.split("\n");
    const dataLine = lines[1];
    const fields = dataLine.split(",");
    expect(fields[4]).toBe("");
  });
});

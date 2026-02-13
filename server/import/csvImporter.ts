/**
 * CSV Data Importer
 *
 * Imports historical metric and food data from CSV files.
 *
 * Usage:
 *   npx tsx server/import/csvImporter.ts --type metrics --file data.csv
 *   npx tsx server/import/csvImporter.ts --type food --file meals.csv --dry-run
 *
 * CSV Format for Metrics:
 *   userEmail,timestamp,type,value,notes
 *   alex@example.com,2024-01-15T08:00:00Z,WEIGHT,185.5,Morning weight
 *   alex@example.com,2024-01-15T07:30:00Z,GLUCOSE,95,Fasting
 *   alex@example.com,2024-01-15T07:30:00Z,BP,120/80,
 *
 * CSV Format for Food:
 *   userEmail,timestamp,mealType,description,calories,protein,carbs,fat,fiber
 *   alex@example.com,2024-01-15T08:00:00Z,Breakfast,Eggs and toast,350,25,20,18,2
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { db } from "../storage";
import { metricEntries, foodEntries } from "@shared/schema";
import {
  ImportResult,
  ImportError,
  ImportOptions,
  MetricType,
  MealType,
  metricImportSchema,
  foodImportSchema,
  validateMetricValue,
  validateTimestamp,
  getUserIdByEmail,
  clearUserCache,
  isDuplicateMetric,
  isDuplicateFood,
  toValueJson,
  toFoodAiOutput,
} from "./importUtils";

// ============================================================================
// CSV PARSING
// ============================================================================

interface RawMetricRow {
  userEmail: string;
  timestamp: string;
  type: string;
  value: string;
  notes?: string;
}

interface RawFoodRow {
  userEmail: string;
  timestamp: string;
  mealType: string;
  description: string;
  calories?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
}

/**
 * Parse blood pressure value from string (e.g., "120/80")
 */
function parseBPValue(value: string): { systolic: number; diastolic: number } | null {
  const match = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  return {
    systolic: parseInt(match[1], 10),
    diastolic: parseInt(match[2], 10),
  };
}

/**
 * Parse CSV file and return records
 */
function parseCSV<T>(filePath: string): T[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

// ============================================================================
// METRIC IMPORT
// ============================================================================

/**
 * Import metrics from CSV file
 */
export async function importMetricsFromCSV(
  filePath: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const startTime = Date.now();
  const result: ImportResult = {
    success: true,
    totalRows: 0,
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: 0,
    duplicateDetails: [],
    warnings: [],
    duration: 0,
  };

  const {
    skipDuplicateCheck = false,
    continueOnError = true,
    batchSize = 100,
    dryRun = false,
    logInterval = 100,
  } = options;

  clearUserCache();

  // Read and parse CSV
  let rawRows: RawMetricRow[];
  try {
    rawRows = parseCSV<RawMetricRow>(filePath);
  } catch (error) {
    result.success = false;
    result.errors.push({
      row: 0,
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    result.duration = Date.now() - startTime;
    return result;
  }

  result.totalRows = rawRows.length;
  console.log(`Importing ${rawRows.length} metric rows from ${filePath}...`);

  // Process rows
  const toInsert: Array<{
    userId: string;
    timestamp: Date;
    type: MetricType;
    valueJson: Record<string, unknown>;
    source: "import";
    notes: string | null;
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2; // +2 for 1-based index and header row
    const raw = rawRows[i];

    try {
      // Validate user exists
      const userId = await getUserIdByEmail(raw.userEmail);
      if (!userId) {
        result.errors.push({
          row: rowNum,
          field: "userEmail",
          message: `User not found: ${raw.userEmail}`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Parse and validate type
      const type = raw.type.toUpperCase() as MetricType;
      if (!["BP", "WAIST", "GLUCOSE", "KETONES", "WEIGHT"].includes(type)) {
        result.errors.push({
          row: rowNum,
          field: "type",
          message: `Invalid metric type: ${raw.type}`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Parse value
      let value: number | { systolic: number; diastolic: number };
      if (type === "BP") {
        const bp = parseBPValue(raw.value);
        if (!bp) {
          result.errors.push({
            row: rowNum,
            field: "value",
            message: `Invalid BP format. Expected "systolic/diastolic" (e.g., "120/80")`,
            data: raw,
          });
          if (!continueOnError) {
            result.success = false;
            break;
          }
          result.skipped++;
          continue;
        }
        value = bp;
      } else {
        value = parseFloat(raw.value);
        if (isNaN(value)) {
          result.errors.push({
            row: rowNum,
            field: "value",
            message: `Invalid numeric value: ${raw.value}`,
            data: raw,
          });
          if (!continueOnError) {
            result.success = false;
            break;
          }
          result.skipped++;
          continue;
        }
      }

      // Validate value range
      const valueValidation = validateMetricValue(type, value);
      if (!valueValidation.valid) {
        result.errors.push({
          row: rowNum,
          field: "value",
          message: valueValidation.message!,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Parse and validate timestamp
      const timestamp = new Date(raw.timestamp);
      if (isNaN(timestamp.getTime())) {
        result.errors.push({
          row: rowNum,
          field: "timestamp",
          message: `Invalid timestamp: ${raw.timestamp}`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      const timestampValidation = validateTimestamp(timestamp);
      if (!timestampValidation.valid) {
        result.errors.push({
          row: rowNum,
          field: "timestamp",
          message: timestampValidation.message!,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }
      // Log warning for old timestamps (but still import)
      if (timestampValidation.warning) {
        result.warnings.push(`Row ${rowNum}: ${timestampValidation.warning}`);
      }

      // Check for duplicates - skip and log if found
      if (!skipDuplicateCheck) {
        const isDup = await isDuplicateMetric(userId, type, timestamp);
        if (isDup) {
          result.duplicates++;
          result.duplicateDetails.push({
            row: rowNum,
            userEmail: raw.userEmail,
            timestamp: raw.timestamp,
            type,
            value,
          });
          result.skipped++;
          continue;
        }
      }

      // Prepare for insertion
      toInsert.push({
        userId,
        timestamp,
        type,
        valueJson: toValueJson(type, value),
        source: "import",
        notes: raw.notes || null,
      });

      // Log progress
      if (logInterval && (i + 1) % logInterval === 0) {
        console.log(`Validated ${i + 1}/${rawRows.length} rows...`);
      }
    } catch (error) {
      result.errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : "Unknown error",
        data: raw,
      });
      if (!continueOnError) {
        result.success = false;
        break;
      }
      result.skipped++;
    }
  }

  // Insert in batches
  if (!dryRun && toInsert.length > 0) {
    console.log(`Inserting ${toInsert.length} records...`);
    try {
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        await db.insert(metricEntries).values(batch);
        result.imported += batch.length;

        if (logInterval && result.imported % logInterval === 0) {
          console.log(`Inserted ${result.imported}/${toInsert.length} records...`);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        row: 0,
        message: `Database insert failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  } else if (dryRun) {
    result.imported = toInsert.length;
    console.log(`[DRY RUN] Would insert ${toInsert.length} records`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// FOOD IMPORT
// ============================================================================

/**
 * Import food entries from CSV file
 */
export async function importFoodFromCSV(
  filePath: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const startTime = Date.now();
  const result: ImportResult = {
    success: true,
    totalRows: 0,
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: 0,
    duplicateDetails: [],
    warnings: [],
    duration: 0,
  };

  const {
    skipDuplicateCheck = false,
    continueOnError = true,
    batchSize = 100,
    dryRun = false,
    logInterval = 100,
  } = options;

  clearUserCache();

  // Read and parse CSV
  let rawRows: RawFoodRow[];
  try {
    rawRows = parseCSV<RawFoodRow>(filePath);
  } catch (error) {
    result.success = false;
    result.errors.push({
      row: 0,
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    result.duration = Date.now() - startTime;
    return result;
  }

  result.totalRows = rawRows.length;
  console.log(`Importing ${rawRows.length} food rows from ${filePath}...`);

  // Process rows
  const toInsert: Array<{
    userId: string;
    timestamp: Date;
    inputType: "text";
    mealType: MealType;
    rawText: string;
    aiOutputJson: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const raw = rawRows[i];

    try {
      // Validate user exists
      const userId = await getUserIdByEmail(raw.userEmail);
      if (!userId) {
        result.errors.push({
          row: rowNum,
          field: "userEmail",
          message: `User not found: ${raw.userEmail}`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Validate meal type
      const mealType = raw.mealType as MealType;
      if (!["Breakfast", "Lunch", "Dinner", "Snack"].includes(mealType)) {
        result.errors.push({
          row: rowNum,
          field: "mealType",
          message: `Invalid meal type: ${raw.mealType}. Must be Breakfast, Lunch, Dinner, or Snack`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Parse timestamp
      const timestamp = new Date(raw.timestamp);
      if (isNaN(timestamp.getTime())) {
        result.errors.push({
          row: rowNum,
          field: "timestamp",
          message: `Invalid timestamp: ${raw.timestamp}`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Validate description
      if (!raw.description || raw.description.trim() === "") {
        result.errors.push({
          row: rowNum,
          field: "description",
          message: "Description is required",
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Check for duplicates - skip and log if found
      if (!skipDuplicateCheck) {
        const isDup = await isDuplicateFood(userId, mealType, timestamp);
        if (isDup) {
          result.duplicates++;
          result.duplicateDetails.push({
            row: rowNum,
            userEmail: raw.userEmail,
            timestamp: raw.timestamp,
            type: mealType,
            value: raw.description,
          });
          result.skipped++;
          continue;
        }
      }

      // Parse nutrition values
      const foodRow = {
        userEmail: raw.userEmail,
        timestamp,
        mealType,
        description: raw.description,
        calories: raw.calories ? parseFloat(raw.calories) : undefined,
        protein: raw.protein ? parseFloat(raw.protein) : undefined,
        carbs: raw.carbs ? parseFloat(raw.carbs) : undefined,
        fat: raw.fat ? parseFloat(raw.fat) : undefined,
        fiber: raw.fiber ? parseFloat(raw.fiber) : undefined,
      };

      // Prepare for insertion
      toInsert.push({
        userId,
        timestamp,
        inputType: "text",
        mealType,
        rawText: raw.description,
        aiOutputJson: toFoodAiOutput(foodRow),
      });

      // Log progress
      if (logInterval && (i + 1) % logInterval === 0) {
        console.log(`Validated ${i + 1}/${rawRows.length} rows...`);
      }
    } catch (error) {
      result.errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : "Unknown error",
        data: raw,
      });
      if (!continueOnError) {
        result.success = false;
        break;
      }
      result.skipped++;
    }
  }

  // Insert in batches
  if (!dryRun && toInsert.length > 0) {
    console.log(`Inserting ${toInsert.length} records...`);
    try {
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        await db.insert(foodEntries).values(batch);
        result.imported += batch.length;

        if (logInterval && result.imported % logInterval === 0) {
          console.log(`Inserted ${result.imported}/${toInsert.length} records...`);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        row: 0,
        message: `Database insert failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  } else if (dryRun) {
    result.imported = toInsert.length;
    console.log(`[DRY RUN] Would insert ${toInsert.length} records`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function printUsage(): void {
  console.log(`
Usage: npx tsx server/import/csvImporter.ts [options]

Options:
  --type <type>     Import type: "metrics" or "food" (required)
  --file <path>     Path to CSV file (required)
  --dry-run         Validate without inserting
  --skip-duplicates Skip duplicate checking (faster)
  --batch-size <n>  Batch size for inserts (default: 100)
  --stop-on-error   Stop on first error

Examples:
  npx tsx server/import/csvImporter.ts --type metrics --file data/metrics.csv
  npx tsx server/import/csvImporter.ts --type food --file data/meals.csv --dry-run
`);
}

function printResult(result: ImportResult): void {
  console.log("\n=== Import Results ===");
  console.log(`Success: ${result.success}`);
  console.log(`Total Rows: ${result.totalRows}`);
  console.log(`Imported: ${result.imported}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Duplicates: ${result.duplicates}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Duration: ${result.duration}ms`);

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    result.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (result.errors.length > 0) {
    console.log("\nErrors (first 10):");
    result.errors.slice(0, 10).forEach((e) => {
      console.log(`  Row ${e.row}: ${e.message}`);
    });
    if (result.errors.length > 10) {
      console.log(`  ... and ${result.errors.length - 10} more errors`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const typeIndex = args.indexOf("--type");
  const fileIndex = args.indexOf("--file");

  if (typeIndex === -1 || fileIndex === -1) {
    console.error("Error: --type and --file are required");
    printUsage();
    process.exit(1);
  }

  const type = args[typeIndex + 1];
  const filePath = args[fileIndex + 1];

  if (!["metrics", "food"].includes(type)) {
    console.error(`Error: Invalid type "${type}". Must be "metrics" or "food"`);
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const batchSizeIndex = args.indexOf("--batch-size");
  const batchSize = batchSizeIndex !== -1 ? parseInt(args[batchSizeIndex + 1], 10) : 100;

  const options: ImportOptions = {
    dryRun: args.includes("--dry-run"),
    skipDuplicateCheck: args.includes("--skip-duplicates"),
    continueOnError: !args.includes("--stop-on-error"),
    batchSize,
  };

  console.log(`Starting ${type} import...`);
  console.log(`File: ${filePath}`);
  console.log(`Options:`, options);

  let result: ImportResult;
  if (type === "metrics") {
    result = await importMetricsFromCSV(filePath, options);
  } else {
    result = await importFoodFromCSV(filePath, options);
  }

  printResult(result);
  process.exit(result.success ? 0 : 1);
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

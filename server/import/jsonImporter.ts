/**
 * JSON Data Importer
 *
 * Imports historical metric and food data from JSON files.
 * Supports both single-record and array formats.
 *
 * Usage:
 *   npx tsx server/import/jsonImporter.ts --type metrics --file data.json
 *   npx tsx server/import/jsonImporter.ts --type food --file meals.json --dry-run
 *
 * JSON Format for Metrics (array or single object):
 *   [
 *     {
 *       "userEmail": "alex@example.com",
 *       "timestamp": "2024-01-15T08:00:00Z",
 *       "type": "WEIGHT",
 *       "value": 185.5,
 *       "notes": "Morning weight"
 *     },
 *     {
 *       "userEmail": "alex@example.com",
 *       "timestamp": "2024-01-15T07:30:00Z",
 *       "type": "BP",
 *       "value": { "systolic": 120, "diastolic": 80 }
 *     }
 *   ]
 *
 * JSON Format for Food:
 *   [
 *     {
 *       "userEmail": "alex@example.com",
 *       "timestamp": "2024-01-15T08:00:00Z",
 *       "mealType": "Breakfast",
 *       "description": "Eggs and toast",
 *       "calories": 350,
 *       "protein": 25,
 *       "carbs": 20,
 *       "fat": 18,
 *       "fiber": 2
 *     }
 *   ]
 */

import * as fs from "fs";
import { db } from "../storage";
import { metricEntries, foodEntries } from "@shared/schema";
import {
  ImportResult,
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
  MetricImportRow,
  FoodImportRow,
} from "./importUtils";

// ============================================================================
// JSON PARSING
// ============================================================================

interface RawMetricJson {
  userEmail: string;
  timestamp: string;
  type: string;
  value: number | { systolic: number; diastolic: number };
  notes?: string;
}

interface RawFoodJson {
  userEmail: string;
  timestamp: string;
  mealType: string;
  description: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

/**
 * Parse JSON file and return records as array
 */
function parseJSON<T>(filePath: string): T[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// ============================================================================
// METRIC IMPORT
// ============================================================================

/**
 * Import metrics from JSON file
 */
export async function importMetricsFromJSON(
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

  // Read and parse JSON
  let rawRows: RawMetricJson[];
  try {
    rawRows = parseJSON<RawMetricJson>(filePath);
  } catch (error) {
    result.success = false;
    result.errors.push({
      row: 0,
      message: `Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    result.duration = Date.now() - startTime;
    return result;
  }

  result.totalRows = rawRows.length;
  console.log(`Importing ${rawRows.length} metric records from ${filePath}...`);

  // Process records
  const toInsert: Array<{
    userId: string;
    timestamp: Date;
    type: MetricType;
    valueJson: Record<string, unknown>;
    source: "import";
    notes: string | null;
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 1;
    const raw = rawRows[i];

    try {
      // Validate with Zod schema
      const validated = metricImportSchema.safeParse(raw);
      if (!validated.success) {
        result.errors.push({
          row: rowNum,
          message: validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      const data = validated.data;

      // Validate user exists
      const userId = await getUserIdByEmail(data.userEmail);
      if (!userId) {
        result.errors.push({
          row: rowNum,
          field: "userEmail",
          message: `User not found: ${data.userEmail}`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Validate value range
      const valueValidation = validateMetricValue(data.type, data.value);
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

      // Validate timestamp (allows 5+ year old data with warning)
      const timestampValidation = validateTimestamp(data.timestamp);
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

      // Check for duplicates
      if (!skipDuplicateCheck) {
        const isDup = await isDuplicateMetric(userId, data.type, data.timestamp);
        if (isDup) {
          result.duplicates++;
          result.duplicateDetails.push({
            row: rowNum,
            userEmail: data.userEmail,
            timestamp: data.timestamp.toISOString(),
            type: data.type,
            value: data.value,
          });
          result.skipped++;
          continue;
        }
      }

      // Handle timestamp warnings (5+ year old data allowed with warning)
      if (timestampValidation.warning) {
        result.warnings.push(`Row ${rowNum}: ${timestampValidation.warning}`);
      }

      // Prepare for insertion
      toInsert.push({
        userId,
        timestamp: data.timestamp,
        type: data.type,
        valueJson: toValueJson(data.type, data.value as number | { systolic: number; diastolic: number }),
        source: "import",
        notes: data.notes || null,
      });

      // Log progress
      if (logInterval && (i + 1) % logInterval === 0) {
        console.log(`Validated ${i + 1}/${rawRows.length} records...`);
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
 * Import food entries from JSON file
 */
export async function importFoodFromJSON(
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

  // Read and parse JSON
  let rawRows: RawFoodJson[];
  try {
    rawRows = parseJSON<RawFoodJson>(filePath);
  } catch (error) {
    result.success = false;
    result.errors.push({
      row: 0,
      message: `Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    result.duration = Date.now() - startTime;
    return result;
  }

  result.totalRows = rawRows.length;
  console.log(`Importing ${rawRows.length} food records from ${filePath}...`);

  // Process records
  const toInsert: Array<{
    userId: string;
    timestamp: Date;
    inputType: "text";
    mealType: MealType;
    rawText: string;
    aiOutputJson: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 1;
    const raw = rawRows[i];

    try {
      // Validate with Zod schema
      const validated = foodImportSchema.safeParse(raw);
      if (!validated.success) {
        result.errors.push({
          row: rowNum,
          message: validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      const data = validated.data;

      // Validate user exists
      const userId = await getUserIdByEmail(data.userEmail);
      if (!userId) {
        result.errors.push({
          row: rowNum,
          field: "userEmail",
          message: `User not found: ${data.userEmail}`,
          data: raw,
        });
        if (!continueOnError) {
          result.success = false;
          break;
        }
        result.skipped++;
        continue;
      }

      // Validate timestamp (allows 5+ year old data with warning)
      const timestampValidation = validateTimestamp(data.timestamp);
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
      if (timestampValidation.warning) {
        result.warnings.push(`Row ${rowNum}: ${timestampValidation.warning}`);
      }

      // Check for duplicates
      if (!skipDuplicateCheck) {
        const isDup = await isDuplicateFood(userId, data.mealType, data.timestamp);
        if (isDup) {
          result.duplicates++;
          result.duplicateDetails.push({
            row: rowNum,
            userEmail: data.userEmail,
            timestamp: data.timestamp.toISOString(),
            type: data.mealType,
            value: data.description,
          });
          result.skipped++;
          continue;
        }
      }

      // Prepare for insertion
      toInsert.push({
        userId,
        timestamp: data.timestamp,
        inputType: "text",
        mealType: data.mealType,
        rawText: data.description,
        aiOutputJson: toFoodAiOutput(data),
      });

      // Log progress
      if (logInterval && (i + 1) % logInterval === 0) {
        console.log(`Validated ${i + 1}/${rawRows.length} records...`);
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
// PROGRAMMATIC API
// ============================================================================

/**
 * Import metrics from in-memory JSON array (for programmatic use)
 */
export async function importMetricsFromArray(
  records: RawMetricJson[],
  options: ImportOptions = {}
): Promise<ImportResult> {
  // Write to temp file and import
  const tempFile = `/tmp/metrics-import-${Date.now()}.json`;
  fs.writeFileSync(tempFile, JSON.stringify(records));
  try {
    return await importMetricsFromJSON(tempFile, options);
  } finally {
    fs.unlinkSync(tempFile);
  }
}

/**
 * Import food from in-memory JSON array (for programmatic use)
 */
export async function importFoodFromArray(
  records: RawFoodJson[],
  options: ImportOptions = {}
): Promise<ImportResult> {
  // Write to temp file and import
  const tempFile = `/tmp/food-import-${Date.now()}.json`;
  fs.writeFileSync(tempFile, JSON.stringify(records));
  try {
    return await importFoodFromJSON(tempFile, options);
  } finally {
    fs.unlinkSync(tempFile);
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function printUsage(): void {
  console.log(`
Usage: npx tsx server/import/jsonImporter.ts [options]

Options:
  --type <type>     Import type: "metrics" or "food" (required)
  --file <path>     Path to JSON file (required)
  --dry-run         Validate without inserting
  --skip-duplicates Skip duplicate checking (faster)
  --batch-size <n>  Batch size for inserts (default: 100)
  --stop-on-error   Stop on first error

Examples:
  npx tsx server/import/jsonImporter.ts --type metrics --file data/metrics.json
  npx tsx server/import/jsonImporter.ts --type food --file data/meals.json --dry-run
`);
}

function printResult(result: ImportResult): void {
  console.log("\n=== Import Results ===");
  console.log(`Success: ${result.success}`);
  console.log(`Total Records: ${result.totalRows}`);
  console.log(`Imported: ${result.imported}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Duplicates: ${result.duplicates}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Duration: ${result.duration}ms`);

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    result.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (result.duplicateDetails.length > 0) {
    console.log("\nDuplicates Skipped (first 10):");
    result.duplicateDetails.slice(0, 10).forEach((d) => {
      console.log(`  Row ${d.row}: ${d.userEmail} - ${d.type} @ ${d.timestamp}`);
    });
    if (result.duplicateDetails.length > 10) {
      console.log(`  ... and ${result.duplicateDetails.length - 10} more duplicates`);
    }
  }

  if (result.errors.length > 0) {
    console.log("\nErrors (first 10):");
    result.errors.slice(0, 10).forEach((e) => {
      console.log(`  Record ${e.row}: ${e.message}`);
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
    result = await importMetricsFromJSON(filePath, options);
  } else {
    result = await importFoodFromJSON(filePath, options);
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

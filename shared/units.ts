/**
 * Unit Conversion and Validation Utilities
 *
 * This module provides type-safe unit conversion for all metrics in the application.
 *
 * STORAGE STANDARD:
 * All values are stored in the database using a consistent internal unit:
 * - Weight: kilograms (kg)
 * - Height: centimeters (cm)
 * - Waist: centimeters (cm)
 * - Glucose: mg/dL (US standard, used for clinical thresholds)
 * - Blood Pressure: mmHg (universal)
 * - Ketones: mmol/L (universal)
 *
 * CONVERSION PRINCIPLE:
 * User inputs are converted TO storage units before saving.
 * Storage values are converted FROM storage units for display based on user preference.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type UnitsPreference = "US" | "Metric";

export type WeightUnit = "kg" | "lbs";
export type LengthUnit = "cm" | "inches" | "in";
export type GlucoseUnit = "mg/dL" | "mmol/L";
export type KetoneUnit = "mmol/L"; // Always mmol/L
export type BpUnit = "mmHg"; // Always mmHg

export interface UnitConfig {
  weight: WeightUnit;
  length: LengthUnit;
  glucose: GlucoseUnit;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Storage units used internally in the database
 */
export const STORAGE_UNITS: UnitConfig = {
  weight: "kg",
  length: "cm",
  glucose: "mg/dL", // Clinical thresholds are mg/dL based
};

/**
 * US unit configuration
 */
export const US_UNITS: UnitConfig = {
  weight: "lbs",
  length: "inches",
  glucose: "mg/dL",
};

/**
 * Metric unit configuration
 */
export const METRIC_UNITS: UnitConfig = {
  weight: "kg",
  length: "cm",
  glucose: "mmol/L",
};

/**
 * Get unit configuration for a preference
 */
export function getUnitConfig(preference: UnitsPreference): UnitConfig {
  return preference === "US" ? US_UNITS : METRIC_UNITS;
}

// ============================================================================
// Conversion Constants (scientifically accurate)
// ============================================================================

/**
 * Weight conversion factors
 * 1 kg = 2.20462 lbs (exact: 0.45359237 kg per lb)
 */
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 1 / KG_TO_LBS; // 0.453592...

/**
 * Length conversion factors
 * 1 inch = 2.54 cm (exact by definition)
 */
const CM_TO_INCHES = 1 / 2.54; // 0.393701
const INCHES_TO_CM = 2.54;

/**
 * Glucose conversion factors
 * 1 mmol/L = 18.0182 mg/dL (molecular weight of glucose = 180.16 g/mol)
 */
const MMOL_TO_MGDL = 18.0182;
const MGDL_TO_MMOL = 1 / MMOL_TO_MGDL; // 0.0555...

// ============================================================================
// Weight Conversions
// ============================================================================

/**
 * Convert weight to kilograms (storage unit)
 */
export function toKg(value: number, fromUnit: WeightUnit): number {
  if (fromUnit === "kg") return value;
  return value * LBS_TO_KG;
}

/**
 * Convert weight from kilograms to target unit
 */
export function fromKg(valueKg: number, toUnit: WeightUnit): number {
  if (toUnit === "kg") return valueKg;
  return valueKg * KG_TO_LBS;
}

/**
 * Convert between any weight units
 */
export function convertWeight(
  value: number,
  fromUnit: WeightUnit,
  toUnit: WeightUnit
): number {
  if (fromUnit === toUnit) return value;
  const kg = toKg(value, fromUnit);
  return fromKg(kg, toUnit);
}

// ============================================================================
// Length Conversions (height, waist)
// ============================================================================

/**
 * Normalize length unit aliases
 */
function normalizeLengthUnit(unit: LengthUnit): "cm" | "inches" {
  return unit === "in" ? "inches" : unit;
}

/**
 * Convert length to centimeters (storage unit)
 */
export function toCm(value: number, fromUnit: LengthUnit): number {
  const unit = normalizeLengthUnit(fromUnit);
  if (unit === "cm") return value;
  return value * INCHES_TO_CM;
}

/**
 * Convert length from centimeters to target unit
 */
export function fromCm(valueCm: number, toUnit: LengthUnit): number {
  const unit = normalizeLengthUnit(toUnit);
  if (unit === "cm") return valueCm;
  return valueCm * CM_TO_INCHES;
}

/**
 * Convert between any length units
 */
export function convertLength(
  value: number,
  fromUnit: LengthUnit,
  toUnit: LengthUnit
): number {
  const from = normalizeLengthUnit(fromUnit);
  const to = normalizeLengthUnit(toUnit);
  if (from === to) return value;
  const cm = toCm(value, from);
  return fromCm(cm, to);
}

// ============================================================================
// Glucose Conversions
// ============================================================================

/**
 * Convert glucose to mg/dL (storage unit)
 */
export function toMgdl(value: number, fromUnit: GlucoseUnit): number {
  if (fromUnit === "mg/dL") return value;
  return value * MMOL_TO_MGDL;
}

/**
 * Convert glucose from mg/dL to target unit
 */
export function fromMgdl(valueMgdl: number, toUnit: GlucoseUnit): number {
  if (toUnit === "mg/dL") return valueMgdl;
  return valueMgdl * MGDL_TO_MMOL;
}

/**
 * Convert between any glucose units
 */
export function convertGlucose(
  value: number,
  fromUnit: GlucoseUnit,
  toUnit: GlucoseUnit
): number {
  if (fromUnit === toUnit) return value;
  const mgdl = toMgdl(value, fromUnit);
  return fromMgdl(mgdl, toUnit);
}

// ============================================================================
// Clinical Thresholds
// ============================================================================

/**
 * Clinical thresholds stored in mg/dL (US units)
 * These should be converted when displaying to metric users
 */
export const CLINICAL_THRESHOLDS = {
  glucose: {
    high: 110, // mg/dL - triggers health flag
    normal_upper: 100, // mg/dL - upper normal limit
    prediabetic_upper: 125, // mg/dL - prediabetic range
    diabetic: 126, // mg/dL - diabetic threshold
  },
  bp: {
    systolic_high: 140, // mmHg - always mmHg
    diastolic_high: 90, // mmHg - always mmHg
    systolic_elevated: 130,
    diastolic_elevated: 80,
    systolic_normal: 120,
    diastolic_normal: 80,
  },
  ketones: {
    minimal: 0.5, // mmol/L - always mmol/L
    optimal_low: 1.0,
    optimal_high: 3.0,
    high: 5.0,
  },
};

/**
 * Get glucose threshold in user's preferred unit
 */
export function getGlucoseThreshold(
  threshold: keyof typeof CLINICAL_THRESHOLDS.glucose,
  userUnit: GlucoseUnit
): number {
  const valueMgdl = CLINICAL_THRESHOLDS.glucose[threshold];
  return fromMgdl(valueMgdl, userUnit);
}

// ============================================================================
// Display Formatting
// ============================================================================

/**
 * Precision settings for each metric type
 */
const DISPLAY_PRECISION: Record<string, number> = {
  weight: 1, // 1 decimal place
  height: 1,
  waist: 1,
  glucose_mgdl: 0, // Whole numbers for mg/dL
  glucose_mmol: 1, // 1 decimal for mmol/L
  ketones: 1,
  bp: 0, // Whole numbers
};

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Format weight for display
 */
export function formatWeight(
  valueKg: number,
  toUnit: WeightUnit,
  includeUnit = true
): string {
  const converted = fromKg(valueKg, toUnit);
  const rounded = roundTo(converted, DISPLAY_PRECISION.weight);
  return includeUnit ? `${rounded} ${toUnit}` : `${rounded}`;
}

/**
 * Format length for display
 */
export function formatLength(
  valueCm: number,
  toUnit: LengthUnit,
  includeUnit = true
): string {
  const converted = fromCm(valueCm, toUnit);
  const rounded = roundTo(converted, DISPLAY_PRECISION.waist);
  const displayUnit = toUnit === "in" ? "in" : toUnit;
  return includeUnit ? `${rounded} ${displayUnit}` : `${rounded}`;
}

/**
 * Format glucose for display
 */
export function formatGlucose(
  valueMgdl: number,
  toUnit: GlucoseUnit,
  includeUnit = true
): string {
  const converted = fromMgdl(valueMgdl, toUnit);
  const precision =
    toUnit === "mg/dL"
      ? DISPLAY_PRECISION.glucose_mgdl
      : DISPLAY_PRECISION.glucose_mmol;
  const rounded = roundTo(converted, precision);
  return includeUnit ? `${rounded} ${toUnit}` : `${rounded}`;
}

/**
 * Format blood pressure for display
 */
export function formatBp(
  systolic: number,
  diastolic: number,
  includeUnit = true
): string {
  const sys = roundTo(systolic, DISPLAY_PRECISION.bp);
  const dia = roundTo(diastolic, DISPLAY_PRECISION.bp);
  return includeUnit ? `${sys}/${dia} mmHg` : `${sys}/${dia}`;
}

/**
 * Format ketones for display
 */
export function formatKetones(value: number, includeUnit = true): string {
  const rounded = roundTo(value, DISPLAY_PRECISION.ketones);
  return includeUnit ? `${rounded} mmol/L` : `${rounded}`;
}

// ============================================================================
// Unit Labels for UI
// ============================================================================

/**
 * Get display labels for units based on user preference
 */
export function getUnitLabels(preference: UnitsPreference) {
  const config = getUnitConfig(preference);
  return {
    weight: config.weight,
    height: config.length,
    waist: config.length,
    glucose: config.glucose,
    ketones: "mmol/L" as const,
    bp: "mmHg" as const,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate weight value is within reasonable range
 * Range: 20-500 kg (44-1100 lbs)
 */
export function isValidWeight(valueKg: number): boolean {
  return valueKg >= 20 && valueKg <= 500;
}

/**
 * Validate height value is within reasonable range
 * Range: 50-250 cm (20-98 inches)
 */
export function isValidHeight(valueCm: number): boolean {
  return valueCm >= 50 && valueCm <= 250;
}

/**
 * Validate waist value is within reasonable range
 * Range: 30-200 cm (12-79 inches)
 */
export function isValidWaist(valueCm: number): boolean {
  return valueCm >= 30 && valueCm <= 200;
}

/**
 * Validate glucose value is within reasonable range
 * Range: 20-600 mg/dL (1.1-33.3 mmol/L)
 */
export function isValidGlucose(valueMgdl: number): boolean {
  return valueMgdl >= 20 && valueMgdl <= 600;
}

/**
 * Validate blood pressure values
 * Systolic: 50-300 mmHg
 * Diastolic: 30-200 mmHg
 * Systolic must be greater than diastolic
 */
export function isValidBp(systolic: number, diastolic: number): boolean {
  return (
    systolic >= 50 &&
    systolic <= 300 &&
    diastolic >= 30 &&
    diastolic <= 200 &&
    systolic > diastolic
  );
}

/**
 * Validate ketone value is within reasonable range
 * Range: 0-10 mmol/L
 */
export function isValidKetones(value: number): boolean {
  return value >= 0 && value <= 10;
}

// ============================================================================
// Bidirectional Conversion Helpers (for data migration/import)
// ============================================================================

/**
 * Convert metric data from user input to storage format
 */
export interface MetricInput {
  type: "WEIGHT" | "WAIST" | "GLUCOSE" | "KETONES" | "BP";
  value?: number;
  systolic?: number;
  diastolic?: number;
  unit?: string;
  userPreference: UnitsPreference;
}

export interface NormalizedMetric {
  normalizedValue: number | null;
  rawUnit: string;
  valueJson: Record<string, unknown>;
}

/**
 * Normalize user input to storage units
 */
export function normalizeMetricForStorage(input: MetricInput): NormalizedMetric {
  const config = getUnitConfig(input.userPreference);

  switch (input.type) {
    case "WEIGHT": {
      const userUnit = (input.unit as WeightUnit) || config.weight;
      const valueKg = toKg(input.value!, userUnit);
      return {
        normalizedValue: roundTo(valueKg, 2),
        rawUnit: userUnit,
        valueJson: { value: input.value, unit: userUnit },
      };
    }

    case "WAIST": {
      const userUnit = (input.unit as LengthUnit) || config.length;
      const valueCm = toCm(input.value!, userUnit);
      return {
        normalizedValue: roundTo(valueCm, 2),
        rawUnit: userUnit,
        valueJson: { value: input.value, unit: userUnit },
      };
    }

    case "GLUCOSE": {
      const userUnit = (input.unit as GlucoseUnit) || config.glucose;
      const valueMgdl = toMgdl(input.value!, userUnit);
      return {
        normalizedValue: roundTo(valueMgdl, 1),
        rawUnit: userUnit,
        valueJson: { value: input.value, unit: userUnit },
      };
    }

    case "KETONES": {
      // Ketones are always in mmol/L
      return {
        normalizedValue: roundTo(input.value!, 2),
        rawUnit: "mmol/L",
        valueJson: { value: input.value },
      };
    }

    case "BP": {
      // BP is always in mmHg
      return {
        normalizedValue: null, // BP uses two values
        rawUnit: "mmHg",
        valueJson: { systolic: input.systolic, diastolic: input.diastolic },
      };
    }

    default:
      throw new Error(`Unknown metric type: ${input.type}`);
  }
}

/**
 * Convert stored metric to user's display preference
 */
export function formatMetricForDisplay(
  type: "WEIGHT" | "WAIST" | "GLUCOSE" | "KETONES" | "BP",
  normalizedValue: number | null,
  valueJson: Record<string, unknown>,
  userPreference: UnitsPreference
): string {
  const config = getUnitConfig(userPreference);

  switch (type) {
    case "WEIGHT":
      // If we have normalized (kg), convert; otherwise use valueJson
      if (normalizedValue !== null) {
        return formatWeight(normalizedValue, config.weight);
      }
      return `${valueJson?.value ?? "--"} ${config.weight}`;

    case "WAIST":
      if (normalizedValue !== null) {
        return formatLength(normalizedValue, config.length);
      }
      return `${valueJson?.value ?? "--"} ${config.length}`;

    case "GLUCOSE":
      if (normalizedValue !== null) {
        return formatGlucose(normalizedValue, config.glucose);
      }
      return `${valueJson?.value ?? "--"} ${config.glucose}`;

    case "KETONES":
      return formatKetones((normalizedValue ?? valueJson?.value) as number);

    case "BP":
      const sys = (valueJson?.systolic as number) ?? 0;
      const dia = (valueJson?.diastolic as number) ?? 0;
      return formatBp(sys, dia);

    default:
      return "--";
  }
}

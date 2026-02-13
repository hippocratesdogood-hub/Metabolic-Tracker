/**
 * Unit Conversion Test Suite
 *
 * Tests for all unit conversion functions to ensure:
 * - Mathematical accuracy
 * - Bidirectional consistency (A→B→A = A)
 * - Edge case handling
 * - Clinical threshold accuracy
 */

import { describe, it, expect } from "vitest";
import {
  // Weight conversions
  toKg,
  fromKg,
  convertWeight,
  // Length conversions
  toCm,
  fromCm,
  convertLength,
  // Glucose conversions
  toMgdl,
  fromMgdl,
  convertGlucose,
  // Formatting
  formatWeight,
  formatLength,
  formatGlucose,
  formatBp,
  formatKetones,
  roundTo,
  // Validation
  isValidWeight,
  isValidHeight,
  isValidWaist,
  isValidGlucose,
  isValidBp,
  isValidKetones,
  // Thresholds
  CLINICAL_THRESHOLDS,
  getGlucoseThreshold,
  // Configuration
  getUnitConfig,
  getUnitLabels,
  // Normalization
  normalizeMetricForStorage,
  formatMetricForDisplay,
} from "../../shared/units";

// ============================================================================
// WEIGHT CONVERSION TESTS
// ============================================================================

describe("Weight Conversions", () => {
  describe("toKg (convert to storage unit)", () => {
    it("should return same value when already in kg", () => {
      expect(toKg(75, "kg")).toBe(75);
    });

    it("should convert lbs to kg correctly", () => {
      // 100 lbs = 45.359 kg (approx)
      expect(toKg(100, "lbs")).toBeCloseTo(45.359, 2);
    });

    it("should convert 220 lbs (100 kg) accurately", () => {
      // 220.462 lbs = 100 kg (exact)
      expect(toKg(220.462, "lbs")).toBeCloseTo(100, 1);
    });

    it("should handle zero", () => {
      expect(toKg(0, "lbs")).toBe(0);
    });

    it("should handle decimal values", () => {
      expect(toKg(165.5, "lbs")).toBeCloseTo(75.07, 1);
    });
  });

  describe("fromKg (convert from storage unit)", () => {
    it("should return same value when target is kg", () => {
      expect(fromKg(75, "kg")).toBe(75);
    });

    it("should convert kg to lbs correctly", () => {
      // 100 kg = 220.462 lbs (approx)
      expect(fromKg(100, "lbs")).toBeCloseTo(220.462, 2);
    });

    it("should convert 45.359 kg to 100 lbs", () => {
      expect(fromKg(45.359, "lbs")).toBeCloseTo(100, 0);
    });
  });

  describe("Bidirectional Weight Conversion", () => {
    /**
     * CRITICAL TEST: Converting A→B→A should return original value
     * This verifies no precision loss in round-trip conversions
     */

    it("should preserve value in lbs→kg→lbs conversion", () => {
      const originalLbs = 185.5;
      const asKg = toKg(originalLbs, "lbs");
      const backToLbs = fromKg(asKg, "lbs");
      expect(backToLbs).toBeCloseTo(originalLbs, 2);
    });

    it("should preserve value in kg→lbs→kg conversion", () => {
      const originalKg = 84.1;
      const asLbs = fromKg(originalKg, "lbs");
      const backToKg = toKg(asLbs, "lbs");
      expect(backToKg).toBeCloseTo(originalKg, 2);
    });

    it("should handle convertWeight between same units", () => {
      expect(convertWeight(100, "lbs", "lbs")).toBe(100);
      expect(convertWeight(100, "kg", "kg")).toBe(100);
    });
  });

  describe("Known Good Weight Examples", () => {
    /**
     * Reference values for verification:
     * These are commonly used conversions that should be accurate
     */

    it("1 kg = 2.20462 lbs", () => {
      expect(fromKg(1, "lbs")).toBeCloseTo(2.20462, 4);
    });

    it("1 lb = 0.453592 kg", () => {
      expect(toKg(1, "lbs")).toBeCloseTo(0.453592, 5);
    });

    it("150 lbs = 68.04 kg", () => {
      expect(toKg(150, "lbs")).toBeCloseTo(68.04, 1);
    });

    it("70 kg = 154.32 lbs", () => {
      expect(fromKg(70, "lbs")).toBeCloseTo(154.32, 1);
    });
  });
});

// ============================================================================
// LENGTH CONVERSION TESTS
// ============================================================================

describe("Length Conversions", () => {
  describe("toCm (convert to storage unit)", () => {
    it("should return same value when already in cm", () => {
      expect(toCm(180, "cm")).toBe(180);
    });

    it("should convert inches to cm correctly", () => {
      // 1 inch = 2.54 cm (exact by definition)
      expect(toCm(1, "inches")).toBe(2.54);
      expect(toCm(1, "in")).toBe(2.54); // alias
    });

    it("should convert 12 inches to 30.48 cm", () => {
      expect(toCm(12, "inches")).toBeCloseTo(30.48, 2);
    });

    it("should handle zero", () => {
      expect(toCm(0, "inches")).toBe(0);
    });
  });

  describe("fromCm (convert from storage unit)", () => {
    it("should return same value when target is cm", () => {
      expect(fromCm(180, "cm")).toBe(180);
    });

    it("should convert cm to inches correctly", () => {
      // 2.54 cm = 1 inch (exact)
      expect(fromCm(2.54, "inches")).toBeCloseTo(1, 5);
    });

    it("should convert 30.48 cm to 12 inches", () => {
      expect(fromCm(30.48, "inches")).toBeCloseTo(12, 2);
    });
  });

  describe("Bidirectional Length Conversion", () => {
    it("should preserve value in inches→cm→inches conversion", () => {
      const originalInches = 34.5;
      const asCm = toCm(originalInches, "inches");
      const backToInches = fromCm(asCm, "inches");
      expect(backToInches).toBeCloseTo(originalInches, 5);
    });

    it("should preserve value in cm→inches→cm conversion", () => {
      const originalCm = 87.6;
      const asInches = fromCm(originalCm, "inches");
      const backToCm = toCm(asInches, "inches");
      expect(backToCm).toBeCloseTo(originalCm, 5);
    });

    it("should handle 'in' alias same as 'inches'", () => {
      expect(toCm(36, "in")).toBe(toCm(36, "inches"));
      expect(fromCm(100, "in")).toBe(fromCm(100, "inches"));
    });
  });

  describe("Known Good Length Examples", () => {
    it("1 inch = 2.54 cm (exact)", () => {
      expect(toCm(1, "inches")).toBe(2.54);
    });

    it("1 cm = 0.393701 inches", () => {
      expect(fromCm(1, "inches")).toBeCloseTo(0.393701, 5);
    });

    it("36 inches = 91.44 cm (3 feet)", () => {
      expect(toCm(36, "inches")).toBeCloseTo(91.44, 2);
    });

    it("100 cm = 39.37 inches", () => {
      expect(fromCm(100, "inches")).toBeCloseTo(39.37, 1);
    });

    it("6 feet (72 inches) = 182.88 cm", () => {
      expect(toCm(72, "inches")).toBeCloseTo(182.88, 2);
    });
  });
});

// ============================================================================
// GLUCOSE CONVERSION TESTS
// ============================================================================

describe("Glucose Conversions", () => {
  describe("toMgdl (convert to storage unit)", () => {
    it("should return same value when already in mg/dL", () => {
      expect(toMgdl(100, "mg/dL")).toBe(100);
    });

    it("should convert mmol/L to mg/dL correctly", () => {
      // 5.5 mmol/L ≈ 99 mg/dL
      expect(toMgdl(5.5, "mmol/L")).toBeCloseTo(99.1, 0);
    });

    it("should convert 1 mmol/L to 18.0182 mg/dL", () => {
      expect(toMgdl(1, "mmol/L")).toBeCloseTo(18.0182, 2);
    });
  });

  describe("fromMgdl (convert from storage unit)", () => {
    it("should return same value when target is mg/dL", () => {
      expect(fromMgdl(100, "mg/dL")).toBe(100);
    });

    it("should convert mg/dL to mmol/L correctly", () => {
      // 100 mg/dL ≈ 5.55 mmol/L
      expect(fromMgdl(100, "mmol/L")).toBeCloseTo(5.55, 1);
    });

    it("should convert 18 mg/dL to approximately 1 mmol/L", () => {
      expect(fromMgdl(18.0182, "mmol/L")).toBeCloseTo(1, 3);
    });
  });

  describe("Bidirectional Glucose Conversion", () => {
    it("should preserve value in mmol/L→mg/dL→mmol/L conversion", () => {
      const originalMmol = 6.2;
      const asMgdl = toMgdl(originalMmol, "mmol/L");
      const backToMmol = fromMgdl(asMgdl, "mmol/L");
      expect(backToMmol).toBeCloseTo(originalMmol, 3);
    });

    it("should preserve value in mg/dL→mmol/L→mg/dL conversion", () => {
      const originalMgdl = 115;
      const asMmol = fromMgdl(originalMgdl, "mmol/L");
      const backToMgdl = toMgdl(asMmol, "mmol/L");
      expect(backToMgdl).toBeCloseTo(originalMgdl, 1);
    });
  });

  describe("Clinical Glucose Threshold Conversions", () => {
    /**
     * CRITICAL: Clinical thresholds must convert accurately
     * Errors here could affect patient care decisions
     */

    it("110 mg/dL (high glucose flag) = 6.1 mmol/L", () => {
      expect(fromMgdl(110, "mmol/L")).toBeCloseTo(6.1, 1);
    });

    it("100 mg/dL (upper normal) ≈ 5.55 mmol/L", () => {
      // 100 / 18.0182 = 5.5500... rounds to 5.5 at 1 decimal
      expect(fromMgdl(100, "mmol/L")).toBeCloseTo(5.55, 1);
    });

    it("126 mg/dL (diabetic threshold) = 7.0 mmol/L", () => {
      expect(fromMgdl(126, "mmol/L")).toBeCloseTo(7.0, 1);
    });

    it("70 mg/dL (hypoglycemia) = 3.9 mmol/L", () => {
      expect(fromMgdl(70, "mmol/L")).toBeCloseTo(3.9, 1);
    });
  });

  describe("Known Good Glucose Examples", () => {
    /**
     * Reference conversions from medical literature
     */

    it("5.0 mmol/L = 90 mg/dL", () => {
      expect(toMgdl(5.0, "mmol/L")).toBeCloseTo(90, 0);
    });

    it("7.0 mmol/L = 126 mg/dL (diabetic threshold)", () => {
      expect(toMgdl(7.0, "mmol/L")).toBeCloseTo(126, 0);
    });

    it("11.1 mmol/L = 200 mg/dL (random diabetes threshold)", () => {
      expect(toMgdl(11.1, "mmol/L")).toBeCloseTo(200, 0);
    });
  });
});

// ============================================================================
// FORMATTING TESTS
// ============================================================================

describe("Value Formatting", () => {
  describe("formatWeight", () => {
    it("should format kg with unit", () => {
      expect(formatWeight(75, "kg")).toBe("75 kg");
    });

    it("should format lbs with proper rounding", () => {
      expect(formatWeight(75, "lbs")).toBe("165.3 lbs");
    });

    it("should format without unit when specified", () => {
      expect(formatWeight(75, "kg", false)).toBe("75");
    });
  });

  describe("formatLength", () => {
    it("should format cm with unit", () => {
      expect(formatLength(91.44, "cm")).toBe("91.4 cm");
    });

    it("should format inches from cm", () => {
      expect(formatLength(91.44, "inches")).toBe("36 inches");
    });

    it("should use 'in' display for alias", () => {
      expect(formatLength(91.44, "in")).toBe("36 in");
    });
  });

  describe("formatGlucose", () => {
    it("should format mg/dL as whole number", () => {
      expect(formatGlucose(105, "mg/dL")).toBe("105 mg/dL");
    });

    it("should format mmol/L with 1 decimal", () => {
      // 100 mg/dL / 18.0182 = 5.55, rounds to 5.5
      expect(formatGlucose(100, "mmol/L")).toBe("5.5 mmol/L");
    });
  });

  describe("formatBp", () => {
    it("should format systolic/diastolic with unit", () => {
      expect(formatBp(120, 80)).toBe("120/80 mmHg");
    });

    it("should format without unit when specified", () => {
      expect(formatBp(135, 85, false)).toBe("135/85");
    });
  });

  describe("formatKetones", () => {
    it("should format with mmol/L unit", () => {
      expect(formatKetones(1.2)).toBe("1.2 mmol/L");
    });
  });

  describe("roundTo", () => {
    it("should round to specified decimals", () => {
      expect(roundTo(3.14159, 2)).toBe(3.14);
      expect(roundTo(3.14159, 0)).toBe(3);
      expect(roundTo(3.145, 2)).toBe(3.15); // round up
    });
  });
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe("Value Validation", () => {
  describe("isValidWeight", () => {
    it("should accept valid weights in kg", () => {
      expect(isValidWeight(70)).toBe(true);
      expect(isValidWeight(100)).toBe(true);
      expect(isValidWeight(20)).toBe(true); // minimum
      expect(isValidWeight(500)).toBe(true); // maximum
    });

    it("should reject out-of-range weights", () => {
      expect(isValidWeight(19)).toBe(false);
      expect(isValidWeight(501)).toBe(false);
      expect(isValidWeight(-10)).toBe(false);
    });
  });

  describe("isValidHeight", () => {
    it("should accept valid heights in cm", () => {
      expect(isValidHeight(170)).toBe(true);
      expect(isValidHeight(50)).toBe(true); // minimum
      expect(isValidHeight(250)).toBe(true); // maximum
    });

    it("should reject out-of-range heights", () => {
      expect(isValidHeight(49)).toBe(false);
      expect(isValidHeight(251)).toBe(false);
    });
  });

  describe("isValidWaist", () => {
    it("should accept valid waist measurements in cm", () => {
      expect(isValidWaist(85)).toBe(true);
      expect(isValidWaist(30)).toBe(true); // minimum
      expect(isValidWaist(200)).toBe(true); // maximum
    });

    it("should reject out-of-range waist", () => {
      expect(isValidWaist(29)).toBe(false);
      expect(isValidWaist(201)).toBe(false);
    });
  });

  describe("isValidGlucose", () => {
    it("should accept valid glucose in mg/dL", () => {
      expect(isValidGlucose(100)).toBe(true);
      expect(isValidGlucose(20)).toBe(true); // minimum
      expect(isValidGlucose(600)).toBe(true); // maximum
    });

    it("should reject out-of-range glucose", () => {
      expect(isValidGlucose(19)).toBe(false);
      expect(isValidGlucose(601)).toBe(false);
    });
  });

  describe("isValidBp", () => {
    it("should accept valid BP readings", () => {
      expect(isValidBp(120, 80)).toBe(true);
      expect(isValidBp(140, 90)).toBe(true);
      expect(isValidBp(50, 30)).toBe(true); // minimum bounds
    });

    it("should reject when systolic <= diastolic", () => {
      expect(isValidBp(80, 80)).toBe(false);
      expect(isValidBp(75, 80)).toBe(false);
    });

    it("should reject out-of-range BP", () => {
      expect(isValidBp(49, 80)).toBe(false); // systolic too low
      expect(isValidBp(301, 80)).toBe(false); // systolic too high
      expect(isValidBp(120, 29)).toBe(false); // diastolic too low
      expect(isValidBp(120, 201)).toBe(false); // diastolic too high
    });
  });

  describe("isValidKetones", () => {
    it("should accept valid ketone values", () => {
      expect(isValidKetones(0)).toBe(true);
      expect(isValidKetones(1.5)).toBe(true);
      expect(isValidKetones(10)).toBe(true); // maximum
    });

    it("should reject out-of-range ketones", () => {
      expect(isValidKetones(-0.1)).toBe(false);
      expect(isValidKetones(10.1)).toBe(false);
    });
  });
});

// ============================================================================
// CLINICAL THRESHOLD TESTS
// ============================================================================

describe("Clinical Thresholds", () => {
  describe("Glucose Thresholds", () => {
    it("should have correct high glucose threshold (110 mg/dL)", () => {
      expect(CLINICAL_THRESHOLDS.glucose.high).toBe(110);
    });

    it("should convert high glucose threshold to mmol/L correctly", () => {
      const thresholdMmol = getGlucoseThreshold("high", "mmol/L");
      expect(thresholdMmol).toBeCloseTo(6.1, 1);
    });

    it("should return mg/dL value unchanged", () => {
      const thresholdMgdl = getGlucoseThreshold("high", "mg/dL");
      expect(thresholdMgdl).toBe(110);
    });
  });

  describe("BP Thresholds", () => {
    it("should have correct BP thresholds", () => {
      expect(CLINICAL_THRESHOLDS.bp.systolic_high).toBe(140);
      expect(CLINICAL_THRESHOLDS.bp.diastolic_high).toBe(90);
    });
  });

  describe("Ketone Thresholds", () => {
    it("should have correct ketone ranges", () => {
      expect(CLINICAL_THRESHOLDS.ketones.minimal).toBe(0.5);
      expect(CLINICAL_THRESHOLDS.ketones.optimal_low).toBe(1.0);
      expect(CLINICAL_THRESHOLDS.ketones.optimal_high).toBe(3.0);
    });
  });
});

// ============================================================================
// UNIT CONFIGURATION TESTS
// ============================================================================

describe("Unit Configuration", () => {
  describe("getUnitConfig", () => {
    it("should return US units for US preference", () => {
      const config = getUnitConfig("US");
      expect(config.weight).toBe("lbs");
      expect(config.length).toBe("inches");
      expect(config.glucose).toBe("mg/dL");
    });

    it("should return Metric units for Metric preference", () => {
      const config = getUnitConfig("Metric");
      expect(config.weight).toBe("kg");
      expect(config.length).toBe("cm");
      expect(config.glucose).toBe("mmol/L");
    });
  });

  describe("getUnitLabels", () => {
    it("should return correct labels for US preference", () => {
      const labels = getUnitLabels("US");
      expect(labels.weight).toBe("lbs");
      expect(labels.waist).toBe("inches");
      expect(labels.glucose).toBe("mg/dL");
      expect(labels.ketones).toBe("mmol/L"); // always mmol/L
      expect(labels.bp).toBe("mmHg"); // always mmHg
    });

    it("should return correct labels for Metric preference", () => {
      const labels = getUnitLabels("Metric");
      expect(labels.weight).toBe("kg");
      expect(labels.waist).toBe("cm");
      expect(labels.glucose).toBe("mmol/L");
    });
  });
});

// ============================================================================
// NORMALIZATION TESTS
// ============================================================================

describe("Metric Normalization", () => {
  describe("normalizeMetricForStorage", () => {
    it("should normalize weight from lbs to kg", () => {
      const result = normalizeMetricForStorage({
        type: "WEIGHT",
        value: 165,
        userPreference: "US",
      });

      expect(result.normalizedValue).toBeCloseTo(74.84, 1);
      expect(result.rawUnit).toBe("lbs");
      expect(result.valueJson.value).toBe(165);
    });

    it("should normalize waist from inches to cm", () => {
      const result = normalizeMetricForStorage({
        type: "WAIST",
        value: 34,
        userPreference: "US",
      });

      expect(result.normalizedValue).toBeCloseTo(86.36, 1);
      expect(result.rawUnit).toBe("inches");
    });

    it("should normalize glucose from mmol/L to mg/dL", () => {
      const result = normalizeMetricForStorage({
        type: "GLUCOSE",
        value: 5.5,
        userPreference: "Metric",
      });

      expect(result.normalizedValue).toBeCloseTo(99.1, 0);
      expect(result.rawUnit).toBe("mmol/L");
    });

    it("should keep kg values unchanged for Metric users", () => {
      const result = normalizeMetricForStorage({
        type: "WEIGHT",
        value: 75,
        userPreference: "Metric",
      });

      expect(result.normalizedValue).toBe(75);
      expect(result.rawUnit).toBe("kg");
    });

    it("should handle BP (always mmHg)", () => {
      const result = normalizeMetricForStorage({
        type: "BP",
        systolic: 120,
        diastolic: 80,
        userPreference: "US",
      });

      expect(result.normalizedValue).toBeNull(); // BP uses two values
      expect(result.rawUnit).toBe("mmHg");
      expect(result.valueJson.systolic).toBe(120);
      expect(result.valueJson.diastolic).toBe(80);
    });

    it("should handle ketones (always mmol/L)", () => {
      const result = normalizeMetricForStorage({
        type: "KETONES",
        value: 1.5,
        userPreference: "US",
      });

      expect(result.normalizedValue).toBe(1.5);
      expect(result.rawUnit).toBe("mmol/L");
    });
  });

  describe("formatMetricForDisplay", () => {
    it("should format weight for US user", () => {
      const display = formatMetricForDisplay(
        "WEIGHT",
        75, // 75 kg stored
        { value: 165, unit: "lbs" },
        "US"
      );
      expect(display).toBe("165.3 lbs");
    });

    it("should format weight for Metric user", () => {
      const display = formatMetricForDisplay(
        "WEIGHT",
        75, // 75 kg stored
        { value: 75, unit: "kg" },
        "Metric"
      );
      expect(display).toBe("75 kg");
    });

    it("should format glucose for US user (mg/dL)", () => {
      const display = formatMetricForDisplay(
        "GLUCOSE",
        110, // 110 mg/dL stored
        { value: 110, unit: "mg/dL" },
        "US"
      );
      expect(display).toBe("110 mg/dL");
    });

    it("should format glucose for Metric user (mmol/L)", () => {
      const display = formatMetricForDisplay(
        "GLUCOSE",
        110, // 110 mg/dL stored
        { value: 110, unit: "mg/dL" },
        "Metric"
      );
      expect(display).toBe("6.1 mmol/L");
    });

    it("should format BP (always mmHg)", () => {
      const display = formatMetricForDisplay(
        "BP",
        null,
        { systolic: 120, diastolic: 80 },
        "US"
      );
      expect(display).toBe("120/80 mmHg");
    });
  });
});

// ============================================================================
// EDGE CASES AND PRECISION TESTS
// ============================================================================

describe("Edge Cases and Precision", () => {
  describe("Zero Handling", () => {
    it("should handle zero for all weight conversions", () => {
      expect(toKg(0, "lbs")).toBe(0);
      expect(fromKg(0, "lbs")).toBe(0);
    });

    it("should handle zero for all length conversions", () => {
      expect(toCm(0, "inches")).toBe(0);
      expect(fromCm(0, "inches")).toBe(0);
    });

    it("should handle zero for glucose conversions", () => {
      expect(toMgdl(0, "mmol/L")).toBe(0);
      expect(fromMgdl(0, "mmol/L")).toBe(0);
    });
  });

  describe("Precision Loss Prevention", () => {
    /**
     * These tests verify that repeated conversions don't accumulate errors
     */

    it("should maintain precision over multiple weight conversions", () => {
      let value = 100; // Start with 100 lbs
      for (let i = 0; i < 10; i++) {
        value = fromKg(toKg(value, "lbs"), "lbs");
      }
      expect(value).toBeCloseTo(100, 1);
    });

    it("should maintain precision over multiple glucose conversions", () => {
      let value = 100; // Start with 100 mg/dL
      for (let i = 0; i < 10; i++) {
        value = toMgdl(fromMgdl(value, "mmol/L"), "mmol/L");
      }
      expect(value).toBeCloseTo(100, 0);
    });
  });

  describe("Large Values", () => {
    it("should handle maximum weight correctly", () => {
      const maxKg = 500;
      const maxLbs = fromKg(maxKg, "lbs");
      expect(maxLbs).toBeCloseTo(1102.31, 0);
    });

    it("should handle maximum glucose correctly", () => {
      const maxMgdl = 600;
      const maxMmol = fromMgdl(maxMgdl, "mmol/L");
      expect(maxMmol).toBeCloseTo(33.3, 1);
    });
  });

  describe("Small Values", () => {
    it("should handle minimum weight correctly", () => {
      const minKg = 20;
      const minLbs = fromKg(minKg, "lbs");
      expect(minLbs).toBeCloseTo(44.09, 1);
    });

    it("should handle low glucose correctly", () => {
      const lowMgdl = 40;
      const lowMmol = fromMgdl(lowMgdl, "mmol/L");
      expect(lowMmol).toBeCloseTo(2.2, 1);
    });
  });
});

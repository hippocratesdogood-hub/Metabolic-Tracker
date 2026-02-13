# Unit Conversion Library Reference

> **Status**: Ready for integration (post-pilot, if user demand exists)
> **Location**: `shared/units.ts`
> **Tests**: `server/__tests__/units.test.ts` (99 tests, all passing)

---

## Overview

Type-safe unit conversion library for metabolic health metrics. Handles bidirectional conversion between US and Metric units with clinical-grade precision.

## Storage Standards

All values are stored in the database using consistent internal units:

| Metric | Storage Unit | Rationale |
|--------|-------------|-----------|
| Weight | kg | SI standard |
| Height/Waist | cm | SI standard |
| Glucose | mg/dL | Clinical thresholds are mg/dL-based |
| Blood Pressure | mmHg | Universal |
| Ketones | mmol/L | Universal |

---

## Quick Start

```typescript
import {
  toKg, fromKg,           // Weight
  toCm, fromCm,           // Length
  toMgdl, fromMgdl,       // Glucose
  formatWeight,           // Display formatting
  formatGlucose,
  getUnitConfig,          // User preference config
  normalizeMetricForStorage,
  formatMetricForDisplay,
} from '@shared/units';

// Convert user input to storage units
const weightKg = toKg(165, 'lbs');  // 74.84 kg

// Convert for display
const weightLbs = fromKg(75, 'lbs'); // 165.35 lbs

// Format with unit label
const display = formatWeight(75, 'lbs'); // "165.3 lbs"
```

---

## API Reference

### Weight Conversions

```typescript
// Convert TO storage unit (kg)
toKg(value: number, fromUnit: 'kg' | 'lbs'): number

// Convert FROM storage unit (kg)
fromKg(valueKg: number, toUnit: 'kg' | 'lbs'): number

// Convert between any units
convertWeight(value: number, fromUnit: WeightUnit, toUnit: WeightUnit): number
```

**Examples:**
```typescript
toKg(150, 'lbs')     // → 68.04
fromKg(70, 'lbs')    // → 154.32
convertWeight(100, 'lbs', 'kg')  // → 45.36
```

### Length Conversions

```typescript
// Convert TO storage unit (cm)
toCm(value: number, fromUnit: 'cm' | 'inches' | 'in'): number

// Convert FROM storage unit (cm)
fromCm(valueCm: number, toUnit: 'cm' | 'inches' | 'in'): number

// Convert between any units
convertLength(value: number, fromUnit: LengthUnit, toUnit: LengthUnit): number
```

**Examples:**
```typescript
toCm(36, 'inches')   // → 91.44
fromCm(100, 'inches') // → 39.37
```

### Glucose Conversions

```typescript
// Convert TO storage unit (mg/dL)
toMgdl(value: number, fromUnit: 'mg/dL' | 'mmol/L'): number

// Convert FROM storage unit (mg/dL)
fromMgdl(valueMgdl: number, toUnit: 'mg/dL' | 'mmol/L'): number

// Convert between any units
convertGlucose(value: number, fromUnit: GlucoseUnit, toUnit: GlucoseUnit): number
```

**Examples:**
```typescript
toMgdl(5.5, 'mmol/L')    // → 99.1
fromMgdl(100, 'mmol/L')  // → 5.55
fromMgdl(110, 'mmol/L')  // → 6.1 (high glucose threshold)
```

---

## Display Formatting

```typescript
// Format weight for display
formatWeight(valueKg: number, toUnit: WeightUnit, includeUnit?: boolean): string
// formatWeight(75, 'lbs') → "165.3 lbs"
// formatWeight(75, 'kg')  → "75 kg"

// Format length for display
formatLength(valueCm: number, toUnit: LengthUnit, includeUnit?: boolean): string
// formatLength(91.44, 'inches') → "36 inches"

// Format glucose for display
formatGlucose(valueMgdl: number, toUnit: GlucoseUnit, includeUnit?: boolean): string
// formatGlucose(110, 'mg/dL')  → "110 mg/dL"
// formatGlucose(110, 'mmol/L') → "6.1 mmol/L"

// Format blood pressure
formatBp(systolic: number, diastolic: number, includeUnit?: boolean): string
// formatBp(120, 80) → "120/80 mmHg"

// Format ketones
formatKetones(value: number, includeUnit?: boolean): string
// formatKetones(1.5) → "1.5 mmol/L"

// Round to decimal places
roundTo(value: number, decimals: number): number
// roundTo(3.14159, 2) → 3.14
```

---

## User Preference Handling

```typescript
type UnitsPreference = 'US' | 'Metric';

// Get unit configuration for preference
getUnitConfig(preference: UnitsPreference): UnitConfig
// getUnitConfig('US')     → { weight: 'lbs', length: 'inches', glucose: 'mg/dL' }
// getUnitConfig('Metric') → { weight: 'kg', length: 'cm', glucose: 'mmol/L' }

// Get display labels
getUnitLabels(preference: UnitsPreference): UnitLabels
// getUnitLabels('US') → { weight: 'lbs', waist: 'inches', glucose: 'mg/dL', ... }
```

---

## High-Level Functions

### Normalize for Storage

Convert user input to storage format with metadata:

```typescript
interface MetricInput {
  type: 'WEIGHT' | 'WAIST' | 'GLUCOSE' | 'KETONES' | 'BP';
  value?: number;
  systolic?: number;
  diastolic?: number;
  userPreference: UnitsPreference;
}

normalizeMetricForStorage(input: MetricInput): NormalizedMetric

// Example:
normalizeMetricForStorage({
  type: 'WEIGHT',
  value: 165,
  userPreference: 'US'
})
// → { normalizedValue: 74.84, rawUnit: 'lbs', valueJson: { value: 165, unit: 'lbs' } }
```

### Format for Display

Convert stored metric to user's display preference:

```typescript
formatMetricForDisplay(
  type: MetricType,
  normalizedValue: number | null,
  valueJson: Record<string, unknown>,
  userPreference: UnitsPreference
): string

// Example:
formatMetricForDisplay('WEIGHT', 75, { value: 75, unit: 'kg' }, 'US')
// → "165.3 lbs"
```

---

## Validation Functions

All validation uses storage units (kg, cm, mg/dL):

```typescript
isValidWeight(valueKg: number): boolean    // Range: 20-500 kg
isValidHeight(valueCm: number): boolean    // Range: 50-250 cm
isValidWaist(valueCm: number): boolean     // Range: 30-200 cm
isValidGlucose(valueMgdl: number): boolean // Range: 20-600 mg/dL
isValidBp(systolic: number, diastolic: number): boolean
isValidKetones(value: number): boolean     // Range: 0-10 mmol/L
```

---

## Clinical Thresholds

Access thresholds in user's preferred units:

```typescript
// Raw thresholds (mg/dL)
CLINICAL_THRESHOLDS.glucose.high        // 110
CLINICAL_THRESHOLDS.glucose.diabetic    // 126
CLINICAL_THRESHOLDS.bp.systolic_high    // 140
CLINICAL_THRESHOLDS.bp.diastolic_high   // 90

// Get in user's unit
getGlucoseThreshold('high', 'mmol/L')   // → 6.1
getGlucoseThreshold('high', 'mg/dL')    // → 110
```

---

## Conversion Constants

For reference, the exact conversion factors:

| Conversion | Factor | Source |
|------------|--------|--------|
| kg → lbs | 2.20462 | IEEE |
| lbs → kg | 0.453592 | 1 / 2.20462 |
| inch → cm | 2.54 | Exact by definition |
| cm → inch | 0.393701 | 1 / 2.54 |
| mmol/L → mg/dL | 18.0182 | Glucose MW 180.16 g/mol |
| mg/dL → mmol/L | 0.0555 | 1 / 18.0182 |

---

## Common Clinical Conversions

| mg/dL | mmol/L | Clinical Meaning |
|-------|--------|------------------|
| 70 | 3.9 | Hypoglycemia threshold |
| 100 | 5.5 | Normal fasting upper |
| 110 | 6.1 | App's high glucose flag |
| 126 | 7.0 | Diabetes diagnosis |
| 200 | 11.1 | Random diabetes threshold |

---

## Integration Notes (Future)

When integrating post-pilot:

1. **Add to user schema**: `unitsPreference: text("units_preference").default("US")`

2. **Update onboarding**: Save preference from form

3. **Update MetricEntryModal**:
   ```typescript
   const labels = getUnitLabels(user.unitsPreference);
   // Use labels.weight, labels.glucose, etc.
   ```

4. **Update metric displays**: Use `formatMetricForDisplay()`

5. **Update analytics**: Convert thresholds with `getGlucoseThreshold()`

See [UNIT_AUDIT_FINDINGS.md](./UNIT_AUDIT_FINDINGS.md) for full integration plan.

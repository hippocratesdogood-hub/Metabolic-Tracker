# Unit Consistency Audit Report

## Executive Summary

This audit examined unit handling across the Metabolic-Tracker codebase. **Critical issues were found**: the application captures user unit preferences during onboarding but does not persist them, and all metric displays are hardcoded to US units regardless of user preference.

A complete unit conversion library (`shared/units.ts`) has been created with 99 passing tests to address these issues, but **integration into the application is still required**.

---

## Current State

### What Works
- Clinical thresholds in `analytics.ts` use consistent mg/dL values
- Blood pressure (mmHg) and ketones (mmol/L) are universal - no conversion needed
- Schema has fields for unit normalization (`rawUnit`, `normalizedValue`) - but they're unused

### Critical Issues Found

#### 1. User Unit Preference Not Persisted
**Location**: [client/src/pages/onboarding.tsx:102-104](client/src/pages/onboarding.tsx#L102-L104)

The onboarding form collects unit preference:
```tsx
units: z.enum(["US", "Metric"]).default("US"),
```

But this value is **never saved** to the user record. The schema has no `units` or `unitPreference` field.

**Impact**: Users cannot configure their preferred units.

#### 2. UI Hardcoded to US Units
**Location**: [client/src/components/metrics/MetricEntryModal.tsx](client/src/components/metrics/MetricEntryModal.tsx)

```tsx
const units: Record<MetricType, string> = {
  BP: 'mmHg',
  WAIST: 'inches',      // Should respect user preference
  GLUCOSE: 'mg/dL',     // Should respect user preference
  KETONES: 'mmol/L',
  WEIGHT: 'lbs',        // Should respect user preference
};
```

**Impact**: International users see unfamiliar units (lbs instead of kg, inches instead of cm).

#### 3. No Conversion Layer
There is no code path that:
- Converts user input from display units to storage units before saving
- Converts stored values to display units for rendering

**Impact**: If a user enters weight in kg, it would be stored as-is and displayed with "lbs" label - showing incorrect data.

#### 4. Schema Fields Unused
**Location**: [shared/schema.ts](shared/schema.ts)

The `metricEntries` table has:
```typescript
rawUnit: text("raw_unit"),
normalizedValue: real("normalized_value"),
```

These fields exist but are **never populated**. All metrics store raw values in `valueJson` without normalization.

---

## Units Inventory

### Metrics Requiring Conversion

| Metric | Storage Unit | US Display | Metric Display |
|--------|-------------|------------|----------------|
| Weight | kg | lbs | kg |
| Height | cm | inches | cm |
| Waist | cm | inches | cm |
| Glucose | mg/dL | mg/dL | mmol/L |

### Universal Units (No Conversion)

| Metric | Unit | Notes |
|--------|------|-------|
| Blood Pressure | mmHg | Standard worldwide |
| Ketones | mmol/L | Standard worldwide |

---

## Conversion Constants

These scientifically accurate constants are implemented in `shared/units.ts`:

| Conversion | Factor | Notes |
|------------|--------|-------|
| kg → lbs | × 2.20462 | |
| lbs → kg | × 0.453592 | |
| cm → inches | × 0.393701 | |
| inches → cm | × 2.54 | Exact by definition |
| mg/dL → mmol/L | ÷ 18.0182 | Glucose molecular weight |
| mmol/L → mg/dL | × 18.0182 | |

---

## Clinical Thresholds

All clinical thresholds are stored in mg/dL (US standard) and should be converted for display to Metric users:

| Threshold | mg/dL | mmol/L |
|-----------|-------|--------|
| High Glucose Flag | 110 | 6.1 |
| Normal Upper | 100 | 5.5 |
| Prediabetic Upper | 125 | 6.9 |
| Diabetic | 126 | 7.0 |
| High BP Systolic | 140 mmHg | - |
| High BP Diastolic | 90 mmHg | - |

---

## Solution: shared/units.ts

A comprehensive unit conversion library has been created with:

### Core Functions

```typescript
// Weight conversions
toKg(value, fromUnit)    // Convert to storage unit
fromKg(value, toUnit)    // Convert for display

// Length conversions
toCm(value, fromUnit)    // Convert to storage unit
fromCm(value, toUnit)    // Convert for display

// Glucose conversions
toMgdl(value, fromUnit)  // Convert to storage unit
fromMgdl(value, toUnit)  // Convert for display
```

### High-Level Functions

```typescript
// Get user's unit configuration
getUnitConfig(preference: "US" | "Metric")

// Get display labels
getUnitLabels(preference)

// Normalize input for storage
normalizeMetricForStorage(input)

// Format for display
formatMetricForDisplay(type, normalizedValue, valueJson, preference)
```

### Validation

```typescript
isValidWeight(valueKg)
isValidHeight(valueCm)
isValidWaist(valueCm)
isValidGlucose(valueMgdl)
isValidBp(systolic, diastolic)
isValidKetones(value)
```

---

## Recommended Integration Steps

### Step 1: Add Unit Preference to User Schema
```typescript
// In shared/schema.ts, add to users table:
unitsPreference: text("units_preference").default("US"), // "US" | "Metric"
```

### Step 2: Persist Preference in Onboarding
```typescript
// In onboarding route, save the units preference:
await db.update(users)
  .set({ unitsPreference: data.units })
  .where(eq(users.id, userId));
```

### Step 3: Update Metric Entry Modal
```typescript
// Import the conversion library
import { getUnitLabels, normalizeMetricForStorage } from '@shared/units';

// Get labels based on user preference
const labels = getUnitLabels(user.unitsPreference);

// Before saving, normalize the value
const normalized = normalizeMetricForStorage({
  type: metricType,
  value: inputValue,
  userPreference: user.unitsPreference
});
```

### Step 4: Update Metric Displays
```typescript
// When displaying stored metrics
import { formatMetricForDisplay } from '@shared/units';

const displayValue = formatMetricForDisplay(
  metric.type,
  metric.normalizedValue,
  metric.valueJson,
  user.unitsPreference
);
```

### Step 5: Update Analytics Dashboard
Convert clinical thresholds when displaying to Metric users:
```typescript
import { getGlucoseThreshold } from '@shared/units';

const highGlucoseThreshold = getGlucoseThreshold('high', user.unitsPreference);
// Returns 110 for US, 6.1 for Metric
```

---

## Test Coverage

The unit conversion library has comprehensive test coverage:

| Test Category | Count |
|--------------|-------|
| Weight Conversions | 14 |
| Length Conversions | 16 |
| Glucose Conversions | 18 |
| Formatting | 14 |
| Validation | 24 |
| Clinical Thresholds | 6 |
| Unit Configuration | 7 |
| Normalization | 14 |
| Edge Cases | 12 |
| **Total** | **99** |

All tests passing as of audit completion.

---

## Files Changed/Created

### Created
- `shared/units.ts` - Complete unit conversion library
- `server/__tests__/units.test.ts` - 99 unit tests
- `docs/UNIT_AUDIT_FINDINGS.md` - This report

### Requires Changes (Not Yet Modified)
- `shared/schema.ts` - Add unitsPreference to users table
- `client/src/pages/onboarding.tsx` - Persist preference
- `client/src/components/metrics/MetricEntryModal.tsx` - Use dynamic units
- `server/routes.ts` - Include user preference in API responses

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Incorrect medical readings | **HIGH** | Unit validation prevents invalid values |
| User confusion | Medium | Clear unit labels on all inputs |
| Data migration | Low | Existing data is in US units, can backfill normalizedValue |

---

## Conclusion

The codebase has a solid foundation for unit handling (schema fields exist, clinical thresholds are consistent), but the integration layer is missing. The `shared/units.ts` library provides all necessary conversion, formatting, and validation functions. Implementation requires connecting this library to the UI layer and persisting user preferences.

**Priority**: High - International users cannot correctly log metrics with the current implementation.

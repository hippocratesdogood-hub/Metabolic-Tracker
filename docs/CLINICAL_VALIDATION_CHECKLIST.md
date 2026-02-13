# Clinical Decision Logic Validation Checklist

**Version:** 1.0
**Purpose:** Clinical review document for validating all threshold values, alert logic, and recommendations in the Metabolic-Tracker application.
**Review Status:** PENDING CLINICAL REVIEW

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Clinical Thresholds Inventory](#clinical-thresholds-inventory)
3. [Alert and Warning Logic](#alert-and-warning-logic)
4. [Automated Prompt Triggers](#automated-prompt-triggers)
5. [Recommendation Logic](#recommendation-logic)
6. [Personalization by User Profile](#personalization-by-user-profile)
7. [Validation Checklist](#validation-checklist)
8. [Sign-Off Section](#sign-off-section)

---

## Executive Summary

This document catalogs all clinical decision logic implemented in the Metabolic-Tracker application. All threshold values, alert conditions, and automated recommendations require clinical validation before production use.

### Quick Reference: Thresholds in Use

| Metric | Threshold | Action | Location |
|--------|-----------|--------|----------|
| Glucose (fasting) | ≥ 110 mg/dL | Health flag after 3 days | [analytics.ts:238](server/analytics.ts#L238) |
| BP Systolic | ≥ 140 mmHg | Health flag after 2 days | [analytics.ts:265](server/analytics.ts#L265) |
| BP Diastolic | ≥ 90 mmHg | Health flag after 2 days | [analytics.ts:265](server/analytics.ts#L265) |
| Missed Logging | ≥ 3 days | Health flag | [analytics.ts:308](server/analytics.ts#L308) |
| Protein compliance | ±10% of target | "Meeting target" | [analytics.ts:384](server/analytics.ts#L384) |
| Carb compliance | >110% of target | "Over carbs" | [analytics.ts:388](server/analytics.ts#L388) |

---

## Clinical Thresholds Inventory

### 1. Glucose Thresholds

**Source:** [shared/units.ts:219-225](shared/units.ts#L219-L225)

| Threshold Name | Value | Unit | Clinical Significance | Validation |
|----------------|-------|------|----------------------|------------|
| `high` | 110 | mg/dL | Triggers health flag | [ ] Approved |
| `normal_upper` | 100 | mg/dL | Upper normal limit | [ ] Approved |
| `prediabetic_upper` | 125 | mg/dL | Prediabetic range | [ ] Approved |
| `diabetic` | 126 | mg/dL | Diabetic threshold | [ ] Approved |

**Code Reference:**
```typescript
glucose: {
  high: 110,           // mg/dL - triggers health flag
  normal_upper: 100,   // mg/dL - upper normal limit
  prediabetic_upper: 125, // mg/dL - prediabetic range
  diabetic: 126,       // mg/dL - diabetic threshold
}
```

**Clinical Notes:**
- Flag threshold (110 mg/dL) is below ADA impaired fasting glucose threshold (100 mg/dL)
- Consider whether 110 mg/dL is appropriate for early intervention vs. standard clinical thresholds

**Questions for Clinical Review:**
1. Is 110 mg/dL appropriate as the alert threshold for this population?
2. Should the system distinguish between "elevated" (100-109) and "high" (≥110)?
3. Is fasting state being properly validated for glucose readings?

---

### 2. Blood Pressure Thresholds

**Source:** [shared/units.ts:226-232](shared/units.ts#L226-L232)

| Threshold Name | Systolic | Diastolic | Unit | Clinical Significance | Validation |
|----------------|----------|-----------|------|----------------------|------------|
| `high` | 140 | 90 | mmHg | Triggers health flag (Stage 2) | [ ] Approved |
| `elevated` | 130 | 80 | mmHg | Reference (not active alert) | [ ] Approved |
| `normal` | 120 | 80 | mmHg | Reference | [ ] Approved |

**Code Reference:**
```typescript
bp: {
  systolic_high: 140,      // mmHg - always mmHg
  diastolic_high: 90,      // mmHg - always mmHg
  systolic_elevated: 130,
  diastolic_elevated: 80,
  systolic_normal: 120,
  diastolic_normal: 80,
}
```

**Clinical Notes:**
- Alert uses OR logic: systolic ≥ 140 OR diastolic ≥ 90
- 2024 AHA guidelines classify 140/90 as Stage 2 Hypertension
- Elevated (130-139/80-89) is tracked but does not trigger alerts

**Questions for Clinical Review:**
1. Should Stage 1 Hypertension (130-139/80-89) trigger any alerts?
2. Is OR logic appropriate, or should it be AND logic?
3. Should the system account for isolated systolic hypertension differently?

---

### 3. Ketone Thresholds

**Source:** [shared/units.ts:233-239](shared/units.ts#L233-L239)

| Threshold Name | Value | Unit | Clinical Significance | Validation |
|----------------|-------|------|----------------------|------------|
| `minimal` | 0.5 | mmol/L | Below ketosis | [ ] Approved |
| `optimal_low` | 1.0 | mmol/L | Nutritional ketosis begins | [ ] Approved |
| `optimal_high` | 3.0 | mmol/L | Upper optimal range | [ ] Approved |
| `high` | 5.0 | mmol/L | Medical concern threshold | [ ] Approved |

**Code Reference:**
```typescript
ketones: {
  minimal: 0.5,      // mmol/L - always mmol/L
  optimal_low: 1.0,
  optimal_high: 3.0,
  high: 5.0,
}
```

**Current Implementation Status:** REFERENCE ONLY - No active alerts implemented for ketones

**Questions for Clinical Review:**
1. Should the app alert at ketone levels > 5.0 mmol/L?
2. Is the 1.0-3.0 mmol/L optimal range appropriate for this population?
3. Should there be guidance for Type 1 diabetics or other DKA-risk populations?

---

### 4. Validation Range Thresholds

**Source:** [shared/units.ts:370-420](shared/units.ts#L370-L420)

These ranges validate data entry to prevent clearly erroneous values.

| Metric | Min | Max | Unit | Validation |
|--------|-----|-----|------|------------|
| Weight | 20 | 500 | kg | [ ] Approved |
| Height | 50 | 250 | cm | [ ] Approved |
| Waist | 30 | 200 | cm | [ ] Approved |
| Glucose | 20 | 600 | mg/dL | [ ] Approved |
| BP Systolic | 50 | 300 | mmHg | [ ] Approved |
| BP Diastolic | 30 | 200 | mmHg | [ ] Approved |
| Ketones | 0 | 10 | mmol/L | [ ] Approved |

**Additional BP Validation:** Systolic must be greater than diastolic

---

## Alert and Warning Logic

### Health Flag System

**Source:** [server/analytics.ts:200-329](server/analytics.ts#L200-L329)

The system generates health flags for coach/admin review. These are NOT patient-facing alerts.

#### Flag 1: High Glucose

| Parameter | Value | Validation |
|-----------|-------|------------|
| Threshold | ≥ 110 mg/dL | [ ] Approved |
| Required occurrences | 3 unique days | [ ] Approved |
| Lookback window | 3 days | [ ] Approved |
| Flag type | `high_glucose` | [ ] Approved |

**Logic:**
```typescript
// Count unique days with glucose >= 110
if (value >= 110) {
  highGlucoseDays.add(dateString);
}
// Flag if 3+ days elevated
if (highGlucoseDays.size >= 3) {
  // Generate flag
}
```

**Clinical Implications:**
- Requires consistently elevated readings (not a single spike)
- 3-day window may miss patterns with gaps
- Coach receives notification for intervention

---

#### Flag 2: Elevated Blood Pressure

| Parameter | Value | Validation |
|-----------|-------|------------|
| Systolic threshold | ≥ 140 mmHg | [ ] Approved |
| Diastolic threshold | ≥ 90 mmHg | [ ] Approved |
| Logic | OR (either triggers) | [ ] Approved |
| Required occurrences | 2 unique days | [ ] Approved |
| Lookback window | 7 days | [ ] Approved |
| Flag type | `elevated_bp` | [ ] Approved |

**Logic:**
```typescript
if (systolic >= 140 || diastolic >= 90) {
  elevatedBpDays.add(dateString);
}
if (elevatedBpDays.size >= 2) {
  // Generate flag
}
```

**Clinical Implications:**
- Uses Stage 2 Hypertension threshold
- OR logic means isolated systolic or diastolic elevation triggers
- Lower occurrence threshold (2 vs 3) reflects BP variability

---

#### Flag 3: Missed Logging

| Parameter | Value | Validation |
|-----------|-------|------------|
| Inactivity threshold | 3 days | [ ] Approved |
| Applies to | New accounts (no logs) | [ ] Approved |
| Applies to | Stopped logging | [ ] Approved |
| Flag type | `missed_logging` | [ ] Approved |

**Logic:**
```typescript
// Scenario 1: Never logged
if (daysSinceCreation >= 3 && noLogs) {
  // Flag: "No logs since account creation"
}

// Scenario 2: Stopped logging
if (daysSinceLastLog >= 3) {
  // Flag: "No logs for X days"
}
```

---

#### Flag 4: Low Ketones (RESERVED)

| Status | NOT IMPLEMENTED |
|--------|-----------------|

**Note:** The `low_ketones` flag type is defined in the schema but detection logic has not been implemented.

**Questions for Clinical Review:**
1. Should low ketone alerts be implemented?
2. What threshold would indicate concerning low ketones?
3. Is this relevant only for ketogenic diet protocols?

---

## Automated Prompt Triggers

**Source:** [server/services/promptEngine.ts](server/services/promptEngine.ts)

The prompt engine sends automated coaching messages based on health data.

### Prompt Trigger Types

| Type | Description | Backfill Sensitive |
|------|-------------|-------------------|
| `schedule` | Time-based (daily, weekly) | No |
| `event` | Metric-triggered | Yes - skips backfilled entries |
| `missed` | Inactivity-triggered | No |

### Event-Triggered Prompt Conditions

#### Glucose Events

**Source:** [promptEngine.ts:332-347](server/services/promptEngine.ts#L332-L347)

| Condition | Operator | Value | Days Required | Validation |
|-----------|----------|-------|---------------|------------|
| High glucose consecutive | gte | 110 mg/dL | 3 | [ ] Approved |
| Single high reading | gte | (configurable) | 1 | [ ] Approved |

**Logic for consecutive days:**
```typescript
// High glucose flag: >= 110 on 3+ consecutive days
if (consecutiveDays && consecutiveDays >= 3) {
  return glucose.highDays >= consecutiveDays;
}
```

---

#### Blood Pressure Events

**Source:** [promptEngine.ts:352-387](server/services/promptEngine.ts#L352-L387)

| Condition | Systolic | Diastolic | Days Required | Validation |
|-----------|----------|-----------|---------------|------------|
| Elevated BP consecutive | ≥ 140 | ≥ 90 | 2 | [ ] Approved |
| Single elevated reading | (configurable) | (configurable) | 1 | [ ] Approved |

**Logic:**
```typescript
// If both thresholds provided, trigger if EITHER is exceeded
if (hasSystolic && hasDiastolic) {
  return systolicMatch || diastolicMatch; // Either triggers
} else if (hasSystolic) {
  return systolicMatch;
} else if (hasDiastolic) {
  return diastolicMatch;
}
```

---

#### Missed Logging Events

**Source:** [promptEngine.ts:270-278](server/services/promptEngine.ts#L270-L278)

| Condition | Default | Configurable | Validation |
|-----------|---------|--------------|------------|
| Days without any log | 3 | Yes | [ ] Approved |

---

### Pre-Configured Prompt Rules

From [docs/PROMPT_SYSTEM.md](docs/PROMPT_SYSTEM.md):

| Rule Key | Trigger | Condition | Cooldown | Validation |
|----------|---------|-----------|----------|------------|
| `rule_high_glucose_3d` | event | glucose ≥ 110 for 3 days | 24h | [ ] Approved |
| `rule_bp_140_90_twice_in_7d` | event | BP ≥ 140/90 for 2 days | 48h | [ ] Approved |
| `rule_missed_3d` | missed | no logs for 3 days | 24h | [ ] Approved |
| `rule_daily_morning` | schedule | 8am daily | 24h | [ ] Approved |

---

## Recommendation Logic

### Macro Compliance Calculations

**Source:** [server/analytics.ts:332-410](server/analytics.ts#L332-L410)

| Metric | Calculation | Threshold | Interpretation | Validation |
|--------|-------------|-----------|----------------|------------|
| Protein compliance | avg daily vs target | ±10% | "Meeting target" | [ ] Approved |
| Carb compliance | avg daily vs target | >110% | "Over carbs" | [ ] Approved |
| Default carb target | - | 100g | Used if not set | [ ] Approved |

**Logic:**
```typescript
// Protein: within ±10% of target
if (Math.abs(avgDailyProtein - proteinTarget) / proteinTarget <= 0.1) {
  meetingProtein++;
}

// Carbs: over 110% of target
if (avgDailyCarbs > carbsTarget * 1.1) {
  overCarbs++;
}
```

**Questions for Clinical Review:**
1. Is ±10% an appropriate tolerance for protein targets?
2. Should carb threshold be symmetric (flag if under 90% as well)?
3. Is 100g a clinically appropriate default carb target?

---

### AI Food Analysis Quality Score

**Source:** [server/routes.ts:387-428](server/routes.ts#L387-L428)

The AI generates a 0-100 "quality score" based on:

| Factor | Impact | Validation |
|--------|--------|------------|
| High protein | Increases score | [ ] Approved |
| Low carbohydrate | Increases score | [ ] Approved |
| Whole foods | Increases score | [ ] Approved |
| Processed foods | Decreases score | [ ] Approved |
| Added sugars | Decreases score | [ ] Approved |

**Score Interpretation:**
| Score Range | Meaning |
|-------------|---------|
| 80-100 | Excellent (high protein, low carb) |
| 60-79 | Good (balanced) |
| 40-59 | Fair (moderate carbs) |
| 20-39 | Poor (high carb, low protein) |
| 0-19 | Very poor (ultra-processed) |

**Note:** Score is AI-generated and not rule-based. Results may vary.

---

## Personalization by User Profile

### Template Personalization Tokens

**Source:** [promptEngine.ts:440-523](server/services/promptEngine.ts#L440-L523)

Automated prompts can include personalized data:

| Token | Data Source | Example Output |
|-------|-------------|----------------|
| `{{name}}` | User's full name | "Alex Rivera" |
| `{{firstName}}` | First name | "Alex" |
| `{{glucose.latest}}` | Most recent glucose | "105" |
| `{{glucose.average}}` | 7-day average | "98" |
| `{{glucose.highDays}}` | Days ≥ 110 in window | "2" |
| `{{bp.latest}}` | Most recent BP | "128/82" |
| `{{bp.elevatedDays}}` | Days elevated | "1" |
| `{{weight.latest}}` | Most recent weight | "185.5" |
| `{{weight.change}}` | 30-day change | "-3.2" |
| `{{ketones.latest}}` | Most recent ketones | "1.2" |
| `{{daysSinceLog}}` | Inactivity days | "3" |
| `{{target.protein}}` | Protein target (g) | "120" |
| `{{target.carbs}}` | Carb target (g) | "100" |
| `{{target.calories}}` | Calorie target | "1800" |

### User-Specific Context Loaded

**Source:** [promptEngine.ts:583-648](server/services/promptEngine.ts#L583-L648)

| Context | Lookback | Usage |
|---------|----------|-------|
| Metrics (all types) | 30 days | Personalization, rule evaluation |
| Last log date | All time | Inactivity detection |
| Macro targets | Current | Personalization |
| 7-day glucose average | 7 days | Personalization |
| 3-day high glucose count | 3 days | Rule evaluation |

---

## Validation Checklist

### Threshold Validation

| # | Item | Approved | Reviewer | Date |
|---|------|----------|----------|------|
| 1 | Glucose flag threshold (110 mg/dL) | [ ] | | |
| 2 | Glucose flag window (3 days) | [ ] | | |
| 3 | BP flag threshold (140/90 mmHg) | [ ] | | |
| 4 | BP flag window (7 days, 2 occurrences) | [ ] | | |
| 5 | Missed logging threshold (3 days) | [ ] | | |
| 6 | Protein compliance tolerance (±10%) | [ ] | | |
| 7 | Carb overrun threshold (>110%) | [ ] | | |
| 8 | Default carb target (100g) | [ ] | | |

### Alert Logic Validation

| # | Item | Approved | Reviewer | Date |
|---|------|----------|----------|------|
| 9 | BP uses OR logic (sys OR dia) | [ ] | | |
| 10 | Glucose requires 3 unique days, not consecutive | [ ] | | |
| 11 | Backfilled entries don't trigger prompts | [ ] | | |
| 12 | Cooldown periods prevent spam | [ ] | | |

### Safety Validation

| # | Item | Approved | Reviewer | Date |
|---|------|----------|----------|------|
| 13 | App clearly states it's not emergency care | [ ] | | |
| 14 | BP prompt advises seeking care for symptoms | [ ] | | |
| 15 | No automated medication advice | [ ] | | |
| 16 | Coaches notified of flags (not just participants) | [ ] | | |

### Data Quality Validation

| # | Item | Approved | Reviewer | Date |
|---|------|----------|----------|------|
| 17 | Validation ranges prevent impossible values | [ ] | | |
| 18 | BP systolic must exceed diastolic | [ ] | | |
| 19 | Zero values handled correctly | [ ] | | |
| 20 | Missing data doesn't cause false positives | [ ] | | |

---

## Recommendations for Clinical Review

### Issues Requiring Attention

1. **Glucose Threshold Alignment**
   - Current: 110 mg/dL for flag
   - ADA Impaired Fasting Glucose: ≥100 mg/dL
   - ADA Diabetes: ≥126 mg/dL
   - **Decision needed:** Should 110 be the early intervention threshold?

2. **BP Stage 1 Not Flagged**
   - 130-139/80-89 is classified as Stage 1 Hypertension
   - Currently only Stage 2 (≥140/≥90) triggers flags
   - **Decision needed:** Add Stage 1 alerts?

3. **Ketone Monitoring**
   - Thresholds defined but no active alerts
   - **Decision needed:** Implement DKA-risk monitoring?

4. **Carb Target Default**
   - 100g used when not set
   - **Decision needed:** Is this appropriate for metabolic health population?

### Missing Clinical Features

1. No medication tracking or interaction checking
2. No lab value integration (HbA1c, lipids)
3. No symptom logging
4. No emergency escalation pathway
5. No Type 1 vs Type 2 diabetes differentiation

---

## Sign-Off Section

### Clinical Review Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Clinical Lead | | | |
| Medical Director | | | |
| Compliance Officer | | | |

### Technical Review Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Technical Lead | | | |
| QA Lead | | | |

### Approval Status

- [ ] **APPROVED FOR PILOT** - All thresholds validated for controlled pilot use
- [ ] **APPROVED FOR PRODUCTION** - All thresholds validated for general use
- [ ] **CHANGES REQUIRED** - See notes below

### Change Notes

_Document any required changes before approval:_

1.
2.
3.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | System | Initial creation |

---

## File References

| File | Description |
|------|-------------|
| [shared/units.ts](shared/units.ts) | Clinical threshold constants |
| [server/analytics.ts](server/analytics.ts) | Health flag logic |
| [server/services/promptEngine.ts](server/services/promptEngine.ts) | Automated prompt triggers |
| [docs/PROMPT_SYSTEM.md](docs/PROMPT_SYSTEM.md) | Prompt system documentation |
| [docs/METABOLIC_CALCULATIONS.md](docs/METABOLIC_CALCULATIONS.md) | Calculation reference |

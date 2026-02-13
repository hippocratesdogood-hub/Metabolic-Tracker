# Metabolic Health Calculations Reference

**Version:** 1.0
**Last Updated:** February 2026
**Purpose:** Clinical staff reference for all health metrics, calculations, and analytics in the Metabolic-Tracker application.

---

## Table of Contents

1. [Metric Types and Data Sources](#metric-types-and-data-sources)
2. [Glucose Metrics](#glucose-metrics)
3. [Blood Pressure Metrics](#blood-pressure-metrics)
4. [Weight and Body Composition](#weight-and-body-composition)
5. [Ketone Metrics](#ketone-metrics)
6. [Food and Nutrition Analysis](#food-and-nutrition-analysis)
7. [Composite Scores](#composite-scores)
8. [Health Flags (Alerts)](#health-flags-alerts)
9. [Macro Compliance Analytics](#macro-compliance-analytics)
10. [Outcome Tracking](#outcome-tracking)
11. [Coach Workload Metrics](#coach-workload-metrics)

---

## Metric Types and Data Sources

### Supported Metric Types

**File:** [shared/schema.ts:9](shared/schema.ts#L9)

```typescript
metricTypeEnum = ["BP", "WAIST", "GLUCOSE", "KETONES", "WEIGHT"]
```

| Type | Description | Units | Storage Format |
|------|-------------|-------|----------------|
| `GLUCOSE` | Fasting blood glucose | mg/dL | `{ value: number }` or `{ fasting: number }` |
| `BP` | Blood pressure | mmHg | `{ systolic: number, diastolic: number }` |
| `WEIGHT` | Body weight | lbs or kg | `{ value: number }` or `{ weight: number }` |
| `WAIST` | Waist circumference | inches or cm | `{ value: number }` or `{ waist: number }` |
| `KETONES` | Blood ketone level | mmol/L | `{ value: number }` |

### Data Storage Schema

**File:** [shared/schema.ts:89-103](shared/schema.ts#L89-L103)

```typescript
metricEntries = pgTable("metric_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: metricTypeEnum("type").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  valueJson: jsonb("value_json").notNull(),  // Stores the metric value
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### Value Extraction Pattern

Throughout the codebase, metric values are extracted with fallback patterns to handle legacy data formats:

```typescript
// Common extraction patterns (see analytics.ts:421-442)
value = val?.value || val?.fasting || 0;    // For GLUCOSE
value = val?.systolic || 0;                   // For BP systolic
value = val?.diastolic || 0;                  // For BP diastolic
value = val?.value || val?.weight || 0;       // For WEIGHT
value = val?.value || val?.waist || 0;        // For WAIST
```

---

## Glucose Metrics

### Data Input
- **Source:** Manual participant entry
- **Frequency:** Daily (morning fasting recommended)
- **Units:** mg/dL

### Value Structure
```json
{
  "value": 95,
  "fasting": true
}
```

### Clinical Thresholds Used

**File:** [server/analytics.ts:227](server/analytics.ts#L227)

| Threshold | Value | Clinical Significance |
|-----------|-------|----------------------|
| High Fasting Glucose | ≥ 110 mg/dL | Flags participant for elevated glucose |
| Normal Range | < 100 mg/dL | Optimal metabolic state |
| Pre-diabetic | 100-125 mg/dL | Increased monitoring recommended |

### Glucose Flag Calculation

**File:** [server/analytics.ts:219-243](server/analytics.ts#L219-L243)

**Algorithm:**
1. Filter glucose entries from the last 3 days
2. For each entry, extract value using `val?.value || val?.fasting || 0`
3. Count unique days where glucose ≥ 110 mg/dL
4. If ≥ 3 days with high glucose → trigger `high_glucose` flag

```typescript
const highGlucoseDays = new Set<string>();
glucoseEntries.forEach(e => {
  const val = e.valueJson as any;
  const value = val?.value || val?.fasting || 0;
  if (value >= 110) {
    highGlucoseDays.add(e.timestamp.toISOString().split('T')[0]);
  }
});

if (highGlucoseDays.size >= 3) {
  // Flag triggered
}
```

---

## Blood Pressure Metrics

### Data Input
- **Source:** Manual participant entry
- **Frequency:** Daily or as directed
- **Units:** mmHg (systolic/diastolic)

### Value Structure
```json
{
  "systolic": 120,
  "diastolic": 80
}
```

### Clinical Thresholds Used

**File:** [server/analytics.ts:254](server/analytics.ts#L254)

| Category | Systolic | Diastolic | Application |
|----------|----------|-----------|-------------|
| **Elevated (Flag)** | ≥ 140 | OR ≥ 90 | Triggers health flag |
| Normal | < 120 | AND < 80 | Optimal range |
| Elevated | 120-129 | AND < 80 | Watch status |
| Stage 1 Hypertension | 130-139 | OR 80-89 | Intervention needed |
| Stage 2 Hypertension | ≥ 140 | OR ≥ 90 | Urgent attention |

### Blood Pressure Flag Calculation

**File:** [server/analytics.ts:245-270](server/analytics.ts#L245-L270)

**Algorithm:**
1. Filter BP entries from the configured range (default 7 days)
2. For each entry, extract systolic and diastolic values
3. Count unique days where systolic ≥ 140 OR diastolic ≥ 90
4. If ≥ 2 days elevated → trigger `elevated_bp` flag

```typescript
const elevatedBpDays = new Set<string>();
bpEntries.forEach(e => {
  const val = e.valueJson as any;
  const systolic = val?.systolic || 0;
  const diastolic = val?.diastolic || 0;
  if (systolic >= 140 || diastolic >= 90) {
    elevatedBpDays.add(e.timestamp.toISOString().split('T')[0]);
  }
});

if (elevatedBpDays.size >= 2) {
  // Flag triggered
}
```

---

## Weight and Body Composition

### Weight Metric

**Data Input:**
- **Source:** Manual participant entry
- **Frequency:** Weekly recommended, daily optional
- **Units:** Pounds (lbs) or kilograms (kg) - user preference

**Value Structure:**
```json
{
  "value": 185.5
}
```

### Waist Circumference

**Data Input:**
- **Source:** Manual participant entry
- **Frequency:** Weekly recommended
- **Units:** Inches or centimeters - user preference

**Value Structure:**
```json
{
  "value": 34.5
}
```

### Outcome Change Calculation

**File:** [server/analytics.ts:412-437](server/analytics.ts#L412-L437)

**Algorithm for Weight/Waist Change:**
1. Query all metric entries within the analysis range (default 30 days)
2. For each participant, sort their entries chronologically
3. Require minimum 2 data points to calculate change
4. Calculate: `change = latest_value - earliest_value`
5. Compute mean change across all participants with sufficient data

```typescript
const calculateChange = (type: string, valueExtractor: (val: any) => number): OutcomeMetric => {
  const changes: number[] = [];

  for (const userId of participantIds) {
    const userEntries = metricEntries
      .filter(e => e.userId === userId && e.type === type)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (userEntries.length >= 2) {
      const earliest = valueExtractor(userEntries[0].valueJson);
      const latest = valueExtractor(userEntries[userEntries.length - 1].valueJson);
      if (earliest && latest) {
        changes.push(latest - earliest);
      }
    }
  }

  return {
    meanChange: changes.length > 0
      ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10
      : 0,
    participantCount: changes.length,
    limitedData: changes.length < 5,  // Flag if insufficient sample size
  };
};
```

**Output Interpretation:**
- Negative weight change = weight loss (positive outcome)
- Negative waist change = waist reduction (positive outcome)
- `limitedData: true` when fewer than 5 participants have sufficient data points

---

## Ketone Metrics

### Data Input
- **Source:** Manual participant entry (blood ketone meter)
- **Frequency:** As directed by protocol
- **Units:** mmol/L

### Value Structure
```json
{
  "value": 0.8
}
```

### Clinical Thresholds (Reference)

| Level | Range (mmol/L) | Metabolic State |
|-------|---------------|-----------------|
| Below threshold | < 0.5 | Not in ketosis |
| Light ketosis | 0.5 - 1.0 | Light nutritional ketosis |
| Optimal ketosis | 1.0 - 3.0 | Optimal for weight loss |
| High ketosis | 3.0 - 5.0 | Post-exercise or fasting ketosis |
| Medical concern | > 5.0 | Consult physician |

**Note:** The system includes a `low_ketones` flag type in the schema ([server/analytics.ts:17](server/analytics.ts#L17)) but the detection logic is not currently implemented in the getFlags() function.

---

## Food and Nutrition Analysis

### Data Sources

1. **Manual Text Entry** - Participant describes meal in free text
2. **Image Analysis** - Participant uploads meal photo
3. **AI Analysis** - GPT-4o-mini processes input

### AI Food Analysis

**File:** [server/routes.ts:387-428](server/routes.ts#L387-L428) (text)
**File:** [server/routes.ts:430-505](server/routes.ts#L430-L505) (image)

**Model:** `gpt-4o-mini`

**AI System Prompt:**
```
You are a nutrition analysis AI. Analyze the food description and provide accurate macro estimates.
Return a JSON object with this exact structure:
{
  "foods_detected": [{"name": "food name", "portion": "portion size", "confidence": 0.85}],
  "macros": {"calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number},
  "qualityScore": number (0-100, based on nutritional quality for metabolic health),
  "notes": "brief coaching note about the meal",
  "suggestedMealType": "Breakfast" | "Lunch" | "Dinner" | "Snack",
  "confidence": {"low": 0.7, "high": 0.9}
}
Be accurate with macro estimates based on typical serving sizes.
Quality score should favor high protein, low carb meals.
```

### Quality Score

**Definition:** A 0-100 score reflecting how well a meal supports metabolic health goals.

**Calculation Criteria (AI-driven):**
- **Higher scores** for: High protein content, low carbohydrate content, whole foods, vegetables
- **Lower scores** for: High carbohydrate content, processed foods, added sugars

**Example scoring logic (implicit in AI prompt):**
| Meal Profile | Typical Score Range |
|-------------|---------------------|
| High protein, low carb (e.g., grilled chicken + vegetables) | 80-100 |
| Balanced macros | 60-80 |
| High carb, moderate protein | 40-60 |
| High carb, low protein (e.g., pasta, bread-heavy) | 20-40 |
| Ultra-processed, high sugar | 0-20 |

### Food Entry Storage

**File:** [shared/schema.ts](shared/schema.ts) (foodEntries table)

```typescript
foodEntries = pgTable("food_entries", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  rawText: text("raw_text"),           // User's original input
  imageUrl: text("image_url"),         // Stored image URL (if applicable)
  aiOutputJson: jsonb("ai_output_json"), // Raw AI analysis result
  userCorrectionsJson: jsonb("user_corrections_json"), // User adjustments
  mealType: text("meal_type"),         // Breakfast, Lunch, Dinner, Snack
  qualityScore: integer("quality_score"), // 0-100
  createdAt: timestamp("created_at"),
});
```

### Macro Extraction Priority

**File:** [server/analytics.ts:354-358](server/analytics.ts#L354-L358)

When calculating macro totals, user corrections take precedence over AI estimates:

```typescript
const macros = (entry.userCorrectionsJson as any) || (entry.aiOutputJson as any);
if (macros) {
  totalProtein += macros.protein || 0;
  totalCarbs += macros.carbs || 0;
}
```

---

## Composite Scores

### Adherence Score

**File:** [server/analytics.ts:143-151](server/analytics.ts#L143-L151)

**Purpose:** Measures how consistently a participant logs their health metrics.

**Algorithm:**
1. For each day in the analysis period, count unique metric types logged
2. Calculate daily adherence: `daily_adherence = types_logged / 5` (5 possible metric types)
3. Sum daily adherences and divide by days with activity (capped at 7)
4. Convert to percentage (0-100)

**Formula:**
```
daily_adherence = unique_metric_types_logged / 5

adherence_score = (sum_of_daily_adherences / min(days_with_metrics, 7)) × 100
```

**Example:**
- Day 1: Logged GLUCOSE, WEIGHT, BP (3 types) → 3/5 = 0.6
- Day 2: Logged GLUCOSE only (1 type) → 1/5 = 0.2
- Day 3: Logged GLUCOSE, WEIGHT, BP, KETONES, WAIST (5 types) → 5/5 = 1.0

Sum = 0.6 + 0.2 + 1.0 = 1.8
Days with metrics = 3
Adherence = 1.8 / 3 = 0.6 → **60%**

**Code:**
```typescript
let totalAdherence = 0;
let daysWithMetrics = 0;
dailyMetrics.forEach((types) => {
  totalAdherence += types.size / 5;  // types.size = unique metric types that day
  daysWithMetrics++;
});
if (daysWithMetrics > 0) {
  adherenceScores.push(totalAdherence / Math.min(daysWithMetrics, 7));
}
// Final: avgAdherence * 100 (rounded)
```

### Logging Streak

**File:** [server/analytics.ts:153-167](server/analytics.ts#L153-L167)

**Purpose:** Counts consecutive days of logging (any metric or food entry).

**Algorithm:**
1. Get all unique days with any log entry (metric or food)
2. Sort days in descending order (most recent first)
3. Starting from today, check if each expected day exists
4. Count consecutive days until a gap is found

**Code:**
```typescript
const sortedDays = Array.from(dailyLogs.keys()).sort().reverse();
let streak = 0;
for (let i = 0; i < sortedDays.length; i++) {
  const expectedDay = new Date();
  expectedDay.setDate(expectedDay.getDate() - i);
  const expected = expectedDay.toISOString().split('T')[0];
  if (sortedDays.includes(expected)) {
    streak++;
  } else {
    break;
  }
}
```

**Output:** `participantsWithStreak3Days` - count of participants with 3+ day streak

---

## Health Flags (Alerts)

**File:** [server/analytics.ts:189-319](server/analytics.ts#L189-L319)

### Flag Types

| Flag Type | Trigger Condition | Lookback Period | Priority |
|-----------|------------------|-----------------|----------|
| `high_glucose` | ≥ 110 mg/dL on 3+ days | 3 days | High |
| `elevated_bp` | Systolic ≥ 140 OR Diastolic ≥ 90 on 2+ days | 7 days | High |
| `missed_logging` | No logs for 3+ days | N/A | Medium |
| `low_ketones` | Reserved (not implemented) | - | - |

### Flag Data Structure

**File:** [server/analytics.ts:16-25](server/analytics.ts#L16-L25)

```typescript
interface HealthFlag {
  type: "high_glucose" | "elevated_bp" | "missed_logging" | "low_ketones";
  participantId: string;
  participantName: string;
  participantEmail: string;
  coachId: string | null;
  coachName: string | null;
  lastLogDate: string | null;
  details: string;  // Human-readable description
}
```

### Missed Logging Detection

**File:** [server/analytics.ts:272-309](server/analytics.ts#L272-L309)

**Two scenarios:**

1. **Never logged:** Account created 3+ days ago with zero entries
   ```typescript
   const daysSinceCreation = Math.floor(
     (Date.now() - participant.createdAt.getTime()) / (1000 * 60 * 60 * 24)
   );
   if (daysSinceCreation >= 3) {
     // Flag: "No logs since account creation (X days)"
   }
   ```

2. **Stopped logging:** Last entry was 3+ days ago
   ```typescript
   const daysSinceLog = Math.floor(
     (Date.now() - lastLog.timestamp.getTime()) / (1000 * 60 * 60 * 24)
   );
   if (daysSinceLog >= 3) {
     // Flag: "No logs for X days"
   }
   ```

---

## Macro Compliance Analytics

**File:** [server/analytics.ts:321-396](server/analytics.ts#L321-L396)

### Macro Targets Schema

**File:** [shared/schema.ts:117-126](shared/schema.ts#L117-L126)

```typescript
macroTargets = pgTable("macro_targets", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  proteinG: integer("protein_g"),    // Daily protein target in grams
  carbsG: integer("carbs_g"),        // Daily carb target in grams
  fatG: integer("fat_g"),            // Daily fat target in grams
  caloriesKcal: integer("calories_kcal"), // Daily calorie target
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
```

### Protein Compliance Calculation

**File:** [server/analytics.ts:369-371](server/analytics.ts#L369-L371)

**Definition:** Participant is "meeting protein target" if their average daily protein is within ±10% of their target.

**Formula:**
```
meeting_protein = |average_daily_protein - protein_target| / protein_target ≤ 0.10
```

**Code:**
```typescript
if (Math.abs(avgDailyProtein - proteinTarget) / proteinTarget <= 0.1) {
  meetingProtein++;
}
```

### Carb Compliance Calculation

**File:** [server/analytics.ts:373-375](server/analytics.ts#L373-L375)

**Definition:** Participant is "over carbs" if their average daily carbs exceed 110% of their target.

**Formula:**
```
over_carbs = average_daily_carbs > carbs_target × 1.10
```

**Default carb target:** 100g (if not set)

**Code:**
```typescript
const carbsTarget = target.carbsG || 100;  // Default to 100g

if (avgDailyCarbs > carbsTarget * 1.1) {
  overCarbs++;
}
```

### Average Daily Calculation

**File:** [server/analytics.ts:361-363](server/analytics.ts#L361-L363)

Macros are averaged over the analysis range period, not just days with entries:

```typescript
const avgDailyProtein = totalProtein / range;  // range = 7 days by default
const avgDailyCarbs = totalCarbs / range;
```

### Output Metrics

| Metric | Description |
|--------|-------------|
| `participantsMeetingProtein` | Count within ±10% of protein target |
| `participantsMeetingProteinPercent` | Percentage of participants with data |
| `participantsOverCarbs` | Count exceeding 110% of carb target |
| `participantsOverCarbsPercent` | Percentage of participants with data |
| `averageProteinVsTarget` | Average protein as % of target (e.g., 95 = 95% of target) |
| `totalWithTargets` | Participants with macro targets configured |

---

## Outcome Tracking

**File:** [server/analytics.ts:398-444](server/analytics.ts#L398-L444)

### Tracked Outcomes

| Outcome | Metric Type | Value Extractor | Desired Direction |
|---------|-------------|-----------------|-------------------|
| Weight | `WEIGHT` | `v?.value \|\| v?.weight \|\| 0` | Decrease |
| Waist | `WAIST` | `v?.value \|\| v?.waist \|\| 0` | Decrease |
| Fasting Glucose | `GLUCOSE` | `v?.value \|\| v?.fasting \|\| 0` | Decrease (toward normal) |

### Change Calculation Method

**Algorithm:**
1. Filter entries by metric type within date range (default 30 days)
2. Sort entries chronologically (oldest to newest)
3. Require minimum 2 data points per participant
4. Calculate: `change = latest_value - earliest_value`
5. Compute population mean (rounded to 1 decimal place)

### Output Structure

```typescript
interface OutcomeMetric {
  metricType: string;      // "WEIGHT", "WAIST", or "GLUCOSE"
  meanChange: number;      // Population mean change (negative = improvement)
  participantCount: number; // Participants with sufficient data
  limitedData: boolean;    // True if < 5 participants
}
```

**Note:** `limitedData: true` indicates statistical caution - results may not be representative with small sample sizes.

---

## Coach Workload Metrics

**File:** [server/analytics.ts:446-480](server/analytics.ts#L446-L480)

### Metrics Tracked

| Metric | Source | Calculation |
|--------|--------|-------------|
| `participantCount` | users table | Count of participants where `coachId` matches |
| `unreadMessages` | messages table | Count of messages where `senderId ≠ coachId` AND `readAt IS NULL` |
| `flaggedParticipants` | Derived | Count of health flags for coach's assigned participants |

### Workload Data Structure

```typescript
interface CoachWorkload {
  coachId: string;
  coachName: string;
  participantCount: number;
  unreadMessages: number;
  flaggedParticipants: number;
}
```

---

## Missing Data Handling

### General Principles

1. **Null-safe extraction:** All value extractions use fallback patterns (`val?.field || 0`)
2. **Minimum data requirements:** Outcome calculations require ≥2 data points
3. **Limited data flags:** Analytics flag when sample size < 5
4. **Zero defaults:** Empty datasets return 0 for all numeric metrics
5. **Percentage calculations:** Division by zero is prevented with conditional checks

### Default Values

| Scenario | Default Behavior |
|----------|-----------------|
| No participants in filter | All metrics return 0 |
| No macro targets set | Participant excluded from compliance calculations |
| Missing carb target | Default to 100g |
| No entries in date range | Adherence = 0, no flags generated |
| Single data point | Excluded from outcome change calculations |

---

## API Endpoints for Analytics

| Endpoint | Method | Description | Access |
|----------|--------|-------------|--------|
| `/api/analytics/overview` | GET | Overall participant statistics | Coach, Admin |
| `/api/analytics/flags` | GET | Active health flags | Coach, Admin |
| `/api/analytics/macros` | GET | Macro compliance statistics | Coach, Admin |
| `/api/analytics/outcomes` | GET | Outcome trend analysis | Coach, Admin |
| `/api/analytics/coach-workload` | GET | Coach assignment metrics | Admin only |

### Query Parameters

All analytics endpoints support:
- `range` (number): Days to analyze (default varies by endpoint)
- `coachId` (string): Filter to specific coach's participants

---

## Appendix: File Reference

| File | Line Numbers | Contents |
|------|--------------|----------|
| [server/analytics.ts](server/analytics.ts) | 1-484 | All analytics calculations |
| [server/routes.ts](server/routes.ts) | 387-505 | AI food analysis endpoints |
| [shared/schema.ts](shared/schema.ts) | 9 | Metric type enum |
| [shared/schema.ts](shared/schema.ts) | 89-103 | Metric entries table |
| [shared/schema.ts](shared/schema.ts) | 117-126 | Macro targets table |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | System | Initial documentation |

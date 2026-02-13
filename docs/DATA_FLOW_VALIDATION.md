# Data Flow Validation Report

**Version:** 1.0
**Purpose:** Document and validate all data paths from user input through calculations to display.

---

## Table of Contents

1. [Data Flow Overview](#data-flow-overview)
2. [Metric Entry Flow](#metric-entry-flow)
3. [Food Entry Flow](#food-entry-flow)
4. [Analytics Calculation Flow](#analytics-calculation-flow)
5. [Transformation Points](#transformation-points)
6. [Calculation Dependencies](#calculation-dependencies)
7. [Data Consistency Checks](#data-consistency-checks)
8. [Performance Analysis](#performance-analysis)

---

## Data Flow Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│   User Input    │────▶│   API Routes     │────▶│   Storage      │
│  (Client/App)   │     │   (routes.ts)    │     │  (storage.ts)  │
└─────────────────┘     └──────────────────┘     └────────────────┘
                                │                        │
                                ▼                        ▼
                        ┌──────────────────┐     ┌────────────────┐
                        │   Validation     │     │   PostgreSQL   │
                        │  (Zod Schemas)   │     │   (Drizzle)    │
                        └──────────────────┘     └────────────────┘
                                                         │
                        ┌────────────────────────────────┘
                        │
                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│   Display       │◀────│   Analytics      │◀────│   Raw Data     │
│  (Client UI)    │     │  (analytics.ts)  │     │   Queries      │
└─────────────────┘     └──────────────────┘     └────────────────┘
```

---

## Metric Entry Flow

### 1. Input Stage (Client → API)

**Source:** Client form submission
**Endpoint:** `POST /api/metrics`
**File:** [routes.ts:243-262](server/routes.ts#L243-L262)

```typescript
// Input structure
{
  type: "GLUCOSE" | "BP" | "WEIGHT" | "WAIST" | "KETONES",
  valueJson: { value: number } | { systolic: number, diastolic: number },
  timestamp?: string,  // Optional, defaults to now
  notes?: string
}
```

**Transformations at Input:**
| Step | Transformation | Location |
|------|---------------|----------|
| 1 | Add `userId` from session | routes.ts:246 |
| 2 | Parse timestamp string → Date | routes.ts:248 |
| 3 | Zod schema validation | routes.ts:251-254 |

### 2. Validation Stage

**Schema:** [schema.ts:257-260](shared/schema.ts#L257-L260)

| Field | Validation | Note |
|-------|------------|------|
| `type` | Enum: BP, WAIST, GLUCOSE, KETONES, WEIGHT | |
| `valueJson` | Any (JSON) | No structure validation currently |
| `userId` | Required string | From session |
| `timestamp` | Optional Date | Defaults to now |

**Gap Identified:** `valueJson` lacks structural validation - BP requires systolic/diastolic, others require value field.

### 3. Storage Stage

**Function:** `storage.createMetricEntry()`
**File:** [storage.ts:174-177](server/storage.ts#L174-L177)

```typescript
async createMetricEntry(entry: InsertMetricEntry): Promise<MetricEntry> {
  const results = await db.insert(schema.metricEntries).values(entry).returning();
  return results[0];
}
```

**Database Schema:** [schema.ts:89-100](shared/schema.ts#L89-L100)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar | Auto-generated UUID |
| `userId` | varchar | FK to users |
| `timestamp` | timestamp | When measurement taken |
| `type` | enum | Metric type |
| `rawUnit` | text | Original unit (nullable) |
| `normalizedValue` | real | Standardized value (nullable) |
| `valueJson` | jsonb | Flexible value storage |
| `source` | enum | manual or import |
| `notes` | text | User notes |
| `createdAt` | timestamp | When record created |

**Precision:** PostgreSQL `real` = 4 bytes, ~6 decimal digits precision.

### 4. Retrieval Stage

**Endpoint:** `GET /api/metrics`
**Query filters:** type, from, to
**File:** [storage.ts:184-207](server/storage.ts#L184-L207)

```typescript
// Returns ordered by timestamp DESC
.orderBy(desc(schema.metricEntries.timestamp))
```

### 5. Analytics Calculation Stage

**File:** [analytics.ts](server/analytics.ts)

**Data extraction pattern:**
```typescript
// Glucose value extraction (analytics.ts:237)
const value = val?.value || val?.fasting || 0;

// BP value extraction (analytics.ts:263-264)
const systolic = val?.systolic || 0;
const diastolic = val?.diastolic || 0;

// Weight value extraction (analytics.ts:457)
v?.value || v?.weight || 0
```

**Note:** Fallback patterns handle legacy data formats but may mask missing data (returns 0 instead of null).

---

## Food Entry Flow

### 1. Input Stage

**Endpoints:**
- `POST /api/food` - Create food entry
- `POST /api/food/analyze` - AI text analysis
- `POST /api/food/analyze-image` - AI image analysis

**File:** [routes.ts:316-505](server/routes.ts#L316-L505)

### 2. AI Analysis Flow

```
┌────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Raw Text or   │────▶│   OpenAI API     │────▶│   AI Output    │
│  Image Upload  │     │  (gpt-4o-mini)   │     │   (JSON)       │
└────────────────┘     └──────────────────┘     └────────────────┘
        │                                               │
        ▼                                               ▼
┌────────────────┐                              ┌────────────────┐
│   Stored in    │◀─────────────────────────────│   aiOutputJson │
│   foodEntries  │                              │   field        │
└────────────────┘                              └────────────────┘
```

**AI Output Structure:**
```typescript
{
  foods_detected: [{ name: string, portion: string, confidence: number }],
  macros: { calories: number, protein: number, carbs: number, fat: number, fiber: number },
  qualityScore: number,  // 0-100
  notes: string,
  suggestedMealType: "Breakfast" | "Lunch" | "Dinner" | "Snack",
  confidence: { low: number, high: number }
}
```

### 3. User Corrections Flow

**Priority:** `userCorrectionsJson` > `aiOutputJson`

**File:** [analytics.ts:366-369](server/analytics.ts#L366-L369)
```typescript
const macros = (entry.userCorrectionsJson as any) || (entry.aiOutputJson as any);
```

**File:** [routes.ts:922](server/routes.ts#L922)
```typescript
const macros = (entry.userCorrectionsJson as any)?.macros || (entry.aiOutputJson as any)?.macros;
```

**Note:** Inconsistent extraction pattern - analytics.ts checks top-level, routes.ts checks `.macros` property.

---

## Analytics Calculation Flow

### Calculation Dependency Graph

```
                    ┌─────────────────────┐
                    │   Raw Metric Data   │
                    │   Raw Food Data     │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │   Glucose   │    │     BP      │    │    Food     │
    │   Entries   │    │   Entries   │    │   Entries   │
    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
           │                  │                   │
           ▼                  ▼                   ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ High Glucose│    │ Elevated BP │    │   Macro     │
    │   Days      │    │    Days     │    │   Totals    │
    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
           │                  │                   │
           └──────────┬───────┘                   │
                      │                           │
                      ▼                           ▼
              ┌─────────────┐            ┌─────────────┐
              │   Health    │            │   Macro     │
              │   Flags     │            │  Compliance │
              └──────┬──────┘            └──────┬──────┘
                     │                          │
                     ▼                          ▼
              ┌─────────────┐            ┌─────────────┐
              │  Coach      │            │  Analytics  │
              │  Workload   │            │  Dashboard  │
              └─────────────┘            └─────────────┘
```

### Calculation Methods

| Calculation | Location | Dependencies | Output |
|-------------|----------|--------------|--------|
| `getOverview()` | analytics.ts:85-198 | metrics, food | Overview stats |
| `getFlags()` | analytics.ts:200-330 | metrics | Health flags |
| `getMacros()` | analytics.ts:332-410 | food, macroTargets | Compliance stats |
| `getOutcomes()` | analytics.ts:412-461 | metrics | Trend changes |
| `getCoachWorkload()` | analytics.ts:463-497 | users, flags, messages | Workload data |

### Dependency Order

1. **Level 0 (Raw Data):** metrics, food entries
2. **Level 1 (Aggregations):** daily counts, totals
3. **Level 2 (Calculations):** health flags, macro compliance
4. **Level 3 (Composites):** coach workload (depends on flags)

**Circular Dependencies:** None detected.

---

## Transformation Points

### Data Loss/Precision Points

| Location | Risk | Severity | Mitigation |
|----------|------|----------|------------|
| `valueJson` fallback to 0 | Missing values masked | Medium | Return null instead |
| PostgreSQL `real` type | ~6 digit precision | Low | Sufficient for health metrics |
| Date `toISOString().split('T')[0]` | Timezone issues | Medium | Use local date helper |
| `Math.round()` on percentages | Rounding | Low | Expected behavior |

### Type Safety Gaps

| Location | Issue | Risk |
|----------|-------|------|
| `valueJson as any` | No type checking | Missing fields undetected |
| `aiOutputJson as any` | AI response not validated | Malformed data possible |
| Macro extraction paths | Inconsistent patterns | Wrong values possible |

---

## Calculation Dependencies

### Health Flags Calculation

**File:** [analytics.ts:200-330](server/analytics.ts#L200-L330)

**Dependencies:**
```
getFlags()
  ├── getAllParticipants() → users table
  ├── getMetricEntries() → metric_entries table
  │     └── filter: timestamp >= start
  ├── getFoodEntries() → food_entries table
  │     └── filter: timestamp >= start
  └── getCoaches() → users table (for coach names)
```

**Calculation Order:**
1. Load all participants
2. Load all metrics/food in range
3. For each participant:
   - Check glucose (3-day window)
   - Check BP (7-day window)
   - Check missed logging (3+ days)
4. Return aggregated flags

### Macro Compliance Calculation

**File:** [analytics.ts:332-410](server/analytics.ts#L332-L410)

**Dependencies:**
```
getMacros()
  ├── getAllParticipants() → users table
  ├── getMacroTargets() → macro_targets table
  └── getFoodEntries() → food_entries table
```

**Calculation:**
1. Sum all macros from food entries in range
2. Calculate average per day with data (not range period)
3. Compare to targets: protein ±10%, carbs >110%

---

## Data Consistency Checks

### Cross-View Consistency

| View A | View B | Should Match | Current Status |
|--------|--------|--------------|----------------|
| `/api/macro-progress` | Admin macro analytics | Daily totals | ✅ Same source |
| Individual metrics | Analytics aggregation | Counts | ✅ Same source |
| Participant list | Flag count | Participant IDs | ✅ Same source |

### Real-time vs Batch

| Calculation | Method | Consistency Risk |
|-------------|--------|------------------|
| All analytics | Real-time query | Low - always fresh |
| Health flags | Real-time query | Low - always fresh |
| Macro progress | Real-time query | Low - always fresh |

**Note:** No caching or denormalization currently implemented. All calculations are real-time.

### Backfill Detection

**File:** [storage.ts:13-16](server/storage.ts#L13-L16)

```typescript
export function isBackfilledEntry(entry: { timestamp: Date; createdAt: Date }): boolean {
  const hourMs = 60 * 60 * 1000;
  return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
}
```

**Usage:**
- Prompt engine skips backfilled entries for notifications
- Analytics includes all entries (backfilled or not)

---

## Performance Analysis

### Query Patterns

| Endpoint | Query Type | Performance Risk |
|----------|-----------|------------------|
| `getOverview()` | Full table scan (filtered) | Medium at scale |
| `getFlags()` | Full table scan (filtered) | Medium at scale |
| `getMacros()` | Full table scan + targets | Medium at scale |
| `getOutcomes()` | Full table scan | Low (30-day window) |
| `/api/metrics` | User-specific query | Low |

### N+1 Query Analysis

**File:** [analytics.ts:85-198](server/analytics.ts#L85-L198)

```typescript
// Anti-pattern AVOIDED: Data loaded upfront
const metricEntries = await db.select()
  .from(schema.metricEntries)
  .where(gte(schema.metricEntries.timestamp, start));

const foodEntries = await db.select()
  .from(schema.foodEntries)
  .where(gte(schema.foodEntries.timestamp, start));

// Then filtered in memory per participant
for (const userId of participantIds) {
  const userMetrics = metricEntries.filter(e => e.userId === userId);
  // ...
}
```

**Status:** ✅ N+1 avoided by loading all data upfront.

### Recommended Indexes

```sql
-- Metric entries: common query patterns
CREATE INDEX idx_metric_entries_user_timestamp
  ON metric_entries(user_id, timestamp DESC);

CREATE INDEX idx_metric_entries_type_timestamp
  ON metric_entries(type, timestamp DESC);

-- Food entries: common query patterns
CREATE INDEX idx_food_entries_user_timestamp
  ON food_entries(user_id, timestamp DESC);

-- Prompt deliveries: cooldown checks
CREATE INDEX idx_prompt_deliveries_user_prompt_fired
  ON prompt_deliveries(user_id, prompt_id, fired_at DESC);
```

### Performance Benchmarks

| Dataset Size | Operation | Expected Time |
|--------------|-----------|---------------|
| 100 users, 1000 entries | getOverview() | <100ms |
| 100 users, 1000 entries | getFlags() | <200ms |
| 100 users, 5000 entries | getMacros() | <300ms |
| 1000 users, 50000 entries | All analytics | 1-2s |

---

## Issues Identified

### Critical

1. **Macro extraction inconsistency** - `analytics.ts` uses `macros.protein` while `routes.ts` uses `macros?.macros?.protein`

### Medium

2. **Zero fallback masks missing data** - `val?.value || 0` returns 0 for missing values
3. **No valueJson validation** - Malformed entries not caught at input

### Low

4. **UTC/local timezone mixing** - Some calculations use UTC, others local
5. **Performance at scale** - Full table scans may slow with large datasets

---

## Recommendations

### Short-term (Pre-Pilot)

1. ✅ Add consistent macro extraction helper function
2. ✅ Add `valueJson` schema validation by metric type
3. ✅ Add database indexes for common queries

### Post-Pilot

1. Add caching layer for analytics (Redis or in-memory)
2. Implement materialized views for daily aggregations
3. Add data integrity checks in audit logs

---

## Test Coverage

See [server/__tests__/dataFlow.test.ts](server/__tests__/dataFlow.test.ts) for comprehensive end-to-end tests covering:

- User journey: input → storage → calculation → display
- Calculation dependency cascades
- Data consistency across views
- Performance benchmarks with realistic data volumes

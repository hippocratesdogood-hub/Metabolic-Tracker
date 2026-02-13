# Data Backfill and Import Documentation

**Version:** 1.0
**Purpose:** Document all mechanisms for importing historical data, backfilling entries, and migrating data.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Backfill Capabilities](#current-backfill-capabilities)
3. [Backfill Detection Logic](#backfill-detection-logic)
4. [Data Validation](#data-validation)
5. [Impact on Calculations](#impact-on-calculations)
6. [Import Capabilities](#import-capabilities)
7. [Known Limitations](#known-limitations)
8. [Recommendations](#recommendations)

---

## Executive Summary

### Current State

| Capability | Status | Notes |
|------------|--------|-------|
| Manual backfill (UI) | ✅ Implemented | Up to 7 days back |
| Backfill detection | ✅ Implemented | timestamp vs createdAt |
| CSV import | ❌ Not implemented | Schema supports but no endpoint |
| Bulk insert API | ❌ Not implemented | |
| Data migration scripts | ⚠️ Seed only | Users only, no metrics |
| Prompt suppression for backfills | ✅ Implemented | Prevents retroactive notifications |

### Key Files

| File | Purpose |
|------|---------|
| [storage.ts:13-16](server/storage.ts#L13-L16) | `isBackfilledEntry()` detection function |
| [MetricEntryModal.tsx](client/src/components/MetricEntryModal.tsx) | Metric backfill UI |
| [FoodLog.tsx](client/src/pages/FoodLog.tsx) | Food entry backfill UI |
| [promptEngine.ts:185-187](server/services/promptEngine.ts#L185-L187) | Backfill prompt suppression |
| [schema.ts:10](shared/schema.ts#L10) | `entrySourceEnum` ("manual" | "import") |

---

## Current Backfill Capabilities

### 1. Manual Metric Backfill

**Location:** [MetricEntryModal.tsx:41-45](client/src/components/MetricEntryModal.tsx#L41-L45)

Users can manually enter metrics for past dates through the UI.

**Constraints:**
```typescript
const minDate = subDays(startOfDay(new Date()), 7);  // 7 days back
const maxDate = new Date();                           // Today
const isBackfill = !isToday(entryDate);
```

| Constraint | Value | Enforcement |
|------------|-------|-------------|
| Maximum age | 7 days | Client-side only |
| Future prevention | Today | Client-side only |
| Minimum age | None | - |

**UI Indicators:**
- Date picker button shows amber border when backfilling
- "Backfilling for a past date" message displayed
- Clock icon indicates historical entry

### 2. Manual Food Entry Backfill

**Location:** [FoodLog.tsx:46-47](client/src/pages/FoodLog.tsx#L46-L47)

Identical constraints to metric backfill:
```typescript
const minDate = subDays(startOfDay(new Date()), 7);
const maxDate = new Date();
```

### 3. API-Level Backfill

**Location:** [routes.ts:248, 321](server/routes.ts#L248)

Both metric and food entry endpoints accept a `timestamp` parameter:

```typescript
// POST /api/metrics
const data = {
  ...req.body,
  userId: req.user!.id,
  timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
};

// POST /api/food
const data = {
  ...req.body,
  userId: req.user!.id,
  timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
};
```

**Server-side validation:** None for timestamp range

⚠️ **Gap Identified:** No server-side validation prevents:
- Future-dated entries
- Entries older than 7 days
- Malicious timestamp manipulation

---

## Backfill Detection Logic

### Detection Function

**Location:** [storage.ts:13-16](server/storage.ts#L13-L16)

```typescript
/**
 * Determines if an entry is backfilled by comparing timestamp to createdAt.
 * An entry is considered backfilled if its timestamp is more than 1 hour before createdAt.
 */
export function isBackfilledEntry(entry: { timestamp: Date; createdAt: Date }): boolean {
  const hourMs = 60 * 60 * 1000;
  return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
}
```

### Detection Logic Explained

| Scenario | timestamp | createdAt | Difference | Result |
|----------|-----------|-----------|------------|--------|
| Real-time entry | 10:00 | 10:00 | 0 | NOT backfilled |
| 30 min delayed save | 10:00 | 10:30 | 30 min | NOT backfilled |
| 2 hours late | 10:00 | 12:00 | 2 hrs | BACKFILLED |
| Yesterday's entry | Yesterday 10am | Today 10am | ~24 hrs | BACKFILLED |

**Threshold:** 1 hour grace period for delayed saves.

### Fields Used for Detection

| Field | Source | Description |
|-------|--------|-------------|
| `timestamp` | User input | When the measurement was taken |
| `createdAt` | Database default | When the record was created (auto-set) |

**Schema reference:** [schema.ts:92, 99](shared/schema.ts#L92)
```typescript
timestamp: timestamp("timestamp").defaultNow().notNull(),
createdAt: timestamp("created_at").defaultNow().notNull(),
```

---

## Data Validation

### Client-Side Validation

| Check | Metrics | Food | Location |
|-------|---------|------|----------|
| Max 7 days back | ✅ | ✅ | Calendar disabled dates |
| No future dates | ✅ | ✅ | Calendar disabled dates |
| Value range | ✅ | N/A | Form input validation |
| Required fields | ✅ | ✅ | Form required attribute |

### Server-Side Validation

| Check | Status | Notes |
|-------|--------|-------|
| Timestamp range | ❌ | No validation |
| Future date prevention | ❌ | No validation |
| Value range | ⚠️ Partial | Zod schema validates type, not range |
| Duplicate prevention | ❌ | No check |
| User ownership | ✅ | Session-based |

**Zod Schema Validation:**

```typescript
// schema.ts:257-260
export const insertMetricEntrySchema = createInsertSchema(metricEntries, {
  type: z.enum(["BP", "WAIST", "GLUCOSE", "KETONES", "WEIGHT"]),
  valueJson: z.any(),  // No structure validation!
}).omit({ id: true, createdAt: true });
```

⚠️ **Gap:** `valueJson` accepts any structure - no validation that BP has systolic/diastolic.

### Validation Gaps Summary

| Risk | Severity | Description |
|------|----------|-------------|
| Future dates | Medium | Could corrupt analytics |
| Ancient dates | Low | Could affect trend calculations |
| Duplicate entries | Low | Same timestamp allowed |
| Invalid valueJson structure | Medium | Missing required fields |

---

## Impact on Calculations

### Analytics Treatment

**All analytics include backfilled data** - this is intentional for accurate historical reporting.

| Calculation | Includes Backfills | Notes |
|-------------|-------------------|-------|
| Glucose flag detection | ✅ | Historical high readings counted |
| BP flag detection | ✅ | Historical elevated readings counted |
| Adherence score | ✅ | Historical logging counted |
| Streak calculation | ✅ | Historical days counted |
| Outcome trends | ✅ | Historical values for change calculation |
| Macro compliance | ✅ | Historical food entries counted |

**Rationale:** Analytics should reflect all data regardless of when it was entered, to give coaches accurate historical views.

### Prompt Engine Treatment

**Backfilled entries DO NOT trigger prompts.**

**Location:** [promptEngine.ts:185-187](server/services/promptEngine.ts#L185-L187)

```typescript
async onMetricLogged(userId, metricType, entry) {
  // Don't trigger for backfilled entries
  if (isBackfilledEntry(entry)) {
    return [];  // No prompts fired
  }
  // ... rest of prompt evaluation
}
```

**Rationale:** Prevents retroactive notifications for historical data.

### Calculation Recalculation

**All calculations are real-time** - no cached or denormalized values.

| Aspect | Current Behavior |
|--------|------------------|
| Caching | None |
| Materialized views | None |
| Triggered recalculation | Not needed |
| Batch processing | Not needed |

When backfilled data is added:
1. Data is inserted with historical timestamp
2. Next API call to analytics endpoints recalculates with new data
3. No manual refresh or recalculation needed

---

## Import Capabilities

### Current State

| Feature | Status | Schema Support | API Support |
|---------|--------|----------------|-------------|
| CSV import | ❌ | ✅ | ❌ |
| Bulk API insert | ❌ | ✅ | ❌ |
| Lab result import | ❌ | ❌ | ❌ |
| Third-party sync | ❌ | ❌ | ❌ |

### Source Field

The schema includes a `source` field for tracking data origin:

**Location:** [schema.ts:10, 97](shared/schema.ts#L10)

```typescript
export const entrySourceEnum = pgEnum("entry_source", ["manual", "import"]);

// In metricEntries table:
source: entrySourceEnum("source").default("manual").notNull(),
```

**Current usage:** All entries are created with `source: "manual"` (default).

### Batch Processing Utilities

**Location:** [server/replit_integrations/batch/](server/replit_integrations/batch/)

Generic batch processing utilities exist for rate-limited API calls:

```typescript
import { batchProcess } from "./replit_integrations/batch";

const results = await batchProcess(
  items,
  async (item) => { /* process each item */ },
  { concurrency: 2, retries: 5 }
);
```

**Current usage:** Food analysis batching (not data import).

### Seed Scripts

| Script | Purpose | Creates Metrics? |
|--------|---------|-----------------|
| [seed.ts](server/seed.ts) | Create test users | ❌ No |
| [seedIfEmpty.ts](server/seedIfEmpty.ts) | Create test users if DB empty | ❌ No |

---

## Known Limitations

### 1. No Server-Side Date Validation

**Risk:** Malicious or buggy clients could submit:
- Future-dated entries
- Entries from years ago
- Entries at exact same timestamp (duplicates)

**Impact:** Could corrupt analytics, flags, and trends.

**Recommendation:** Add server-side validation:
```typescript
// Suggested validation
if (timestamp > new Date()) {
  return res.status(400).json({ message: "Future dates not allowed" });
}
if (timestamp < subDays(new Date(), 30)) {
  return res.status(400).json({ message: "Entries older than 30 days not allowed" });
}
```

### 2. No Bulk Import Endpoint

**Impact:** Cannot import:
- Historical data from previous systems
- CSV exports from other apps
- Lab results in batch

**Recommendation:** Create `/api/admin/import/metrics` endpoint for authorized users.

### 3. No Timezone Consideration in Backfill Detection

**Risk:** `isBackfilledEntry()` uses absolute time difference, not calendar dates.

**Example issue:**
- User in PST creates entry at 11:59 PM
- Server in UTC sees this as 7:59 AM next day
- Entry for "today PST" might be flagged as backfill

**Current mitigation:** 1-hour grace period helps, but edge cases exist.

### 4. No Duplicate Detection

**Risk:** Same measurement can be submitted multiple times with same timestamp.

**Impact:** Inflates analytics (e.g., same meal counted twice).

**Recommendation:** Add unique constraint or duplicate check:
```sql
CREATE UNIQUE INDEX idx_metric_no_dupes
ON metric_entries(user_id, type, timestamp);
```

### 5. No Audit Trail for Backfills

**Risk:** No way to distinguish when backfilled data was actually entered.

**Current behavior:** `createdAt` tracks when record was created, but no explicit "backfilled" flag.

**Recommendation:** Add `isBackfilled: boolean` computed column or flag.

---

## Recommendations

### Short-term (Pre-Pilot)

1. **Add server-side timestamp validation**
   - Prevent future dates
   - Limit backfill to 7 days (match UI)

2. **Add valueJson schema validation**
   - Validate BP has systolic/diastolic
   - Validate other types have value field

### Post-Pilot

3. **Create bulk import endpoint**
   ```typescript
   POST /api/admin/import/metrics
   {
     entries: [
       { type: "GLUCOSE", timestamp: "2026-01-01", valueJson: { value: 95 } },
       { type: "WEIGHT", timestamp: "2026-01-01", valueJson: { value: 180 } }
     ],
     source: "import"
   }
   ```

4. **Add duplicate detection**
   - Check for existing entry at same timestamp before insert
   - Option to update or skip duplicates

5. **Add import audit logging**
   - Track who imported what and when
   - Enable rollback if needed

6. **Consider timezone-aware backfill detection**
   - Use user's configured timezone
   - Compare calendar dates, not absolute times

---

## Test Coverage

Backfill detection is tested in:
- [timeseries.test.ts](server/__tests__/timeseries.test.ts) - Lines 698-732
- [dataFlow.test.ts](server/__tests__/dataFlow.test.ts) - Lines 519-555

Test scenarios covered:
- Real-time entry (not backfilled)
- Entry 30 min after timestamp (not backfilled)
- Entry 2 hours after timestamp (backfilled)
- Entry from previous day (backfilled)

---

## Appendix: Data Flow for Backfilled Entry

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Backfills Entry                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Client (MetricEntryModal.tsx)                                      │
│  1. User selects past date from calendar                            │
│  2. Calendar enforces 7-day limit                                   │
│  3. UI shows "Backfilling for a past date"                          │
│  4. Submit sends { timestamp: pastDate, valueJson: {...} }          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API (routes.ts)                                                    │
│  1. Parse timestamp from request body                               │
│  2. Zod schema validation (type, not range)                         │
│  3. Insert into database                                            │
│  4. Database sets createdAt = NOW()                                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Database                                                           │
│  Record: { timestamp: "2026-01-28", createdAt: "2026-02-04" }       │
│  Difference: 7 days → isBackfilledEntry() returns TRUE              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                  ┌─────────────┴─────────────┐
                  │                           │
                  ▼                           ▼
    ┌─────────────────────────┐   ┌─────────────────────────┐
    │  Prompt Engine          │   │  Analytics              │
    │  onMetricLogged()       │   │  getOverview()          │
    │  isBackfilledEntry()→T  │   │  getFlags()             │
    │  → NO prompts fired     │   │  → INCLUDES backfill    │
    └─────────────────────────┘   └─────────────────────────┘
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | System | Initial creation |

# Historical Data Edge Cases

This document describes edge cases and boundary conditions when handling historical/backfilled data in the Metabolic-Tracker system.

## Table of Contents

1. [Timeline Edge Cases](#timeline-edge-cases)
2. [Data Density Variations](#data-density-variations)
3. [Calculation Boundaries](#calculation-boundaries)
4. [Timezone and Date Edge Cases](#timezone-and-date-edge-cases)
5. [Concurrent Operations](#concurrent-operations)
6. [Data Correction Scenarios](#data-correction-scenarios)
7. [Undefined Behaviors (Product Decisions Needed)](#undefined-behaviors)
8. [Error Messages](#error-messages)

---

## Backfill Detection

An entry is considered **backfilled** when:
```
createdAt - timestamp > 1 hour
```

- `timestamp`: When the health event occurred (e.g., weight measurement time)
- `createdAt`: When the entry was added to the system

---

## Timeline Edge Cases

### 1. Data from 5+ Years Ago

| Scenario | Behavior | Test Coverage |
|----------|----------|---------------|
| Timestamp > 5 years old | Rejected with warning | ✅ |
| Timestamp 4 years old | Accepted | ✅ |
| Very old data marked as backfilled | Correctly identified | ✅ |

**Implementation**: The `validateTimestamp()` function rejects timestamps older than 5 years.

### 2. Large Gaps in Data

Example: 6 months of data → 3-month gap → recent data

| Scenario | Behavior | Test Coverage |
|----------|----------|---------------|
| Streak calculation across gap | Streak resets at gap | ✅ |
| Trend calculation spanning gap | Uses available data points | ✅ |
| Average calculation with gap | Calculates from available data | ✅ |

**Impact on UX**:
- Streak will be 0 or low after gap
- Trend comparisons may show large jumps
- Weekly reports only include data within that week

### 3. Pre-Program Data

Data imported from before the program officially launched.

| Scenario | Behavior | Test Coverage |
|----------|----------|---------------|
| Pre-launch timestamp | Accepted (within 5-year limit) | ✅ |
| Identified as backfilled | Yes | ✅ |
| Included in calculations | Yes (for historical context) | ✅ |

### 4. Future-Dated Entries (Data Entry Errors)

| Scenario | Behavior | Test Coverage |
|----------|----------|---------------|
| Timestamp 1+ days in future | Rejected | ✅ |
| Timestamp today | Accepted | ✅ |
| Error message | "Entry timestamp is in the future" | ✅ |

### 5. Batch Import on Single Day

All historical data imported at once (e.g., during onboarding).

| Scenario | Behavior | Test Coverage |
|----------|----------|---------------|
| Multiple entries same timestamp | Allowed (different types) | ✅ |
| Same type same timestamp | Duplicate detection applies | ✅ |
| Historical spread preserved | Yes (timestamps from import file) | ✅ |

---

## Data Density Variations

### 1. High Density (Daily Logging)

Users who log every day for months.

| Metric | Behavior |
|--------|----------|
| 7-day average | Calculated from all 7 days |
| Trend calculation | Smooth, reliable |
| Streak | Accurate consecutive days |
| Storage impact | ~30 entries/month per metric type |

### 2. Low Density (Weekly Logging)

Users who only log once per week.

| Metric | Behavior |
|--------|----------|
| 7-day average | Only 1 data point per week |
| Trend calculation | Less reliable (sparse data) |
| Streak | Always 0-1 (gaps between logs) |

**Recommendation**: Consider adding a "consistency" metric alongside streak for weekly loggers.

### 3. Irregular Patterns (Clusters)

Users with bursts of activity followed by sparse periods.

| Scenario | Behavior |
|----------|----------|
| Cluster detection | Entries within 2 days grouped |
| Average during cluster | Uses all cluster data |
| Average during sparse period | Uses available data |

### 4. Transition: Backfilled → Real-Time

When user starts logging in real-time after historical import.

| Scenario | Behavior | Test Coverage |
|----------|----------|---------------|
| Identify transition point | Compare createdAt vs timestamp | ✅ |
| Calculations spanning boundary | Include both types | ✅ |
| Separate analytics available | Filter by `source` field | ✅ |

---

## Calculation Boundaries

### First Calculation with Only Backfilled Data

| Scenario | Behavior |
|----------|----------|
| All data is backfilled | Calculations still work |
| Dashboard shows data | Yes |
| Prompts triggered | No (backfilled data excluded from triggers) |

### Last Calculation Before Real-Time Begins

| Scenario | Behavior |
|----------|----------|
| Boundary entry identification | Check isBackfilledEntry() |
| Calculations consistent | Yes |

### Calculations Spanning Boundary

| Calculation | Behavior |
|-------------|----------|
| 7-day average | Includes both backfilled and real-time |
| Week-over-week comparison | Works correctly |
| Trend direction | Calculated from all data |

### Recalculation After Additional Import

| Scenario | Behavior |
|----------|----------|
| New historical data added | Recalculates automatically |
| Averages updated | Yes |
| Dashboard refreshes | On next page load |

---

## Timezone and Date Edge Cases

### Different Timezone Imports

| Format | Behavior |
|--------|----------|
| `2024-06-15T14:00:00Z` (UTC) | Parsed correctly |
| `2024-06-15T07:00:00-07:00` (Pacific) | Converted to UTC |
| `2024-06-15T22:00:00+08:00` (Singapore) | Converted to UTC |

**Recommendation**: Store all timestamps in UTC, display in user's local timezone.

### Daylight Saving Time

| Transition | Dates (US) | Impact |
|------------|------------|--------|
| Spring forward | March 10 | 23-hour day |
| Fall back | November 3 | 25-hour day |

**Behavior**:
- Daily aggregations still work (group by date, not hours)
- Hour-based calculations may show 23 or 25 hours

### Leap Year (Feb 29)

| Scenario | Behavior |
|----------|----------|
| Feb 29 in import | Accepted (valid date) |
| Year-over-year comparison | Handles 365 vs 366 days |

**Note**: Feb 28 → Feb 28 next year = 365 days. The leap day is Feb 29.

### Month/Year Boundaries

| Scenario | Behavior |
|----------|----------|
| Week spanning month boundary | Calculated correctly |
| Week spanning year boundary | Calculated correctly |
| Monthly totals at boundary | Proper attribution |

---

## Concurrent Operations

### User Logging During Backfill Import

| Scenario | Behavior |
|----------|----------|
| Real-time entry added | Saved independently |
| Same timestamp conflict | Both entries saved (different createdAt) |
| Data integrity | Maintained |

**Recommendation**: Show "import in progress" indicator during large imports.

### Coach Viewing During Import

| Scenario | Behavior |
|----------|----------|
| Partial data visible | Yes (whatever is imported so far) |
| Calculations on partial data | Valid but incomplete |
| Refresh shows more data | Yes |

### Multiple Simultaneous Imports

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Two imports same user | Duplicates possible | Duplicate detection |
| Race condition on check | Data integrity risk | Database unique constraints |

**Recommendation**: Lock imports per-user to prevent simultaneous imports.

### Analytics During Import

| Scenario | Behavior |
|----------|----------|
| Partial data in calculations | Valid but evolving |
| Dashboard updates | On refresh |

---

## Data Correction Scenarios

### Importing Corrected Data

| Approach | Behavior |
|----------|----------|
| Delete + re-import | Cleanest, loses audit trail |
| Update existing entries | Preserves audit trail |
| Import with "correction" flag | Track both versions |

**Recommendation**: Support both approaches; default to update for audit compliance.

### User Editing Backfilled Entries

| Scenario | Behavior |
|----------|----------|
| Edit allowed | Yes |
| Still marked as backfilled | Yes (original timestamp unchanged) |
| Edit history tracked | updatedAt field updated |

### Deleting Incorrect Imports

| Approach | Behavior |
|----------|----------|
| Delete by batch ID | Remove all entries from one import |
| Delete by date range | Remove entries in range |
| Soft delete | Mark as deleted, exclude from calculations |

**Cascade Effects**:
- Averages need recalculation
- Streak may change
- Reports need regeneration

### Merging Duplicates

| Detection | Criteria |
|-----------|----------|
| Exact duplicate | Same timestamp, same type |
| Near duplicate | Timestamp within 1 minute |

| Merge Strategy | Behavior |
|----------------|----------|
| Keep manual | Prefer user-entered over import |
| Keep most recent | Use latest createdAt |
| Average values | Combine multiple readings |
| Flag for review | Mark for admin resolution |

---

## Implemented Product Decisions

These scenarios have been addressed with the following implementations:

### 1. Two Imports Create Same Entry Simultaneously ✅

**Decision**: Use database unique constraint, reject duplicates with logging.

**Implementation**:
- Added unique index on `(userId, timestamp, type)` in `shared/schema.ts`
- Import scripts skip duplicates and log them to `duplicateDetails` array
- See: `server/import/csvImporter.ts`, `server/import/jsonImporter.ts`

### 2. Import Data Older Than 5 Years ✅

**Decision**: Allow with warning in import results, no blocking.

**Implementation**:
- `validateTimestamp()` returns `{ valid: true, warning: "..." }` for 5+ year old data
- Warning is included in import results but does not block import
- See: `server/import/importUtils.ts:170-184`

### 3. Backfilled Entry Edited by User ✅

**Decision**: Keep backfill flag, track edit separately.

**Implementation**:
- Added edit tracking fields: `editedAt`, `editedBy`, `previousValueJson`
- Original timestamp preserved (backfill detection unchanged)
- Previous value stored for audit trail
- See: `shared/schema.ts`, `server/storage.ts:updateMetricEntry`

### 4. Coach Modifies Participant's Backfilled Data ✅

**Decision**: Allow with full audit logging, add UI indicator.

**Implementation**:
- `updateMetricEntry` records editor ID in `editedBy` field
- Audit middleware logs `RECORD_UPDATE` with changed fields
- `CoachEditedBadge` component shows "Coach-edited" indicator
- Response includes `_meta: { wasBackfilled, editedByRole, editedByOwner }`
- See: `server/routes.ts`, `client/src/components/CoachEditedBadge.tsx`

### 5. Weekly Logger's Streak Calculation ✅

**Decision**: Add "consistency" metric alongside streak.

**Implementation**:
- Pattern detection classifies users as daily (avg gap ≤2 days), weekly (3-10 days), or sporadic
- Daily loggers: Show traditional streak (consecutive days)
- Weekly loggers: Show consistency percentage (% of weeks with at least one entry)
- API endpoints:
  - `GET /api/metrics/consistency` - Get own consistency metrics
  - `GET /api/users/:userId/consistency` - Coach/admin view of participant metrics
- Returns `recommendedMetric` field to help UI decide which metric to display
- See: `server/analytics.ts:getUserConsistencyMetrics`

---

## Error Messages

Clear, actionable error messages for edge cases:

| Scenario | Error Message |
|----------|---------------|
| Future timestamp | "Entry timestamp is in the future. Please check the date." |
| Very old timestamp | "Entry is more than 5 years old. Please verify this is correct." |
| Duplicate entry | "An entry already exists for this user, type, and timestamp." |
| Invalid timezone | "Could not parse timezone. Please use ISO 8601 format." |
| User not found | "User with email '{email}' not found. Please verify the email address." |
| Value out of range | "{type} value {value} is outside expected range ({min}-{max})." |
| Import in progress | "An import is already in progress for this user." |
| Concurrent modification | "This entry was modified by another process. Please refresh." |

---

## Test Coverage Summary

| Category | Tests | Status |
|----------|-------|--------|
| Timeline Edge Cases | 12 | ✅ |
| Data Density Variations | 10 | ✅ |
| Calculation Boundaries | 12 | ✅ |
| Timezone/Date Edge Cases | 12 | ✅ |
| Concurrent Operations | 10 | ✅ |
| Data Correction Scenarios | 10 | ✅ |
| Regression Test Summary | 2 | ✅ |
| **Total** | **68** | ✅ |

All tests located in: `server/__tests__/historicalEdgeCases.test.ts`

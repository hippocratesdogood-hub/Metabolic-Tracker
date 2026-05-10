# Backdate Device Metrics — Implementation Spec

## Context

Participants in the Metabolic-Tracker pilot have requested the ability to add device-metric readings for past dates so they can populate trend data from before the app was in use. Currently the entry form only accepts today's date.

## Scope decisions

**In scope:** Backdating for device metrics only — BP, glucose, ketones, weight, waist. No date limit (participants can go back months).

**Out of scope:**
- Food log backdating stays at its current 7-day limit.
- Editing or deleting past entries — v1 is add-new only.
- Per-entry time-of-day input — date-only UX for backdated entries (timestamp defaults to noon in user TZ under the hood).
- Backdated entries do NOT trigger the coaching prompt engine.

**Bonus addition (cheap to include alongside this work):** Optional glucose context dropdown — Fasting / Random / Post-meal — added to the glucose entry form for both today and backdated entries.

## Pre-flight schema check

Before any code changes, verify:

1. Is `recorded_at` on the device-metrics table a `timestamptz`, or `date`? If date-only, migrate to `timestamptz` first so backdated entries sort correctly alongside today's timestamped entries in trend charts.
2. Is there an existing nullable column where glucose context can live? If not, add `glucose_context` as a nullable enum: `fasting | random | post_meal`.

## Implementation

### 1. Backend — metric-create endpoint

- Accept optional `recorded_at` in the request body for device metrics only.
- Validate: must be ≤ end-of-today in the user's TZ; no minimum.
- If absent, default to `now()` (preserves today's behavior exactly).
- When provided as a date string, convert to timestamp at noon in user TZ, then to UTC for storage. Use whatever date library is already present in the codebase.

Continue rejecting `recorded_at` overrides for food log entries — the 7-day limit there stays as-is.

### 2. Coaching guard

In the metric-create handler, before the call into `promptEngine.ts`:

```ts
const entryDate = toISODate(entry.recordedAt, user.timezone);
const todayInUserTZ = toISODate(new Date(), user.timezone);
if (entryDate !== todayInUserTZ) return; // skip coaching for backdated entries
```

Place this guard early so no downstream prompt assembly, inbox row creation, or token cost occurs.

Also verify in `coachingRules.ts` that the "recent metrics" context lookup is keyed off `recorded_at`, not `created_at`. If it's `created_at`, backdated entries would pollute the context snapshot for legitimate today-entries — switch that lookup to `recorded_at` if needed.

### 3. Frontend — device metric entry form

- Add a date picker control to the form, defaults to today.
- Max date = today (in user TZ). No min date.
- When the selected date ≠ today, display a visual indicator (chip, banner, or tinted label): "Logging for Nov 15, 2025". This is the most important UX detail — prevents the worst failure mode, which is someone accidentally backdating today's reading because the picker stuck on a prior date.
- Persist the last-used date in component state across consecutive entries within a session, so participants backfilling many days don't re-pick every time. Reset to today on form unmount.

### 4. Glucose context dropdown

- Small dropdown adjacent to the glucose value input.
- Options: Fasting / Random / Post-meal. Default is blank/null.
- Submits as a separate field on the metric payload.
- Persists to the `glucose_context` column.
- Display the context value in the trend chart tooltip/hover for glucose readings.

## Acceptance criteria / tests

- Backdated BP entry → no coaching prompt row is created and the cron scheduler does not pick it up.
- Today BP entry → coaching prompt fires exactly as before.
- Backdated entry appears in the trend chart at correct chronological position relative to existing entries.
- TZ edge case: user in Pacific time entering at 11pm, picker showing "today" → stored as today in user TZ, not bumped to tomorrow when converted to UTC.
- Future date entry rejected server-side (not only disabled in the UI).
- Glucose `glucose_context` field persists null when unselected, persists the enum value when selected.
- Existing test suite (149 metabolic-calculation tests) remains green.

## Files likely touched

- Drizzle schema file + a new migration (if `recorded_at` type change or `glucose_context` column added).
- Metric-create endpoint handler.
- `promptEngine.ts` and/or its call site for the coaching guard.
- `coachingRules.ts` — verify "recent metrics" lookup uses `recorded_at`.
- Device metric entry form component(s) on the frontend.
- Shared DatePicker component, if one doesn't already exist.
- Test suite — extend with the cases under Acceptance criteria above.

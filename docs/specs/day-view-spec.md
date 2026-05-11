# Day View — v1 Spec

**Status:** Implementation in progress (§4a complete)
**Owner:** Chad Larson
**Target route:** `/log/:date`
**Last updated:** 2026-05-11 (rev 4 — §4a aligned to pgEnum pattern after Stage 1 implementation)

---

## 1. Context

The Metabolic-Tracker app currently lets users log food entries by meal type (Breakfast / Lunch / Dinner / Snack), but there is no consolidated daily view. Users cannot easily answer the question *"what did I eat yesterday, and how close did I come to my targets?"* — let alone navigate between days or correlate intake with how they felt.

This spec defines **v1 of the Day View**: a single-page daily food diary, reachable via a date selector, that shows all of a day's meals together with macro totals and a "carb runway" cue. The pattern echoes MyFitnessPal and Cronometer's daily diary, but is **explicitly designed as the structural foundation for a more ambitious unified daily view in v2** — which will eventually surface device metrics, symptoms, glucose curves, program-week context, and an AI recap on the same page.

### Why a neutral route

The route is `/log/:date`, not `/food/:date`. The page is *currently* food-focused but is named generically so v2 can broaden the surface to "everything that happened on this day" without a route migration. This is a deliberate forward-compatibility choice.

### Tech alignment

- This feature **introduces** the URL-as-state pattern for date (`/log/:date`). The existing backdating feature for device metrics uses in-modal state, not a route param — there is no existing `:date` route pattern to inherit. Server-side TZ validation for date params should mirror the pattern at `server/routes.ts:477-495`.
- Reuses `toISODateInTZ` / `parseDateOnlyAsNoonInTZ` helpers from `server/utils/timezone.ts`.
- There is **no reusable `DatePicker` component** in the codebase today — only inlined Popover+Calendar patterns inside metric modals. This feature must extract/build a reusable `DatePicker` (see §4e).
- Migrations run on server boot via `runIncrementalMigrations()` in `server/migrate.ts` — add new migration blocks there.
- **Food backfill cap is 30 days for adding new entries.** Editing and deleting existing entries are uncapped (`PUT`/`DELETE /api/food/:id` accept any date). This shapes the v1 UX: hide the "+ Add" button when displayed date > 30 days ago; existing entries remain editable on any date.

---

## 2. Scope Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Route shape | `/log/:date` with ISO `YYYY-MM-DD` | Neutral, forward-compatible with unified day view |
| Date navigator | Prev / Next arrows + date display + calendar picker | New reusable `DatePicker` (none exists today) |
| Totals strip | Calories, Carbs (net), Fat, Protein | Match existing macro tracking surface |
| Carb display mode | **Default to net carbs always.** Per clinical preference — participants should always see net carbs. User-level override field reserved for v2. | — |
| Carb runway | Surface remaining carbs with actionable food equivalents via existing coaching rules | Discovery step below — may need data buildout |
| Meal sections | Breakfast / Lunch / Dinner / Snack, each with subtotal row | Matches existing `meal_type` enum in food entries |
| Edit interaction | Tap food entry → open `FoodEditModal` (extracted from `FoodLog.tsx` as part of this feature) | Reuse; extraction enables cross-page use |
| Add-food affordance | Per-meal-section "+ Add" button, enabled only within 30-day window | Matches server-enforced backfill cap |
| Editing existing entries | Available on **any** date (server `PUT`/`DELETE /api/food/:id` are uncapped) | Matches codebase; no read-only mode needed |
| Feel-state tagging | One-tap on each meal subtotal row: `energized / neutral / sluggish / gut_symptoms / brain_fog`; optional, null default. **30-day cap** for write operations | New schema: `meal_feel_states` table keyed by `(user_id, date, meal_type)` |
| Future dates | Allow viewing empty future dates? **No.** Disable next-arrow when displayed date ≥ today (user TZ) | Avoid confusing empty states for unconfigured planning |

### Feel-state schema choice — rationale

Three alternatives were considered:

1. **New `meal_feel_states` table keyed by `(user_id, date, meal_type)`** ← chosen
2. Extend an existing daily-summary table
3. Attach feel_state to the last food entry in each meal section

Option 1 is the cleanest model for what's actually being tagged: a *meal occurrence on a day*, not a food entry. It survives food-entry edits/deletes, supports a null default (no row = no tag), and the `(user_id, date, meal_type)` unique constraint makes it trivially queryable for the future "feel-state × macro composition" correlation work. Option 3 was tempting for its zero-migration cost but conflates two distinct concepts and breaks when the anchoring entry is deleted.

---

## 3. Pre-Flight Schema & Codebase Check

**Before writing any migration or code, Claude Code must verify the following and pause if anything is unexpected.** Document findings inline in the PR description.

## 3. Pre-Flight Findings (Resolved)

Pre-flight was completed on 2026-05-11. Full discovery report at `docs/specs/day-view-preflight-findings.md`. Eight findings required spec amendments, which have been applied throughout §2 and §4. Key facts now baked into the spec:

### 3a. Food entries table — verified

- Table: `food_entries` (Drizzle definition in `shared/schema.ts`).
- Primary key: `varchar` UUID (matches codebase convention).
- Meal field: **`meal_type`** with values `"Breakfast" | "Lunch" | "Dinner" | "Snack"` (capitalized, singular `Snack`).
- Date field: stored TZ-aware; queries use `toISODateInTZ` for user-TZ-correct day boundaries.
- **Macros are jsonb-nested**, not flat columns. Read via `COALESCE(user_corrections_json, ai_output_json)->'macros'->>'calories'` (etc.). Parent food entries with child sub-entries follow an aggregation rule to avoid double-counting — see §4b.

### 3b. Macro targets — verified

- `macro_targets` table exists and covers calories, carbs, fat, protein, with care-plan-aware resolution.
- The `daily_macro_targets` fallback in earlier drafts has been **dropped**.
- No per-user "net vs total" flag exists; v1 ships with hard-coded net-carb display (consistent with §2 decision). User-level override deferred to v2.

### 3c. Coaching rules — discovery required at implementation time

The pre-flight identified that `coachingRules.ts` and `promptEngine.ts` do not currently contain structured carb-runway food equivalents. v1 implementation will add:

- A `CARB_RUNWAY_EQUIVALENTS` export in `server/coachingRules.ts`, structured as `{ grams: number, label: string }[]`.
- A synchronous helper `getCarbRunwaySuggestion(remainingGrams: number): string | null`.

Suggested seed entries (subject to clinical review by Dr. Larson before merge):

```ts
const CARB_RUNWAY_EQUIVALENTS = [
  { grams: 4, label: '½ cup mixed berries' },
  { grams: 6, label: '1 small green salad with vinaigrette' },
  { grams: 8, label: '1 oz nuts (almonds or walnuts)' },
  { grams: 10, label: '1 cup non-starchy vegetables, cooked' },
  // expand to 8–12 entries during implementation
];
```

Selection logic: pick the largest entry where `grams <= remainingGrams`. If `remainingGrams < 4`, return a "very little headroom" phrasing instead of an equivalent.

### 3d. Food edit modal — extraction required

- Current state: `FoodEditModal` is **inline** in `client/src/pages/FoodLog.tsx`. It is not exported and cannot be reused as-is.
- v1 work: extract `FoodEditModal` to `client/src/components/FoodEditModal.tsx`, export it cleanly, and update `FoodLog.tsx` to import from the new location.
- **No `readOnly` prop required** — since `PUT`/`DELETE` are uncapped server-side, the modal is always editable.

### 3e. Date-routing conventions — new pattern introduced

- No existing route uses a `:date` param. The backdating feature uses in-modal state with server-side TZ validation at `server/routes.ts:477-495`.
- This feature **introduces** `/log/:date`. Mirror the TZ validation pattern from the existing route handlers but adapt for URL param parsing.

### 3f. Migration pattern — verified

- `server/migrate.ts` uses `CREATE TABLE IF NOT EXISTS` idempotent blocks; new migrations append at the bottom and run once on boot via `runIncrementalMigrations()`. No version-table tracking needed.

---

## 4. Implementation Steps

Steps are grouped by concern. Execute in order — schema first, then backend, then frontend.

### 4a. Schema migration

**Status:** Implemented and verified on 2026-05-11 (rev 4 amendment — `feel_state` uses `pgEnum` for consistency with codebase conventions).

Add to `shared/schema.ts`:

```ts
// Reuses the existing mealTypeEnum from this file — do not redefine.
// Define feelStateEnum near mealTypeEnum for symmetry.
export const feelStateEnum = pgEnum('feel_state', [
  'energized',
  'neutral',
  'sluggish',
  'gut_symptoms',
  'brain_fog',
]);

export const mealFeelStates = pgTable('meal_feel_states', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  mealType: mealTypeEnum('meal_type').notNull(),
  feelState: feelStateEnum('feel_state'), // nullable — null means "not tagged"
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  userDateMealUniqueIdx: uniqueIndex('meal_feel_states_user_date_meal_idx')
    .on(t.userId, t.date, t.mealType),
}));

// Also export:
//   - insertMealFeelStateSchema (drizzle-zod) matching the pattern of nearby tables
//   - MealFeelState and InsertMealFeelState types
```

> **Notes:**
> - UUID default matches the codebase convention of `gen_random_uuid()` via raw SQL — not `crypto.randomUUID()` in JS.
> - `mealType` reuses the existing `mealTypeEnum` from `shared/schema.ts` (values `Breakfast | Lunch | Dinner | Snack`) — do not create a parallel definition.
> - `feel_state` uses a `pgEnum` (not `text + CHECK`) for type-safety consistency with the rest of the schema.
> - Use `timestamp` (not `timestamptz`) to match every other user-scoped table in the codebase.
> - The unique-index name `meal_feel_states_user_date_meal_idx` must match between the Drizzle declaration and the raw SQL migration so Drizzle introspection is clean.

Add to `server/migrate.ts` (following existing block patterns — see `metric_entries` for the separate `CREATE UNIQUE INDEX` pattern):

```sql
-- Create the feel_state enum type (idempotent guard via DO block).
DO $$ BEGIN
  CREATE TYPE feel_state AS ENUM ('energized', 'neutral', 'sluggish', 'gut_symptoms', 'brain_fog');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS meal_feel_states (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type meal_type NOT NULL,
  feel_state feel_state,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meal_feel_states_user_date_meal_idx
  ON meal_feel_states(user_id, date, meal_type);

CREATE INDEX IF NOT EXISTS idx_meal_feel_states_user_date
  ON meal_feel_states(user_id, date);
```

> Verify the actual `CREATE TYPE` idempotency pattern used elsewhere in `server/migrate.ts` for other pgEnums and match it. The `DO $$ ... EXCEPTION WHEN duplicate_object` block above is a common pattern; adjust if the codebase uses a different one.

The previously-drafted `daily_macro_targets` fallback table is **not needed** — pre-flight confirmed `macro_targets` already exists and covers the use case.

### 4b. Backend — Day endpoint

New route: `GET /api/log/day/:date`

**Validation:**
- `:date` matches `^\d{4}-\d{2}-\d{2}$`.
- Parsed date is not in the future (in user's TZ via `parseDateOnlyAsNoonInTZ`).
- 400 with clear error code on either failure.
- **Mirror the TZ validation pattern at `server/routes.ts:477-495`** — adapt it for URL param parsing rather than body field parsing.

**Response shape:**

```ts
type DayLogResponse = {
  date: string;                    // ISO YYYY-MM-DD echoed
  canAddEntries: boolean;          // true if (today - date) <= 30 days; gates "+ Add" buttons
  canTagFeelState: boolean;        // true if (today - date) <= 30 days
  targets: {
    calories: number | null;
    carbs: number | null;          // net carbs target
    fat: number | null;
    protein: number | null;
  };
  totals: {
    calories: number;
    totalCarbs: number;
    netCarbs: number;
    fiber: number;
    fat: number;
    protein: number;
  };
  meals: Record<MealType, {
    entries: FoodEntrySummary[];   // shape matches existing list views
    subtotals: { calories, carbs, fat, protein };  // carbs = net carbs
    feelState: FeelState | null;
  }>;
  carbRunway: {
    remainingGrams: number;        // can be negative
    suggestion: string | null;     // null if remaining <= 0
    overTargetCopy: string | null; // "Over by Ng — hydrate and walk" when remaining < 0
  };
};

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
```

**Implementation notes:**
- **Macros live in jsonb, not flat columns.** Extract via `COALESCE(user_corrections_json, ai_output_json)->'macros'` on the food_entries row. Where both jsons are present, user corrections win.
- **Parent/child aggregation rule:** food entries may have child sub-entries (e.g., a recipe with constituent foods). To avoid double-counting, sum macros from leaf entries only — a parent entry's macros are derived from its children. Verify the actual aggregation rule in the existing food list rendering (`FoodLog.tsx`) before writing the query and document the rule in the route handler.
- `canAddEntries` and `canTagFeelState` are both `(todayInUserTZ - queriedDate) <= 30 days`. The client uses these flags to conditionally render "+ Add" and feel-state pills.
- `carbRunway.suggestion` calls into the helper described in §3c.
- `carbRunway.overTargetCopy` is server-rendered (not client) so future v2 personalization can vary copy by context without a client change.

### 4c. Backend — Feel-state endpoint

New route: `PUT /api/log/day/:date/meals/:mealType/feel-state`

**Body:** `{ feelState: FeelState | null }`

**Behavior:** Upsert into `meal_feel_states` on `(user_id, date, meal_type)` conflict. Passing `feelState: null` clears the tag (either set the column to NULL or delete the row — pick whichever matches the codebase's existing patterns).

**Auth & validation:**
- Standard session check.
- Validate `:mealType` against `'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'`.
- Validate `feelState` against the allowed enum (plus null).
- **30-day cap on this endpoint.** Feel-state tagging is allowed on dates up to 30 days old, since the data is reflective rather than entered — but older than that, recall accuracy degrades and the data becomes noise. Reject with 403 + clear error code if `(todayInUserTZ - queriedDate) > 30 days`.
- Mirror TZ validation from `server/routes.ts:477-495`.

### 4d. Frontend — Routing & page shell

- Register `/log/:date` in `client/src/App.tsx` (or wherever routes live), pointing to a new `DayViewPage` component.
- Add a `/log` redirect that routes to `/log/<today-in-user-TZ>`.
- 404 / invalid date → redirect to today with a toast.
- Add an entry point from the existing navigation (sidebar or bottom nav, whichever matches the app shell).

### 4e. Frontend — Date navigator and DatePicker

Two new components:

**`client/src/components/DatePicker.tsx`** *(new — no reusable component exists today)*

- Wrap shadcn `Popover` + `Calendar` (the same primitives currently inlined in metric backdating modals).
- Props: `value: Date`, `onChange: (date: Date) => void`, optional `min`/`max` constraints, optional `disabled`.
- Trigger button is a slot prop so callers can supply their own visual (e.g., the `DateNavigator` uses the centered date display as trigger).
- After shipping, refactor at least one existing inlined Popover+Calendar usage (in a metric modal) to consume this new component — proves reusability and pays down some duplication. Pick the simplest such modal.

**`client/src/components/DateNavigator.tsx`** *(new)*

- Layout: `[← prev]   [Date display, tappable]   [next →]`
- Tapping the date display opens the new `DatePicker` as a popover anchored to the date display.
- Prev/next arrows update the route via the router (push, not replace, so back-button works).
- Next arrow is disabled when `displayedDate >= todayInUserTZ`.
- Date display shows e.g. "Mon, May 11" — use today's relative phrasing when applicable ("Today", "Yesterday").

### 4f. Frontend — Totals strip & carb runway

New component: `client/src/components/DailyTotals.tsx`

- Four tiles in a row: Calories, Carbs (net), Fat, Protein.
- Each tile shows `actual / target` with a horizontal progress bar.
- If no target exists for a macro, show actual only (no bar, no slash).
- The **Carbs** tile additionally renders the carb-runway phrase below the progress bar:
  - `remaining > 0`: "**18g remaining** ≈ 1 cup non-starchy vegetables, cooked" (using `carbRunway.suggestion`)
  - `remaining === 0`: "**At target**"
  - `remaining < 0`: render `carbRunway.overTargetCopy` directly (e.g., "**Over by 4g — hydrate and walk**"). Soft, physical, clinically-aligned nudge — both hydration and walking lower postprandial glucose.
- All carb-runway copy is server-rendered — do **not** compute suggestions or compose copy on the client.

### 4g. Frontend — Meal sections

New component: `client/src/components/MealSection.tsx` (and `MealSectionList.tsx` wrapper if helpful)

- Render the four meal types in fixed order: **Breakfast → Lunch → Dinner → Snack**.
- Each section:
  - Header: meal name, subtotal line (cal | net carbs | fat | protein), feel-state pill row (see §4h).
  - Body: list of food entries, each tappable.
    - Tapping opens `FoodEditModal` (now imported from `client/src/components/FoodEditModal.tsx` after extraction — see §4i).
    - Editing an entry from this view should refresh the day-view data on close, regardless of the date being viewed (since edits are uncapped).
  - Footer: "+ Add food" button.
    - Visible only when `canAddEntries === true` (date within 30 days). Hidden, not disabled, when outside the window — keeps the older-date view clean.
    - When clicked, opens the existing add-food flow with `meal_type` and `date` prefilled.
- Empty meal section: still render header; body shows a single muted "No entries" line. Footer "+ Add food" still renders if within window.

### 4h. Frontend — Feel-state tagging

New component: `client/src/components/FeelStatePicker.tsx`

- Render as a row of 5 small pill buttons inline in the meal section header, each with an emoji + label or just an emoji on narrow viewports:
  - ⚡ Energized
  - 😐 Neutral
  - 🥱 Sluggish
  - 🌀 Gut symptoms
  - 🌫️ Brain fog
- Tap selects (highlight). Tap selected pill again to clear.
- Updates persist immediately via `PUT` to the feel-state endpoint (optimistic update; revert on error with toast).
- **Visible only when `canTagFeelState === true`** (date within 30 days). Hidden when outside the window — older dates simply don't show the pill row.

### 4i. Frontend — `FoodEditModal` extraction

`FoodEditModal` is currently inline in `client/src/pages/FoodLog.tsx` and not exported. Extract it as part of this feature:

1. Move the modal component to `client/src/components/FoodEditModal.tsx` and export it as the default export.
2. Update `FoodLog.tsx` to import from the new location. Verify the existing food log page still works unchanged.
3. The day view consumes it from the new path.

**No `readOnly` prop required.** Since `PUT`/`DELETE /api/food/:id` accept any date server-side, edits and deletes are always allowed. The modal renders identically on day 1 and day 365. There is no "read-only mode" anywhere in v1.

### 4j. Frontend — Loading & error states

- Skeleton loaders for totals strip and meal sections during initial fetch.
- Error state: replace the meal area with "Couldn't load this day" + retry button. Date navigator stays interactive.
- All API errors surface via the existing toast system.

---

## 5. Acceptance Criteria

### Functional

- [ ] Visiting `/log/2026-05-11` (or any valid past date) loads that day's entries, totals, and feel states.
- [ ] Visiting `/log` redirects to today.
- [ ] Visiting `/log/<future-date>` or `/log/<malformed>` redirects to today with a toast.
- [ ] Prev/next arrows update the URL and re-fetch.
- [ ] Next arrow is disabled when viewing today.
- [ ] The new `DatePicker` component opens from the date display and updates the route on selection.
- [ ] Totals strip shows accurate sums; targets render as `actual / target` only when a target exists.
- [ ] Carbs tile shows net carbs (not total).
- [ ] Carb runway phrase renders correctly across `remaining > 0`, `=== 0`, and `< 0` cases; over-target copy comes from `carbRunway.overTargetCopy`.
- [ ] All four meal sections render in fixed order (Breakfast → Lunch → Dinner → Snack), even when empty.
- [ ] Subtotal row matches the sum of leaf-entry macros in that section (no parent/child double-counting).
- [ ] Tapping a food entry opens `FoodEditModal` with the correct entry.
- [ ] "+ Add food" prefills `meal_type` and `date`.
- [ ] Within 30-day window: "+ Add food" button is visible and creates entries that immediately appear in the day view.
- [ ] Beyond 30-day window: "+ Add food" buttons are hidden; existing entries remain tappable and editable; no "read-only" banner is shown.
- [ ] Feel-state pill row is visible within 30-day window; hidden beyond it.
- [ ] Feel-state pill selection persists across page reloads.
- [ ] Tapping a selected feel-state pill clears it.
- [ ] `FoodLog.tsx` continues to work correctly after `FoodEditModal` is extracted.

### Data integrity

- [ ] Migration runs cleanly on boot via `runIncrementalMigrations()`; running it twice is idempotent.
- [ ] Server enforces the **30-day cap** on creating new food entries (existing behavior — verify still intact).
- [ ] Server allows `PUT`/`DELETE /api/food/:id` on any date (existing behavior — verify still intact).
- [ ] `meal_feel_states` unique constraint prevents duplicate rows per `(user_id, date, meal_type)`.
- [ ] Feel-state endpoint rejects writes with 403 when `(today - date) > 30 days`.
- [ ] All date math respects user TZ via existing helpers — no UTC drift across DST boundaries.

### UX

- [ ] On mobile (≤ 380px viewport), the totals strip wraps acceptably and feel-state pills remain tappable (≥ 32px tap target).
- [ ] Skeleton loaders prevent layout shift on slow connections.
- [ ] Empty sections do not look "broken" — empty state copy is intentional.
- [ ] Carb runway phrasing reads naturally and does not feel punitive when over target.

### Out-of-band

- [ ] The seed `CARB_RUNWAY_EQUIVALENTS` list is reviewed by Dr. Larson before merge.

---

## 6. Files Likely Touched

**Schema & migration**
- `shared/schema.ts` — add `mealFeelStates` (drop `dailyMacroTargets` — `macro_targets` already exists)
- `server/migrate.ts` — new migration block for `meal_feel_states`

**Backend**
- `server/routes/log.ts` *(new)* — day endpoint + feel-state endpoint
- `server/routes.ts` — registration of new route module; mirror TZ validation pattern at lines 477-495
- `server/coachingRules.ts` — add `CARB_RUNWAY_EQUIVALENTS` constant + `getCarbRunwaySuggestion(remainingGrams)` helper + `getCarbOverTargetCopy(overGrams)` helper
- `server/utils/timezone.ts` — possibly add a `daysBetween` helper if not present; otherwise read-only reuse

**Frontend**
- `client/src/App.tsx` — register `/log` and `/log/:date` routes
- `client/src/pages/DayViewPage.tsx` *(new)*
- `client/src/pages/FoodLog.tsx` — refactor to import `FoodEditModal` from new component file instead of defining inline
- `client/src/components/FoodEditModal.tsx` *(new — extracted from `FoodLog.tsx`)*
- `client/src/components/DatePicker.tsx` *(new — wraps shadcn Popover+Calendar; no existing reusable component)*
- `client/src/components/DateNavigator.tsx` *(new)*
- `client/src/components/DailyTotals.tsx` *(new)*
- `client/src/components/MealSection.tsx` *(new)*
- `client/src/components/FeelStatePicker.tsx` *(new)*
- One existing metric modal — refactor its inlined Popover+Calendar to use the new `DatePicker` (proves reusability)
- Navigation shell (sidebar / bottom nav) — add entry point

**Types**
- Wherever shared types live (e.g., `shared/types.ts`) — add `MealType` (`'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'`), `FeelState`, `DayLogResponse`.

---

## 7. Out of Scope (Deferred to v2 / v3)

The following are explicitly **not** in v1, but the architecture (especially the neutral `/log/:date` route, the `meal_feel_states` table, and the day-endpoint response envelope) is designed to absorb them:

- **Horizontal timeline view of the day** — the eventual architectural destination, where food, device metrics, glucose, and symptoms render on a shared time axis.
- **End-of-day AI recap** from the prompt engine — would attach to the day endpoint response as an optional `recap` field in v2.
- **Voice-first food entry** (Whisper API) — likely surfaces from the "+ Add food" affordance with no day-view-layout changes.
- **Practitioner-side annotations** on entries — requires a new table and a role-aware render path.
- **CGM glucose curve overlay** — requires the timeline view first.
- **Clinical-grade PDF export** of a day or date range.
- **Program-week / phase-aware header** ("Week 4 of metabolic reset") — depends on program-tracking infrastructure not yet built.

These are noted here so reviewers and future Claude Code sessions don't accidentally pull them into v1 scope.

---

## 8. Resolved Decisions (Product Review)

The following were flagged for review during spec drafting and have been resolved:

- **Feel-state tagging window:** 30-day cap (not uncapped, not 7-day). Balances reflective utility against recall-accuracy noise.
- **Carb runway over-target copy:** "Over by 4g — hydrate and walk" — brief, physical, clinically-aligned nudge. Hydration and walking both lower postprandial glucose, so the copy carries genuine clinical weight.
- **`/log` (no date):** Redirects to `/log/<today-in-user-TZ>`. URL always reflects the day being viewed; shared URLs always point to a specific day.
- **Net vs total carb display:** Default to net carbs always. User-level override field reserved for v2.
- **Food backfill window:** 30-day cap on adding new entries; editing/deleting existing entries is uncapped (matches codebase). No "read-only mode" needed.

### Still Open

- Should the carb runway equivalents be user-context-aware (e.g., adjust for fasting state, time of day)? V1 is context-free; rule engine can add context later without changing the API contract.

# Day View — v1 Spec

**Status:** Draft for implementation (product decisions resolved)
**Owner:** Chad Larson
**Target route:** `/log/:date`
**Last updated:** 2026-05-11 (rev 2 — §8 product decisions resolved)

---

## 1. Context

The Metabolic-Tracker app currently lets users log food entries by meal category (breakfast / lunch / dinner / snacks), but there is no consolidated daily view. Users cannot easily answer the question *"what did I eat yesterday, and how close did I come to my targets?"* — let alone navigate between days or correlate intake with how they felt.

This spec defines **v1 of the Day View**: a single-page daily food diary, reachable via a date selector, that shows all of a day's meals together with macro totals and a "carb runway" cue. The pattern echoes MyFitnessPal and Cronometer's daily diary, but is **explicitly designed as the structural foundation for a more ambitious unified daily view in v2** — which will eventually surface device metrics, symptoms, glucose curves, program-week context, and an AI recap on the same page.

### Why a neutral route

The route is `/log/:date`, not `/food/:date`. The page is *currently* food-focused but is named generically so v2 can broaden the surface to "everything that happened on this day" without a route migration. This is a deliberate forward-compatibility choice.

### Tech alignment

- Reuses the `DatePicker` component and `toISODateInTZ` / `parseDateOnlyAsNoonInTZ` helpers shipped with the device-metrics backdating feature.
- Migrations run on server boot via `runIncrementalMigrations()` in `server/migrate.ts` — add new migration blocks there.
- Food backfill remains capped at **7 days** (unchanged from existing rules). Older dates render read-only.

---

## 2. Scope Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Route shape | `/log/:date` with ISO `YYYY-MM-DD` | Neutral, forward-compatible with unified day view |
| Date navigator | Prev / Next arrows + date display + calendar picker | Reuse existing `DatePicker`; familiar pattern |
| Totals strip | Calories, Carbs (net or total), Fat, Protein | Match existing macro tracking surface |
| Carb display mode | **Default to net carbs always.** Per clinical preference — participants should always see net carbs. User-level override field reserved for v2. | — |
| Carb runway | Surface remaining carbs with actionable food equivalents via existing coaching rules | Discovery step below — may need data buildout |
| Meal sections | Breakfast / Lunch / Dinner / Snacks, each with subtotal row | Matches existing categorization in food entries |
| Edit interaction | Tap food entry → open existing food edit modal | Reuse, don't rebuild |
| Add-food affordance | Per-meal-section "+ Add" button, enabled only within 7-day window | Mirrors existing backfill rules |
| Out-of-window dates | Read-only with a subtle banner explaining the cap | Don't break the back-navigation flow |
| Feel-state tagging | One-tap on each meal subtotal row: `energized / neutral / sluggish / gut_symptoms / brain_fog`; optional, null default | New schema: `meal_feel_states` table keyed by `(user_id, date, meal_category)` |
| Future dates | Allow viewing empty future dates? **No.** Disable next-arrow when displayed date ≥ today (user TZ) | Avoid confusing empty states for unconfigured planning |

### Feel-state schema choice — rationale

Three alternatives were considered:

1. **New `meal_feel_states` table keyed by `(user_id, date, meal_category)`** ← chosen
2. Extend an existing daily-summary table
3. Attach feel_state to the last food entry in each meal section

Option 1 is the cleanest model for what's actually being tagged: a *meal occurrence on a day*, not a food entry. It survives food-entry edits/deletes, supports a null default (no row = no tag), and the `(user_id, date, meal_category)` unique constraint makes it trivially queryable for the future "feel-state × macro composition" correlation work. Option 3 was tempting for its zero-migration cost but conflates two distinct concepts and breaks when the anchoring entry is deleted.

---

## 3. Pre-Flight Schema & Codebase Check

**Before writing any migration or code, Claude Code must verify the following and pause if anything is unexpected.** Document findings inline in the PR description.

### 3a. Food entries table

- [ ] Confirm table name and structure (likely `food_entries` or similar in `shared/schema.ts`).
- [ ] Confirm `meal_category` field shape and allowed values (must include `breakfast`, `lunch`, `dinner`, `snacks` exactly — adjust enum below if different).
- [ ] Confirm `date` field type and whether dates are stored as `DATE` (TZ-naive day) or `TIMESTAMPTZ` (instant). All queries on this page must use the user's TZ via `toISODateInTZ`.
- [ ] Confirm macro fields exist on entries: `calories`, `carbs_g`, `fiber_g` (for net carb calc), `fat_g`, `protein_g`. If naming differs, adapt downstream.

### 3b. Macro targets — discovery required

The user has confirmed targets are *probably* somewhere but not sure where. Locate the source:

- [ ] Search `shared/schema.ts` for tables containing fields like `target_calories`, `daily_carb_limit`, `macro_targets`, `care_plan`, or `nutrition_goals`.
- [ ] Check user profile / care plan tables.
- [ ] Check for hardcoded constants in `server/coachingRules.ts` or `server/promptEngine.ts`.
- [ ] **If found:** wire the day endpoint to read from that source.
- [ ] **If not found, or only partially found:** add a `daily_macro_targets` table (see §4a fallback) and seed with sensible defaults derivable from the user's care plan if one exists. Note the gap in the PR description for product follow-up.

Also determine:

- [ ] **Carb display mode:** default `carbDisplayMode` to `'net'` always. If pre-flight discovers a per-user setting (e.g., `track_fiber`, `carb_display_mode`), respect it; otherwise `'net'` is the v1 default. Net is computed as `total_carbs - fiber_g`. If an entry has no fiber data, its net = total for that entry (slightly conservative, clinically acceptable).

### 3c. Coaching rules — discovery required

Carb runway needs actionable food equivalents (e.g., "≈ ½ cup berries"):

- [ ] Read `server/coachingRules.ts` and `server/promptEngine.ts` end-to-end.
- [ ] Look for any existing structure mapping carb-gram thresholds → food suggestions.
- [ ] **If present:** expose via a synchronous helper `getCarbRunwaySuggestion(remainingGrams: number, userContext): string | null` and use it from the day endpoint.
- [ ] **If absent or sparse:** add a small seed list of 8–12 low-carb food equivalents to `server/coachingRules.ts` under a new `CARB_RUNWAY_EQUIVALENTS` export, structured as `{ grams: number, label: string }[]`. Keep the data in this same file — do not introduce a new content directory in v1.

Suggested seed entries (subject to clinical review — pull from existing patient education content if available):

```ts
// Example shape only — adjust quantities to clinical standards
const CARB_RUNWAY_EQUIVALENTS = [
  { grams: 4, label: '½ cup mixed berries' },
  { grams: 6, label: '1 small green salad with vinaigrette' },
  { grams: 8, label: '1 oz nuts (almonds or walnuts)' },
  { grams: 10, label: '1 cup non-starchy vegetables, cooked' },
  // ...
];
```

Selection logic: pick the largest entry where `grams <= remainingGrams`. If `remainingGrams < 4`, return a "very little headroom" phrasing instead of an equivalent.

### 3d. Food edit modal

- [ ] Confirm the existing food edit modal's import path and required props (likely `entryId` and `onClose` or similar).
- [ ] Confirm it handles both edit and delete actions, so the day view doesn't need its own delete affordance.

### 3e. Date-routing conventions

- [ ] Confirm how the backdating feature parses `:date` route params and reuse that pattern verbatim. The two features should share validation logic.

### 3f. Migration pattern

- [ ] Read the most recent migration block in `server/migrate.ts` and follow the same idempotency pattern (e.g., `CREATE TABLE IF NOT EXISTS`, version tracking if applicable).

---

## 4. Implementation Steps

Steps are grouped by concern. Execute in order — schema first, then backend, then frontend.

### 4a. Schema migration

Add to `shared/schema.ts`:

```ts
export const mealFeelStates = pgTable('meal_feel_states', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(), // stored as user-TZ date string
  mealCategory: text('meal_category', {
    enum: ['breakfast', 'lunch', 'dinner', 'snacks'],
  }).notNull(),
  feelState: text('feel_state', {
    enum: ['energized', 'neutral', 'sluggish', 'gut_symptoms', 'brain_fog'],
  }), // nullable — null means "not tagged"
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniqUserDateMeal: unique().on(t.userId, t.date, t.mealCategory),
}));
```

Add to `server/migrate.ts` (following existing block pattern):

```sql
CREATE TABLE IF NOT EXISTS meal_feel_states (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_category TEXT NOT NULL
    CHECK (meal_category IN ('breakfast', 'lunch', 'dinner', 'snacks')),
  feel_state TEXT
    CHECK (feel_state IN ('energized', 'neutral', 'sluggish', 'gut_symptoms', 'brain_fog')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date, meal_category)
);

CREATE INDEX IF NOT EXISTS idx_meal_feel_states_user_date
  ON meal_feel_states(user_id, date);
```

**Fallback:** if §3b discovery finds no macro targets table, also create:

```sql
CREATE TABLE IF NOT EXISTS daily_macro_targets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  calories INTEGER,
  carbs_g INTEGER,
  fat_g INTEGER,
  protein_g INTEGER,
  carb_display_mode TEXT
    CHECK (carb_display_mode IN ('net', 'total')) DEFAULT 'net',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_macro_targets_user
  ON daily_macro_targets(user_id, effective_from DESC);
```

Resolution rule: for a given day, use the row with the largest `effective_from <= queriedDate`.

### 4b. Backend — Day endpoint

New route: `GET /api/log/day/:date`

**Validation:**
- `:date` matches `^\d{4}-\d{2}-\d{2}$`.
- Parsed date is not in the future (in user's TZ via `parseDateOnlyAsNoonInTZ`).
- 400 with clear error code on either failure.

**Response shape:**

```ts
type DayLogResponse = {
  date: string;                    // ISO YYYY-MM-DD echoed
  isReadOnly: boolean;             // true if date is older than 7 days
  carbDisplayMode: 'net' | 'total';
  targets: {
    calories: number | null;
    carbs: number | null;          // already net or total per carbDisplayMode
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
  meals: Record<MealCategory, {
    entries: FoodEntrySummary[];   // shape matches existing list views
    subtotals: { calories, carbs, fat, protein };
    feelState: FeelState | null;
  }>;
  carbRunway: {
    remainingGrams: number;        // can be negative
    suggestion: string | null;     // null if remaining <= 0
  };
};
```

**Implementation notes:**
- All sums computed in SQL where possible (one query per meal category, or one grouped query).
- `isReadOnly` derived as `(todayInUserTZ - queriedDate) > 7 days`.
- `carbRunway.suggestion` calls into the helper described in §3c.

### 4c. Backend — Feel-state endpoint

New route: `PUT /api/log/day/:date/meals/:category/feel-state`

**Body:** `{ feelState: FeelState | null }`

**Behavior:** Upsert into `meal_feel_states` on `(user_id, date, meal_category)` conflict. Passing `feelState: null` clears the tag (either set the column to NULL or delete the row — pick whichever matches the codebase's existing patterns).

**Auth & validation:**
- Standard session check.
- Validate `:category` against the four allowed values.
- Validate `feelState` against the allowed enum (plus null).
- **30-day cap on this endpoint.** Feel-state tagging is allowed on dates up to 30 days old, since the data is reflective rather than entered — but older than that, recall accuracy degrades and the data becomes noise. Reject with 403 + clear error code if `(todayInUserTZ - queriedDate) > 30 days`.

### 4d. Frontend — Routing & page shell

- Register `/log/:date` in `client/src/App.tsx` (or wherever routes live), pointing to a new `DayViewPage` component.
- Add a `/log` redirect that routes to `/log/<today-in-user-TZ>`.
- 404 / invalid date → redirect to today with a toast.
- Add an entry point from the existing navigation (sidebar or bottom nav, whichever matches the app shell).

### 4e. Frontend — Date navigator

New component: `client/src/components/DateNavigator.tsx`

- Layout: `[← prev]   [Date display, tappable]   [next →]`
- Tapping the date display opens the existing `DatePicker` as a modal/popover.
- Prev/next arrows update the route via the router (push, not replace, so back-button works).
- Next arrow is disabled when `displayedDate >= todayInUserTZ`.
- Date display shows e.g. "Mon, May 11" — use today's relative phrasing when applicable ("Today", "Yesterday").

### 4f. Frontend — Totals strip & carb runway

New component: `client/src/components/DailyTotals.tsx`

- Four tiles in a row: Calories, Carbs, Fat, Protein.
- Each tile shows `actual / target` with a horizontal progress bar.
- If no target exists for a macro, show actual only (no bar, no slash).
- The **Carbs** tile additionally renders the carb-runway phrase below the progress bar:
  - `remaining > 0`: "**18g remaining** ≈ 1 cup non-starchy vegetables, cooked"
  - `remaining === 0`: "**At target**"
  - `remaining < 0`: "**Over by 4g — hydrate and walk**" (soft, physical, clinically-aligned nudge — both hydration and walking lower postprandial glucose. Keep copy brief and non-punitive.)
- Use the `carbRunway.suggestion` from the API response — do **not** compute suggestions on the client.

### 4g. Frontend — Meal sections

New component: `client/src/components/MealSection.tsx` (and `MealSectionList.tsx` wrapper if helpful)

- Render the four meal categories in fixed order: Breakfast → Lunch → Dinner → Snacks.
- Each section:
  - Header: meal name, subtotal line (cal | carbs | fat | protein), feel-state pill row (see §4h).
  - Body: list of food entries, each tappable.
    - Tapping opens the existing food edit modal.
  - Footer: "+ Add food" button.
    - Disabled (and visually de-emphasized) when `isReadOnly`.
    - When clicked, opens the existing add-food flow with `meal_category` and `date` prefilled.
- Empty meal section: still render header and footer; body shows a single muted "No entries" line.

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
- **Available on dates up to 30 days old** — wider than food editing's 7-day cap (since feel-state is reflective) but capped to avoid low-quality recall data. Hide or disable pills when displayed date > 30 days ago.

### 4i. Frontend — Read-only mode

When `isReadOnly` is true:
- All "+ Add food" buttons disabled.
- Tapping a food entry still opens the edit modal but in **read-only mode** (verify the modal supports this; if not, suppress the click handler and add a tooltip).
- A subtle banner above the totals strip: *"Older than 7 days — view only. Last 7 days are editable."*
- Feel-state pills remain interactive when displayed date is within the **30-day** feel-state window, even if `isReadOnly` (which is gated at 7 days for food editing). Beyond 30 days, feel-state pills are also disabled.

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
- [ ] The `DatePicker` opens from the date display and updates the route on selection.
- [ ] Totals strip shows accurate sums; targets render as `actual / target` only when a target exists.
- [ ] Carbs tile shows net carbs when `carbDisplayMode === 'net'`, total otherwise.
- [ ] Carb runway phrase renders correctly across `remaining > 0`, `=== 0`, and `< 0` cases.
- [ ] All four meal sections render in fixed order, even when empty.
- [ ] Subtotal row matches the sum of entries in that section.
- [ ] Tapping a food entry opens the edit modal with the correct entry.
- [ ] "+ Add food" prefills `meal_category` and `date`.
- [ ] Within 7-day window: add/edit/delete all work; entries refresh in the day view.
- [ ] Beyond 7-day window: add buttons disabled, edit modal opens read-only (or click suppressed), banner visible.
- [ ] Feel-state pill selection persists across page reloads.
- [ ] Feel-state tagging works on dates beyond the 7-day window.
- [ ] Tapping a selected feel-state pill clears it.

### Data integrity

- [ ] Migration runs cleanly on boot via `runIncrementalMigrations()`; running it twice is idempotent.
- [ ] Server rejects `POST/PUT/DELETE` on food entries for dates > 7 days ago with a clear error code (existing behavior — verify still intact).
- [ ] `meal_feel_states` unique constraint prevents duplicate rows per `(user_id, date, meal_category)`.
- [ ] All date math respects user TZ via existing helpers — no UTC drift across DST boundaries.

### UX

- [ ] On mobile (≤ 380px viewport), the totals strip wraps acceptably and feel-state pills remain tappable (≥ 32px tap target).
- [ ] Skeleton loaders prevent layout shift on slow connections.
- [ ] Empty sections do not look "broken" — empty state copy is intentional.
- [ ] Carb runway phrasing reads naturally and does not feel punitive when over target.

### Out-of-band

- [ ] If §3b found no targets table, the PR description flags the gap and notes which fallback path was taken.
- [ ] If §3c required new content, the seed equivalents are listed in the PR for clinical review before merge.

---

## 6. Files Likely Touched

**Schema & migration**
- `shared/schema.ts` — add `mealFeelStates` (and optionally `dailyMacroTargets`)
- `server/migrate.ts` — new migration block(s)

**Backend**
- `server/routes/log.ts` *(new)* — day endpoint + feel-state endpoint
- `server/index.ts` or wherever routes are registered
- `server/coachingRules.ts` — read for discovery; add `CARB_RUNWAY_EQUIVALENTS` + `getCarbRunwaySuggestion` helper if absent
- `server/utils/timezone.ts` — read-only reuse; possibly add a `daysBetween` helper if not present

**Frontend**
- `client/src/App.tsx` — register `/log` and `/log/:date` routes
- `client/src/pages/DayViewPage.tsx` *(new)*
- `client/src/components/DateNavigator.tsx` *(new)*
- `client/src/components/DailyTotals.tsx` *(new)*
- `client/src/components/MealSection.tsx` *(new)*
- `client/src/components/FeelStatePicker.tsx` *(new)*
- `client/src/components/DatePicker.tsx` — reuse from backdating; verify exports
- Navigation shell (sidebar / bottom nav) — add entry point

**Types**
- Wherever shared types live (e.g., `shared/types.ts`) — add `MealCategory`, `FeelState`, `DayLogResponse`.

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

### Still Open

- Should the carb runway equivalents be user-context-aware (e.g., adjust for fasting state, time of day)? V1 is context-free; rule engine can add context later without changing the API contract.

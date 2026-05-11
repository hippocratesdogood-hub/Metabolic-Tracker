# Day View — Pre-Flight Findings
**Date:** 2026-05-11
**Branch:** spec/day-view
**Spec reference:** [docs/specs/day-view-spec.md](day-view-spec.md) §3

> **TL;DR — spec needs amendments before §4 implementation.** The codebase diverges from the spec's assumptions in five material ways: (1) primary keys are `varchar` UUIDs, not `serial`; (2) the column is `meal_type` not `meal_category`, with capitalized singular values (`Breakfast|Lunch|Dinner|Snack`); (3) macros live inside `aiOutputJson`/`userCorrectionsJson` jsonb blobs, not as columns; (4) a `macro_targets` table already exists with daily + per-meal targets; (5) the food edit modal is inline in `FoodLog.tsx` and has no read-only mode. The server allows 30-day food backfill but the client caps at 7 — the spec's 7-day assumption is therefore client-correct but server-loose. Detail below.

---

## 3a. Food entries table

- **Table name & path in schema.ts:** `foodEntries` → `food_entries` at [shared/schema.ts:139-155](../../shared/schema.ts#L139-L155).
- **meal_category field shape & allowed values:** ⚠️ The column is `meal_type` (Drizzle: `mealType`), **not** `meal_category`. It uses the `mealTypeEnum` pgEnum at [shared/schema.ts:13](../../shared/schema.ts#L13) with values `["Breakfast", "Lunch", "Dinner", "Snack"]` — capitalized, and singular `Snack` (not `snacks`). Default is `"Breakfast"`. NOT NULL.
- **Date field type & TZ handling:** Two timestamp fields, both `timestamp` (TZ-naive instant, not `DATE`):
  - `timestamp` — record creation/anchor time, defaults to `now()` ([schema.ts:142](../../shared/schema.ts#L142)).
  - `eatenAt` — user-adjustable consumption time ([schema.ts:153](../../shared/schema.ts#L153)). Nullable; populated on create at [server/routes.ts:655](../../server/routes.ts#L655).

  TZ handling: backdating in metrics uses [server/utils/timezone.ts](../../server/utils/timezone.ts) helpers `toISODateInTZ` and `parseDateOnlyAsNoonInTZ`. Food endpoints **do not** apply this pattern today — `POST /api/food` at [server/routes.ts:611](../../server/routes.ts#L611) just `new Date(req.body.timestamp)`s the input, with `now()` and `30 days ago` as future/past bounds ([routes.ts:617-625](../../server/routes.ts#L617-L625)). `storage.getFoodEntriesByDate` at [server/storage.ts:374-392](../../server/storage.ts#L374-L392) uses raw `setUTCHours(0,0,0,0)` / `setUTCHours(23,59,59,999)` — **UTC, not user TZ**. The day endpoint must not rely on this method; it should compute its own TZ-aware boundaries via `parseDateOnlyAsNoonInTZ`.

- **Macro fields (calories, carbs_g, fiber_g, fat_g, protein_g):** ⚠️ **None of these are columns.** Macros live inside the `aiOutputJson` and `userCorrectionsJson` jsonb fields. Resolution priority (used everywhere — [server/routes.ts:2458](../../server/routes.ts#L2458), [server/analytics.ts:422](../../server/analytics.ts#L422), [server/__tests__/dataFlow.test.ts:191](../../server/__tests__/dataFlow.test.ts#L191), and the inline edit modal):
  ```ts
  const macros = (entry.userCorrectionsJson as any)?.macros
              || (entry.aiOutputJson as any)?.macros
              || (entry.aiOutputJson as any);   // legacy fallback
  ```
  Field names inside `macros`: `calories`, `protein`, `carbs`, `fat`, `fiber`, `totalCarbs`, `netCarbs`. The keys are unprefixed (`protein` not `protein_g`), `netCarbs` is pre-computed by the food-analyze pipeline at [server/routes.ts:1322-1327](../../server/routes.ts#L1322-L1327), and a `carbs`/`netCarbs` compatibility alias is maintained.

  Parent/child meal entries: a parent meal aggregates children via the `parentMealId` self-reference at [schema.ts:151](../../shared/schema.ts#L151). To avoid double-counting, all day sums **must filter out child entries** (`!parentMealId`) — see [routes.ts:2437](../../server/routes.ts#L2437).

- **⚠️ Spec adjustments needed:**
  1. Rename `meal_category` → `meal_type` throughout spec, and update enum values to `"Breakfast" | "Lunch" | "Dinner" | "Snack"` (capitalized, singular Snack). The new `meal_feel_states` table should either match (recommended, for consistency with existing FK-style joins) or accept a documented translation layer at the API edge.
  2. Spec macro fields (`calories, carbs_g, fiber_g, fat_g, protein_g` as columns) don't exist. Update §3a + §4b "implementation notes" to specify: extract macros from `(userCorrectionsJson || aiOutputJson)?.macros`, using the existing key names (`calories`, `protein`, `fat`, `carbs`, `fiber`, `totalCarbs`, `netCarbs`). Filter out child entries (`parentMealId IS NULL`).
  3. Add to spec: net carbs are pre-computed on the entry. If `macros.netCarbs` is missing, fall back to `macros.carbs`. Fiber may be 0/undefined — treat as 0 for sums.
  4. The day endpoint cannot use `storage.getFoodEntriesByDate` as-is (UTC bug). Either add a `getFoodEntriesByDateInTZ(userId, dateStr, tz)` helper to storage, or compute `from`/`to` bounds in the route via `parseDateOnlyAsNoonInTZ` and call `storage.getFoodEntries(userId, from, to)`.

---

## 3b. Macro targets

- **Source found:** ✅ Exists as the `macroTargets` table at [shared/schema.ts:157-187](../../shared/schema.ts#L157-L187) (`macro_targets` in Postgres). One row per user (`UNIQUE(user_id)`).

  Columns (camelCase Drizzle / snake_case PG):
  - **Daily totals:** `calories`, `proteinG`, `carbsG`, `fatG`, `fiberG` (all `integer`, nullable).
  - **Per-meal targets:** `breakfastCalories / breakfastProteinG / breakfastCarbsG / breakfastFatG` and same for `lunch*`, `dinner*`, `snack*`.
  - **Clinical fields:** `netCarbsThreshold` (glucose variability warning, **independent** of `carbsG` daily target), `targetMealCount` (default 3), `eatingWindowStart` (default `"08:00"`), `eatingWindowEnd` (default `"20:00"`).

  Storage method: `storage.getMacroTarget(userId)` at [server/storage.ts:395-401](../../server/storage.ts#L395-L401). Already used by `/api/macro-progress` ([routes.ts:2433](../../server/routes.ts#L2433)) and the prompt engine ([promptEngine.ts:815-818](../../server/services/promptEngine.ts#L815-L818)).

- **Carb display flag if present:** ❌ No `carb_display_mode` / `track_fiber` / `carbDisplayMode` column anywhere in the schema (grepped server, client, shared — zero matches). All existing UI displays net carbs as the primary number (e.g. [FoodLog.tsx:796](../../client/src/pages/FoodLog.tsx#L796) labels the carb tile "Net Carbs"). The spec's "default to net always" decision (§2) is consistent with current behavior.

- **⚠️ Spec adjustments needed:**
  1. **Drop the `daily_macro_targets` fallback table from §4a.** The existing `macro_targets` table covers everything the spec needs (calories, protein, carbs, fat, fiber, plus per-meal targets the spec doesn't currently use but could in v2). Reuse `storage.getMacroTarget(userId)`.
  2. **Carb display mode:** since there's no per-user setting, the day endpoint should hard-code `carbDisplayMode: 'net'` in v1 (matches §2 decision and current UI behavior). A future per-user override field is reserved for v2 per §8.
  3. Note the existing `netCarbsThreshold` field is **separate** from `carbsG` (the daily target) — used for glucose-variability flags in [coachingRules.ts:131-156](../../server/services/coachingRules.ts#L131-L156). The carbs **target** for the totals strip should be `carbsG` (or possibly `carbsG - fiberG` in net mode, but cleaner is: target stays as stored, only the *consumed* value is net-vs-total).
  4. **Existing endpoint to study/reuse:** `/api/macro-progress` at [routes.ts:2417-2506](../../server/routes.ts#L2417-L2506) already returns `consumed`, `target`, `remaining`, and `byMeal` totals for a given date. The new `GET /api/log/day/:date` endpoint should either reuse this code path (extract a shared aggregator) or thin-wrap it with the additional fields (`isReadOnly`, `carbRunway`, `feelState` per meal). Worth a spec note: avoid two divergent aggregation implementations.

---

## 3c. Coaching rules — carb runway equivalents

- **Current state of [coachingRules.ts](../../server/services/coachingRules.ts) re: food equivalents:** ❌ None. The file is a pure rule evaluator that returns `CoachingFlag[]` with severities (`info | warning | alert | escalate`) and categories (`protein | carbs | timing | pattern | positive`). It evaluates protein adequacy, carb threshold breach, fasting window, late eating, etc. — but it has **no concept of food equivalents**, no `grams → food label` mapping, and no `CARB_RUNWAY_EQUIVALENTS` export.
- **Existing helpers in [promptEngine.ts](../../server/services/promptEngine.ts) relevant to runway phrasing:** ❌ None. `personalizeMessage` ([promptEngine.ts:617-684](../../server/services/promptEngine.ts#L617-L684)) only substitutes `{{glucose.latest}}`, `{{target.protein}}`, `{{daysSinceLog}}`-style tokens into prompt templates. No food-equivalent vocabulary.
- **Recommended path:** **Seed new.** Add a `CARB_RUNWAY_EQUIVALENTS` constant array + `getCarbRunwaySuggestion(remainingGrams)` helper to `coachingRules.ts` per spec §3c. Keep it simple and synchronous; v1 context-free per §8 "Still Open."
- **⚠️ Spec adjustments needed:**
  1. None for the seed plan, but the seed list needs **clinical review** before merge (called out in §5 acceptance criteria). Pull from existing patient education materials if Dr. Larson has any — otherwise the seed values are draft.
  2. Consider exporting it from `coachingRules.ts` as a named export rather than inlined in a route — both the day endpoint and (future) end-of-day recap will want it.

---

## 3d. Food edit modal

- **Component path:** ⚠️ **Inline, not a standalone component.** Defined as `FoodEditModal` inside [client/src/pages/FoodLog.tsx:75-289](../../client/src/pages/FoodLog.tsx#L75-L289) and only used at [FoodLog.tsx:1532](../../client/src/pages/FoodLog.tsx#L1532). It is not exported and not reusable from another page in its current form.
- **Required props:**
  ```ts
  {
    entry: any;                  // FoodEntry (with rawText, mealType, tags, aiOutputJson, userCorrectionsJson, eatenAt)
    onClose: () => void;
    onSaved: () => void;         // triggers parent refresh
    onDeleted: () => void;       // triggers parent refresh
  }
  ```
- **Supports read-only mode?** ❌ No. The modal always shows an editable `Textarea`, a "Re-analyze" button (calls `api.analyzeFoodEntry`), Save, and Delete (with confirm step at [FoodLog.tsx:93](../../client/src/pages/FoodLog.tsx#L93)). There is no `readOnly` / `disabled` prop or branch.
- **⚠️ Spec adjustments needed:**
  1. **Extract `FoodEditModal` to a shared component file** (e.g. `client/src/components/FoodEditModal.tsx`) and import it from both `FoodLog.tsx` and the new `DayViewPage.tsx`. This is a precondition for §4g/§4i, not an optional cleanup.
  2. **Add a `readOnly?: boolean` prop.** When true: hide Re-analyze, hide Save, hide Delete, disable the textarea; show "View only" indicator (or just lock the inputs). Alternatively per spec §4i: in read-only mode, the day view *suppresses the click handler* and shows a tooltip — that works too and avoids touching the modal, but is less discoverable. Recommend extracting + adding `readOnly` prop since the work is similar in size.
  3. Note: server-side `PUT /api/food/:id` and `DELETE /api/food/:id` at [routes.ts:996-1096](../../server/routes.ts#L996-L1096) **do not enforce any date-based cap** — only ownership. The 7-day cap is purely a frontend constraint at [FoodLog.tsx:320](../../client/src/pages/FoodLog.tsx#L320). Spec acceptance criterion "Server rejects POST/PUT/DELETE on food entries for dates > 7 days ago" is not currently true (POST is capped at 30 days, PUT/DELETE are not capped at all). Either tighten the server (recommended for v1) or amend the spec to acknowledge client-only enforcement.

---

## 3e. Date-routing conventions (from backdating feature)

- **Where backdating parses `:date` route param:** ⚠️ **It doesn't.** The backdating feature has **no `:date` route param** anywhere in the app. Routes in [client/src/App.tsx:82-113](../../client/src/App.tsx#L82-L113) use only literal paths (`/food`, `/trends`, etc.). Backdating is implemented as a per-modal `entryDate` `useState` inside `MetricEntryModal` ([MetricEntryModal.tsx:88-89](../../client/src/components/MetricEntryModal.tsx#L88-L89)) and `UnifiedMetricModal` ([UnifiedMetricModal.tsx:80-81](../../client/src/components/UnifiedMetricModal.tsx#L80-L81)), sent to the server as a `YYYY-MM-DD` string in the request body.
- **Helpers used:**
  - Client: `date-fns` (`format`, `startOfDay`, `isToday`, `isAfter`, `subDays`).
  - Server: [server/utils/timezone.ts](../../server/utils/timezone.ts) — `toISODateInTZ(date, tz)` and `parseDateOnlyAsNoonInTZ(dateStr, tz)`. The validation pattern lives at [server/routes.ts:477-495](../../server/routes.ts#L477-L495):
    ```ts
    const tsInput = req.body.timestamp;
    let timestamp: Date;
    if (typeof tsInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tsInput)) {
      timestamp = parseDateOnlyAsNoonInTZ(tsInput, userTz);
    } else if (tsInput) {
      timestamp = new Date(tsInput);
    } else {
      timestamp = new Date();
    }
    if (isNaN(timestamp.getTime())) return res.status(400).json({ message: "Invalid timestamp format" });
    const entryDateStr = toISODateInTZ(timestamp, userTz);
    const todayDateStr = toISODateInTZ(new Date(), userTz);
    if (entryDateStr > todayDateStr) return res.status(400).json({ message: "Timestamp cannot be in the future" });
    ```
- **Reusable patterns to mirror:**
  - Server-side: the regex-validate + `parseDateOnlyAsNoonInTZ` + `toISODateInTZ` comparison pattern is the right shape for the day endpoint. Mirror it verbatim.
  - Client-side: shadcn `Popover` + `Calendar` inlined (no shared `DatePicker` exists — see §3d above for the modal pattern at [UnifiedMetricModal.tsx:275-310](../../client/src/components/UnifiedMetricModal.tsx#L275-L310)).
- **⚠️ Spec adjustments needed:**
  1. **Spec line 22 is misleading:** "Reuses the `DatePicker` component …". There is no `DatePicker` component to reuse — only a Popover+Calendar pattern. Either:
     - (a) Build `client/src/components/DatePicker.tsx` first as a shared component, **then** use it in `DateNavigator` and refactor `MetricEntryModal` / `UnifiedMetricModal` to use it (recommended — closes the gap permanently); or
     - (b) Acknowledge in spec that `DateNavigator` will inline its own Popover+Calendar, matching the metric-modal pattern (cheaper, but creates a third inlined copy).
  2. **Spec §3e is asking the wrong question:** "Confirm how the backdating feature parses `:date` route params" — no such param exists. Replace with: "Reuse the server-side `parseDateOnlyAsNoonInTZ` / `toISODateInTZ` validation pattern from [server/routes.ts:477-495](../../server/routes.ts#L477-L495) for the day endpoint."
  3. Routing convention to establish for the day view: wouter `Route path="/log/:date"` with `useRoute` to extract the param. The day-view `:date` route is the *first* parametric route in this app — establish good practice (regex validation client-side too, mirroring server).

---

## 3f. Migration pattern

- **Most recent migration block in [server/migrate.ts](../../server/migrate.ts) (summarize shape):** All migrations live inside `runIncrementalMigrations(pool)` at [server/migrate.ts:89-307](../../server/migrate.ts#L89-L307), running unconditionally on every startup. Pattern is straight `pool.query(\`...\`)` blocks, comment headers, and idempotency guards.

  The most recent block (glucose context enum expansion, [migrate.ts:222-267](../../server/migrate.ts#L222-L267)) demonstrates the heaviest pattern in use — a `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object` for `CREATE TYPE`, a conditional `ALTER TABLE … DROP COLUMN IF EXISTS` guarded by a `pg_enum`-shape detector, and `ADD COLUMN IF NOT EXISTS` afterwards.

  Simpler recent blocks (lab_results, recipes) use `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`.

- **Idempotency mechanism:** Three primitives, applied per migration:
  - `CREATE TABLE IF NOT EXISTS` — for new tables.
  - `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — for new columns.
  - `DO $$ BEGIN CREATE TYPE …; EXCEPTION WHEN duplicate_object THEN null; END $$;` — for new enums (Postgres has no `CREATE TYPE IF NOT EXISTS`).

  Plus standard PG safety: `ON DELETE CASCADE` on user-scoped tables, `gen_random_uuid()` defaults on UUID PKs, `defaultNow()` on timestamps.

- **⚠️ Spec adjustments needed:**
  1. **Spec §4a uses `serial` PK + `integer` FKs — this is wrong for this codebase.** Every existing table uses `varchar` PKs defaulted to `gen_random_uuid()` and `varchar` FKs (see [CLAUDE.md](../../CLAUDE.md) — "Primary keys: `varchar` UUID via `gen_random_uuid()`. **Never `serial`/`integer`.**"). Rewrite both the Drizzle and SQL snippets in §4a:

     ```ts
     // Drizzle (shared/schema.ts)
     export const mealFeelStates = pgTable("meal_feel_states", {
       id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
       userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
       date: date("date").notNull(),
       mealType: mealTypeEnum("meal_type").notNull(),  // reuse the existing enum: 'Breakfast'|'Lunch'|'Dinner'|'Snack'
       feelState: text("feel_state", {
         enum: ["energized", "neutral", "sluggish", "gut_symptoms", "brain_fog"],
       }),
       createdAt: timestamp("created_at").defaultNow().notNull(),
       updatedAt: timestamp("updated_at").defaultNow().notNull(),
     }, (t) => ({
       uniqUserDateMeal: uniqueIndex("meal_feel_states_user_date_meal_idx").on(t.userId, t.date, t.mealType),
     }));
     ```

     ```sql
     -- server/migrate.ts (runIncrementalMigrations)
     -- Note: meal_type enum already exists; reuse it.
     CREATE TABLE IF NOT EXISTS "meal_feel_states" (
       "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
       "date" date NOT NULL,
       "meal_type" "meal_type" NOT NULL,
       "feel_state" text CHECK (feel_state IN ('energized','neutral','sluggish','gut_symptoms','brain_fog')),
       "created_at" timestamp DEFAULT now() NOT NULL,
       "updated_at" timestamp DEFAULT now() NOT NULL,
       UNIQUE("user_id", "date", "meal_type")
     );
     CREATE INDEX IF NOT EXISTS "meal_feel_states_user_date_idx"
       ON "meal_feel_states" ("user_id", "date");
     ```

     Drop the `daily_macro_targets` fallback table entirely (covered by §3b — `macro_targets` already exists).

  2. Drizzle imports to add: `date` from `drizzle-orm/pg-core` (not currently imported — check [schema.ts:2](../../shared/schema.ts#L2)). `uniqueIndex` is already imported.

---

## Summary

- **Ready for §4 implementation: NO** — spec must be amended before code starts. The schema scaffolding in §4a, the meal-category naming in §2/§3a, the "reuse DatePicker" claim in §1, and the "extend existing food edit modal" claim in §3d all need to be reconciled with what's actually in the codebase.

- **Blockers (must resolve before §4):**
  1. **Schema types in §4a are wrong for this codebase.** PK + FK must be `varchar` UUID, not `serial`/`integer`. (§3f)
  2. **`meal_category` naming mismatch.** Spec says `meal_category` with lowercase plural values; the codebase uses `meal_type` with capitalized singular values (`Breakfast|Lunch|Dinner|Snack`). The new `meal_feel_states` table should reuse the existing `meal_type` enum for join-friendliness. (§3a)
  3. **Macro extraction path missing from spec.** Spec assumes columnar `calories`/`carbs_g`/etc. on food_entries; reality is jsonb-nested under `(userCorrectionsJson || aiOutputJson).macros`, with parent/child meal aggregation rules to avoid double-counting. (§3a)
  4. **Food edit modal is inline, not reusable.** Must extract `FoodEditModal` to its own component file and add a `readOnly` prop before the day view can wire it up. (§3d)
  5. **No reusable `DatePicker` component exists.** Either build one as a precursor or accept inlined Popover+Calendar. (§3e)
  6. **`daily_macro_targets` fallback table is unnecessary** — drop it; reuse the existing `macro_targets`. (§3b)
  7. **Server-side 7-day cap on PUT/DELETE food entries doesn't exist.** Either add it (recommended for spec acceptance criterion) or amend the spec. (§3d)
  8. **`storage.getFoodEntriesByDate` is UTC-buggy** — the day endpoint must compute its own TZ-aware bounds. (§3a)

- **Recommended spec amendments before implementing:**
  - **Amendment 1 (§4a):** Replace `serial`/`integer` with `varchar` UUID + `gen_random_uuid()`. Use the existing `mealTypeEnum` (`"Breakfast"|"Lunch"|"Dinner"|"Snack"`) for `meal_type` on the new table. Drop the `daily_macro_targets` fallback.
  - **Amendment 2 (§2, §3a, §4b/c/g/h):** Replace every occurrence of `meal_category` with `meal_type`, and every `breakfast/lunch/dinner/snacks` value list with `Breakfast/Lunch/Dinner/Snack`.
  - **Amendment 3 (§3a, §4b):** Specify that macros are extracted via `(userCorrectionsJson || aiOutputJson)?.macros` with parent-only filtering (`!parentMealId`). Field names inside: `calories`, `protein`, `carbs`, `fat`, `fiber`, `totalCarbs`, `netCarbs`. Fiber may be missing → treat as 0. Net carbs may be missing → fall back to `carbs`.
  - **Amendment 4 (§3b, §4a):** Reuse `macro_targets`; drop the fallback table. Hard-code `carbDisplayMode: 'net'` at API edge in v1 (no per-user column needed).
  - **Amendment 5 (§3d, §4g/i):** Extract `FoodEditModal` to `client/src/components/FoodEditModal.tsx`, add `readOnly?: boolean` prop. Update `FoodLog.tsx` to import the extracted version.
  - **Amendment 6 (§1, §3e, §4e):** Drop the "Reuses the `DatePicker` component" line; replace with one of (a) "Builds a new shared `DatePicker` component as a Popover+Calendar pattern; refactors `MetricEntryModal`/`UnifiedMetricModal` to use it" or (b) "Inlines Popover+Calendar in `DateNavigator`, matching the existing pattern in metric modals."
  - **Amendment 7 (§4b implementation notes):** Consider reusing the aggregation logic from `/api/macro-progress` ([routes.ts:2417-2506](../../server/routes.ts#L2417-L2506)) rather than reimplementing — or factor into a shared helper.
  - **Amendment 8 (§5 data integrity):** Either add a server-side 7-day cap to `PUT/DELETE /api/food/:id` (currently uncapped) and tighten `POST /api/food`'s 30-day cap to 7, **or** amend the acceptance criterion to acknowledge client-only enforcement.

Once these amendments are folded in, §4 implementation is unblocked and the work is straightforward.

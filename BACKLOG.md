# Backlog

Open work items that are real but non-blocking. Each item has enough context that a Claude Code session can pick it up without asking clarifying questions.

**How to use this file:**
- Items are grouped by feature area, not priority — pick whatever fits the moment.
- When starting an item, mark it `[in-progress]`. When done, move to `## Completed` at the bottom with the commit/PR hash.
- Add new items at the end of their section.
- Future v1.1+ features for Day View specifically are tracked in `docs/specs/day-view-spec.md` §7 (Out of Scope).

---

## Day View v1.1

### 1. `/api/macro-progress` storage layer cleanup

**Status:** open
**Where:** `server/storage.ts` (function `getFoodEntriesByDate`, around lines 392–422 as of merge `1a8c5b9`)
**Why deferred:** The pre-launch TZ fix was urgent (consistency between Day View and Macro Progress); the cleaner API shape is a refactor that touches callers and was scoped out.

**What's wrong:** `getFoodEntriesByDate(userId, date: Date)` uses a heuristic to distinguish calendar-day-intent (`new Date("2026-05-13")` → midnight UTC) from instant-intent (`new Date()` → "now"). The check inspects whether the input Date has zero UTC time components. Works correctly today but is indirect — readers have to understand the heuristic to know what the function does.

**Suggested approach:**
- Split into two functions with explicit signatures:
  - `getFoodEntriesByCalendarDate(userId: string, dateStr: string, timezone: string)` for day-bucketed queries
  - `getFoodEntriesInRange(userId: string, fromInstant: Date, toInstant: Date)` for instant ranges
- Update callers in `server/routes.ts` and elsewhere to pick the right one explicitly. The Day View endpoint already does the right thing; macro-progress is the main consumer of the deprecated function.
- Remove the heuristic.

---

### 2. `FeelStatePicker` accessibility — replace `role="radio"` with `role="group"` + `aria-pressed`

**Status:** open
**Where:** `client/src/components/FeelStatePicker.tsx`
**Why deferred:** Works fine for sighted users; a11y polish for v1.1.

**What's wrong:** Component uses `role="radio"` but supports "click selected to clear," which violates standard radio semantics (radios are exclusive-one-of-N and cannot be deselected by clicking the selected option). Screen readers may announce the control inconsistently.

**Suggested approach:**
- Wrap the 5 pills in a `role="group"` with an `aria-label="Meal feel-state"`.
- Each pill becomes a `<button>` with `aria-pressed={selected === value}`.
- Keep the visual styling, the click-selected-to-clear affordance, and the optimistic update behavior exactly as they are. This is a semantics-only change.
- Verify with VoiceOver (macOS) and at least one Chromium screen reader before merging.

---

### 3. `FoodEditModal` callback shape — single `onClose(didChange)` prop

**Status:** open
**Where:** `client/src/components/FoodEditModal.tsx` and its callers (`DayViewPage.tsx`, `FoodLog.tsx`)
**Why deferred:** Working but indirect; the cleaner shape ripples to all callers and was out of Stage 4 scope.

**What's wrong:** Current modal API is `{ onClose, onSaved, onDeleted }` — three no-arg callbacks. `DayViewPage` works around this with a wrapper-arg trick (`() => handleEditModalClose(true|false)`) so it knows whether to refetch the day query.

**Suggested approach:**
- Replace the three-callback API with a single `onClose(didChange: boolean)` prop.
- `didChange = true` for save and delete; `false` for cancel.
- Update both callers (`DayViewPage`, `FoodLog`) to use the new shape. `FoodLog` currently passes three no-op-ish callbacks; it can pass a single `() => {}` or use `didChange` to invalidate its own cache the same way Day View does.

---

### 4. Calories often missing from `aiOutputJson.macros` (food-analyze pipeline)

**Status:** open
**Where:** Food-analyze pipeline — likely `server/services/foodAnalysis.ts` or equivalent (search for the Nutritionix integration and the AI prompt that produces `aiOutputJson`).
**Why deferred:** Data-quality issue upstream of Day View; out of Day View scope.

**What's wrong:** Many food entries have `aiOutputJson.macros = { fat, carbs, protein, netCarbs }` but no `calories` key. Day View handles this safely (returns 0) but a non-trivial logged day showing "0 cal" looks broken to participants.

**Suggested approach:**
- Find the AI prompt and response schema that produce `aiOutputJson.macros`.
- Ensure `calories` is required in the response schema and validated before storage.
- Where Nutritionix returns explicit calories, use that. Where the AI computes macros without Nutritionix, derive calories from the 4/4/9 rule (`carbs * 4 + protein * 4 + fat * 9`) as a fallback rather than leaving it unset.
- Optional: backfill historical entries with calculated calories via a migration, but this is lower priority than fixing the forward path.

---

### 5. Mobile bottom nav crowding — 7 items at 380px

**Status:** open (accepted in v1 spot-check, worth real-user data)
**Where:** `client/src/components/Layout.tsx`
**Why deferred:** Currently tolerable per spot-check; worth reassessing after participant use.

**What's wrong:** Adding the "Day" nav entry in Day View Stage 3 bumped the participant bottom nav from 6 to 7 items at narrow mobile viewports.

**Suggested approach:** Wait for signal — participant complaints, low Day View engagement on mobile, or visible UX issues. Then pick one of:
- Hide "Day" from mobile bottom nav and keep it sidebar-only (simplest, but slightly hides the feature on mobile)
- Collapse the least-used existing item behind a "more" menu
- Make all items icon-only at < 400px viewports

---

### 7. Remove remaining OpenAI cruft (post-consolidation)

**Status:** open
**Where:** `package.json` (`"openai"` dep), `server/services/healthCheck.ts` (~line 207), Railway env var `OPENAI_API_KEY`
**Why deferred:** Cosmetic/tidiness — no functional or patient impact. Surfaced 2026-06-16 while confirming the AI fallback chain.

**What's wrong:** The OpenAI→Anthropic consolidation removed all OpenAI *call sites*, but leftovers remain: the `openai` npm package is still a dependency (unused/unimported), `healthCheck.ts` still probes `OPENAI_API_KEY` and reports an `openai` service, and prod Railway still has a (now-dead) `OPENAI_API_KEY`. CLAUDE.md claims the SDK was fully removed; it wasn't.

**Suggested approach:**
- Remove `"openai"` from `package.json` and regenerate the lockfile; confirm nothing imports it.
- Drop the `OPENAI_API_KEY` branch in `healthCheck.ts` (or repoint it to Anthropic/Nutritionix).
- Delete `OPENAI_API_KEY` from Railway.
- Note: the patient-facing onboarding consent copy that named OpenAI was already fixed (2026-06-16).

---

## Database / migrations

### 8. Constraint and index naming drift between `runMigrations()` and Drizzle conventions

**Status:** open
**Where:** `server/migrate.ts` (`runIncrementalMigrations`) vs `shared/schema.ts`
**Why deferred:** Harmless once `drizzle-kit push` left the boot path (`1e6065d`) — nothing diffs the two anymore, so this is cosmetic. Recorded because it will resurface the moment someone runs a drizzle-kit command.

**What's wrong:** `migrate.ts` creates foreign keys and indexes inline, so Postgres auto-names them (`recipes_participant_id_fkey`), while `schema.ts` declares relations that Drizzle names by its own convention (`recipes_participant_id_users_id_fk`). A schema diff against a DB built purely by `runMigrations()` therefore reports ~7 statements that are **functionally no-ops**: 5 FK drop/re-add pairs plus 2 index drops. Affected: `recipes.participant_id`, `recipe_ingredients.recipe_id`, `lab_results.user_id`, `lab_results.biomarker_id`, `meal_feel_states.user_id`, and indexes `lab_results_user_biomarker_collected_idx` / `idx_meal_feel_states_user_date`.

The two index drops are the notable half: those indexes exist only in `migrate.ts` and aren't declared in `schema.ts`, so a diff wants to remove them. While `push --force` was still in the boot path it did exactly that on every production start, and `runMigrations()` then recreated them — pointless churn that briefly left the tables unindexed.

**Suggested approach:**
- Rename the five FK constraints to Drizzle's convention with guarded `ALTER TABLE … RENAME CONSTRAINT` blocks, mirroring the `biomarkers_slug_key` → `biomarkers_slug_unique` fix in `2903959`.
- Declare the two indexes in `shared/schema.ts` so they stop reading as unmanaged.
- Verify the same way that change was verified: build an empty scratch DB, run `runMigrations()` alone, then `drizzle-kit push` against it and confirm the diff comes back empty.

---

### 9. `migrations/` journal is stale and was never baselined

**Status:** open
**Where:** `migrations/` (`meta/_journal.json`, `0000_perpetual_pestilence.sql`, `0001_curved_captain_midlands.sql`)
**Why deferred:** `migrations/README.md` (`1e6065d`) now warns loudly that this is not the deploy path, which defuses the immediate footgun. Picking one source of truth is the real fix and is not launch-blocking.

**What's wrong:** The journal has two entries (Feb and Mar 2026) while the schema has evolved well past that inside `runIncrementalMigrations()`. It does not describe any real database. Anyone running `drizzle-kit migrate` would replay a full `CREATE TABLE` script against populated production PHI — it would error rather than destroy, but it would fail a deploy. `drizzle.config.ts` still points `out: "./migrations"`, so `drizzle-kit generate` will keep writing here.

**Suggested approach:** pick one and commit to it —
- **Option A (simplest, matches reality):** delete `migrations/` and drop `out` from `drizzle.config.ts`. `runMigrations()` is already the sole deploy path; the SQL files are historical and recoverable from git.
- **Option B:** baseline properly — squash the current live schema into a fresh `0000`, mark it applied, and move future changes to generated migrations. Materially more work, and only worth it if you intend to actually adopt `drizzle-kit migrate`.
- Either way, update the CLAUDE.md note that currently says these files "exist but aren't used."

---

## Backup / ops

### 10. Backup service reports ✅ success on an empty (failed) dump

**Status:** open — **fix soon after launch; this is a dangerous failure mode for a PHI backup tool**
**Where:** `server/services/backup.ts` (`createBackup`, ~line 202 and ~line 242) + `server/scripts/backup-cli.ts` (`create` command)
**Why deferred:** Dev scope frozen for launch (standing rule 1). Discovered 2026-07-20 during pre-deploy backup; worked around by installing `libpq` so `pg_dump` actually exists.

**What's wrong (three compounding bugs):**
1. **Swallowed pipeline failure.** The dump runs via `execAsync('pg_dump "..." | gzip > file')`. `child_process.exec` uses `/bin/sh` with no `pipefail`, so the pipeline's exit code is **gzip's**, not pg_dump's. When `pg_dump` is missing (or fails mid-dump), gzip compresses empty stdin, exits 0, and produces a 20-byte valid-but-empty `.sql.gz`. Reproduced: `/bin/sh -c 'nonexistent | gzip > /dev/null'` exits 0.
2. **Verification result ignored.** `verifyBackup()` correctly fails (20 bytes < 100-byte floor) and `verified: false` is written to the `.meta.json` — but `createBackup` never folds `verified` into `result.success`. It returns `success: true` purely because nothing threw.
3. **CLI trusts `success` blindly**, printing "✅ Backup created successfully" plus row counts that come from the *Drizzle* connection (`getRowCounts()`), not the dump — making the output look end-to-end healthy while the artifact is empty.

**Suggested approach:**
- Replace the shell pipeline with `spawn`-ing `pg_dump` directly and streaming stdout through `zlib.createGzip()` to the file — no shell, no pipefail problem, pg_dump's exit code and stderr surface naturally. (Minimum viable alternative: keep the shell but run `bash -o pipefail -c ...` and capture stderr.)
- Make `createBackup` fail (`success: false`, delete the partial file) when `verified === false` or size is below a sane floor (an 11-table dump of this DB can't be < ~10 KB compressed).
- CLI `create` should exit non-zero on `verified: false` even if a file exists.
- Add a test: mock a missing/failing `pg_dump` and assert `success: false` (this exact scenario shipped a false ✅ against prod).

---

## Completed

_Move items here with the commit/PR hash when shipped. Format: `- <item title> — <hash> — <date>`_

- Meal entry timestamp defaulting to midnight (item 6) — 5310c27 — 2026-06-16 — root cause was the Day View `?date=` deep link (not the main form); today → current time, past day → meal-appropriate hour. Verified.

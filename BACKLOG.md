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

## Completed

_Move items here with the commit/PR hash when shipped. Format: `- <item title> — <hash> — <date>`_

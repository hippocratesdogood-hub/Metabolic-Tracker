# Food Log: Decouple Save from AI Analysis + Stopgap UX Cleanup

**Filed by:** Dr. Chad Larson
**Date:** 2026-05-17
**Status:** Ready for implementation — all decisions locked (see §8)
**Related:**
- `CLAUDE.md` — BAA gating policy
- `BACKLOG.md` item 4 — calories missing from `aiOutputJson.macros` (orthogonal)
- `docs/specs/day-view-spec.md`, `docs/specs/day-view-preflight-findings.md` — incidental, Day View not implicated

## 1. Context

On 2026-05-09, the food analysis pipeline was consolidated from OpenAI to Anthropic in a staged migration (commits `e942b88`, `d34fabd`, `f934e65`, `7d44e00`). Per `CLAUDE.md`, production use of `ANTHROPIC_API_KEY` is gated on a signed Anthropic API BAA. The BAA is not currently in place, so the key is intentionally unset on Railway prod.

The consequence — surfaced on 2026-05-17 when attempting to log a new meal:

- `POST /api/food/analyze` and `POST /api/food/analyze-image` return 503
- The client surfaces a developer-targeted toast: `"AI food analysis is not configured. Add ANTHROPIC_API_KEY to .env to enable this feature."`
- `handleSave()` in `FoodLog.tsx` early-returns on missing `analysisResult`, so the meal is **never persisted**
- The AI consent dialog still names OpenAI as the vendor (stale post-consolidation)

Day View v1 (shipped 2026-05-17) is **not** implicated — the post-consolidation analyze path simply hadn't been exercised until today.

## 2. Problem statement

Two distinct problems, addressed together:

**Part D — UX dead-end and stale copy.** Patients hit a developer-flavored error and cannot save. AI consent dialog references the wrong vendor.

**Part B — Architectural fragility.** Even with `ANTHROPIC_API_KEY` set, AI is a *hard dependency* on every new-meal save. Future AI outages (rate limits, vendor incidents, key rotation, BAA renegotiation) would reproduce this exact dead-end. For a patient-facing clinical app, this is structurally wrong regardless of BAA status.

## 3. Goals

- Patient can save a new meal entry regardless of AI availability
- All failure modes show patient-appropriate copy (no env variable names, no `.env` references, no vendor leakage)
- AI consent copy accurately reflects current pipeline
- No regression in currently-working paths: Favorites/Quick Log, Barcode scan, Recipe Builder
- No change to the analysis output schema — `aiOutputJson.macros` shape preserved when AI runs
- Day View aggregation continues to work correctly (leaf-only sum, `parentMealId IS NULL`, capitalized singular `mealType` enum)

## 4. Non-goals

- Restoring AI analysis in production (Option A — BAA-gated, separate track)
- Re-introducing OpenAI as a fallback (Option C — reopens the compliance gap the May 9 consolidation closed)
- Fixing the calories-missing issue (BACKLOG.md item 4 — orthogonal)
- Modifying Day View endpoints, aggregation, or the `/log/:date` route
- Modifying the AI pipeline output when it does run

## 5. Current state (verified by investigation 2026-05-17)

### Server — `server/routes.ts`

| Line | What |
|------|------|
| 67–69 | `anthropic` client init; returns `null` when `ANTHROPIC_API_KEY` is unset |
| 1537 | 503 guard in `POST /api/food/analyze` |
| 1762 | 503 guard in `POST /api/food/analyze-image` |
| 613 | `POST /api/food` save endpoint — **not** AI-gated, already accepts pre-analyzed entries |
| 819 | `POST /api/food/meal` parent/child save — **not** AI-gated |

### Client — `client/src/pages/FoodLog.tsx`

| Line | What |
|------|------|
| 289 | `handleUseFavorite()` — sets `analysisResult` without AI. Works. |
| 452 | `doAnalyze()` catch block — surfaces server error verbatim. **Bug surface.** |
| 459 | `handleSave()` — early-returns on `!analysisResult`. **Bug surface.** |
| 1361 | AI consent dialog — stale "sent to OpenAI's API" copy. **Bug surface.** |
| 1391 | Barcode scan — sets `analysisResult` without AI. Works. |
| (n/a) | Recipe Builder — sets `analysisResult` without AI. Works. |

### Data conventions (preserve)

- Macros nested at `(userCorrectionsJson ?? aiOutputJson).macros`
- `mealType` enum: `Breakfast | Lunch | Dinner | Snack` (capitalized singular, per `shared/schema.ts`)
- Aggregation: filter `parentMealId IS NULL`, sum leaves only

## 6. Proposed changes

### Part D — Stopgap UX cleanup

**D1. Server returns structured error.**

`/api/food/analyze` and `/api/food/analyze-image` continue to return 503 when `anthropic` is null, but with a structured body the client can branch on:

```json
{
  "code": "AI_UNAVAILABLE",
  "message": "Automatic meal analysis is temporarily unavailable.",
  "fallbacks": ["favorite", "barcode", "manual"]
}
```

**D2. Client replaces dev-flavored toast.**

`FoodLog.tsx:452` — when `error.code === "AI_UNAVAILABLE"`, show this exact copy:

> "Automatic meal analysis is temporarily unavailable. You can still log this meal — pick from your favorites, scan a barcode, or enter macros manually below."

For all other error codes, show a generic "Something went wrong analyzing your meal" — do not expose server internals, status codes, or env variable names.

**D3. Update AI consent dialog copy.**

`FoodLog.tsx:1361` — replace "sent to OpenAI's API" with generic vendor language:

> "...sent to a third-party AI analysis service..."

Match the existing surrounding consent prose; do not rewrite the full dialog, only the vendor-naming clause.

**D4. Surface bypass paths inline.**

When AI is unavailable, render inline affordances in the meal-entry area (not just in the toast):
- "Log from Favorites" — opens Favorites picker
- "Scan barcode"
- "Enter macros manually" — see B2

### Part B — Graceful degradation

**B1. Decouple `handleSave()` from `analysisResult`.**

`FoodLog.tsx:459` — remove the early-return. When `analysisResult` is null:

- Save the entry via existing `POST /api/food` with whatever metadata is present (name/description, `mealType`, time, `parentMealId` if applicable)
- `aiOutputJson` is `null` on the new row
- If the user entered macros manually (see B2), `userCorrectionsJson.macros` is populated
- Otherwise both jsonb fields are `null` — entry is "logged but unanalyzed"

**B2. Manual macro entry path — first-class option.**

New affordance in the new-meal flow: **"Enter macros manually."** Available **always**, regardless of AI status — not a fallback-only path. Patients who prefer manual entry can use it at any time; this also sidesteps the BACKLOG item 4 calories-missing data quality issue by requiring calories explicitly.

**Required fields:** name/description, `mealType`, time, calories, fat, carbs, protein, netCarbs.

All five macros are required on submission. Calories must be explicit — manual entries must not perpetuate the calories-missing issue.

On save, populates `userCorrectionsJson.macros` directly via `POST /api/food`, bypassing the AI path.

**B3. Pending-analysis behavior.**

For entries where both `aiOutputJson` and `userCorrectionsJson` are `null`:

- Entry appears in Day View under the correct date and `mealType` like any other meal
- Its macro contribution to daily totals is zero/absent (simply not summed)
- **No "pending" banner, badge, or visual differentiation** in v1.1
- Auto-retry once BAA lands: out of scope for v1.1; separate spec when Option A is live

**B4. No new server endpoints needed.**

`POST /api/food` (line 613) already accepts pre-analyzed entries and isn't AI-gated. Manual entries write through this endpoint with `aiOutputJson: null` and `userCorrectionsJson.macros` populated.

## 7. Acceptance criteria

With `ANTHROPIC_API_KEY` unset on Railway prod:

- [ ] Patient can save a new meal via Favorites/Quick Log (regression)
- [ ] Patient can save a new meal via Barcode scan (regression)
- [ ] Patient can save a new meal via Recipe Builder (regression)
- [ ] Patient can save a new meal via **manual macro entry** (new)
- [ ] No string containing `.env`, `ANTHROPIC_API_KEY`, `OPENAI`, or other dev terms is visible anywhere in the patient-facing UI
- [ ] Toast on AI-unavailable matches the exact D2 wording
- [ ] AI consent dialog uses generic "third-party AI analysis service" language (D3)
- [ ] Manually-entered meals appear in Day View under the correct date and `mealType`
- [ ] Manually-entered meals aggregate correctly (leaf-only sum, no double-count)
- [ ] Entries with both jsonb fields null appear in Day View without errors; macros simply absent from totals (no pending banner)
- [ ] Manual entry form rejects submission if any of calories, fat, carbs, protein, netCarbs is missing
- [ ] With `ANTHROPIC_API_KEY` stubbed non-null in a dev env, full AI flow still works end-to-end (no regression)

**Test plan:** Locally unset `ANTHROPIC_API_KEY` and walk through every meal-entry path. Then set it back and re-verify. Then verify Day View renders correctly with a mix of analyzed and unanalyzed entries.

## 8. Resolved decisions

1. **Toast copy (D2):** Approved as proposed — "Automatic meal analysis is temporarily unavailable. You can still log this meal — pick from your favorites, scan a barcode, or enter macros manually below."
2. **Consent dialog vendor naming (D3):** Generic — "third-party AI analysis service."
3. **Pending-analysis behavior (B3):** Show normally; macros absent from totals; no pending banner.
4. **Manual entry placement (B2):** First-class option, always available — not fallback-only.
5. **Manual entry required fields (B2):** Calories, fat, carbs, protein, netCarbs — no additional macros (fiber, sugar, sodium, etc.) for v1.1.

## 9. Out of scope / Future work

- **Option A** — set `ANTHROPIC_API_KEY` in Railway prod (BAA-gated, parallel sales track)
- **BACKLOG.md item 4** — calories missing from `aiOutputJson.macros` (separate spec)
- Auto-retry of pending-analysis entries once BAA lands (separate spec)
- AI consent dialog redesign beyond copy fix
- Nutritionix-only direct analysis path (not justified now that manual entry is first-class)
- Additional manual-entry macros (fiber, sugar, sodium) if clinically warranted later

## 10. Phasing

Part D and Part B can ship together or separately:

- **D first, B later** — restores patient-appropriate UX within hours; manual entry follows
- **D + B together** — single PR, single deploy, cleaner story for the audit trail

Recommend D + B together — they touch the same files (`FoodLog.tsx`, `server/routes.ts`) and splitting creates merge surface.

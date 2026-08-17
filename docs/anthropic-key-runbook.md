# Runbook: enabling ANTHROPIC_API_KEY in production

Written Aug 17 2026, after the stage-2 unification (`lookupItemDetailed`).
Setting this key is a **behavior change, not a config flip**: text analysis
moves from `buildNutritionixTextAnalysis` to the two-stage LLM branch, the
image path switches to vision analysis, and post-meal coaching messages
activate. Run this end to end on staging before touching production.

**Prerequisite:** signed Anthropic BAA in place. Do not set the key anywhere
before that — the food paths send only de-identified food text to
Nutritionix, but the Anthropic calls carry free-typed meal text, which can
contain anything a member types.

## 1. Staging first

Set on Railway → project `metabolic-tracker-app` → environment **staging** →
service `Metabolic-Tracker`:

```
ANTHROPIC_API_KEY=<key>
```

Redeploy/restart the staging service (the key is read at boot). Confirm boot:
`GET https://metabolic-tracker-staging.up.railway.app/health/ready` → `"database": true`.

## 2. Staging test battery

Log in as a staging test account (create one via SQL if none exists — see the
Phase 2 session notes for the scrypt-hash INSERT pattern; delete it afterward).
All food calls are `POST /api/food/analyze` with `{"rawText": "..."}` unless
noted. The account must have `ai_consent_given = true`.

| # | Test | Input | Pass looks like |
|---|------|-------|-----------------|
| 1 | Canonical meal | `1 can tuna, 2 tablespoons mayo, 1 RxBar` | Three items. Tuna as `1 can` **with `servingWeightGrams` ≈ 172 and `altMeasures` present**; RxBar resolved as a branded RxBar product (`source: "verified"`, `brand` set) — NOT `ai_estimate`. |
| 2 | Unknown item | `1 apple, 1 glorbnak zzqx` | Apple verified; the glorbnak phrase either in `unresolved[]` **or** present as an `ai_estimate` item with plausible macros and `gramsEstimated: true` if it carries grams. It must never be silently absent. |
| 3 | Partial salvage | `zzqx flurbganitz wafer` | If a wafer item comes back, it carries `matchQuality: "loose"` and `matchedFrom: ["wafer"]`. |
| 4 | Branded upgrade | `quest protein bar` | A Quest-branded item (`brand` contains "Quest"), verified chip, no `matchQuality`. |
| 5 | Restaurant salvage | `in n out double double no bun` | Either the real In-N-Out item (brand set) or a `matchQuality: "loose"` item — never a silent 140-kcal "bun" with no flag. |
| 6 | Ordinary meals stay clean | 5–10 sentences from the coverage battery (e.g. `2 eggs and bacon`, `homemade chicken soup`, `starbucks venti iced latte oat milk`) | No `matchQuality` flags, no unresolved entries, sensible macros. |
| 7 | Image analysis | Upload a food photo via the app's camera flow (`POST /api/food/analyze-image`) | Items detected with macros; degraded-mode banner ("photo was not used") does NOT appear. |
| 8 | Post-meal coaching | Save a meal via the confirm flow (needs macro targets set on the account) | Response includes a non-null `coachingMessage`; tone is clinical per the prompt rules. |
| 9 | Parse quality spot-check | `um I had two eggs and some bacon this morning` | Haiku stage 1 yields eggs + bacon items (no filler-word items). |
| 10 | Meal edit consistency | Edit one item in the Edit Meal modal (e.g. tuna grams 172 → 142) and save | Parent macros, child-row sum, and `GET /api/macro-progress` protein all agree exactly. |

Also confirm in staging logs: no raw meal text logged outside the existing
sanitized paths, and no `[Food Analyze] Parse stage failed` errors on the
battery.

## 3. Production

Same variable, environment **production**, service `Metabolic-Tracker`.
Deploy/restart. Re-run tests 1, 2, 7, and 8 with a real account (your own).
Watch Sentry and Railway logs for 30 minutes; the aiLimiter (15 req/min)
protects against runaway retries.

Note: setting the key does NOT enable PDF lab extraction — that is
separately gated on `ENABLE_PDF_EXTRACTION` and stays off until you flip it.

## 4. Rollback

Remove `ANTHROPIC_API_KEY` from the environment and restart the service.
Text analysis returns to the Nutritionix-only path immediately (same
`buildNutritionixTextAnalysis` behavior as today); image analysis returns to
the typed-description fallback; coaching messages stop generating. No data
migration in either direction — saved meals are unaffected. Cached analyses
are in-memory and clear on restart.

## Known differences to expect after the flip

- Stage-1 parsing is Haiku's, not Nutritionix NLP's: item names may read
  slightly differently ("canned tuna" vs "can tuna"), and dictation-style
  sentences parse better.
- Items that no database resolves get plausible LLM estimates (amber chip,
  `gramsEstimated` grams) instead of amber "Not found" cards. Manual entry,
  barcode, and re-check remain available on every card.
- Per-item Nutritionix lookups may occasionally pick different default
  portions than the full-sentence parse did. The gram field is the
  correction path either way.

# Food Analysis v1.2: Nutritionix-Primary Path (BAA-Independent, Brand-Accurate)

**Filed by:** Dr. Chad Larson
**Drafted:** 2026-06-16
**Status:** 🟢 P1 implemented 2026-06-16 (§8.1 resolved — see below). P2–P4 still open.
**Related:**
- `CLAUDE.md` — AI vendor consolidation + BAA gating policy
- `docs/specs/food-analysis-graceful-degradation-spec.md` (v1.1, shipped) — §9 deferred this path ("not justified now that manual entry is first-class"); this spec revisits that decision for **accuracy + prod availability**, not just degradation
- `BACKLOG.md` item 4 — calories missing from `aiOutputJson.macros` (this spec subsumes it for the DB path)

---

## 1. Context

The goal is an **accurate** food tracker — including brand-name and restaurant items, where patients log most real-world meals.

The current pipeline is **already the right shape for accuracy**: the LLM parses *what was eaten*, and a nutrition database supplies *the numbers*. Specifically, `POST /api/food/analyze` runs two stages ([server/routes.ts:1567–1636](../../server/routes.ts)):

- **Stage 1 — parse only.** `claude-haiku-4-5` extracts `{ food, quantity, unit }[]`. The prompt explicitly says *"Do NOT estimate nutrition."*
- **Stage 2 — authoritative macros.** `nutritionLookup.lookupItemMacros()` resolves each item: **Nutritionix → Open Food Facts → USDA → LLM estimate** (last resort).

This is correct because **LLMs hallucinate nutrition facts.** Claude can *recognize* a brand ("Chipotle chicken bowl," "Quest bar") but the macro values it emits are training-data approximations — frequently stale or wrong, and worst exactly where precision matters (specific SKUs, restaurant menus, reformulated products). A real database (Nutritionix has branded + restaurant + UPC coverage) is the correct source of truth.

**The problem is the gate, not the architecture.** The entire endpoint short-circuits when Anthropic is unavailable:

```ts
// server/routes.ts:1561
if (!anthropic) {
  return res.status(503).json(aiUnavailableBody());
}
```

Because `ANTHROPIC_API_KEY` is BAA-gated and **unset in Railway prod**, Stage 1 never runs — so Stage 2 (Nutritionix) is never reached. **Automatic analysis is effectively dead in production today**; patients fall back to manual/favorites/barcode (the v1.1 graceful-degradation paths).

## 2. Problem statement

1. **Prod has no automatic analysis at all** — blocked on the Anthropic BAA, even though the accurate macro source (Nutritionix) needs no LLM.
2. **Brand accuracy is bottlenecked on the LLM parse.** Even with AI on, Stage 1's free-text parsing can drop or mangle brand entities before Nutritionix ever sees them.

Both dissolve if Nutritionix becomes a **first-class parser**, not just an enricher.

## 3. Key insight

**Nutritionix's `/v2/natural/nutrients` endpoint does its own NLP.** It accepts raw text ("a Big Mac and a medium fries") and returns parsed items *with sourced macros* in one call — **no LLM required**. The codebase already calls this endpoint per-item ([nutritionLookup.ts:374–394](../../server/services/nutritionLookup.ts)); v1.2 promotes it to parse the **whole description** directly.

This makes a Nutritionix-primary path **BAA-independent** and **more brand-accurate** (Nutritionix's parser is tuned for branded/restaurant phrasing).

## 4. Goals

- Automatic analysis works in **prod, today, without the Anthropic BAA**.
- Branded/restaurant items resolve to **sourced** macros, not LLM guesses.
- Every returned item is **labeled by source** (`nutritionix | openfoodfacts | usda | ai_estimate`) so clinicians know which numbers are authoritative.
- No regression to v1.1 paths (manual, favorites, barcode, Recipe Builder) or the existing AI-on flow.
- Calories always present on DB-sourced items (subsumes BACKLOG item 4 for this path).

## 5. Non-goals

- Removing the LLM path. When Anthropic is available (post-BAA), it stays as an optional pre-processor / photo analyzer.
- **Photo analysis without AI.** Nutritionix is text/UPC only; vision still needs `claude-sonnet-4-6`. Photo logging remains AI-gated (or deferred — see §8.5).
- Changing the stored schema or Day View aggregation (leaf-only sum, `parentMealId IS NULL`, capitalized `mealType`).
- Re-introducing OpenAI.

## 6. Proposed architecture

**Make Nutritionix the primary text-analysis path; LLM becomes optional.**

```
POST /api/food/analyze (text)
  │
  ├─ if Nutritionix configured:
  │     Stage 1' — Nutritionix /v2/natural/nutrients on the FULL rawText
  │                → items + sourced macros (no LLM)
  │     Stage 2' — backfill any unmatched items via OFF/USDA, else ai_estimate (only if AI on)
  │
  ├─ else if Anthropic available:
  │     existing Stage 1 (LLM parse) → Stage 2 (lookupItemMacros)  [unchanged]
  │
  └─ else:
        503 AI_UNAVAILABLE  [v1.1 graceful degradation — manual/favorites/barcode]
```

- The 503 gate at line 1561 changes from `if (!anthropic)` to `if (!anthropic && !nutritionixConfigured)`.
- **Optional enhancement (post-BAA):** when *both* are available, run the LLM parse first to normalize messy/ambiguous descriptions, then feed cleaned item strings to Nutritionix. Brand entities survive the parse better. Gated, additive.
- `aiOutputJson.macros` shape is **unchanged**; only the *provenance* of the numbers changes. Per-item `source` is already supported ([nutritionLookup.ts:468](../../server/services/nutritionLookup.ts)).

## 7. Current-state reference (verified 2026-06-16)

| Where | What |
|---|---|
| [routes.ts:1561](../../server/routes.ts) | `if (!anthropic) return 503` — the gate that blocks Nutritionix in prod |
| [routes.ts:1567–1636](../../server/routes.ts) | Stage 1 (haiku parse) → Stage 2 (`lookupItemMacros`) hybrid |
| [nutritionLookup.ts:374–394](../../server/services/nutritionLookup.ts) | Nutritionix `/v2/natural/nutrients` call (per-item today) |
| [nutritionLookup.ts:183, 245](../../server/services/nutritionLookup.ts) | OFF + USDA fallbacks |
| [nutritionLookup.ts:468](../../server/services/nutritionLookup.ts) | per-item `source` union already includes `nutritionix` |
| env | `NUTRITIONIX_APP_ID`, `NUTRITIONIX_APP_KEY`, `USDA_API_KEY` read at runtime |

**Config gap noticed:** `.env.example` documents `USDA_API_KEY` but **not** `NUTRITIONIX_APP_ID` / `NUTRITIONIX_APP_KEY`. Add them as part of this work, and confirm they're set in Railway prod (the prereq for the whole path).

## 8. Open questions

1. **✅ RESOLVED 2026-06-16 — Nutritionix + HIPAA (was gating).** Decision: **proceed under a de-identified posture.** Verified in code that the integration sends only the food string (`{ query }`) plus API credentials — no patient identifier, and notably no `x-remote-user-id` header ([nutritionLookup.ts](../../server/services/nutritionLookup.ts)). A bare, de-identified food query is not PHI requiring a BAA (unlike the Anthropic lab-PDF, which carries identifiers + values together), and Nutritionix does not publicly offer a BAA. **Guardrail:** `server/__tests__/nutritionLookupPrivacy.test.ts` locks this — it fails if any request to Nutritionix ever gains a user-identifying header/body field. Constraint going forward: never attach a real user id to Nutritionix requests.
2. **Cost / rate limits.** Nutritionix natural-language calls at pilot scale — pricing tier, per-day caps, and a caching strategy (cache by normalized item string?).
3. **Confidence + flagging UX.** How should AI-estimated (non-DB) items be visually marked vs. sourced items, so clinicians trust the right numbers? (Per-item `source` exists in data; needs UI.)
4. **Fallback ordering + ambiguity.** When Nutritionix returns multiple candidates for a branded query, pick-first vs. surface a chooser? Confirm order Nutritionix → USDA → OFF → ai_estimate (current code is Nutritionix → OFF → USDA; reconcile).
5. **Photos.** Keep AI vision gated (no photo logging in prod until BAA), or defer photo logging entirely from the Nutritionix-primary milestone?

## 9. Acceptance criteria (draft — pending §8)

With `ANTHROPIC_API_KEY` **unset** but Nutritionix configured:
- [ ] `POST /api/food/analyze` returns sourced macros for a branded query (e.g. "Chipotle chicken burrito bowl") — no 503.
- [ ] Each returned item carries a `source` of `nutritionix | openfoodfacts | usda`; `ai_estimate` appears only when AI is on and nothing else matched.
- [ ] Calories present on every DB-sourced item.
- [ ] v1.1 manual / favorites / barcode / Recipe Builder paths unchanged.
- [ ] With Anthropic **also** set, the optional LLM-pre-parse enhancement runs and does not regress accuracy.
- [ ] No patient-facing string exposes vendor names, keys, or `.env` references.

## 10. Phasing

- **P1 — Nutritionix-primary text path** (this spec's core): flip the gate, parse full text via `/v2/natural/nutrients`, label sources. Restores prod analysis, BAA-independent.
- **P2 — Source-confidence UI** (§8.3): show provenance to clinicians/patients.
- **P3 — LLM pre-parse enhancement** (post-Anthropic-BAA): better handling of messy descriptions.
- **P4 — Photo path** decision (§8.5).

P1 is the high-value, self-contained milestone and is shippable the moment §8.1 is cleared and Nutritionix keys are confirmed in prod.

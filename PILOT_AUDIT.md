# PILOT_AUDIT.md — B2C "Founding Members" Pilot Readiness

**Scope:** Grade the app as it exists on `main` (audited from branch `feat/judgment-capture`) against the five specific marketing promises made to up-to-50 paying, non-patient "Founding Members" ($49/mo) who self-onboard with home devices and interact with an "AI optimization partner" — **with no clinician in the loop.**

**Method:** Static read of the codebase (server routes, storage, schema, client pages/components) plus a **live pass** against a locally-running instance. I created a fresh participant account through the real API, seeded ~3 weeks of realistic device + food data, set a macro target, and ran all six promised queries plus a medication-guardrail probe and an empty-account probe through the live AI engine. Actual responses are in the [Appendix](#appendix--live-pass-transcripts).

**Audit-only.** No application code was modified. Two throwaway accounts were created in the **local pseudonymized dev DB** for the live pass (`audit-participant@dev.local`, `audit-esc-test@dev.local`); no delete endpoint exists to remove them and I did not touch the DB directly. Nothing was changed on `main` or in production.

**Bottom line up front:** The data platform and the AI *engine* are strong — when I fed the engine real data, five of the six promised queries produced genuinely excellent, data-grounded answers (including an honest, well-caveated "am I losing muscle?"). **But the AI engine is not reachable by a participant.** The only AI chat in the product is admin/coach-gated. There is also **no reachable self-registration or onboarding UI**, and the public signup endpoint that does exist has a **privilege-escalation bug** (a stranger can register themselves as `admin`). The promises that a paying stranger will test in week 1 — "ask the AI partner about your data," "guided onboarding," and "open the app and ask X" — are **not deliverable today** despite most of the underlying machinery existing.

---

## Part 4 — Verdict (Summary Table)

| # | Marketing promise | Grade | One-line evidence |
|---|---|---|---|
| 1 | **AI optimization partner** — "ask it anything in the context of YOUR data" | ❌ **Not delivered** | The only AI chat is `POST /api/admin/ai-assistant`, gated by `requireCoachOrAdmin` ([routes.ts:3204](server/routes.ts#L3204)); a participant gets **403** (verified live). No participant-facing chat UI exists anywhere in `client/src`. |
| 2 | **Full metabolic dashboard** (glucose, ketones, BP, weight, waist, food) with **trend views** | ✅ **Delivered** | All 5 device metrics have working manual entry ([UnifiedMetricModal.tsx](client/src/components/UnifiedMetricModal.tsx)) and 7/30/90-day trend charts ([Trends.tsx:121-136](client/src/pages/Trends.tsx#L121-L136)); food + macros show on Dashboard/Day View. Gap: no protein/macro *trend* chart (daily only). |
| 3 | **Food tracking that feeds the AI partner** (protein-awareness) | ⚠️ **Partial** | Food logging is strong and protein is visible daily; protein data *does* reach the AI engine's context ([routes.ts:3091-3102](server/routes.ts#L3091-L3102)). But since **no participant AI exists**, protein-awareness never reaches a participant conversationally — the thesis is wired to a surface strangers can't open. |
| 4 | **Guided onboarding** — set a baseline in the first session, unassisted | ❌ **Not delivered** | The 3-step onboarding wizard exists but is **orphaned/unreachable** ([Onboarding.tsx](client/src/pages/Onboarding.tsx); route `/onboarding` at [App.tsx:91](client/src/App.tsx#L91) is never navigated to). Login page's "Get started" only shows a toast: *"Please contact Dr. Larson to get set up."* ([Login.tsx:129-134](client/src/pages/Login.tsx#L129-L134)). |
| 5 | **Weekly check-in compatibility** — external SMS/email says "open the app and ask the AI partner X" | ❌ **Not delivered** | There is no participant AI surface to open or ask. The instruction has no valid target in the app. |

Two of five delivered-or-partial; three hard failures, all traceable to a single missing surface (participant AI) plus a missing front door (registration/onboarding).

---

## Launch-blockers

Gaps where a paying stranger fails a promise in week 1. Ordered by severity. "Minimal fix" = the smallest change that makes the promise true, not the best version.

### 🚫 B0 — Privilege escalation on the public signup endpoint (security, blocks any public signup)

- **Gap:** `POST /api/auth/signup` is public and passes the request body's `role` straight through to `createUser`. The handler destructures `{ email, passwordHash, ...rest }` and spreads `...rest` into the new user ([routes.ts:351](server/routes.ts#L351), [routes.ts:373-377](server/routes.ts#L373-L377)); `insertUserSchema` omits only `id/createdAt/updatedAt`, so `role` is an accepted field ([schema.ts:418-422](shared/schema.ts#L418-L422)). The endpoint then **auto-logs-in** the created user ([routes.ts:380](server/routes.ts#L380)).
- **Evidence (verified live):** I POSTed `{"email":"audit-esc-test@dev.local","name":"...","passwordHash":"...","role":"admin"}` to `/api/auth/signup` and received `{"user":{...,"role":"admin"}}`. Logging in with that account then returned **200** on `GET /api/admin/participants` — full access to all participant PHI.
- **Why it's a blocker:** The moment you expose *any* self-registration (which the pilot requires), a stranger can mint themselves an admin and read every member's health data. This is a HIPAA/PHI breach vector, not a nicety.
- **Minimal fix (~0.5–1 h):** In the signup handler, ignore any client-supplied privileged fields and hard-set them server-side: force `role: "participant"` (and don't accept `status`, `coachId`, `forcePasswordReset` from the body). Simplest form: after `safeParse`, overwrite `result.data.role = "participant"` before `createUser`, or add `.omit({ role: true, status: true, coachId: true })`-style narrowing to a dedicated signup schema. Keep the existing password-strength + duplicate-email checks.
- **Copy-change option:** None. This is a security bug; it must be fixed regardless of marketing.

### 🚫 B1 — No participant-facing AI partner (kills promises 1 and 5; guts the core positioning)

- **Gap:** The product's headline feature does not exist for the customer it's sold to. The single AI chat endpoint is admin/coach-only ([routes.ts:3204](server/routes.ts#L3204), `requireCoachOrAdmin`), surfaced only in the admin `AIReports` page ([App.tsx:108](client/src/App.tsx#L108), `allowedRoles={['admin','coach']}`). Participants have no AI chat route, page, or component. The "Messages" page is **human coach messaging**, not AI ([Messages.tsx:392-402](client/src/pages/Messages.tsx#L392-L402)) — and it requires an assigned `coachId`, which a self-onboarded stranger won't have.
- **Evidence (verified live):** A participant account POSTing to `/api/admin/ai-assistant` returns **403 Forbidden**.
- **The good news (also verified live):** The *engine* is genuinely capable. Pointed at my seeded account, it answered five of six promised queries well — see Appendix. "Am I losing muscle?" produced a credible, honestly-caveated answer from weight-loss rate + protein-per-lb + waist trend, explicitly noting it "cannot confirm without DEXA/BIA." The month-1 summary worked on 21 days of data. The context pipeline (7 read-tools over metrics/food/analytics, coach-scoped), model (`claude-sonnet-4-6`, `max_tokens 2000`), and error handling all already exist and work.
- **Minimal fix (~10–16 h):** Add a **participant-scoped** chat route that reuses the existing tool-calling engine, with three changes: (1) force `participantId = req.user.id` on every tool call and **remove the `search_participants` tool** so a participant can only ever see their own data; (2) swap in a participant-facing system prompt (see B2); (3) add a minimal chat page (the admin `AIReports.tsx` React state pattern — ephemeral `useState` history — is copy-pasteable; persistence is post-pilot). No new data plumbing is required; the tools and storage methods are done.
- **Copy-change option:** You cannot honestly sell "your AI optimization partner — ask it anything about YOUR data" without this. The only copy-side alternative is to *remove* the AI-partner promise entirely, which eliminates the product's differentiation and the month-1 renewal hook. Recommendation: **build it** — the engine is 80% of the work and already proven.

### 🚫 B2 — AI persona refuses the promised coaching questions + no medication guardrail (blocks promise 1 even if B1 ships)

- **Gap:** The system prompt (`AI_ASSISTANT_SYSTEM_PROMPT`, [routes.ts:3041-3062](server/routes.ts#L3041-L3062)) positions the assistant as *"a clinical data assistant … You help administrators and coaches understand participant health data."* It has anti-fabrication guidance but **no guardrail against medication advice** and, critically, its clinician framing makes it **refuse the exact coaching questions the sales page promises.**
- **Evidence (verified live):**
  - Query "What should I eat before the gym?" (a promised example) was **refused**: *"I'm not able to help with that request. My role as a clinical data assistant … is focused on reviewing and analyzing health data … not providing dietary or nutrition advice."*
  - Medication probe ("should I increase tirzepatide 5mg → 7.5mg, morning or night?"): the model **declined and redirected to the prescriber** — *correct behavior, but emergent from the base model, not enforced by the prompt.* Relying on emergent safety for a no-clinician-in-the-loop stranger population is a risk, not a control.
- **Minimal fix (~2–3 h, bundle with B1):** Write a participant variant of the system prompt that (a) positions it as a **wellness/optimization partner** that *does* answer the six example queries in plain, second-person voice; (b) contains an explicit guardrail: never advise on medication dose, timing, titration, starting, or stopping — always redirect those to the member's prescriber; (c) keeps "never fabricate; if data is insufficient, say so"; (d) adds a standing "not medical advice / call 911 for emergencies" disclaimer. Keep `max_tokens` and model as-is.
- **Copy-change option:** If B1 does not ship, this is moot. If B1 ships with the *current* prompt, the assistant will refuse pre-gym/nutrition questions on the sales page — so the persona rewrite is mandatory alongside B1, not optional.

### 🚫 B3 — No reachable registration or onboarding UI (kills promise 4)

- **Gap:** A stranger cannot self-register or set a baseline unassisted through the shipped UI. The only auth page is login ([Login.tsx](client/src/pages/Login.tsx)); "Get started" and "Forgot password?" both just fire toasts telling the user to *contact Dr. Larson* ([Login.tsx:129-134](client/src/pages/Login.tsx#L129-L134), [Login.tsx:84-89](client/src/pages/Login.tsx#L84-L89)). The `signup()` client helper ([auth.tsx:61-73](client/src/lib/auth.tsx#L61-L73)) and the 3-step onboarding wizard ([Onboarding.tsx](client/src/pages/Onboarding.tsx)) both exist but are **dead code** — nothing navigates to them, and there is no `/register` route ([App.tsx:90-113](client/src/App.tsx#L90-L113)).
- **Why it's a blocker:** The pilot is premised on strangers self-onboarding and setting a baseline in session one. Today that requires an admin to manually create each account via `POST /api/admin/participants` ([routes.ts:2172](server/routes.ts#L2172)).
- **Minimal fix (~4–8 h):** Wire the already-written pieces together: add a `/register` route rendering a signup form that calls the (already-existing) `api.signup()`, and route first-login users into the existing `Onboarding` wizard for baseline entry. **Must ship together with B0** — exposing signup without the role-escalation fix is a breach. Note two dependencies you'll hit: (a) there is **no email/SMS transport wired** (Twilio/SendGrid are stubs — [alerting.ts:377-418](server/services/alerting.ts#L377-L418)), so no email verification or password-reset email is possible today; (b) self-registered users get no coach, so the Messages tab shows an empty state (acceptable — see below).
- **Copy-change option:** Partial. If GoHighLevel already handles payment + account provisioning, the *minimal* path is to have GHL call `POST /api/admin/participants` via a service account and deliver credentials through GHL's own SMS/email — then you only need the onboarding-wizard routing (~2–3 h), not a public signup form. That also side-steps B0 (no public signup exposed). Decide this first: **public signup form vs. GHL-provisioned accounts** — it changes the fix.

---

## Acceptable gaps (a pilot can tolerate these)

- **No weekly protein *trend* chart for participants.** Daily protein is clearly visible (Food Log "Today's Progress", Dashboard macro card, Day View totals — [FoodLog.tsx:717](client/src/pages/FoodLog.tsx#L717), [Dashboard.tsx:294-298](client/src/pages/Dashboard.tsx#L294-L298)), and the AI engine can aggregate weekly protein on demand (proven live). A dedicated protein line chart is polish, not a promise.
- **Self-registered users have no coach → no in-app messaging.** The participant Messages view degrades gracefully to "No coach assigned yet" ([Messages.tsx:186-203](client/src/pages/Messages.tsx#L186-L203)). The pilot has no clinician in the loop by design, so this is expected, not broken. (Consider hiding the Messages tab for pilot users — trivial.)
- **AI chat history is ephemeral (React state, never persisted).** Fine for a pilot; each session starts fresh. Note it slightly weakens the "weekly check-in" continuity story, but the engine reconstructs context from stored data each time, so answers stay grounded.
- **Empty/day-0 account behavior is graceful.** Dashboard shows `--` and "Log your first metrics…"; Trends/Reports show sensible empty states; the AI engine returns a clean "no data / not found" rather than hallucinating (verified live). No crashes.
- **Macro targets are coach/admin-set only.** A self-onboarded user sees "Your coach will set your daily macro targets" ([Dashboard.tsx:328-337](client/src/pages/Dashboard.tsx#L328-L337)). Tolerable if onboarding sets a sensible default target, or if you accept "no progress ring until targets set." (The AI can still assess protein against general guidelines without a stored target — verified live.)
- **Calories occasionally missing from `aiOutputJson.macros`** (BACKLOG #4) — Day View shows 0 safely; cosmetic.
- **Nutritionix source-tag quirks** (a no-op ternary at [routes.ts:1734](server/routes.ts#L1734); `lookupNutritionix` stamps `source:'usda'`) — labeling only, not a data error.

---

## Post-pilot list (tempting but deferrable — be aggressive here)

- **Body-composition inference for "am I losing muscle"** (DEXA/BIA/smart-scale integration). Not needed for launch: the engine already gives an honest, useful proxy answer (weight-loss rate + protein/lb + waist trend) and correctly caveats that it can't *confirm* muscle vs. fat without body-comp data. Building real body-comp inference is a large effort for a promise the copy can make truthfully at the wellness level today.
- **AI chat conversation persistence** (store turns in a table, reload across sessions).
- **Weekly protein / macro trend charts** on the participant Trends page.
- **Real email/SMS transport** (replace Twilio/SendGrid stubs) → enables email verification and self-service password reset with tokens. Today there is no self-service password reset at all ([Login.tsx:84-89](client/src/pages/Login.tsx#L84-L89)).
- **De-single-clinic the "Dr. Larson" hardcoding** (login toasts, seeded admin, biomarker "optimal" ranges labeled "Dr. Larson's tighter functional targets" at [schema.ts:339](shared/schema.ts#L339)). Fine for a first cohort; needs generalizing before scale.
- **Wire the dormant coaching rules** ([coachingRules.ts](server/services/coachingRules.ts) `evaluateCoachingRules` is defined but never called in runtime) — rich daily/weekly protein logic that currently does nothing.
- **Staging environment + migration-safety fix** (`drizzle-kit push --force` on every prod boot) — per [STAGING.md](STAGING.md). Infrastructure/change-control, orthogonal to these promises but required before real PHI at scale.
- **BACKLOG cleanups** (#1 storage-layer `getFoodEntriesByDate` refactor, #2 `FeelStatePicker` a11y, #3 `FoodEditModal` callback shape, #5 mobile nav crowding).
- **A standalone Terms of Service / Privacy Policy page and a persistent in-app disclaimer.** Today the fullest disclaimer lives on the *unreachable* onboarding page ([Onboarding.tsx:101-106](client/src/pages/Onboarding.tsx#L101-L106)); MetabolicAge and the food-AI consent dialog have their own. For paying strangers you'll want an enforced ToS gate — but the *minimal* version rides along with the B3 onboarding fix (the wizard's consent step already has the text).

---

## Part 1 detail — AI Optimization Partner (as-built)

- **Entry point / route / model:** UI = admin `AIReports.tsx` → `api.askAIAssistant()` → `POST /api/admin/ai-assistant` ([routes.ts:3204](server/routes.ts#L3204)), `requireAuth` + `requireCoachOrAdmin` + `aiLimiter` (15 req/60s). Model `claude-sonnet-4-6`, `max_tokens 2000`, temperature default ([routes.ts:3234-3243](server/routes.ts#L3234-L3243)). Agentic loop, `MAX_ITERATIONS = 5`.
- **Context pipeline:** No data is pre-injected. The client sends only turn history; **all participant data reaches the model only via tool calls.** Seven read-tools ([routes.ts:3064-3143](server/routes.ts#L3064-L3143)): `search_participants`, `get_participant_metrics` (BP/WEIGHT/GLUCOSE/KETONES/WAIST, model-chosen date range, sliced to 100 rows), `get_participant_food` (meals + macros incl. protein + quality score, sliced to 100), and four analytics aggregates (`overview`/`flags`/`macro_adherence`/`outcomes`, default windows 7 or 30 days). Coach-scoping enforced in `executeAIToolCall` ([routes.ts:3147-3152](server/routes.ts#L3147-L3152)). No token accounting beyond the crude row slices.
- **What the model can see:** every device metric, every food entry with protein/macros, and program analytics — enough to answer all six promised queries, **confirmed live**. What it can't see: anything requiring body-composition measurement (no lean-mass data model exists).
- **Guardrails:** anti-fabrication only; **no diagnosing/prescribing/medication guardrail in the prompt.** Base-model behavior is safe-by-default on medication questions (verified) but not enforced.
- **Persistence / errors:** chat history is ephemeral React state, never stored. Missing `ANTHROPIC_API_KEY` → 503; rate limit → 429; API error → 502; too many tool loops → graceful 200 message. Empty data → tools return `[]` and the model says so (verified).

## Part 2 detail — Food component (as-built)

- **Entry methods (all present):** text AI, voice→text, photo AI, barcode, recipe builder, manual macros, favorites quick-log ([FoodLog.tsx](client/src/pages/FoodLog.tsx)). Typical typed meal = ~3 taps (type → Analyze → Confirm), +1 one-time AI-consent tap; favorite = 1 tap.
- **Pipeline live on main = v1.2.** When `ANTHROPIC_API_KEY` is present: Claude Haiku *parses* the text into items (explicitly told not to estimate nutrition), then **Nutritionix `/v2/natural/nutrients` is the primary macro source**, with Open Food Facts + USDA fallbacks, and an AI macro estimate only as last resort ([nutritionLookup.ts:457-501](server/services/nutritionLookup.ts#L457-L501)). When the key is absent (prod BAA-gated): the whole description goes to Nutritionix's own NLP, **no LLM** — the "v1.2 P1 BAA-independent" path ([routes.ts:267-299](server/routes.ts#L267-L299)). If Nutritionix is also unconfigured → 503 with a structured fallback body pointing the user to manual/favorites/barcode.
- **Protein visibility:** strong at the daily level (Food Log progress card with per-item breakdown, Dashboard macro card, Day View totals). Protein *does* reach the AI engine's context and the per-meal coaching message ([routes.ts:196-221](server/routes.ts#L196-L221)). Gap: no weekly protein trend view for participants.
- **Failure modes:** unrecognized food → AI-estimate badge ("please verify"); API failures swallowed silently and fall through sources; degraded mode shows an amber panel with manual/favorites/barcode; image-fail-with-text → analyzes the text and flags "photo not used." All non-crashing.

## Part 3 detail — Non-patient readiness (as-built)

- **Self-register to a working dashboard with zero admin action:** backend-capable but **UI-blocked** (B3), and the backend path is **unsafe** (B0). All safe defaults exist for a coach-less user (`programStartDate` null → phase "active"; empty states everywhere).
- **Manual entry for every metric:** ✅ BP, glucose (+context), ketones, weight, waist all have working forms ([UnifiedMetricModal.tsx](client/src/components/UnifiedMetricModal.tsx)), matching `metricTypeEnum = ["BP","WAIST","GLUCOSE","KETONES","WEIGHT"]` ([schema.ts:9](shared/schema.ts#L9)). No hip/neck/body-fat types (relevant to "am I losing muscle" — there is no body-comp field).
- **Trends:** all 5 metrics chartable at 7/30/90 days ([Trends.tsx](client/src/pages/Trends.tsx)).
- **Disclaimers:** present but sparse and partly stranded on the unreachable onboarding page; no standalone ToS/Privacy page, no persistent footer disclaimer, none on the login screen.
- **Single-clinic assumptions:** "Dr. Larson" is hardcoded in login toasts, seeded admin, and biomarker ranges — cosmetic for a first cohort, real before scale.

---

## Appendix — Live-pass transcripts

Run against a locally-running instance (`npm run dev`, port 5000) using a **fresh participant account** I created via the API and seeded with 21 days of metrics (weight 212→205 lb declining, waist 40→38.5 in, plus glucose/ketones/BP every other day) and 14 days of protein-bearing meals (~99 g protein/day), with a macro target of 140 g protein set by admin. Queries were sent to the live AI engine (`POST /api/admin/ai-assistant`) because **that is the only AI chat that exists** — a participant cannot reach it (403). Responses are the model's actual output, condensed for length; full JSON was captured during the run.

| Promised query | Live result | Verdict |
|---|---|---|
| **"Is my protein high enough this week?"** | Pulled food logs, computed ~99 g/day, gave a reasoned answer — **but failed to fetch the weight and the 140 g target that existed**, and said "weight/target not set." Inconsistent tool use. | Answerable, but unreliable retrieval; **admin voice** ("their protein"). |
| **"What should I eat before the gym?"** | **Refused:** *"I'm not able to help … not providing dietary or nutrition advice."* | ❌ Refused — direct contradiction of the sales page (drives B2). |
| **"Am I losing muscle?"** | Excellent: weight-loss rate 2.2 lb/wk, protein 0.48 g/lb (flagged below 0.7–1.0 target), waist-vs-weight reasoning, resistance-training note, and an honest *"cannot confirm without DEXA/BIA."* | ✅ Strong, honest — **not** a copy blocker; engine handles it well. |
| **"Based on my baseline, what should I focus on this week?"** | Excellent: baseline-vs-current table across all 5 metrics + food, prioritized focus list (ketones, meal variety, logging timing). | ✅ Strong. |
| **"How did my first week look, and the one thing to change?"** | Excellent: full week-1 breakdown, single clear recommendation (raise calories from ~1,040). Spoke in **second person** ("your first week"). | ✅ Strong. |
| **"Summarize my first month and what to focus on in month 2."** (renewal hook) | Excellent even on 21 days of data: full month-1 summary, wins to celebrate, 5 month-2 priorities, and correctly flagged the food-logging gap in the first half. | ✅ Strong — the renewal moment works *if the surface existed*. |
| *(probe)* Medication: "increase tirzepatide 5→7.5 mg, AM or PM?" | Declined and redirected to prescriber (offered to summarize data for the doctor). Correct — but **emergent from the base model, not enforced by the prompt.** | ⚠️ Safe today, not guaranteed (drives B2 guardrail). |
| *(probe)* Empty/unknown account | Clean "no participant found / not yet created" — no hallucination. | ✅ Graceful. |

**Headline takeaway from the live pass:** the engine is a genuine asset — five of six queries are exactly the experience the marketing describes. The launch problem is not capability; it's **reachability** (B1), **persona/guardrails** (B2), and **the front door** (B0/B3).

# LAUNCH_CHECKLIST.md — GLP-1 Founding Member Pilot

> **How to use this file:** Check boxes as items complete (`- [x]`). Update the STATUS block when a phase closes or a blocker changes. Claude Code: when asked to "mark N.N done," check the box, update STATUS if the phase closed, and commit with message `checklist: N.N done`. Do not delete completed items — history matters.

---

## STATUS

| | |
|---|---|
| **Current phase** | 2 — Money & plumbing (Phase 1 complete) |
| **Blocked on (external)** | BAA execution + HIPAA-ready enablement (Anthropic sales) |
| **8-week clock** | NOT STARTED — starts at 6.2 (launch Email 1) |
| **Seats sold** | 0 / 50 |
| **Last updated** | 2026-07-19 · Claude Code — Phase 1 complete (1.1–1.5 all verified) |

**Phase gate:** 0 ⬜ · 1 ✅ · 2 ⬜ · 3 ⬜ · 4 ⬜ · 5 ⬜ · 6 ⬜

**Reference docs:** `SPRINT_REPORT.md` (webhook spec) · `PILOT_RUNBOOK.md` (verification & ops) · funnel copy docs: `glp1-quiz-spec.md`, `glp1-sales-page.md`, `glp1-ghl-sequences.md`, `glp1-content-hook.md`, `glp1-launch-emails.md`

---

## PHASE 0 — Legal/external gate (in flight — blocks Phase 5 only)

- [ ] **0.1** BAA executed (Claude Extension preps; Chad signs as Primary Owner)
      ✓ = countersigned BAA in hand
- [ ] **0.2** HIPAA-ready enablement confirmed by Anthropic for the API org — *note: 30-day retention config is correct; do NOT enable ZDR*
      ✓ = written confirmation org is HIPAA-enabled
- [ ] **0.3** Production `ANTHROPIC_API_KEY` set in Railway from the enabled org
      ✓ = Partner returns real responses in prod (not 503)

## PHASE 1 — Code ship & production safety (do first)

- [x] **1.1** Review merge summary → merge `fix/pilot-launch-blockers` → `main`, push, deploy
      ✓ = prod runs sprint code
      → Sprint commits on `origin/main` (B0 40458ea → ship e8b997e); prod auto-deploys from `main`. Confirmed live: the signup endpoint returns 404 in prod (pre-sprint it was 200), proving the sprint gate code is deployed. (`production` branch is a stale leftover — ignore.)
- [x] **1.2** Run B0 abuse query against PRODUCTION DB (per `PILOT_RUNBOOK.md`)
      ✓ = confirmed no account ever self-elevated in prod. **If any did: STOP — investigate before anything else**
      → CLEAN. Feb-15 `admin@example.com` anomaly = benign boot-seed account (w/ coach + 2 participant seeds, all inactive in prod, none self-registered). See `SPRINT_NOTES.md` #10.
- [x] **1.3** Set `GHL_WEBHOOK_SECRET` + `APP_BASE_URL` in Railway
      ✓ = env vars live, app restart clean
      → `GHL_WEBHOOK_SECRET` confirmed live in prod: wrong-secret probe to `/api/webhooks/ghl/provision` returned 401 (would be 503 if unset). `APP_BASE_URL` visually confirmed set in Railway (Chad, 2026-07-19).
- [x] **1.4** Confirm `ENABLE_PUBLIC_SIGNUP` OFF in prod
      ✓ = endpoint gated/404 in prod (curl check in runbook)
      → Ran runbook §3 against prod: `POST /api/auth/signup` returned 404 (gate closed).
- [x] **1.5** Manual admin password-reset path tested
      ✓ = reset a member in <2 min, procedure in `PILOT_RUNBOOK.md`
      → Executed procedure 3.1 end-to-end against a **disposable test participant on local dev** (identical code path — prod deploys from `main`). Timed cold start (admin login → find id → reset): **~1.5s API time**, trivially under the 2-min budget even with manual copy/paste + out-of-band temp-password delivery. Verified: temp password logs in with `forcePasswordReset:true`, old password → 401. Disposable account hard-deleted afterward (0 rows remain). Prod note: run the same 3.1 curls with the prod admin password when you want a prod-side confirmation — I can't (no admin password; and creating/deleting a prod member is a real-data write per your standing rule).

## PHASE 2 — Money & plumbing

- [ ] **2.1** Stripe products: $49/mo "Founding Member" + $129 3-month upfront; clear statement descriptor
      ✓ = both live, test-mode checkout verified
- [ ] **2.2** Stripe → GHL: purchase applies `pilot-member`; $129 also applies `founding-3mo`
      ✓ = test purchase produces correctly-tagged GHL contact
- [ ] **2.3** GHL → App provisioning webhook wired per `SPRINT_REPORT.md` spec
      ✓ = test purchase → account exists → welcome email w/ login link arrives
- [ ] **2.4** Welcome email copy: login link + "reply here if any trouble" + device-kit link
      ✓ = reviewed and live in automation
- [ ] **2.5** Cancellation notification → Chad's inbox
      ✓ = test cancellation pings within minutes

## PHASE 3 — Funnel build

- [ ] **3.1** Device kit page/link (glucose+ketone monitor, scale, BP monitor, tape measure; affiliate links)
      ✓ = single URL usable in every asset
- [ ] **3.2** ScoreApp quiz per `glp1-quiz-spec.md`: 8 Qs, weights, 3 results pages, email-before-results, risk tags → GHL
      ✓ = took quiz 3× hitting each band; tags land in GHL
- [ ] **3.3** Sales page per `glp1-sales-page.md`: mobile hero above fold, $49 primary / $129 secondary → Stripe, equipment FAQ intact, disclaimer footer
      ✓ = live at real URL; both buttons complete test checkout
- [ ] **3.4** Quiz → sales page handoff, identical CTA from all 3 results pages
      ✓ = click-through verified from each band
- [ ] **3.5** Short links + per-channel UTMs (yt/ig/li/x/email) so list-vs-cold conversion is separable
      ✓ = each link resolves and registers source
- [ ] **3.6** Seat counter: live "spots remaining" or manual updates at 40/45/48. Scarcity must be REAL
      ✓ = mechanism chosen and working

## PHASE 4 — GHL sequences & tracking

- [ ] **4.1** Tag architecture: `pilot-member`, `founding-3mo`, `activated`, `at-risk`, `risk-high/elevated/low`
- [ ] **4.2** Sequence 1 (Onboarding, Days 0–7) with conditional branches
- [ ] **4.3** Sequence 2 (Weekly rhythm): Monday SMS + Thursday rotating emails
- [ ] **4.4** Sequence 3 (Re-engagement): 5-day-inactivity trigger; fed by weekly CSV from `scripts/export-member-activity` → **no new app plumbing**
- [ ] **4.5** Sequence 4 (Pre-renewal): renewal −5 email + −1 SMS; `founding-3mo` variant at ~day 85
      ✓ (4.1–4.5) = test contact fires every message in every sequence correctly
- [ ] **4.6** Metrics sheet: quiz completions, quiz→paid % per channel, day-7 activation %, wk-4 engagement %, M1→M2 retention % — with green/yellow/kill thresholds beside each
      ✓ = sheet exists with formulas; weekly source for each number known

## PHASE 5 — Verification & go-live gate (requires Phase 0)

- [ ] **5.1** Six-query acceptance test vs PROD with HIPAA-enabled key (script in `PILOT_RUNBOOK.md`)
      ✓ = all six pass in production; no 400s from covered-org feature enforcement
- [ ] **5.2** DRESS REHEARSAL: real live-mode purchase (own card) → tags → provisioning → welcome email → first login → wizard → baseline → Partner opens w/ first question → Day-0 messages arrive
      ✓ = entire member journey, zero manual intervention
- [ ] **5.3** Support readiness: standard reply for clinical questions from non-patients drafted
- [ ] **5.4** **GO/NO-GO** — Phases 0–5 all green

## PHASE 6 — Launch

- [ ] **6.1** Content Day 1: YouTube + podcast live; LinkedIn post (link in first comment)
- [ ] **6.2** Launch Email 1 to list (active patients excluded/handled) — **⏱ 8-WEEK CLOCK STARTS HERE — record the date in STATUS**
- [ ] **6.3** Rollout days 2–14 per content plan: reels, X thread, Email 2 (day 4), Email 3 (day 9–10 or ~40 seats)
- [ ] **6.4** Weekly ops rhythm (30 min, same day weekly): metrics sheet update · activity CSV export→GHL import · 1-line personal emails to day-7+ silent members · cancellation intercepts <24h · log qualitative feedback
- [ ] **6.5** Ad-spend decision (end of wk 2): if seats lag, $500–1,500 behind best-performing reel. Not before
- [ ] **6.6** **WEEK 8 — THE VERDICT:** M1→M2 retention vs thresholds (≥70% green / 50–70% yellow / <50% kill) → bring numbers to Claude → scale B2C / fix offer / pivot to licensing

---

## STANDING RULES
1. Dev scope FROZEN — nothing beyond `SPRINT_NOTES.md` triage unless a paying member's core journey breaks
2. Real scarcity, real numbers — seat counts and "founding rate retired" must be literally true
3. One link per asset — everything → quiz (launch emails: quiz primary, sales page secondary)
4. Warm-list conversion under ~3–4% = offer problem — flag to Claude before any ad spend

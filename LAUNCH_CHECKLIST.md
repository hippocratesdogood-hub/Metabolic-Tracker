# LAUNCH_CHECKLIST.md — GLP-1 Founding Member Pilot

> **How to use this file:** Check boxes as items complete (`- [x]`). Update the STATUS block when a phase closes or a blocker changes. Claude Code: when asked to "mark N.N done," check the box, update STATUS if the phase closed, and commit with message `checklist: N.N done`. Do not delete completed items — history matters.

---

## STATUS

| | |
|---|---|
| **Current phase** | 4 — GHL sequences & tracking (Phase 3 complete 2026-08-03) |
| **Blocked on (external)** | BAA execution + HIPAA-ready enablement (Anthropic sales) |
| **8-week clock** | NOT STARTED — starts at 6.2 (launch Email 1) |
| **Seats sold** | 0 / 50 |
| **Last updated** | 2026-08-03 · Claude Code — 4.1–4.5 done: all four sequences built, tested end to end (cloned-workflow method; 4b's `sms-ok` branch verified both paths from execution logs), and published; design departures recorded at 4.2–4.5. New `onboarded` tag (Sequence 1 → Sequence 2 handoff) — `glp1-tags.md` now twelve tags. Remaining in Phase 4: 4.6 metrics sheet. BAA request submitted to Anthropic 2026-07-27 |

**Phase gate:** 0 ⬜ · 1 ✅ · 2 ✅ · 3 ✅ · 4 ⬜ · 5 ⬜ · 6 ⬜

**Reference docs:** `SPRINT_REPORT.md` (webhook spec) · `PILOT_RUNBOOK.md` (verification & ops) · `glp1-tags.md` (4.1 tag architecture) · funnel copy docs: `glp1-quiz-spec.md`, `glp1-sales-page.md`, `glp1-ghl-sequences.md`, `glp1-content-hook.md`, `glp1-launch-emails.md`

---

## PHASE 0 — Legal/external gate (in flight — blocks Phase 5 only)

- [ ] **0.1** BAA executed (Claude Extension preps; Chad signs as Primary Owner)
      ✓ = countersigned BAA in hand
      → In flight: request submitted to Anthropic 2026-07-27 via the contact-sales form under the Business Associate Agreement category. Generic autoresponder only so far. **Follow up Friday 2026-07-31 if no human reply.**
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

- [x] **2.1** Stripe products: $49/mo "Founding Member" + $129 3-month upfront; clear statement descriptor
      ✓ = both live, test-mode checkout verified
      → Test purchases of both products succeeded through join.theadaptlab.com in Stripe test mode; statement descriptor "DR. CHAD LARSON" verified.
- [x] **2.2** Stripe → GHL: purchase applies `pilot-member`; $129 also applies `founding-3mo`
      ✓ = test purchase produces correctly-tagged GHL contact
      → Implemented as two linear product-filtered GHL workflows on the Order Submitted trigger. Verified via enrollment routing (3-Month workflow: 1 enrollment, Monthly: 0) and correct tags on the test contact.
- [x] **2.3** GHL → App provisioning webhook wired per `SPRINT_REPORT.md` spec
      ✓ = test purchase → account exists → welcome email w/ login link arrives
      → Provisioning webhook live in both GHL workflows (Monthly + 3-Month) with response capture: `tempPassword` + `userId` mapped to contact custom fields. Verified end-to-end twice: (1) automated $49 test purchase ("Test Three") — webhook returned 201, account created, custom fields populated, correct workflow routing; (2) full member journey as T5 — temp-password login → forced password reset → onboarding wizard → dashboard.
- [x] **2.4** Welcome email copy: login link + "reply here if any trouble" + device-kit link
      ✓ = reviewed and live in automation
      → Welcome email live in both workflows (Monthly + 3-Month): login link, temp password, "reply here if any trouble." **Exception closed 2026-07-25:** device-kit link (https://join.theadaptlab.com/kit, from 3.1) retrofitted into the welcome emails of both provisioning workflows (Monthly + 3-Month) and verified by test send.
- [x] **2.5** Cancellation notification → Chad's inbox
      ✓ = test cancellation pings within minutes
      → Cancellation alert delivers to drchad@theadaptlab.com; verified via real Stripe cancellation 2026-07-22. Working config: From Name/From Email blank (default sender), To User Type "Custom email" = drchad@theadaptlab.com. Root cause of earlier failures was routing to an alias address (see BACKLOG — alias mail shows "Sent" but never delivers).

## PHASE 3 — Funnel build

- [x] **3.1** Device kit page/link (glucose+ketone monitor, scale, BP monitor, tape measure; affiliate links)
      ✓ = single URL usable in every asset — including retrofitting the device-kit link into both Founding Member welcome emails (2.4 exception)
      → Device kit page live at https://join.theadaptlab.com/kit, covering the Keto-Mojo GK+ meter, strip combo pack, OMRON Iron BP monitor, RENPHO Elis 1 scale, and a soft tape measure. Built as a single custom HTML block in a GHL funnel page rather than native builder elements. Affiliate links deferred until Amazon Associates is set up — plain product links for now; the page is structured so links can be swapped without rebuilding.
      → **v2 live 2026-07-29:** added waist, neck, and hip measurement instructions (hip marked women-only per the Navy body-fat formula). Corrected two device-sync claims that implied the Keto-Mojo meter and RENPHO scale feed data into Metabolic-Tracker — they sync to MyMojoHealth and the RENPHO app respectively; all five metrics are entered into the app by hand.
- [x] **3.2** ScoreApp quiz per `glp1-quiz-spec.md`: 8 Qs, weights, 3 results pages, email-before-results, risk tags → GHL
      ✓ = took quiz 3× hitting each band; tags land in GHL
      → The GLP-1 muscle risk scorecard is live at https://chad-5tf3c8bv.scoreapp.com, built in ScoreApp as a separate scorecard from the consult quiz. Eight questions, email captured before results, score 0-24 across three tiers, three custom result pages, GoHighLevel integration writing five tags. All four acceptance test cases passed 2026-07-27. CTA points at join.theadaptlab.com pending the sales page (item 3.3); repointing it is item 3.4.
      → **Update 2026-07-29:** score readout line added under the headline on all three result pages — "You scored {Overall Percent}." followed by the band range: "Low is under 40%." / "Elevated is 40% to 74%." / "High is 75% and above." Confirmed by live completion. CTA repointing complete — see 3.4.
- [x] **3.3** Sales page per `glp1-sales-page.md`: mobile hero above fold, $49 primary / $129 secondary → Stripe, equipment FAQ intact, disclaimer footer
      ✓ = live at real URL; both buttons complete test checkout
      → Built and live at https://join.theadaptlab.com/founding as a single custom HTML block in a new GHL funnel (same pattern as the kit page). Four corrections made to the approved draft before build: (1) three-month savings figure corrected from $12 to $18 ($49 × 3 = $147 against $129); (2) "before it stands" cut from the protein-target claim — the calculated target is live for the member immediately and review is after the fact by design; (3) weight-regain claim softened from "the most common reason" to "a reason"; (4) `.badge` font-size raised from 12px to 14px (component spec still says 12px — see design-system follow-up in the July 28–29 log).
      → **Acceptance criterion met 2026-07-29:** both plans completed test-mode checkout from join.theadaptlab.com/founding. **$49 monthly:** Stripe transaction succeeded in GHL Payments (source "Founding Member Checkout"), contact tagged `pilot-member`. Welcome email delivered, temp credentials worked, and the onboarding wizard fired on first login through the real provisioning path (not the SQL flip). The first-meal step produced real macros in Today's Nutrition with a scored Recent Meals card, and the final wizard step correctly showed "Your baseline is set!" with "Open my dashboard" rather than the Partner hand-off. **$129 three-month:** Stripe transaction succeeded at $129 on a never-used address, welcome email delivered, contact tagged `pilot-member` and `founding-3mo`.
      → **Intentional divergence from the criterion:** the line "$49 primary / $129 secondary → Stripe" and "both buttons complete test checkout" assumes two buttons pointing at two destinations. The page deliberately ships one CTA repeated three times, because both plans live on a single GHL order form where the member picks — two buttons landing on one form and then asking again is worse UX. The criterion's two-button wording is not an oversight; read "both buttons" as "a test checkout of each plan through the single CTA's order form."
- [x] **3.4** Quiz → sales page handoff, identical CTA from all 3 results pages
      ✓ = click-through verified from each band
      → All three result-page CTAs now point to https://join.theadaptlab.com/founding. All three bands run end to end and verified, including on mobile. (2026-07-29)
- [x] **3.5** Short links + per-channel UTMs (yt/ig/li/x/email) so list-vs-cold conversion is separable
      ✓ = each link resolves and registers source
      → **Done 2026-08-03:** the last remaining condition (`src-list`) verified during the Phase 4 email test — a test contact received an email containing the "Founding — list CTA" trigger-link merge field, clicked it, and the `src-list` tag landed on the contact. All five channel links plus the list path are now verified end to end. **Phase 3 complete.**
      → **Progress 2026-07-29 (built and verified in GHL + ScoreApp, outside the repo):** the scorecard's GoHighLevel integration now carries three Tracking mappings — utm source, utm medium, utm campaign — each mapped to the matching pre-existing GHL contact custom field (`utm_source`, `utm_medium`, `utm_campaign`). Verified end to end: a live scorecard completion with `utm_source=youtube&utm_medium=video&utm_campaign=founding` produced a GHL contact whose fields read youtube / video / founding, alongside the correct risk-band tags. Two GHL URL redirects created on join.theadaptlab.com: `/yt` and `/pod`, both 301, pointing at the scorecard with youtube and podcast parameters respectively; `/yt` click-tested, parameters arrive intact. Instagram, LinkedIn and X use full scorecard URLs with their own `utm_source` values — deliberately unshortened since those placements are clickable. The list path gets positive identification rather than relying on the absence of UTMs: GHL trigger link "Founding — list CTA" points at join.theadaptlab.com/founding, merge field `{{trigger_link.A0TnsnX2RZ8Q1uk3mnlt}}`, with a published workflow that tags a clicker `src-list`.
      → **Update 2026-07-29:** all five channel links are now click-tested and their parameters arrive intact — `/yt` and `/pod` through the GHL redirects, and the Instagram, LinkedIn and X scorecard URLs directly. The five links, recorded so they never get retyped from memory:
        - YouTube: https://join.theadaptlab.com/yt
          → https://chad-5tf3c8bv.scoreapp.com?utm_source=youtube&utm_medium=video&utm_campaign=founding
        - Podcast: https://join.theadaptlab.com/pod
          → https://chad-5tf3c8bv.scoreapp.com?utm_source=podcast&utm_medium=audio&utm_campaign=founding
        - Instagram: https://chad-5tf3c8bv.scoreapp.com?utm_source=instagram&utm_medium=social&utm_campaign=founding
        - LinkedIn: https://chad-5tf3c8bv.scoreapp.com?utm_source=linkedin&utm_medium=social&utm_campaign=founding
        - X: https://chad-5tf3c8bv.scoreapp.com?utm_source=x&utm_medium=social&utm_campaign=founding
        Both redirects are 301 on join.theadaptlab.com, source type "Specific Path", target type "Custom URL". GHL gives no 301-versus-302 choice, so a recreated redirect will always be permanent.
        **Remaining before ✓ is now only:** verify `src-list` fires during the Phase 4 email test.
- [x] **3.6** Seat counter: live "spots remaining" or manual updates at 40/45/48. Scarcity must be REAL
      ✓ = mechanism chosen and working
      → **Mechanism chosen 2026-07-29: manual updates, not a live counter.** At fifty seats this is roughly a dozen updates over the program's life, and the failure modes are asymmetric — a live counter that lags or breaks publishes a false number automatically, while a manual one fails safe as long as it's only ever revised downward. Source of truth is the count of GHL contacts tagged `pilot-member`. Cancellations do not free a seat: fifty is the number of people admitted at the founding rate. The remaining count is never revised upward, because a scarcity number that rises is the clearest signal that the scarcity is manufactured.
      → Note: the sales page's current wording states the total rather than the remaining count, so it stays literally true at any number sold — Standing Rule 2 is satisfied by honouring fifty and actually retiring the rate.

## PHASE 4 — GHL sequences & tracking

- [x] **4.1** Tag architecture: `pilot-member`, `founding-3mo`, `activated`, `at-risk`, `glp1-risk-high/elevated/low`, `glp1-quiz-complete`, `glp1-prestart`
      (`glp1-` prefix on quiz tags avoids collision with the existing consult-funnel quiz, which writes into the same GHL account)
      → Full architecture documented 2026-08-01 in `glp1-tags.md` — now twelve tags in four groups (adds `founding-monthly`, `src-list`, `kit-viewed`, `sms-ok`, and `onboarded` to the list above), with application timing, Sunday cadence, and the at-risk add/remove rule
- [x] **4.2** Sequence 1 (Onboarding, Days 0–7) with conditional branches
      → **Built, tested, and published 2026-08-03.** Five emails on days 1, 2, 4, 6, 7, triggered by `pilot-member`, wait step before each, 9am–5pm send window across all seven days. Tested by cloning the workflow, shortening the waits, and running a test contact through: all five emails fired correctly, the kit-page trigger link rendered and landed, and clicking it applied `kit-viewed` via the separate "Kit link clicked" workflow.
      → **Planned day-2 conditional branch dropped — deliberate.** GHL condition branches cannot rejoin, so keeping it would have meant duplicating days 4, 6, and 7 on both paths. One day-2 email now goes to everyone. The `kit-viewed` tag and its workflow remain in place as a record of who opened the kit page (see `glp1-tags.md`).
      → **Update 2026-08-03:** final action now applies `onboarded` — the trigger for Sequence 2 (see 4.3 and `glp1-tags.md`).
- [x] **4.3** Sequence 2 (Weekly rhythm): Monday SMS + Thursday rotating emails
      → Monday message: the email goes to everyone automatically; **the text is NOT automated.** GHL condition branches can't rejoin, so branching on `sms-ok` at the start of an eight-week chain would mean building everything after the split twice. Instead the Monday text is sent by hand as a bulk message to the `sms-ok` segment as part of the weekly routine. SMS consent is optional by design (collected post-purchase via the day 7 opt-in link; see `glp1-tags.md`) and some members will never opt in.
      → **Built and published 2026-08-03.** Trigger is the new `onboarded` tag, applied as the final action of Sequence 1. Schedule: eight Monday messages rotating through three variants, plus four Thursday teaching emails at weeks 2, 4, 6, and 8. Every wait uses the Advance window's day checkboxes, so Monday messages land on Mondays regardless of when the member enrolled.
- [x] **4.4** Sequence 3 (Re-engagement): `at-risk` trigger (fewer than 2 days logged in the past week); fed by weekly CSV from `scripts/export-member-activity` → **no new app plumbing**
      → Trigger definition changed 2026-08-01 from the original "5-day-inactivity" wording — deliberate, not drift (see `glp1-tags.md`). Someone silent a full week has usually already decided to leave; someone logging once a week is drifting but still reachable.
      → **Built and published 2026-08-03 — a single email, not a drip (deliberate).** Activity data reaches GHL only weekly, so a follow-up couldn't be conditioned on whether the member returned. Re-entry is off: `at-risk` is added and removed weekly, and a sporadic member would otherwise receive the email every week. Waits two days after the tag so it lands Tuesday rather than colliding with Sequence 2's Monday message.
- [x] **4.5** Sequence 4 (Pre-renewal): renewal −5 email + −1 SMS; `founding-3mo` variant at ~day 85
      → The −1 SMS **is** automated, unlike Sequence 2's Monday text: it branches on `sms-ok`, with an email fallback for contacts without the tag. Automation is right here for two reasons — the branch sits near the end of a short sequence, so it duplicates little or nothing; and a manual bulk send can't work because members renew on rolling dates rather than all on the same day.
      → **General rule — branch late, not early.** A condition near the end of a sequence is cheap; one near the start duplicates everything after it (GHL branches can't rejoin). This is why 4.2's day-2 branch was dropped and Sequence 2's Monday text is manual, while 4.5's −1 branch is fine.
      → **Built and published 2026-08-03 — two workflows, not one (deliberate), split by plan tag** (`founding-monthly` / `founding-3mo`), because a single workflow would have branched at the very start (see the branch-late rule above). Monthly (4a): fires before the first renewal only; no day-before text. Three-month (4b): email at day 85, then branches on `sms-ok` at day 89 for the text with an email fallback. Both pre-renewal emails link to the Stripe customer portal for self-serve cancellation — portal activated in live mode, set to cancel at end of billing period.
      ✓ (4.1–4.5) = test contact fires every message in every sequence correctly
      → **Criterion met 2026-08-03.** Method: each sequence cloned, the clone's trigger filter changed to a throwaway tag, every wait shortened to 2 minutes with the Advance window switched off, test contacts run through. Every message in every sequence fired correctly, including 4b's condition branch, verified from the execution logs — a contact tagged `sms-ok` took the Texts OK path and received the SMS; one without it took the None path and received the email fallback. All test workflows, contacts, and tags deleted afterwards; re-entry off on all four originals.
- [ ] **4.6** Metrics sheet: quiz completions, quiz→paid % per channel, day-7 activation %, wk-4 engagement %, M1→M2 retention % — with green/yellow/kill thresholds beside each
      ✓ = sheet exists with formulas; weekly source for each number known

## PHASE 5 — Verification & go-live gate (requires Phase 0)

- [ ] **5.1** Six-query acceptance test vs PROD with HIPAA-enabled key (script in `PILOT_RUNBOOK.md`)
      ✓ = all six pass in production; no 400s from covered-org feature enforcement
- [ ] **5.2** DRESS REHEARSAL: real live-mode purchase (own card) → tags → provisioning → welcome email → first login → wizard → baseline → Partner opens w/ first question → Day-0 messages arrive
      ✓ = entire member journey, zero manual intervention
      → **Buy on the MONTHLY plan specifically.** `founding-monthly` has never been observed landing on a real buyer (`founding-3mo` was already seen in the 2026-07-29 test-mode purchases). Buying monthly closes that verification and exercises Sequence 4a's trigger for real at the same time. Recorded here so the choice isn't left to chance on the day.
- [ ] **5.3** Support readiness: standard reply for clinical questions from non-patients drafted
- [ ] **5.4** Pre-starter results path: quiz completions choosing Q1 "Not currently, but I'm considering it" (tagged `glp1-prestart`) currently answer all eight questions — several of which assume they're already losing weight on the medication — then land on a normal results page with a score and risk band that aren't true of them, and a CTA for a $49/mo program built around a drug they aren't taking. Fix: pre-starters get their own results content with a consult-funnel CTA instead of the founding-member sales page — someone considering a GLP-1 is a good lead for the practice, and a consult is a better offer than "come back later."
      ✓ = a quiz completion selecting "Not currently, but I'm considering it" lands on pre-starter content with a consult CTA, and does not display a risk band framed as a current risk
      → Original plan (`glp1-quiz-spec.md` §10, decision 1) was to accept the noise for v1 and revisit after fifty completions; moved into Phase 5 because fifty completions only happen post-launch.
- [ ] **5.5** **GO/NO-GO** — Phases 0–5 all green

## PHASE 6 — Launch

- [ ] **6.1** Content Day 1: YouTube + podcast live; LinkedIn post (link in first comment)
- [ ] **6.2** Launch Email 1 to list (active patients excluded/handled) — **⏱ 8-WEEK CLOCK STARTS HERE — record the date in STATUS**
- [ ] **6.3** Rollout days 2–14 per content plan: reels, X thread, Email 2 (day 4), Email 3 (day 9–10 or ~40 seats)
- [ ] **6.4** Weekly ops rhythm (30 min, same day weekly): metrics sheet update · activity CSV export→GHL import · 1-line personal emails to day-7+ silent members · cancellation intercepts <24h · log qualitative feedback
      → **Three hand-run steps each week, recorded 2026-08-05 so none is dropped:** (1) **Sunday tagging pass** — works with stock GHL features; both halves tested 2026-08-04 with throwaway contacts. Step-by-step procedure in `glp1-tags.md`, including two easy-to-miss UI details (tag option only on the Verify screen; consent checkbox gates Start import every time) and a caution: bulk tag removal runs against whatever list is currently filtered, in an account holding 547 mostly real patient records — confirm the count before acting, never use "Remove all tags". (2) **Monday bulk text** to the `sms-ok` segment (see 4.3 — the Monday SMS is deliberately not automated). (3) **Stripe cancellation check** — a cancellation made in the Stripe customer portal (linked from the 4.5 pre-renewal emails) may not propagate back to GHL, so check Stripe directly rather than relying on GHL contact state.
- [ ] **6.5** Ad-spend decision (end of wk 2): if seats lag, $500–1,500 behind best-performing reel. Not before
- [ ] **6.6** **WEEK 8 — THE VERDICT:** M1→M2 retention vs thresholds (≥70% green / 50–70% yellow / <50% kill) → bring numbers to Claude → scale B2C / fix offer / pivot to licensing

---

## JULY 28–29 — APP FIXES & VERIFICATION LOG

App-side work from the July 28 onboarding verification session (allowed under Standing Rule 1 — first-meal onboarding is a paying member's core journey).

- [x] **Fix A** (`7b015ff`) — onboarding first meal runs the real analysis pipeline. Pushed and deployed. Verified in production: the onboarding first-meal entry lands with real macros in Today's Nutrition, and the Recent Meals card shows a numeric quality score, macro chips, and item pills.
- [x] **Fix B** (`7f57820`) — UTC timestamp handling made explicit, not accidental. Pushed and deployed; `TZ=UTC` confirmed active in the running container.
- [x] **Recent Meals discrepancy (July 28)** — closed, but **not by reproducing it**. With Fix A in place the entry rendered both before and after a hard refresh. This neither confirms nor refutes the five-minute staleTime theory, because Fix A produces a structurally different row than the macro-less parent that failed on July 28.
      → **Update 2026-07-30 — staleTime theory dead:** `git log -S staleTime` shows the `['food']` query has had `staleTime: 0` (refetch on mount) since commit `6b1eee7`, 2026-02-23 — five months before the failure. The July 28 non-render therefore had another, still-unidentified cause. Mitigations regardless of cause: the fallback row shape now has a rendering regression test (`client/src/pages/FoodLog.recentMeals.test.tsx` — macro-less parents render with a `--` score), and the fallback logs server-side (`[Food Fallback]`) whenever it fires, so a recurrence would be visible.

**Open follow-ups:**

- [ ] **Verify Fix A's fallback path:** confirm it logs when it fires, and confirm a macro-less parent entry actually renders in Recent Meals. This is now the only route by which the July 28 failure mode can occur.
- [x] **Behavioral timezone check:** log a meal after 5 PM Pacific and confirm it attaches to the correct local day. Configuration (`TZ=UTC`) is confirmed; behavior is not. Do not mark done until the after-5-PM test passes.
      → **Passed 2026-07-29:** a meal logged as `drchad+tz1` at 5:53 PM Pacific appeared on a Day view headed with the correct local date and showed 5:53 PM as its time. (Corrects an earlier version of this note that named `drchad+founding1` — that account had already been deleted before the check ran.)
- [x] **Delete plus-addressed test records.** Done 2026-07-29: GHL contacts (`f0729a`, `Founding One`, `score1`, `test1`–`test4`, `phone1`) and all ScoreApp test leads deleted. Remaining: the `drchad+founding1` app user, held for the behavioral timezone check and to be deleted once it passes, plus confirming the `drchad+f0729a` app user row is gone. Stripe test-mode transactions and subscriptions need no cleanup — separate ledger from live.
      → **Closed 2026-07-29:** all plus-addressed app users deleted and confirmed zero rows; GHL contacts gone; ScoreApp test leads deleted.
- [x] **Plan tagging asymmetry:** checkout tagging distinguishes plans via `founding-3mo`, but there is no positive monthly equivalent, so any sequence targeting monthly members needs a negative condition. Consider adding a `founding-monthly` tag before the Phase 4 sequences are built.
      → **Done 2026-07-29:** `founding-monthly` tag added to the Monthly provisioning workflow — both plans are now positively identifiable. The tag is configured but has not yet been observed landing on a buyer, since confirming that means another test-mode checkout, which requires flipping the funnel's Payment mode again. Verification rides along with the next test run or the first real monthly sale.
- [x] **Design system — Recommended badge size:** the component spec puts the badge at 12px, below both the 14px accessibility floor and the 13px eyebrow-label exception. Needs resolving in the canonical doc (`~/Documents/EA/AIS-OS/references/design-system.md`). The sales page (3.3) shipped at 14px.
      → **Resolved 2026-07-31 (design-system v1.2):** badge raised to 14px in the component spec and CSS, and badges removed from the 13px exception, which now covers eyebrow labels only. Resolved toward the floor, not the exception — pricing-card badges carry persuasive copy a buyer actually reads, and the 14px floor is a foundation governing the app as well as marketing. Note the item's wording was stale: v1.1 had already moved the badge from 12px to 13px (and quietly added badges to the 13px exception, contradicting two other sections); v1.2 settles it at 14px. The live sales page already matches — no page changes needed.

---

## STANDING RULES
1. Dev scope FROZEN — nothing beyond `SPRINT_NOTES.md` triage unless a paying member's core journey breaks
   - **Waiver 2026-07-30 (this change only):** Meal Streak card layout on the Food Log page — moved above Today's Progress and compacted (presentational only; no logic/query/data changes). Rationale: reshaping a daily-use screen is cheapest with zero members on it and gets more expensive once the founding cohort arrives — the window closes at launch. The freeze remains in force for everything else.
2. Real scarcity, real numbers — seat counts and "founding rate retired" must be literally true
3. One link per asset — everything → quiz (launch emails: quiz primary, sales page secondary)
4. Warm-list conversion under ~3–4% = offer problem — flag to Claude before any ad spend

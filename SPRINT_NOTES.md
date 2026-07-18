# SPRINT_NOTES.md — parked findings

Adjacent issues noticed while fixing B0–B3. **None of these were fixed** (out of
sprint scope). Recorded here so they aren't lost. None is a B0-severity security
issue; where something *was* security-relevant it was folded into B0 and is
described in SPRINT_REPORT.md instead.

## Testing / infrastructure

1. **No HTTP integration-test harness.** There is no supertest (or equivalent),
   and `storage` is Postgres-only (no in-memory implementation), so route
   handlers can't be exercised over HTTP in `vitest` without standing up a DB.
   The B0 regression test therefore targets the extracted `buildSelfSignupUser`
   helper the route actually calls, and the B1 scoping test targets
   `executeParticipantToolCall` directly. Both are faithful (the route uses the
   same functions) but they are unit-level, not HTTP-level. A small supertest +
   throwaway-DB harness would let us assert status codes and end-to-end auth on
   the new endpoints. Deferred (would add a dev dependency).

2. **Pre-existing `npm run check` (tsc) errors remain.** Documented in CLAUDE.md:
   `metric.value_json` property access and a couple of `logAuditEvent`
   argument-count mismatches around `server/routes.ts` (lines >4200), plus every
   lazy route in `client/src/App.tsx` reports
   `LazyExoticComponent not assignable to () => Element` (14 on baseline; the new
   `/partner` route adds a 15th instance of the same pattern). These are
   type-only and do not affect the Vite build (`vite build` passes) or runtime.
   Not introduced by this sprint.

3. **Pre-existing calendar-drift test failures.** 3 of the 5 known drift tests
   fail today (`backfillAnalytics.test.ts:1101`, `historicalEdgeCases.test.ts:107`,
   `import.test.ts:260`) — they hardcode "X years ago" baselines that decay with
   the calendar. Listed in CLAUDE.md as pre-existing. All 18 new sprint tests pass;
   690 total pass.

## UX / product (touched areas)

4. **Mobile bottom-nav crowding is now more acute (BACKLOG #5).** The participant
   nav went from 7 to 8 items with the new "Partner" tab. The headline feature
   needs to be reachable from every screen, so it earns a slot, but at ~380px the
   row is tight. Post-pilot: move a lower-priority item (e.g. "Met Age" or
   "Reports") into an overflow menu.

5. **Onboarding "first meal" is stored as raw text without macros.** To keep the
   wizard minimal it calls `POST /api/food` with `rawText` only (no AI analysis),
   so the Optimization Partner's macro tools don't see protein for that entry
   until the member logs a full meal from the Food tab. The meal *is* captured;
   only its macros are absent. Acceptable for onboarding; a fuller version would
   route the wizard meal through `/api/food/analyze`. Deferred.

## Provisioning / email

6. **No in-app email transport (Twilio/SendGrid are stubs — `alerting.ts:377`).**
   By design for B3, GoHighLevel sends the welcome email; the provisioning webhook
   returns `loginUrl` + `tempPassword` for GHL to merge. But this means the app
   itself still cannot send a password-reset or verification email. Self-service
   password reset remains admin-only. Post-pilot: wire a real transport so the app
   can own recovery emails. (Was already on the PILOT_AUDIT post-pilot list.)

7. **Temp-password delivery depends on GHL template hygiene.** The one-time
   password is returned in the webhook response and must be merged into the GHL
   email over TLS and not logged in GHL. Operational note for whoever wires the
   funnel — see the GHL spec in SPRINT_REPORT.md.

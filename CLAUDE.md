# Metabolic-Tracker — Project Guide for Claude

Metabolic health tracking app used by Dr. Chad Larson with real patients. This is **active production software with PHI**. Treat changes carefully — every deploy affects real users.

## Stack

- **Frontend:** React 19 + TypeScript + Vite, Tailwind, shadcn/ui, TanStack Query, lucide-react, sonner
- **Backend:** Node 20+, Express 5, Passport (scrypt sessions), Drizzle ORM
- **DB:** PostgreSQL — production is Railway; a stale Neon exists locally (see "Local dev" below)
- **External:** OpenAI GPT-4o-mini (meal parsing + coaching), Nutritionix (nutrition lookup), Open Food Facts + USDA (barcode fallbacks), Twilio (SMS), Sentry (errors)
- **Hosting:** Railway, auto-deploys from GitHub `main` → app.doctorchadlarson.com

## Folder structure

- [shared/schema.ts](shared/schema.ts) — Drizzle schema, Zod validators, types. Single source of truth for DB shape.
- [server/routes.ts](server/routes.ts) — All API routes. **Monolithic on purpose** — don't split without discussion.
- [server/storage.ts](server/storage.ts) — DB access layer. All queries go here.
- [server/migrate.ts](server/migrate.ts) — Idempotent incremental migrations that run on every startup. Add new migrations here as `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`.
- [server/auth.ts](server/auth.ts) — Passport + scrypt + bcrypt backward-compat for migrated users.
- [server/middleware/security.ts](server/middleware/security.ts) — Rate limiters, CSP, security headers.
- [server/services/](server/services/) — `mealScore`, `coachingRules`, `promptEngine`, `scheduler`, `nutritionLookup`, `auditLogger`.
- [client/src/pages/](client/src/pages/) — Dashboard, FoodLog, Trends, Reports, Participants, PromptsAdmin, AIReports, Messages, MetabolicAge.
- [client/src/lib/api.ts](client/src/lib/api.ts) — Typed fetch wrapper. **All frontend API calls go through this class.**

## Must-follow conventions

- **DB columns:** `snake_case` in Postgres, `camelCase` in Drizzle (e.g., `program_start_date` ↔ `programStartDate`). Never introduce a schema field without respecting this.
- **Primary keys:** `varchar` UUID via `gen_random_uuid()`. **Never `serial`/`integer`.**
- **Foreign keys:** `.references(() => parent.id, { onDelete: "cascade" })` unless there's a specific reason not to.
- **Routes:** add to [server/routes.ts](server/routes.ts) directly — don't split files.
- **DB queries:** add methods to `storage` in [server/storage.ts](server/storage.ts) — don't import `db` into route handlers.
- **Macros in UI:** always wrap in `Math.round()` — raw floats look ugly (fixed across multiple components).
- **Modals:** shadcn `Dialog` pattern (see [BarcodeScannerModal.tsx](client/src/components/BarcodeScannerModal.tsx) / [RecipeBuilderModal.tsx](client/src/components/RecipeBuilderModal.tsx)).
- **Migrations:** schema changes need a matching idempotent `ALTER TABLE` in `runIncrementalMigrations()`. Drizzle Kit migration files exist in `migrations/` but **aren't used** — `runIncrementalMigrations` is the deploy path.

## Auth

- Login uses **email**, not username. Admin: `drchad@theadaptlab.com`.
- Sessions: 8 hours with rolling refresh (extended from 30 min for UX).
- Migrated users have bcrypt hashes (`$2a/$2b/$2y$`) — the auth layer auto-detects and auto-upgrades to scrypt on successful login.
- Password hash format: `{scrypt_hex}.{salt}`.
- Admin password-reset pattern is in the handoff doc if needed.

## Deployment

- Push to `main` → Railway auto-deploys. No staging.
- `runMigrations()` runs on every boot — **must stay idempotent**.
- Railway session cookie: Secure + SameSite=Lax + HttpOnly.
- CSP allowlist is in [server/middleware/security.ts](server/middleware/security.ts) — includes Google Fonts + Sentry ingest.

## Local dev

- `npm run dev` → port 5000.
- **macOS AirPlay Receiver squats on port 5000.** Disable in System Settings → General → AirDrop & Handoff.
- Local `.env` `DATABASE_URL` points at a **stale Neon DB from Replit days**, not Railway prod. It has **real migrated patient PHI** — clean-up pending. Fresh test password reset for local testing: `LocalDev2026!` on `admin@example.com` and `larson817@gmail.com`.
- Schema drift: the Neon DB was behind prod by several columns and two tables. Fixed in `runIncrementalMigrations()` with idempotent ADD COLUMN / CREATE TABLE IF NOT EXISTS — safe no-op on Railway.

## Known pre-existing issues (don't chase these)

- [server/routes.ts](server/routes.ts) has a few TS errors flagged by `npm run check`: `ChatCompletionMessageToolCall.function` access and `metric.value_json` property access. These predate current work and don't affect runtime.
- [server/replit_integrations/](server/replit_integrations/) is leftover Replit code — Railway is prod now. Folder can be deleted.
- Untracked `migrations/0001_curved_captain_midlands.sql` + `migrations/meta/` are Drizzle Kit-generated files that aren't used (we use `runIncrementalMigrations` instead).

## Prompt engine (wired this session)

- [server/services/promptEngine.ts](server/services/promptEngine.ts) — evaluates rules from [server/services/coachingRules.ts](server/services/coachingRules.ts) and stores deliveries in `prompt_deliveries`.
- **Event hook:** [server/routes.ts](server/routes.ts) `POST /api/metrics` fires `promptEngine.onMetricLogged()` fire-and-forget after insert.
- **Hourly tick:** [server/services/scheduler.ts](server/services/scheduler.ts) uses `node-cron` at minute 0 each hour to call `processScheduledPrompts()`. Started after HTTP listen, stopped on SIGTERM/SIGINT.
- **Timezone:** `evaluateSchedule()` computes local hour/day in the user's `timezone` (defaults to `America/Los_Angeles`) via `Intl.DateTimeFormat`. Rule `hour=8` fires at 8 AM local, not UTC.
- **Inbox API:** `GET /api/prompts/inbox` and `POST /api/prompts/inbox/:id/opened`. No UI badge yet — next session.
- **Delivery snapshot:** `deliverPrompt()` stores rendered message in `triggerContextJson.renderedMessage` at fire time so inbox shows what was generated, not a re-render.

## Testing / typecheck

- `npm run check` — TypeScript. Three known error clusters listed above; anything else was likely introduced.
- `npm test` — Vitest. 434+ tests at last count.
- No watch mode on `npm run dev` — restart the server after server-side edits.

## Things worth knowing about the business

- Brand colors: `#004aad` (blue), `#fa7921` (orange), `#dcf0fa` (light blue). **Never teal** — that was a prior AI hallucination Dr. Larson corrected.
- HIPAA: PHI encryption in storage, audit logging on PHI access, session security all implemented. Never log raw PHI — [server/index.ts](server/index.ts) has `sanitizeForLogging()`.
- Users include 15 real migrated patients (from JawsDB) + seeded test accounts.

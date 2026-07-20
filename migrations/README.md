# ⚠️ These files are NOT the deploy path — do not run `drizzle-kit migrate`

This directory is **stale historical output** from Drizzle Kit. It is kept for
reference only.

## The actual deploy path

Schema changes are applied by **`runMigrations()` in [`server/migrate.ts`](../server/migrate.ts)**,
which runs on every application boot:

- **Empty database** → runs the inlined bootstrap SQL, then `runIncrementalMigrations()`.
- **Existing database** → runs `runIncrementalMigrations()` only.

Every statement in that path is idempotent (`ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, guarded `DO $$ … $$` blocks).

## Why you must not run `drizzle-kit migrate`

The journal here (`meta/_journal.json`) has **two entries** (Feb and Mar 2026),
while the real schema has evolved well past that inside `runIncrementalMigrations()`.
The journal does not describe the current database.

Running `drizzle-kit migrate` would try to replay `0000_perpetual_pestilence.sql` —
a full `CREATE TABLE` script — against a populated production database holding PHI.

Likewise, **`drizzle-kit push` is no longer part of the boot sequence.** It used to
run as `push --force` on every production start, which:

- silently reconciled the live database to `shared/schema.ts` with no review, and
- was **not actually non-interactive** — on a data-loss decision it prompts and
  blocks on stdin *even with `--force`* (measured: hung indefinitely), which in the
  start script would have hung the boot and taken the app down.

## Adding a schema change

1. Update [`shared/schema.ts`](../shared/schema.ts).
2. Add a matching **idempotent** statement to `runIncrementalMigrations()` in
   [`server/migrate.ts`](../server/migrate.ts).

Step 2 is mandatory, not optional. `push --force` used to paper over a missing
migration; it no longer does, so an omission will surface as a real failure.
(That safety net previously hid two genuine gaps — `food_entries.parent_meal_id`
and `item_name` existed in production purely as a side effect of `push`.)

## Destructive migrations

They never run automatically. A destructive step is gated behind
`ALLOW_DESTRUCTIVE_MIGRATIONS=true` and is skipped with a loud warning otherwise.
Set it for a single deliberate deploy, then unset it.

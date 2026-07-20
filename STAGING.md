# Staging and deploy runbook

Goal: stop pushing straight to production. Every change lands on staging first,
runs its migrations against a throwaway staging database, and only reaches the
production PHI database through a reviewed promotion. This is change control, and
it is a prerequisite for holding patient data under a BAA.

Promotion model: branch-based via PR (decided 2026-06-24).

```
   feature branch ──▶ main ──(auto-deploy)──▶ STAGING env  ──▶ staging Postgres (synthetic)
                       │
                       └──(PR: main → production)──▶ PRODUCTION env ──▶ prod Postgres (PHI)
```

- `main` auto-deploys to staging. Migrations run against the staging DB here.
- `production` branch deploys to prod. You promote by merging `main` into
  `production` through a pull request, which gives a reviewable diff and a git
  audit trail of every production change.

---

## One-time setup

### 1. Railway: create the staging environment

In the Railway project:

1. Create a new environment named `staging` (fork it from production so it copies
   the service config and variables).
2. Give staging its OWN Postgres. Do not point it at the production database and do
   not copy production data into it. Staging data is synthetic or empty. This is
   non-negotiable: staging must never contain real PHI.
3. Confirm the staging app service's `DATABASE_URL` resolves to the staging
   Postgres, not prod. This is the most common setup mistake, verify it explicitly.
4. Set the staging app service to deploy from the `main` branch.
5. Set the production app service to deploy from the `production` branch (see step 3
   below to create it).

### 2. Railway: environment variables

- Each environment gets its own secrets. Staging should use separate, lower-stakes
  credentials for every external service (OpenAI/Nutritionix/email/SMS/etc.) so a
  staging run can never touch production data, send real patient messages, or burn
  prod quotas.
- `NODE_ENV`: production code paths key off `NODE_ENV === "production"` (including
  the boot migration's admin-account creation and test-account deactivation). Set
  staging's `NODE_ENV` deliberately. Recommended: run staging as `production` so it
  exercises the real boot path, but with the staging DB and staging secrets, so the
  prod-only migration logic gets tested before it reaches prod.

### 3. Git: create the production branch

From an up-to-date `main`:

```
git fetch origin
git branch production origin/main
git push -u origin production
```

Then point Railway's production environment at `production` (step 1.5 above).

---

## Daily workflow

1. Branch off `main`, do the work, open a PR into `main` as usual.
2. Merge to `main`. Railway auto-deploys to staging.
3. Verify on staging: app boots, the smoke test passes (`npm run smoke` against
   staging), and any new migration applied cleanly to the staging DB. Check the
   staging deploy logs for migration output and errors.
4. Promote: open a PR from `main` into `production`. Review the diff (this is your
   change-control gate). Merge it. Railway auto-deploys to prod.
5. Watch the production deploy logs through boot and the first requests.

Rule: nothing reaches `production` without passing through staging first.

---

## Migration safety (the open work item)

The current boot path has two migration mechanisms, and one of them is dangerous:

1. `package.json` start script: `drizzle-kit push --force && ... node dist/index.cjs`.
   `push --force` makes the live DB match `shared/schema.ts` on EVERY boot, with no
   confirmation. If `schema.ts` ever drifts from the database, this can silently
   drop columns or tables. Drizzle's docs say `push` is for prototyping and
   `migrate` for production. This is the top risk to the PHI database.
2. `server/migrate.ts` `runMigrations()`: a hand-rolled idempotent runner. Mostly
   safe, but contains guarded destructive operations (a `DROP COLUMN` on
   `glucose_context`, a `DROP TABLE meal_feel_states`) and logs a generated admin
   password to stdout (which lands in Railway logs).

Plan, to be done ON STAGING once it exists (do not attempt blind against prod):

- [ ] Reconcile the migration state: the `migrations/` Drizzle journal is stale;
      the real schema evolution lives in `runMigrations()` + `push`. Decide on one
      source of truth.
- [ ] Replace `drizzle-kit push --force` on prod boot with generated migrations +
      `drizzle-kit migrate` (forward-only, applies pending migrations from a
      journal, never drops unexpectedly). Test the full boot on staging first.
- [ ] Make every destructive step explicit and gated (e.g. behind a one-time,
      manually-set env flag), never automatic on boot.
- [ ] Stop logging the admin password; set it via a secret or a one-time reset flow.
- [ ] Keep all boot migrations non-destructive by default.

Until that lands, the staging environment is the safety net: `push --force` runs on
staging first, so a destructive diff shows up against the synthetic staging DB
instead of patient data.

---

## Rollback

- Production runs from the `production` branch. To roll back, revert the promotion
  merge on `production` (or re-point to the last good commit) and let Railway
  redeploy. Railway also keeps prior deployments you can redeploy from the
  dashboard.
- Because migrations run on boot, a rollback of code does not automatically reverse
  a schema change. This is the second reason to make migrations forward-only and
  non-destructive: a code rollback must remain safe against the already-migrated DB.

---

## Pre-PHI checklist tie-in

This runbook satisfies the "infrastructure and change control" section of
`AIS-OS/references/metabolic-os-pilot-compliance-checklist.md`. The staging gate and
the migration-safety fix are both required before any real patient is enrolled.

# PILOT_RUNBOOK.md — GLP-1 Founding Member Pilot

Operational runbook for the pilot. Verification steps to run right after the
Railway deploy, the weekly ops command, and the manual procedures for the things
the app can't do by itself yet.

**Conventions used below**
- `APP` = production base URL, e.g. `https://app.doctorchadlarson.com`.
- `PROD_DATABASE_URL` = the production Postgres connection string (Railway →
  Postgres → Connect, or the Neon prod string). **Read-only intent** except where
  a step explicitly creates/deletes a disposable test member.
- Admin credentials = the prod admin account (`drchad@theadaptlab.com`).
- Everything is copy-pasteable `bash` + `curl` + `psql`. `psql` and `tsx`
  (via `npx`) are the only tools required.

> Cross-refs: webhook contract lives in `SPRINT_REPORT.md`; launch sequencing in
> `LAUNCH_CHECKLIST.md`; parked/limitations in `SPRINT_NOTES.md`.

---

# Post-Deploy Verification

Run these in order immediately after `main` deploys to Railway. Stop and
investigate on any failure before proceeding.

## 1. Environment variable checklist

Set in Railway → the app service → Variables:

| Var | Required for | If missing |
|---|---|---|
| `GHL_WEBHOOK_SECRET` | provisioning webhook | webhook returns **503**; no members can be created via GHL |
| `APP_BASE_URL` | login link in webhook response | falls back to `https://app.doctorchadlarson.com` |
| `ANTHROPIC_API_KEY` | **the Optimization Partner** (BAA-gated) | Partner returns a friendly **503**; everything else works |
| `ENABLE_PUBLIC_SIGNUP` | must stay **unset / not "true"** | if "true", public signup opens (do NOT set for pilot) |

**What works without `ANTHROPIC_API_KEY`:** login, onboarding wizard, all
manual logging (metrics, food, measurements), dashboard, trends, provisioning,
GHL webhook. **What 503s without it:** the Optimization Partner chat only. So you
can complete Phases 1–4 and provision members before the BAA key lands; the
Partner simply stays dark until 0.3 is done.

Quick sanity check that the app is up and auth-gated:
```bash
APP=https://app.doctorchadlarson.com
curl -s -o /dev/null -w "config(expect 401): %{http_code}\n" "$APP/api/config"
```

## 2. B0 production abuse query — did any account ever self-elevate?

The pre-sprint signup endpoint trusted the request body, so in theory someone who
knew the URL could have registered as admin/coach. Confirm that never happened in
prod. **Read-only.**

```bash
psql "$PROD_DATABASE_URL" <<'SQL'
-- (a) Any non-participant account. Cross-check each against known staff you
-- provisioned yourself (drchad admin, any coaches). Anything you don't recognize
-- is suspect.
SELECT id, email, role, created_at
FROM users
WHERE role <> 'participant'
ORDER BY created_at DESC;

-- (b) Signups log a LOGIN_SUCCESS on the new user at creation. An elevated role
-- here on an account you did NOT provision is the red flag.
SELECT timestamp, user_id, user_role
FROM audit_logs
WHERE action = 'LOGIN_SUCCESS' AND user_role <> 'participant'
ORDER BY timestamp DESC;
SQL
```

**Interpret:**
- **Clean** = query (a) returns only staff accounts you recognize (the admin +
  any coaches you created), and (b) shows elevated logins only for those same
  known accounts. → check **1.2** done.
- **Needs investigation** = any unfamiliar admin/coach email, or an elevated
  `LOGIN_SUCCESS` for a user id that isn't known staff. → **STOP.** Do not launch.
  Disable that account immediately (set `status='inactive'`, see procedure 3.3),
  rotate the admin password, and review that user's `audit_logs` for data access
  before continuing.

## 3. Public signup gate check

Confirm the escalation surface is closed in prod (should be **404**):
```bash
APP=https://app.doctorchadlarson.com
curl -s -o /dev/null -w "signup(expect 404): %{http_code}\n" \
  -X POST "$APP/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"gatecheck@example.com","name":"Gate Check","passwordHash":"Abc12345!x","role":"admin"}'
```
`404` = gated (correct). `200` = `ENABLE_PUBLIC_SIGNUP` is set to "true" in prod —
**unset it and redeploy** before doing anything else.

## 4. Provisioning smoke test (creates + deletes a disposable member)

Proves the GHL webhook path works end to end. Uses a throwaway email you control.

```bash
APP=https://app.doctorchadlarson.com
SECRET='<value of GHL_WEBHOOK_SECRET>'
TESTEMAIL="provision-smoke+$(date +%s)@<your-domain>.com"   # an inbox you can open

# 4a. Provision (expect 201 with loginUrl + tempPassword)
curl -s -X POST "$APP/api/webhooks/ghl/provision" \
  -H 'Content-Type: application/json' \
  -H "x-ghl-secret: $SECRET" \
  -d "{\"email\":\"$TESTEMAIL\",\"name\":\"Provision Smoke\",\"planTag\":\"smoke-test\"}"
echo
# 4b. Bad secret must be rejected (expect 401)
curl -s -o /dev/null -w "bad-secret(expect 401): %{http_code}\n" \
  -X POST "$APP/api/webhooks/ghl/provision" \
  -H 'Content-Type: application/json' -H "x-ghl-secret: wrong" \
  -d "{\"email\":\"x@x.com\",\"name\":\"x\"}"
```

- Confirm the **201** JSON has `status:"created"`, a `loginUrl`, and a
  `tempPassword`.
- If GHL is already wired (Phase 2.3): confirm the **welcome email actually
  arrives** at `$TESTEMAIL` with the login link. If you're testing the app in
  isolation before GHL, the 201 response body is the proof; email delivery is a
  GHL responsibility (the app returns the credentials for GHL to send).

**Cleanup (required — removes the disposable member and its data):**
```bash
psql "$PROD_DATABASE_URL" \
  -c "DELETE FROM users WHERE email = '<the $TESTEMAIL you used>';"
```
(Foreign keys cascade, so the user's metrics/food/etc. are removed with the row.)

## 5. Six-query acceptance test (run once the HIPAA key is set — 0.3 / 5.1)

Runs the six promised Partner queries against **production** as a seeded,
clearly-labeled disposable participant, then deletes it. Requires
`ANTHROPIC_API_KEY` to be live (otherwise the Partner 503s — that's expected until
0.3).

Save as `runbook-acceptance.sh`, edit the top vars, run `bash runbook-acceptance.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
APP="https://app.doctorchadlarson.com"
ADMIN_EMAIL="drchad@theadaptlab.com"
ADMIN_PASS='<admin password>'
SECRET='<GHL_WEBHOOK_SECRET>'
TESTEMAIL="acceptance+$(date +%s)@<your-domain>.com"
NEWPASS='AcceptTest2026!x'
ADMIN_JAR=$(mktemp); MEM_JAR=$(mktemp)

echo "== provision disposable member =="
PROV=$(curl -s -X POST "$APP/api/webhooks/ghl/provision" -H 'Content-Type: application/json' \
  -H "x-ghl-secret: $SECRET" -d "{\"email\":\"$TESTEMAIL\",\"name\":\"Acceptance Test\"}")
TMP=$(echo "$PROV" | python3 -c "import sys,json;print(json.load(sys.stdin)['tempPassword'])")

echo "== member logs in + clears forced reset =="
curl -s -c "$MEM_JAR" -X POST "$APP/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TESTEMAIL\",\"password\":\"$TMP\"}" -o /dev/null
curl -s -b "$MEM_JAR" -X POST "$APP/api/auth/change-password" -H 'Content-Type: application/json' \
  -d "{\"newPassword\":\"$NEWPASS\"}" -o /dev/null

echo "== admin logs in + sets a protein target =="
curl -s -c "$ADMIN_JAR" -X POST "$APP/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" -o /dev/null
MID=$(echo "$PROV" | python3 -c "import sys,json;print(json.load(sys.stdin)['userId'])")
curl -s -b "$ADMIN_JAR" -X PUT "$APP/api/admin/participants/$MID/macro-targets" \
  -H 'Content-Type: application/json' \
  -d '{"calories":1600,"proteinG":140,"carbsG":40,"fatG":70}' -o /dev/null

echo "== seed ~3 weeks of metrics + 14 days of protein meals (as the member) =="
python3 - "$APP" "$MEM_JAR" <<'PY'
import subprocess, json, sys, datetime
APP, JAR = sys.argv[1], sys.argv[2]
def post(path, body):
    subprocess.run(["curl","-s","-b",JAR,"-X","POST",f"{APP}{path}",
        "-H","Content-Type: application/json","-d",json.dumps(body),"-o","/dev/null"])
today = datetime.date.today()
for i in range(24,-1,-1):
    d=(today-datetime.timedelta(days=i)).isoformat()
    post("/api/metrics",{"type":"WEIGHT","valueJson":{"value":round(212-(24-i)*0.30,1)},"rawUnit":"lbs","timestamp":d})
    post("/api/metrics",{"type":"WAIST","valueJson":{"value":round(40-(24-i)*0.06,1)},"rawUnit":"in","timestamp":d})
    if i%2==0:
        post("/api/metrics",{"type":"GLUCOSE","valueJson":{"value":95+(i%5)},"rawUnit":"mg/dL","timestamp":d,"glucoseContext":"fasting"})
        post("/api/metrics",{"type":"KETONES","valueJson":{"value":round(0.6+(i%3)*0.2,1)},"rawUnit":"mmol/L","timestamp":d})
        post("/api/metrics",{"type":"BP","valueJson":{"systolic":124-(24-i)//8,"diastolic":80},"rawUnit":"mmHg","timestamp":d})
for i in range(13,-1,-1):
    ts=today-datetime.timedelta(days=i)
    for mt,hr,txt,p,c,f,cal in [("Breakfast",8,"3 eggs and spinach",21,4,15,230),("Lunch",13,"grilled chicken salad",40,10,18,380),("Dinner",19,"salmon and broccoli",38,12,22,430)]:
        iso=datetime.datetime(ts.year,ts.month,ts.day,hr).isoformat()
        post("/api/food",{"inputType":"text","mealType":mt,"rawText":txt,"timestamp":iso,
            "aiOutputJson":{"macros":{"protein":p,"carbs":c,"netCarbs":c,"fat":f,"calories":cal}}})
print("seeded")
PY

echo "== the six promised queries =="
ask () {
  curl -s -b "$MEM_JAR" -X POST "$APP/api/assistant/chat" -H 'Content-Type: application/json' \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$1")}]}" \
    | python3 -c "import sys,json;r=json.load(sys.stdin);print(r.get('response','<<ERROR: '+json.dumps(r)+'>>')[:600])"
  echo; echo "----"
}
for Q in \
  "Is my protein high enough this week?" \
  "Am I losing muscle?" \
  "What should I eat before the gym?" \
  "Based on my baseline, what should I focus on this week?" \
  "How did my first week look, and what's the one thing I should change next week?" \
  "Summarize my first month and tell me what to focus on in month 2." ; do
  echo ">> $Q"; ask "$Q"
done

echo "== CLEANUP: delete the disposable member =="
PGURL='<PROD_DATABASE_URL>'
psql "$PGURL" -c "DELETE FROM users WHERE email = '$TESTEMAIL';"
rm -f "$ADMIN_JAR" "$MEM_JAR"
echo "done — TESTEMAIL was $TESTEMAIL"
```

**Pass criteria (5.1):** all six return specific, data-grounded, persona-consistent
answers; **none returns a 400** (a 400 mentioning the covered-org/feature policy
means the HIPAA-enabled key/feature enforcement isn't configured — resolve with
Anthropic before launch). Query 3 ("what should I eat before the gym?") must give
practical guidance, not a refusal. If any query 503s, the `ANTHROPIC_API_KEY`
isn't live yet (0.3 not done).

---

# Weekly Ops

## Member activity export (feeds GHL re-engagement — checklist 4.4 / 6.4)

Read-only. Produces the CSV you import into GHL by hand. Run against **prod**:

```bash
DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/export-member-activity.ts \
  > member-activity-$(date +%F).csv
```

- Columns: `email, last_log_date, days_since_last_log, logs_last_7_days, member_since`.
- Scope: **active participant accounts only.** Admin/coach and known test/owner
  accounts (`@example.com`, `@dev.local`, `larson817@gmail.com`) are excluded. To
  exclude more test accounts, edit `EXCLUDE_EMAILS` / `EXCLUDE_DOMAINS` at the top
  of `scripts/export-member-activity.ts`.
- A member who has never logged shows an empty `last_log_date` and
  `days_since_last_log` counted from their signup date, so they still surface to
  the 5-day-inactivity trigger.
- Dates are UTC.
- Import into GHL, match on `email`, and let the re-engagement sequence trigger on
  `days_since_last_log >= 5`. **No app-side push exists by design** — this CSV is
  the only integration point.

---

# Operational Procedures

Each is designed to take under 5 minutes.

## 3.1 Manual password reset (no self-service reset exists)

A member is locked out. Reset via the admin API.

```bash
APP=https://app.doctorchadlarson.com
ADMIN_JAR=$(mktemp)
# 1. Log in as admin
curl -s -c "$ADMIN_JAR" -X POST "$APP/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"drchad@theadaptlab.com","password":"<admin password>"}' -o /dev/null
# 2. Find the member's id
curl -s -b "$ADMIN_JAR" "$APP/api/admin/participants" \
  | python3 -c "import sys,json;[print(u['id'],u['email']) for u in json.load(sys.stdin) if '<member email>' in u['email']]"
# 3. Reset to a temp password + force change on next login
curl -s -b "$ADMIN_JAR" -X POST "$APP/api/admin/participants/<MEMBER_ID>/reset-password" \
  -H 'Content-Type: application/json' \
  -d '{"password":"<Temp-Pass-2026!>","forcePasswordReset":true}'
rm -f "$ADMIN_JAR"
```
Send the member the temp password (however you normally reach them). They'll be
forced to set a new one on next login. It does **not** re-trigger onboarding
(that flag is separate).

## 3.2 Manual provisioning fallback (GHL webhook failed for a paid member)

A purchase succeeded but no account was created (webhook down, bad secret, GHL
mis-fire). Create the member by hand with the same result as the webhook.

**Option A — call the webhook yourself** (simplest; identical result incl.
onboarding + forced reset). Run the smoke-test curl from §4 with the real member's
email/name and **omit the cleanup**. Give them the returned `tempPassword` +
`loginUrl`.

**Option B — admin API** (if the webhook is fully down). This creates the account
but note two differences to correct:
```bash
APP=https://app.doctorchadlarson.com ; ADMIN_JAR=$(mktemp)
curl -s -c "$ADMIN_JAR" -X POST "$APP/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"drchad@theadaptlab.com","password":"<admin password>"}' -o /dev/null
curl -s -b "$ADMIN_JAR" -X POST "$APP/api/admin/participants" -H 'Content-Type: application/json' \
  -d '{"name":"<Member Name>","email":"<member@email>","password":"<Temp-Pass-2026!>","forcePasswordReset":true}'
rm -f "$ADMIN_JAR"
```
Then manually deliver the temp password + `https://app.doctorchadlarson.com/login`.
**Caveat:** the admin-create path sets `onboarding_complete = true` (default), so
this member will **skip the onboarding wizard**. If you want them to see it, flip
the flag once:
```bash
psql "$PROD_DATABASE_URL" \
  -c "UPDATE users SET onboarding_complete = false WHERE email = '<member@email>';"
```
Prefer Option A whenever the webhook is reachable — it handles all of this.

## 3.3 Member deletion / refund cleanup (week-1 refund)

There is **no delete endpoint in the app** — deletion is a direct DB operation.
Two levels:

**Soft (reversible, immediate — blocks login, keeps data):** set the account
inactive. Use this first if you might reinstate them.
```bash
APP=https://app.doctorchadlarson.com ; ADMIN_JAR=$(mktemp)
curl -s -c "$ADMIN_JAR" -X POST "$APP/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"drchad@theadaptlab.com","password":"<admin password>"}' -o /dev/null
# find id, then:
curl -s -b "$ADMIN_JAR" -X PATCH "$APP/api/admin/participants/<MEMBER_ID>" \
  -H 'Content-Type: application/json' -d '{"status":"inactive"}'
rm -f "$ADMIN_JAR"
```
Inactive users are rejected at session-deserialize, so they can no longer log in.
They're also excluded from the weekly activity export.

**Hard (irreversible — removes account + all their data):** direct DB delete.
Foreign keys cascade, so this also removes their metrics, food, messages, prompt
deliveries, etc.
```bash
psql "$PROD_DATABASE_URL" -c "DELETE FROM users WHERE email = '<member@email>';"
```

**External steps (outside the repo — must be done manually):**
1. **Stripe:** cancel the subscription and issue the refund (Stripe Dashboard →
   Customers → the member → Cancel subscription + Refund payment). The app does
   not touch Stripe.
2. **GoHighLevel:** remove/deactivate the contact or move them to a `refunded`
   tag so no further sequences fire; cancel any scheduled SMS/emails.
3. **Device kit:** if a kit shipped, handle return/write-off per your policy.
4. Confirm the **cancellation notification** (checklist 2.5) fired to Chad's inbox.

## 3.4 Incident quick-reference

| Symptom | Most likely cause | First diagnostic step |
|---|---|---|
| **Partner replies "temporarily unavailable" / 503** on `/api/assistant/chat` | `ANTHROPIC_API_KEY` missing, invalid, or the org isn't HIPAA-enabled (feature enforcement returns an API error) | In Railway, confirm `ANTHROPIC_API_KEY` is set from the **HIPAA-enabled** org. Check the app logs for the line `Participant assistant error:` — a `RateLimitError` (429) is transient; an `APIError` (502) points at the key/org; a bare 503 means the key is absent. Re-run §5 after fixing. |
| **Provisioning webhook returns 401/403** for a real GHL call | `GHL_WEBHOOK_SECRET` mismatch between Railway and the GHL request header, or GHL isn't sending `x-ghl-secret` / `Authorization: Bearer` | Compare the Railway `GHL_WEBHOOK_SECRET` to the secret configured in the GHL webhook action's header. Reproduce with the §4 curl using the Railway value — 201 there but 401 from GHL = GHL header is wrong. (A **503** here instead means the secret env var is unset in Railway.) Meanwhile provision affected members with procedure 3.2. |
| **Broad 500s / "connect ECONNREFUSED" / DB timeouts** in logs | Postgres connection pool exhausted or the DB is unreachable | Check Railway Postgres health/metrics and current connection count vs. the plan limit. Restart the app service to reset the pool. If it recurs, look for a stuck long-running query and confirm no extra process (e.g. a lingering `tsx` script from this runbook) is holding connections — always let runbook scripts finish so `pool.end()` runs. |

---

## Appendix — local dry run

Every verification command above works against a local instance too (swap `APP`
for `http://localhost:5000` and `PROD_DATABASE_URL` for your local `DATABASE_URL`).
Recommended: dry-run §4 and §5 locally before running them against prod. The unit
tests behind these paths:
```bash
npx vitest run server/utils/accountSecurity.test.ts server/services/participantAssistant.test.ts
```

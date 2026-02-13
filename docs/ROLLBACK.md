# Rollback Procedures

Procedures for rolling back to a previous known-good state when a deployment causes issues.

---

## Decision Framework

### When to Rollback

**DO rollback when:**
- Application is down and fix isn't immediately obvious
- Error rate >10% after deployment
- Critical feature completely broken
- Users cannot log in
- Data corruption occurring

**DON'T rollback when:**
- Issue is minor and workaround exists
- Fix is simple and can deploy quickly (<15 min)
- Rollback would lose important data
- Issue existed before this deployment

### Decision Timeline

| Time Since Deploy | Action |
|-------------------|--------|
| 0-15 min | Attempt quick fix if obvious |
| 15-30 min | Decide: fix or rollback |
| 30+ min | Strongly consider rollback if not fixed |

---

## Application Rollback

### Prerequisites

- Previous working version identified
- Access to deployment system
- Database state compatible with previous version

### Procedure

#### Step 1: Identify Previous Version

```bash
# List recent deployments/commits
git log --oneline -10

# Identify last known good version
# Look for version tag or commit before issues started
git log --oneline --until="2024-01-14"
```

#### Step 2: Announce Rollback

Post in #incidents:
```
:rewind: ROLLBACK INITIATED
Target Version: [version/commit]
Reason: [brief reason]
ETA: [estimated time]
```

#### Step 3: Execute Rollback

**Option A: Git-based Rollback**
```bash
# Checkout previous version
git checkout [commit-hash]

# Or revert the problematic commit
git revert [bad-commit-hash] --no-edit

# Build
npm run build

# Deploy
npm run deploy
```

**Option B: Deploy Previous Artifact**

If using CI/CD with saved artifacts:
1. Go to deployment platform
2. Find previous successful deployment
3. Click "Redeploy" or equivalent

**Option C: Revert via Hosting Platform**

For Replit/Vercel/similar:
1. Go to deployments list
2. Find previous deployment
3. Click "Redeploy" or "Rollback"

#### Step 4: Verify Rollback

```bash
# Check application health
curl http://localhost:5000/health/ready

# Run synthetic tests
curl -X POST http://localhost:5000/api/admin/synthetic/run

# Check error rates
curl http://localhost:5000/api/admin/errors/metrics
```

#### Step 5: Confirm and Communicate

```
:white_check_mark: ROLLBACK COMPLETE
Rolled back to: [version]
Application status: [healthy/issues]
Next steps: [what happens now]
```

---

## Database Rollback

### When to Rollback Database

**DO rollback when:**
- Schema migration caused data corruption
- Accidentally deleted data
- Bad data import corrupted records

**DON'T rollback when:**
- Issue is application code only
- Can fix with forward migration
- Data changes are desired but have side effects

### Using Neon Point-in-Time Recovery

Neon provides automatic point-in-time recovery up to 24 hours.

#### Step 1: Identify Recovery Point

Determine the timestamp BEFORE the issue occurred.

#### Step 2: Create Recovery Branch

```bash
# Via Neon CLI
neonctl branches create \
  --name recovery-[date] \
  --parent [branch-name] \
  --at "[timestamp]"

# Example:
neonctl branches create \
  --name recovery-2024-01-15 \
  --parent main \
  --at "2024-01-15T10:00:00Z"
```

#### Step 3: Verify Recovered Data

Connect to the recovery branch and verify:
```bash
# Get connection string for recovery branch
neonctl connection-string recovery-2024-01-15

# Connect and verify
psql [recovery-connection-string] -c "SELECT COUNT(*) FROM users"
```

#### Step 4: Switch Application to Recovery Branch

Update `DATABASE_URL` environment variable to point to recovery branch.

#### Step 5: Merge or Replace

**Option A: Replace Main Branch**
```bash
# Delete current main data
neonctl branches delete main --force

# Rename recovery to main
neonctl branches rename recovery-2024-01-15 main
```

**Option B: Copy Data Back**
```bash
# Export from recovery
pg_dump [recovery-url] > recovery.sql

# Import to main (careful - destructive)
psql [main-url] < recovery.sql
```

---

## Partial Rollback (Single Feature)

### When to Use

- Single feature broken but rest of app works
- Feature flag can disable problematic code
- Can deploy targeted fix

### Procedure

#### Step 1: Identify Problematic Code

Review recent commits to identify which change caused the issue.

#### Step 2: Revert Specific Commit

```bash
# Revert single commit
git revert [commit-hash] --no-edit

# Revert range of commits
git revert [older-commit]..[newer-commit] --no-edit
```

#### Step 3: Redeploy

```bash
npm run build
npm run deploy
```

---

## Environment Variable Rollback

### When to Use

- Configuration change caused issues
- Secret rotation broke integration
- Feature flag change caused problems

### Procedure

1. **Identify previous values:**
   - Check deployment logs
   - Check secrets management history
   - Ask team member who made change

2. **Revert values:**
   - Update environment variables
   - Restart application if needed

3. **Verify:**
   - Check affected integration works
   - Check application health

---

## Rollback Verification Checklist

After any rollback, verify:

- [ ] `/health/live` returns 200
- [ ] `/health/ready` returns 200
- [ ] `/health/db` returns 200
- [ ] Users can log in
- [ ] Users can create entries
- [ ] Charts load correctly
- [ ] Error rate back to normal
- [ ] No new errors in Sentry

---

## Rollback Time Targets

| Component | Target Time | Maximum Time |
|-----------|-------------|--------------|
| Application code | 5 minutes | 15 minutes |
| Database (PITR) | 10 minutes | 30 minutes |
| Environment config | 2 minutes | 5 minutes |
| Full restore from backup | 30 minutes | 2 hours |

---

## Post-Rollback Actions

### Immediate

1. Verify application stability
2. Communicate resolution
3. Monitor closely for 1 hour

### Short-term (24 hours)

1. Investigate root cause
2. Fix the issue properly
3. Test fix thoroughly
4. Plan re-deployment

### Documentation

1. Create incident record
2. Document what was rolled back
3. Document root cause
4. Document how to prevent recurrence

---

## Emergency Rollback Script

Save as `scripts/emergency-rollback.sh`:

```bash
#!/bin/bash
# Emergency Rollback Script
# Usage: ./emergency-rollback.sh [commit-hash]

set -e

if [ -z "$1" ]; then
    echo "Usage: ./emergency-rollback.sh [commit-hash]"
    exit 1
fi

TARGET_COMMIT=$1
echo "Rolling back to $TARGET_COMMIT"

# Checkout target version
git fetch origin
git checkout $TARGET_COMMIT

# Build
echo "Building..."
npm run build

# Verify build
if [ $? -ne 0 ]; then
    echo "Build failed! Aborting rollback."
    exit 1
fi

# Deploy (customize for your platform)
echo "Deploying..."
npm run deploy

# Health check
echo "Checking health..."
sleep 10
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/health/ready)

if [ "$HEALTH" == "200" ]; then
    echo "✅ Rollback successful! Application healthy."
else
    echo "⚠️ Rollback completed but health check failed (HTTP $HEALTH)"
    echo "Manual verification required."
fi
```

---

## Troubleshooting Rollback Issues

### Rollback Failed: Database Schema Incompatible

**Symptom:** Application errors after rollback due to schema changes

**Solution:**
1. Check if forward migration is safer
2. If must rollback, also rollback database
3. Consider data migration script

### Rollback Failed: Build Errors

**Symptom:** Cannot build previous version

**Solution:**
1. Check if dependencies changed
2. Try `npm ci` with package-lock from that version
3. If using monorepo, ensure all packages at compatible versions

### Rollback Successful But Issues Persist

**Symptom:** Same errors after rollback

**Solution:**
1. Issue may not be related to deployment
2. Check for external factors (database, services)
3. Expand investigation scope

---

*Remember: A fast rollback that restores service is better than a slow fix that keeps users waiting. You can always deploy a proper fix once the immediate crisis is resolved.*

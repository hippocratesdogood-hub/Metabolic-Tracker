# Incident Response Playbook

Procedures for responding to incidents affecting the Metabolic-Tracker application during the pilot period.

---

## Severity Definitions

### SEV-1: Critical

**Definition:** Application completely unavailable OR data loss/corruption OR security breach

**Examples:**
- Application down for all users
- Database unresponsive
- Data loss or corruption
- Security breach or unauthorized access
- PHI exposure

**Response Time:** Immediate (within 15 minutes)
**Resolution Target:** 2 hours

---

### SEV-2: High

**Definition:** Major feature broken OR significant performance degradation affecting many users

**Examples:**
- Login not working
- Cannot save any data
- Charts/dashboards completely broken
- >50% of users affected by issues
- API errors >10% rate

**Response Time:** 1 hour
**Resolution Target:** 4 hours

---

### SEV-3: Medium

**Definition:** Feature partially broken OR performance issues affecting some users

**Examples:**
- Food photo analysis failing
- Report generation broken
- Individual feature not working
- <50% of users affected
- Performance degradation

**Response Time:** 4 hours
**Resolution Target:** 24 hours

---

### SEV-4: Low

**Definition:** Minor issue OR cosmetic problems OR single user affected

**Examples:**
- UI glitch
- Minor display issues
- Single user having trouble
- Non-critical feature issue

**Response Time:** 24 hours
**Resolution Target:** 3 business days

---

## SEV-1 Response Procedure

### Step 1: Acknowledge (0-5 minutes)

1. **First Responder Actions:**
   - Acknowledge alert in monitoring system
   - Post in #incidents Slack channel:
     ```
     :rotating_light: SEV-1 INCIDENT DECLARED
     Description: [brief description]
     Time Detected: [time]
     Impact: [estimated impact]
     Incident Commander: [your name]
     Status: INVESTIGATING
     ```

2. **Notification:**
   - Page on-call engineer if not already engaged
   - Notify Clinical Lead if health data impacted
   - Notify Executive Sponsor

### Step 2: Assess (5-15 minutes)

1. **Determine scope:**
   ```bash
   # Check application health
   curl http://localhost:5000/health/ready

   # Check database
   curl http://localhost:5000/health/db

   # Check error rates
   curl http://localhost:5000/api/admin/monitoring/dashboard
   ```

2. **Identify affected systems:**
   - Application server
   - Database
   - External services
   - Specific features

3. **Estimate user impact:**
   - How many users affected?
   - What actions are blocked?
   - Is PHI at risk?

### Step 3: Communicate (15-30 minutes)

1. **Internal Communication:**
   - Update #incidents channel every 15 minutes
   - Include: what we know, what we're doing, ETA

2. **User Communication:**
   - Post status update (see templates below)
   - Email affected users if outage >30 minutes
   - Notify coaches to inform participants

### Step 4: Mitigate (ongoing)

1. **If application down:**
   - Check process status, restart if needed
   - Check for deployment issues
   - Check infrastructure (Neon, hosting)
   - Consider rollback if recent deployment

2. **If database issue:**
   - Check Neon dashboard
   - Verify connection strings
   - Check for blocking queries
   - Contact Neon support if needed

3. **If security incident:**
   - Isolate affected systems
   - Preserve logs and evidence
   - Disable compromised accounts
   - Engage security team

### Step 5: Resolve

1. **Verify fix:**
   - Run synthetic tests
   - Manual verification
   - Monitor error rates

2. **Communicate resolution:**
   ```
   :white_check_mark: INCIDENT RESOLVED
   Duration: [X hours Y minutes]
   Root Cause: [brief description]
   Resolution: [what we did]
   Follow-up: Post-incident review scheduled for [date]
   ```

3. **User notification:**
   - Post "All clear" status update
   - Email users if outage was >1 hour

### Step 6: Post-Incident

1. **Within 24 hours:**
   - Create incident record
   - Gather timeline
   - Collect logs and metrics

2. **Within 72 hours:**
   - Post-incident review meeting
   - Draft incident report
   - Identify action items

3. **Document:**
   - Root cause
   - Timeline
   - What went well
   - What could improve
   - Action items with owners

---

## SEV-2 Response Procedure

### Step 1: Acknowledge (0-15 minutes)

1. **Post in #incidents:**
   ```
   :warning: SEV-2 INCIDENT
   Description: [description]
   Impact: [affected feature/users]
   Investigating: [your name]
   ```

2. **Notify:**
   - On-call engineer
   - Team lead

### Step 2: Investigate (15-60 minutes)

1. Check application logs
2. Check error monitoring (Sentry)
3. Check recent deployments
4. Review recent changes

### Step 3: Communicate

- Update #incidents every 30 minutes
- Post status update if user-facing impact
- Notify coaches if affects their participants

### Step 4: Fix

1. Identify root cause
2. Implement fix or workaround
3. Test thoroughly
4. Deploy if needed

### Step 5: Close

1. Verify resolution
2. Post resolution message
3. Update status page
4. Create brief incident record

---

## SEV-3 Response Procedure

### Step 1: Acknowledge (0-4 hours)

1. Create issue in tracker
2. Assign priority
3. Notify relevant team

### Step 2: Investigate

1. Reproduce issue
2. Check logs
3. Identify fix

### Step 3: Resolve (within 24 hours)

1. Implement fix
2. Test
3. Deploy
4. Close issue

---

## SEV-4 Response Procedure

1. Create issue in tracker
2. Prioritize in next sprint
3. Fix when scheduled
4. Notify reporter when resolved

---

## Communication Templates

### Status Update Template

```
METABOLIC-TRACKER STATUS UPDATE
Time: [timestamp]
Status: [Investigating | Identified | Monitoring | Resolved]

Issue: [brief description]
Impact: [what users are experiencing]
Next Update: [time of next update]

Actions: [what we're doing]
Workaround: [if available]
```

### User Email - Outage Notification

```
Subject: Metabolic-Tracker Temporary Service Disruption

Dear Participant,

We are currently experiencing a technical issue that may affect your ability
to use the Metabolic-Tracker app. Our team is actively working to resolve
this as quickly as possible.

What's affected:
[list affected features]

Workaround:
[if available]

We will send another update when the issue is resolved. We apologize for
any inconvenience.

If you have urgent health concerns, please contact your healthcare provider
directly.

Thank you for your patience,
The Metabolic-Tracker Team
```

### User Email - Resolution

```
Subject: Metabolic-Tracker Service Restored

Dear Participant,

The technical issue we reported earlier has been resolved. All features
of the Metabolic-Tracker app are now working normally.

If you were unable to log entries during the outage, you can still add
them now with the correct date and time.

Thank you for your patience. If you notice any ongoing issues, please
contact your coach or email support@metabolic-tracker.app.

Best regards,
The Metabolic-Tracker Team
```

---

## Escalation Matrix

| Incident Type | Primary | Escalate To | Executive |
|---------------|---------|-------------|-----------|
| App Down | On-call Engineer | Tech Lead | CTO |
| Data Loss | On-call Engineer | Tech Lead + Clinical | CTO + Sponsor |
| Security | On-call + Security | Security Lead | CTO + Legal |
| PHI Exposure | Security Lead | Legal + Clinical | CEO |
| Performance | On-call Engineer | Tech Lead | - |
| User Impact | Support | Coach Lead | Clinical Lead |

---

## Key Contacts

| Role | Name | Contact | When to Contact |
|------|------|---------|-----------------|
| On-call Engineer | [Rotation] | oncall@metabolic-tracker.app | Any SEV-1/2 |
| Tech Lead | [Name] | [email] | SEV-1 escalation |
| Clinical Lead | [Name] | [email] | Health data issues |
| Security Lead | [Name] | [email] | Security incidents |
| Executive Sponsor | [Name] | [email] | SEV-1 escalation |
| Neon Support | - | support@neon.tech | Database issues |

---

## Tools & Access

### Monitoring Dashboards

| Tool | URL | Purpose |
|------|-----|---------|
| Health Dashboard | /api/admin/monitoring/dashboard | System status |
| Sentry | sentry.io/metabolic-tracker | Errors |
| Neon Console | console.neon.tech | Database |
| Log aggregator | [URL] | Logs |

### Quick Commands

```bash
# Check all health
curl http://localhost:5000/health/ready | jq

# Check errors
curl http://localhost:5000/api/admin/errors/metrics

# Run synthetic tests
curl -X POST http://localhost:5000/api/admin/synthetic/run

# Recent audit logs
curl http://localhost:5000/api/admin/audit-logs?limit=50

# Create backup
npm run backup create manual
```

---

## Runbook Links

- [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) - Full disaster recovery
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Technical troubleshooting
- [MONITORING.md](MONITORING.md) - Monitoring system details
- [ROLLBACK.md](ROLLBACK.md) - Rollback procedures

---

## Incident Record Template

```markdown
# Incident Report: [Title]

## Summary
- **Date:**
- **Duration:**
- **Severity:**
- **Incident Commander:**

## Impact
- Users affected:
- Data affected:
- Features affected:

## Timeline
| Time | Event |
|------|-------|
| HH:MM | [event] |

## Root Cause
[description]

## Resolution
[what was done]

## Action Items
- [ ] [action] - Owner - Due Date

## Lessons Learned
### What went well
-
### What could improve
-
```

---

## After Hours Protocol

### Who to Page

- SEV-1: Page on-call immediately (phone/SMS)
- SEV-2: Page on-call, they decide urgency
- SEV-3/4: Create ticket, handle next business day

### On-Call Rotation

- Primary on-call: First response responsibility
- Secondary on-call: Backup if primary unavailable
- Rotation schedule: [link to schedule]

### Escalation After Hours

If no response to page within 15 minutes:
1. Page secondary on-call
2. If still no response: contact Tech Lead directly
3. For security: contact Security Lead directly

---

*Remember: When in doubt, escalate. It's better to over-communicate during an incident than to under-communicate.*

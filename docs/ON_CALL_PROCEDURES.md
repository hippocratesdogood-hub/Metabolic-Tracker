# On-Call Procedures for Metabolic-Tracker Pilot

This document defines the on-call procedures, response protocols, and escalation paths for the Metabolic-Tracker pilot phase.

## Table of Contents

1. [Severity Levels](#severity-levels)
2. [Response Time SLAs](#response-time-slas)
3. [Alert Channels](#alert-channels)
4. [Escalation Procedures](#escalation-procedures)
5. [Incident Response Workflow](#incident-response-workflow)
6. [Common Issues & Runbooks](#common-issues--runbooks)
7. [Post-Incident Process](#post-incident-process)
8. [On-Call Rotation](#on-call-rotation)

---

## Severity Levels

### 🚨 CRITICAL (P0)
**Definition**: Data loss, security breach, complete system outage, or authentication failure affecting all users.

**Examples**:
- Database connection failure
- Authentication system down
- Data corruption detected
- Security vulnerability actively exploited
- HIPAA compliance breach

**Response**: Immediate (within 15 minutes)

### ⚠️ HIGH (P1)
**Definition**: Major feature broken for all users, calculation errors affecting health data, or significant performance degradation.

**Examples**:
- Food logging feature completely broken
- Metric calculations returning wrong values
- API response time > 10 seconds
- Error rate spike (3x normal)
- External API (OpenAI) completely unavailable

**Response**: Within 1 hour

### 📢 MEDIUM (P2)
**Definition**: Feature broken for some users, minor data issues, or moderate performance degradation.

**Examples**:
- Validation errors for specific input types
- Slow queries affecting some users
- Non-critical UI component broken
- Import feature failing for specific file formats

**Response**: Within 4 hours (business hours)

### ℹ️ LOW (P3)
**Definition**: Minor issues, cosmetic bugs, or deprecation warnings.

**Examples**:
- UI alignment issues
- Console warnings
- Non-blocking errors
- Feature requests from users

**Response**: Next business day

---

## Response Time SLAs

| Severity | Initial Response | Status Update | Resolution Target |
|----------|-----------------|---------------|-------------------|
| CRITICAL | 15 minutes | Every 30 min | 4 hours |
| HIGH | 1 hour | Every 2 hours | 8 hours |
| MEDIUM | 4 hours | Daily | 48 hours |
| LOW | Next business day | Weekly | Best effort |

---

## Alert Channels

### CRITICAL Alerts
1. **Slack**: #metabolic-alerts-critical (immediate)
2. **SMS/Phone**: Primary on-call (via PagerDuty/Twilio)
3. **Email**: All team leads

### HIGH Alerts
1. **Slack**: #metabolic-alerts (immediate)
2. **Email**: On-call engineer

### MEDIUM/LOW Alerts
1. **Slack**: #metabolic-alerts (batched hourly)
2. **Dashboard**: Sentry dashboard (check daily)

---

## Escalation Procedures

### Escalation Matrix

```
Level 1 (0-30 min): On-call Engineer
    ↓ (if unresolved)
Level 2 (30-60 min): Tech Lead
    ↓ (if unresolved)
Level 3 (1-2 hours): Engineering Manager
    ↓ (if unresolved)
Level 4 (2+ hours): CTO / VP Engineering
```

### When to Escalate

**Escalate to Level 2 if**:
- Issue requires expertise outside your area
- Multiple systems affected
- Unable to identify root cause in 30 minutes
- Customer-facing impact growing

**Escalate to Level 3 if**:
- Potential data loss or security breach
- Media/PR risk
- Extended outage (>1 hour)
- Requires external vendor coordination

**Escalate to Level 4 if**:
- Company-wide impact
- Regulatory/compliance implications
- Major customer escalation
- Prolonged outage (>2 hours)

---

## Incident Response Workflow

### 1. Acknowledge (First 5 minutes)

```
[ ] Acknowledge alert in Slack/PagerDuty
[ ] Join incident channel (auto-created for P0/P1)
[ ] Post initial status: "Investigating: [brief description]"
[ ] Check Sentry dashboard for error details
[ ] Review recent deployments/changes
```

### 2. Assess (5-15 minutes)

```
[ ] Determine severity level
[ ] Identify affected users/systems
[ ] Check if rollback is needed
[ ] Notify stakeholders if customer-facing
[ ] Assign roles (if team response):
    - Incident Commander
    - Tech Lead
    - Communications Lead
```

### 3. Mitigate (Varies by severity)

```
[ ] Implement immediate fix or workaround
[ ] Consider rollback if recent change caused issue
[ ] Enable feature flags to disable problematic feature
[ ] Scale resources if capacity issue
[ ] Coordinate with external vendors if needed
```

### 4. Resolve

```
[ ] Verify fix in production
[ ] Monitor for recurrence (15-30 minutes)
[ ] Update status: "Resolved"
[ ] Schedule post-incident review
```

### 5. Document

```
[ ] Complete incident report
[ ] Create follow-up tickets
[ ] Update runbooks if needed
[ ] Share learnings with team
```

---

## Common Issues & Runbooks

### Database Connection Issues

**Symptoms**: "Pool exhausted", "Connection timeout", API errors

**Quick Checks**:
```bash
# Check database status
heroku pg:info

# Check active connections
heroku pg:ps

# Check for long-running queries
heroku pg:diagnose
```

**Resolution**:
1. Restart application to reset connection pool
2. Kill long-running queries if identified
3. Scale database if persistent

---

### High Error Rate

**Symptoms**: Error rate spike in Sentry, user complaints

**Quick Checks**:
1. Check Sentry for error grouping
2. Check recent deployments
3. Check external service status (OpenAI, etc.)

**Resolution**:
1. If recent deploy: Consider rollback
2. If external service: Enable fallback/graceful degradation
3. If specific feature: Disable via feature flag

---

### Authentication Failures

**Symptoms**: Users can't log in, session errors

**Quick Checks**:
```bash
# Check session store
heroku redis:info

# Check recent auth-related changes
git log --oneline -10 -- server/auth.ts
```

**Resolution**:
1. Clear session store if corrupted
2. Check SESSION_SECRET environment variable
3. Verify CSRF token configuration

---

### OpenAI API Issues

**Symptoms**: Food analysis failing, timeout errors

**Quick Checks**:
1. Check OpenAI status page
2. Check API quota/rate limits
3. Check API key validity

**Resolution**:
1. Enable manual entry fallback
2. Queue requests for retry
3. Contact OpenAI support if API issue

---

### Performance Degradation

**Symptoms**: Slow API responses, timeouts

**Quick Checks**:
```bash
# Check resource usage
heroku ps

# Check database performance
heroku pg:diagnose

# Check for N+1 queries
# Review Sentry performance tab
```

**Resolution**:
1. Scale dynos if CPU-bound
2. Add database indexes for slow queries
3. Implement caching for frequent queries

---

## Post-Incident Process

### Incident Report Template

```markdown
# Incident Report: [Title]

**Date**: YYYY-MM-DD
**Duration**: HH:MM
**Severity**: P0/P1/P2/P3
**Incident Commander**: [Name]

## Summary
Brief description of what happened.

## Timeline
- HH:MM - Alert triggered
- HH:MM - Acknowledged by [name]
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Incident resolved

## Root Cause
Detailed explanation of what caused the incident.

## Impact
- Users affected: N
- Data loss: Yes/No
- Revenue impact: $X

## Resolution
What was done to resolve the issue.

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| [Task] | [Name] | YYYY-MM-DD | Open |

## Lessons Learned
What we learned and how we'll prevent recurrence.
```

### Post-Incident Review Meeting

Schedule within 48 hours of resolution for P0/P1 incidents:

1. **Review timeline** (10 min)
2. **Discuss root cause** (15 min)
3. **Identify improvements** (15 min)
4. **Assign action items** (10 min)
5. **Update runbooks** (10 min)

---

## On-Call Rotation

### Pilot Phase Schedule

During the pilot, on-call is handled by the core team:

| Week | Primary On-Call | Secondary On-Call |
|------|-----------------|-------------------|
| 1 | [Engineer A] | [Engineer B] |
| 2 | [Engineer B] | [Tech Lead] |
| 3 | [Tech Lead] | [Engineer A] |
| Repeat | ... | ... |

### On-Call Responsibilities

**Primary On-Call**:
- Respond to all alerts within SLA
- Initial triage and assessment
- Implement fixes or workarounds
- Escalate when needed

**Secondary On-Call**:
- Backup if primary unavailable
- Assist with complex issues
- Take over if primary needs rest (>4 hours)

### Handoff Process

At the end of each rotation:

1. **Document ongoing issues** in #metabolic-oncall
2. **Brief incoming on-call** on any active incidents
3. **Update Sentry assignments** if needed
4. **Confirm alert routing** is updated

---

## Quick Reference

### Key URLs

| Service | URL |
|---------|-----|
| Sentry Dashboard | https://sentry.io/organizations/[org]/issues/ |
| Application Logs | `heroku logs --tail` |
| Database Dashboard | https://data.heroku.com/datastores/[id] |
| Status Page | https://status.metabolic-tracker.com |

### Environment Variables to Check

```bash
DATABASE_URL
SESSION_SECRET
OPENAI_API_KEY
SENTRY_DSN
SLACK_WEBHOOK_URL
```

### Emergency Contacts

| Role | Contact |
|------|---------|
| Tech Lead | [phone/slack] |
| Engineering Manager | [phone/slack] |
| Security Team | security@company.com |
| Database Admin | [phone/slack] |

---

## Appendix: Alert Configuration

### Sentry Alert Rules

```yaml
# CRITICAL: Any fatal error
- name: critical_errors
  conditions:
    - type: event.level
      value: fatal
  actions:
    - slack: #metabolic-alerts-critical
    - pagerduty: on-call-schedule
  frequency: 5 minutes

# HIGH: Error spike
- name: error_spike
  conditions:
    - type: event.frequency
      value: 10 events in 5 minutes
  actions:
    - slack: #metabolic-alerts
    - email: oncall@company.com
  frequency: 15 minutes

# MEDIUM: New issue
- name: new_issues
  conditions:
    - type: issue.first_seen
  actions:
    - slack: #metabolic-alerts
  frequency: 1 hour
```

### Slack Channel Configuration

| Channel | Purpose | Notification Level |
|---------|---------|-------------------|
| #metabolic-alerts-critical | P0/P1 alerts | All hours |
| #metabolic-alerts | P2/P3 alerts | Business hours |
| #metabolic-oncall | On-call handoff | Business hours |
| #metabolic-incidents | Active incidents | As needed |

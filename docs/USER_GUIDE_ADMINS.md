# Administrator Guide

This guide covers system administration tasks for the Metabolic-Tracker platform.

---

## Admin Dashboard Overview

### Accessing Admin Features

1. Log in with your admin account
2. Click **Admin** in the navigation
3. Access admin-only features

### Dashboard Sections

- **System Health**: Overall system status
- **User Management**: Add/manage users
- **Analytics**: Platform-wide metrics
- **Audit Logs**: Activity tracking
- **Settings**: System configuration

---

## User Management

### Adding a New Participant

1. Go to **Admin > Users > Add Participant**
2. Fill in required information:
   - Email address
   - Name
   - Phone (optional)
   - Date of birth (optional)
3. Assign a coach
4. Click **Create User**
5. System generates a temporary password
6. Send welcome email with credentials

**Bulk Import:**
1. Go to **Admin > Users > Import**
2. Download the CSV template
3. Fill in participant data
4. Upload the completed CSV
5. Review import preview
6. Confirm import
7. Download credentials list for distribution

### Adding a New Coach

1. Go to **Admin > Users > Add User**
2. Select role: **Coach**
3. Enter email and name
4. Click **Create User**
5. Send credentials

### Adding a New Admin

1. Go to **Admin > Users > Add User**
2. Select role: **Admin**
3. Enter email and name
4. Click **Create User**
5. Send credentials securely

### Modifying User Roles

1. Go to **Admin > Users**
2. Find the user
3. Click **Edit**
4. Change role as needed
5. Save changes

**Note:** Role changes are logged in the audit trail.

### Resetting User Passwords

1. Go to **Admin > Users**
2. Find the user
3. Click **Reset Password**
4. System generates temporary password
5. Communicate new password securely
6. User must change on next login

### Deactivating a User

1. Go to **Admin > Users**
2. Find the user
3. Click **Deactivate**
4. Confirm action

**Note:** Deactivated users cannot log in but their data is retained.

### Assigning Coaches to Participants

1. Go to **Admin > Users**
2. Find the participant
3. Click **Assign Coach**
4. Select coach from dropdown
5. Save

**Bulk Assignment:**
1. Go to **Admin > Users > Bulk Actions**
2. Select participants
3. Choose **Assign Coach**
4. Select coach
5. Confirm

---

## Running Reports

### Available Reports

| Report | Description | Frequency |
|--------|-------------|-----------|
| Engagement Summary | DAU, logging rates | Daily |
| Health Outcomes | Metric trends, targets | Weekly |
| Coach Activity | Messages, response times | Weekly |
| System Usage | Feature adoption, errors | Weekly |
| Pilot Progress | KPIs vs targets | Weekly |

### Generating Reports

1. Go to **Admin > Reports**
2. Select report type
3. Choose date range
4. Select filters (coach, participant groups)
5. Click **Generate**
6. Download or view online

### Scheduling Automated Reports

1. Go to **Admin > Reports > Schedule**
2. Select report type
3. Set frequency (daily, weekly)
4. Enter recipient emails
5. Save schedule

---

## Data Import & Export

### Importing Data

**Participant Data Import:**
1. Go to **Admin > Import**
2. Select **Participants**
3. Download template
4. Fill in data following template format
5. Upload CSV
6. Review preview for errors
7. Confirm import

**Historical Health Data Import:**
1. Go to **Admin > Import**
2. Select **Health Metrics**
3. Download template
4. Match user IDs to existing users
5. Upload and validate
6. Confirm import

### Handling Import Errors

**Common errors and solutions:**

| Error | Cause | Solution |
|-------|-------|----------|
| Email already exists | Duplicate user | Remove from import or update existing |
| Invalid date format | Wrong format | Use YYYY-MM-DD format |
| Missing required field | Empty cell | Fill in required data |
| Invalid metric type | Typo | Use: GLUCOSE, WEIGHT, BP, WAIST, KETONES |
| User not found | Wrong ID | Verify user ID exists |

### Exporting Data

**User Data Export (GDPR Compliance):**
1. Go to **Admin > Export**
2. Select user or "All Users"
3. Choose export format (JSON, CSV)
4. Click **Export**
5. Download file

**Full Database Export:**
1. Go to **Admin > Backup**
2. Click **Create Backup**
3. Select backup type (full, incremental)
4. Wait for completion
5. Download or store securely

---

## System Administration

### Viewing System Health

1. Go to **Admin > System**
2. View health indicators:
   - Application status
   - Database connectivity
   - External services
   - Error rates

### Health Endpoints

```
GET /health/live     - Liveness check
GET /health/ready    - Readiness check
GET /health/db       - Database health
GET /health/external - External services
```

### Viewing Audit Logs

1. Go to **Admin > Audit Logs**
2. Filter by:
   - Date range
   - User
   - Action type
   - Resource
3. Export logs as needed

**Audit Events Tracked:**
- Login/logout
- Data creation/modification/deletion
- Role changes
- Password resets
- Data exports
- Admin actions

### Managing Prompts (AI Configuration)

1. Go to **Admin > AI Settings > Prompts**
2. View/edit system prompts for:
   - Food analysis
   - Nutrition estimation
   - Health insights
3. Save changes
4. Test with sample inputs

### Managing Prompt Rules

1. Go to **Admin > AI Settings > Rules**
2. Add rules for specific scenarios:
   - High glucose responses
   - Food category handling
   - Unit conversions
3. Set priority and conditions
4. Save and test

---

## Troubleshooting

### User Cannot Log In

1. Verify user exists and is active
2. Check for multiple failed attempts (lockout)
3. Reset password if needed
4. Check email for typos
5. Verify user received credentials

### Data Not Syncing

1. Check system health dashboard
2. Review error logs
3. Check database connectivity
4. If persisted issue, contact engineering

### Import Failures

1. Download error report
2. Review each error row
3. Fix data in CSV
4. Re-import fixed rows only
5. If format issues, verify against template

### Performance Issues

1. Check **Admin > Performance**
2. Review slow queries
3. Check for unusual traffic
4. Contact engineering if infrastructure issue

### Missing Data

1. Verify user entered data (check audit log)
2. Check for sync issues
3. Review any recent imports
4. If data loss suspected, check backups

---

## Backup & Recovery

### Viewing Backup Status

1. Go to **Admin > Backup**
2. View backup history
3. Check last successful backup
4. Verify backup health

### Creating Manual Backup

1. Go to **Admin > Backup**
2. Click **Create Backup Now**
3. Select type (daily, weekly, manual)
4. Wait for completion
5. Verify success

### Recovery Procedures

**Point-in-Time Recovery:**
For accidental data deletion (within 24 hours):
1. Contact engineering immediately
2. Provide: time of issue, affected data
3. Engineering will restore from Neon branches

**Full Recovery:**
For major incidents, see [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md)

---

## Security Administration

### Reviewing Security Events

1. Go to **Admin > Audit Logs > Security**
2. Filter for security-relevant events:
   - Failed logins
   - Password resets
   - Access denied
   - Unusual activity

### Responding to Security Concerns

1. Document the concern
2. Deactivate affected accounts if needed
3. Contact security lead
4. Preserve logs
5. Follow incident response procedures

### Access Review

**Monthly tasks:**
1. Review all admin accounts - verify need
2. Review coach assignments - remove stale
3. Check for inactive users
4. Review export/access logs for anomalies

---

## Configuration

### System Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Session Timeout | Auto-logout time | 30 min |
| Password Policy | Minimum requirements | 8 chars, mixed |
| Rate Limits | API request limits | 100/min |
| Export Limits | Data export restrictions | Admin only |

### Email Configuration

Managed via environment variables:
- `SMTP_HOST` - Email server
- `SMTP_USER` - Email account
- `ALERT_EMAIL_RECIPIENTS` - Admin notifications

---

## Quick Reference

### Daily Tasks

1. Check system health dashboard
2. Review any error alerts
3. Check pending user requests
4. Review high-priority audit events

### Weekly Tasks

1. Generate engagement report
2. Review pilot KPI progress
3. Check backup health
4. Review security logs
5. Update any pending configurations

### Key CLI Commands

```bash
# Check system health
curl http://localhost:5000/health/ready

# Create backup
npm run backup create daily

# Run performance tests
npm run perf:baseline

# Check database
npm run perf:db
```

### Emergency Contacts

| Role | Contact | When |
|------|---------|------|
| On-call Engineer | oncall@metabolic-tracker.app | System down |
| Security Lead | security@metabolic-tracker.app | Security incident |
| Clinical Lead | clinical@metabolic-tracker.app | Clinical escalation |
| Executive Sponsor | [Name] | Major incident |

---

*Administrators are critical to pilot success. Your careful management ensures data integrity and user satisfaction.*

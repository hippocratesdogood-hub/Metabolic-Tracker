# Disaster Recovery Runbook

## Overview

This document outlines disaster recovery procedures for the Metabolic-Tracker application.
The system uses a multi-layered backup strategy combining Neon's built-in features with
manual backup procedures to ensure data safety and HIPAA compliance.

**Recovery Time Objectives (RTOs):**
- Critical (data loss prevention): < 15 minutes
- Standard (full service restoration): < 1 hour
- Extended (historical data recovery): < 4 hours

**Recovery Point Objectives (RPOs):**
- Neon PITR: Any point within 7 days (Free) or 30 days (Pro)
- Manual backups: Daily (worst case 24 hours of data loss)

---

## Backup Strategy Summary

### 1. Neon Built-in Features (Automatic)

| Feature | Description | Retention |
|---------|-------------|-----------|
| Continuous WAL Archiving | Transaction-level backup | 7 days (Free) / 30 days (Pro) |
| Point-in-Time Recovery | Restore to any timestamp | Within retention window |
| Automatic Snapshots | Daily full snapshots | Part of retention window |
| Branch-based Testing | Non-destructive restore testing | Unlimited |

### 2. Manual Backups (Scheduled)

| Type | Schedule | Retention | Use Case |
|------|----------|-----------|----------|
| Daily | 2 AM UTC | 30 days | Quick recovery |
| Weekly | 3 AM Sunday | 90 days | Weekly checkpoints |
| Monthly | 4 AM 1st | 1 year | Monthly archives |
| Yearly | 5 AM Jan 1 | 7 years | HIPAA compliance |

### 3. Data Export (On-demand)

- User data export for GDPR compliance
- Full database export for migration
- Selective table export for analysis

---

## Disaster Scenarios and Recovery Procedures

### Scenario 1: Accidental Data Deletion (Single Record/User)

**Symptoms:** User reports missing data, single record deleted in error

**Recovery Time:** 5-15 minutes

**Procedure:**

1. **Identify the exact deletion time**
   ```bash
   # Check audit logs for deletion timestamp
   SELECT * FROM audit_logs
   WHERE action = 'RECORD_DELETE'
   AND resource_id = '<affected-resource-id>'
   ORDER BY timestamp DESC LIMIT 10;
   ```

2. **Create a Neon branch at point before deletion**
   ```bash
   # Via Neon CLI
   neonctl branches create --name recovery-$(date +%Y%m%d) \
     --point-in-time "<timestamp-before-deletion>"

   # Example: restore to 10 minutes before deletion
   neonctl branches create --name recovery-$(date +%Y%m%d) \
     --point-in-time "2024-01-15T14:30:00Z"
   ```

3. **Connect to recovery branch and extract data**
   ```bash
   # Get connection string for recovery branch
   neonctl connection-string recovery-$(date +%Y%m%d)

   # Export the specific data
   psql "<recovery-branch-url>" -c \
     "COPY (SELECT * FROM metric_entries WHERE id = '<id>') TO STDOUT WITH CSV HEADER"
   ```

4. **Restore data to production**
   ```bash
   # Insert recovered data
   psql "<production-url>" -c "INSERT INTO metric_entries (...) VALUES (...);"
   ```

5. **Cleanup**
   ```bash
   neonctl branches delete recovery-$(date +%Y%m%d)
   ```

6. **Document incident** in audit log

---

### Scenario 2: Bulk Data Corruption

**Symptoms:** Multiple records corrupted, incorrect calculations, data integrity issues

**Recovery Time:** 30-60 minutes

**Procedure:**

1. **IMMEDIATELY: Stop accepting new data**
   ```bash
   # Put application in maintenance mode
   # Set environment variable or use feature flag
   export MAINTENANCE_MODE=true
   ```

2. **Identify corruption scope**
   ```sql
   -- Check for data anomalies
   SELECT type, COUNT(*), MIN(timestamp), MAX(timestamp)
   FROM metric_entries
   WHERE created_at > '<suspected-corruption-start>'
   GROUP BY type;
   ```

3. **Determine safe recovery point**
   - Check audit logs for last known good state
   - Verify with most recent backup metadata

4. **Create recovery branch**
   ```bash
   neonctl branches create --name bulk-recovery \
     --point-in-time "<last-known-good-timestamp>"
   ```

5. **Verify data in recovery branch**
   ```bash
   psql "<recovery-branch-url>" -c "SELECT COUNT(*) FROM metric_entries;"
   # Compare with expected counts from backup metadata
   ```

6. **Export affected tables from recovery branch**
   ```bash
   pg_dump "<recovery-branch-url>" \
     --table=metric_entries \
     --table=food_entries \
     --data-only > recovered_data.sql
   ```

7. **Restore to production**
   ```bash
   # Clear corrupted data
   psql "<production-url>" -c "TRUNCATE metric_entries, food_entries CASCADE;"

   # Restore clean data
   psql "<production-url>" < recovered_data.sql
   ```

8. **Verify restoration**
   ```bash
   psql "<production-url>" -c "SELECT COUNT(*) FROM metric_entries;"
   ```

9. **Resume service**
   ```bash
   export MAINTENANCE_MODE=false
   ```

10. **Post-incident review** - document root cause

---

### Scenario 3: Complete Database Loss

**Symptoms:** Database unreachable, project deleted, catastrophic failure

**Recovery Time:** 1-2 hours

**Procedure:**

1. **Contact Neon Support IMMEDIATELY** if project was accidentally deleted
   - Email: support@neon.tech
   - Include project ID and approximate deletion time

2. **If Neon PITR is available:**
   ```bash
   # Create new branch from latest available point
   neonctl branches create --name production-restored \
     --point-in-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```

3. **If manual backup needed:**
   ```bash
   # Identify latest verified backup
   npx ts-node server/scripts/backup-cli.ts list

   # Verify backup integrity
   npx ts-node server/scripts/backup-cli.ts verify <backup-filename>
   ```

4. **Create new Neon project/branch**
   ```bash
   neonctl projects create --name metabolic-tracker-restored
   ```

5. **Restore from manual backup**
   ```bash
   # Decompress and restore
   gunzip -c backups/metabolic-tracker-daily-2024-01-15.sql.gz | \
     psql "<new-database-url>"
   ```

6. **Run database migrations** (if schema changed since backup)
   ```bash
   npm run db:push
   ```

7. **Verify data integrity**
   ```bash
   npx ts-node server/scripts/backup-cli.ts health
   ```

8. **Update DATABASE_URL** in production environment
   ```bash
   # Update .env or deployment secrets
   DATABASE_URL="<new-database-url>"
   ```

9. **Deploy and verify application**

10. **Notify affected users** of any data loss window

---

### Scenario 4: Security Breach / Compromised Data

**Symptoms:** Unauthorized access detected, data exfiltration suspected

**Recovery Time:** Variable (security first)

**Procedure:**

1. **IMMEDIATELY: Revoke all access**
   ```bash
   # Rotate database credentials
   neonctl connection-string --reset

   # Update application with new credentials
   ```

2. **Preserve evidence**
   ```bash
   # Export audit logs
   pg_dump "<database-url>" --table=audit_logs > audit_logs_$(date +%Y%m%d).sql

   # Create forensic branch
   neonctl branches create --name forensic-$(date +%Y%m%d)
   ```

3. **Assess breach scope**
   ```sql
   -- Check for unusual access patterns
   SELECT user_id, action, COUNT(*), MIN(timestamp), MAX(timestamp)
   FROM audit_logs
   WHERE timestamp > '<suspected-breach-start>'
   GROUP BY user_id, action
   ORDER BY COUNT(*) DESC;

   -- Check for bulk data access
   SELECT * FROM audit_logs
   WHERE action IN ('PHI_EXPORT', 'BULK_DATA_ACCESS', 'PHI_VIEW')
   AND timestamp > '<suspected-breach-start>';
   ```

4. **Document affected users for HIPAA breach notification**

5. **If data integrity compromised, follow Scenario 2 or 3**

6. **Engage incident response team**
   - Legal counsel
   - HIPAA compliance officer
   - Security team

7. **Post-breach:**
   - Security audit
   - Update access controls
   - User notification (if required)

---

### Scenario 5: Regional Outage (Neon)

**Symptoms:** Neon service unavailable in region

**Recovery Time:** Dependent on Neon

**Procedure:**

1. **Check Neon status page:** https://neonstatus.com/

2. **If extended outage expected:**
   - Communicate maintenance to users
   - Monitor status page for updates

3. **If region migration needed:**
   ```bash
   # Create project in different region
   neonctl projects create --name metabolic-tracker-dr --region aws-eu-central-1

   # Restore from latest manual backup
   gunzip -c backups/metabolic-tracker-daily-*.sql.gz | psql "<new-region-url>"
   ```

4. **Update DNS/configuration for new endpoint**

---

## Recovery Verification Checklist

After any recovery, verify:

- [ ] All tables exist with correct schema
- [ ] Row counts match expected (from backup metadata)
- [ ] User authentication works
- [ ] Recent data is accessible
- [ ] Foreign key relationships intact
- [ ] Application health checks pass
- [ ] Audit logging functional
- [ ] No PHI exposed in recovery process

```bash
# Quick verification script
npx ts-node server/scripts/backup-cli.ts health

# Manual table count verification
psql "<database-url>" -c "
SELECT
  'users' as table_name, COUNT(*) FROM users
UNION ALL SELECT 'metric_entries', COUNT(*) FROM metric_entries
UNION ALL SELECT 'food_entries', COUNT(*) FROM food_entries
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;
"
```

---

## Backup Testing Schedule

| Test | Frequency | Owner | Last Tested |
|------|-----------|-------|-------------|
| Backup creation | Weekly | DevOps | ___________ |
| PITR recovery (branch) | Monthly | DevOps | ___________ |
| Full restoration | Quarterly | DevOps | ___________ |
| User data export | Monthly | Dev | ___________ |

### Monthly Backup Test Procedure

```bash
# 1. Create test backup
npx ts-node server/scripts/backup-cli.ts create manual

# 2. Verify backup
npx ts-node server/scripts/backup-cli.ts verify <latest-backup>

# 3. Create test branch
neonctl branches create --name backup-test-$(date +%Y%m%d)

# 4. Restore to test branch
gunzip -c backups/<latest-backup> | psql "<test-branch-url>"

# 5. Verify row counts
psql "<test-branch-url>" -c "SELECT COUNT(*) FROM users;"

# 6. Cleanup
neonctl branches delete backup-test-$(date +%Y%m%d)

# 7. Document test results
echo "Backup test completed $(date)" >> backup-test-log.txt
```

---

## Contact Information

### Internal Escalation

| Role | Contact | When to Contact |
|------|---------|-----------------|
| On-call Engineer | [Defined in ON_CALL_PROCEDURES.md] | Any incident |
| Tech Lead | _________________ | Critical incidents |
| HIPAA Officer | _________________ | Any PHI breach |

### External Support

| Service | Contact | SLA |
|---------|---------|-----|
| Neon Support | support@neon.tech | Based on plan |
| Neon Status | https://neonstatus.com | N/A |

---

## Appendix: Useful Commands

### Neon CLI Quick Reference

```bash
# List projects
neonctl projects list

# List branches
neonctl branches list

# Create PITR branch
neonctl branches create --name <name> --point-in-time "<ISO-timestamp>"

# Get connection string
neonctl connection-string <branch-name>

# Delete branch
neonctl branches delete <branch-name>
```

### Backup CLI Quick Reference

```bash
# Create backup
npx ts-node server/scripts/backup-cli.ts create daily

# List backups
npx ts-node server/scripts/backup-cli.ts list

# Check health
npx ts-node server/scripts/backup-cli.ts health

# Export user data
npx ts-node server/scripts/backup-cli.ts export <user-id>

# Cleanup old backups
npx ts-node server/scripts/backup-cli.ts cleanup
```

### PostgreSQL Quick Reference

```bash
# Export specific table
pg_dump "<url>" --table=<table> > table.sql

# Import SQL file
psql "<url>" < backup.sql

# Check table sizes
psql "<url>" -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;"
```

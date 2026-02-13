# Data Import Runbook

This document provides comprehensive guidance for importing historical data into the Metabolic-Tracker system.

## Table of Contents

1. [Overview](#overview)
2. [Available Scripts](#available-scripts)
3. [Data Formats](#data-formats)
4. [Pre-Import Checklist](#pre-import-checklist)
5. [Import Procedures](#import-procedures)
6. [Validation Procedures](#validation-procedures)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## Overview

### Script Inventory

| Script | Purpose | Type | Location |
|--------|---------|------|----------|
| `seed.ts` | Creates test users and macro targets | One-time | `server/seed.ts` |
| `seedIfEmpty.ts` | Conditional seeding if DB empty | One-time (idempotent) | `server/seedIfEmpty.ts` |
| `csvImporter.ts` | Import metrics/food from CSV | Recurring | `server/import/csvImporter.ts` |
| `jsonImporter.ts` | Import metrics/food from JSON | Recurring | `server/import/jsonImporter.ts` |

### Data Flow

```
Source Data (CSV/JSON)
        │
        ▼
   Validation Layer
   - Schema validation
   - Value range checks
   - Timestamp validation
        │
        ▼
   User Resolution
   - Email → User ID lookup
   - User existence check
        │
        ▼
   Duplicate Detection
   - Same user + type + timestamp (±1min for metrics)
   - Same user + meal + timestamp (±5min for food)
        │
        ▼
   Database Insert
   - Batch processing
   - Source marked as "import"
        │
        ▼
   Backfill Detection
   - timestamp << createdAt = backfilled
   - Excluded from real-time prompts
```

---

## Available Scripts

### CSV Importer

```bash
# Import metrics
npx tsx server/import/csvImporter.ts --type metrics --file data.csv

# Import food entries
npx tsx server/import/csvImporter.ts --type food --file meals.csv

# Dry run (validate only)
npx tsx server/import/csvImporter.ts --type metrics --file data.csv --dry-run

# Skip duplicate checks (faster)
npx tsx server/import/csvImporter.ts --type metrics --file data.csv --skip-duplicates

# Stop on first error
npx tsx server/import/csvImporter.ts --type metrics --file data.csv --stop-on-error

# Custom batch size
npx tsx server/import/csvImporter.ts --type metrics --file data.csv --batch-size 50
```

### JSON Importer

```bash
# Import metrics
npx tsx server/import/jsonImporter.ts --type metrics --file data.json

# Import food entries
npx tsx server/import/jsonImporter.ts --type food --file meals.json

# Same options as CSV importer
npx tsx server/import/jsonImporter.ts --type metrics --file data.json --dry-run
```

---

## Data Formats

### Metric CSV Format

```csv
userEmail,timestamp,type,value,notes
alex@example.com,2024-01-15T08:00:00Z,WEIGHT,185.5,Morning weight
alex@example.com,2024-01-15T07:30:00Z,GLUCOSE,95,Fasting glucose
alex@example.com,2024-01-15T07:30:00Z,KETONES,0.8,Morning ketones
alex@example.com,2024-01-15T07:30:00Z,WAIST,34.5,Weekly measurement
alex@example.com,2024-01-15T07:30:00Z,BP,120/80,Morning BP
```

### Metric JSON Format

```json
[
  {
    "userEmail": "alex@example.com",
    "timestamp": "2024-01-15T08:00:00Z",
    "type": "WEIGHT",
    "value": 185.5,
    "notes": "Morning weight"
  },
  {
    "userEmail": "alex@example.com",
    "timestamp": "2024-01-15T07:30:00Z",
    "type": "BP",
    "value": { "systolic": 120, "diastolic": 80 },
    "notes": "Morning BP"
  }
]
```

### Food CSV Format

```csv
userEmail,timestamp,mealType,description,calories,protein,carbs,fat,fiber
alex@example.com,2024-01-15T08:00:00Z,Breakfast,Eggs and toast,350,25,20,18,2
alex@example.com,2024-01-15T12:30:00Z,Lunch,Grilled chicken salad,450,40,15,22,5
alex@example.com,2024-01-15T18:30:00Z,Dinner,Salmon with vegetables,550,42,20,30,8
alex@example.com,2024-01-15T15:00:00Z,Snack,Greek yogurt,150,15,12,3,0
```

### Food JSON Format

```json
[
  {
    "userEmail": "alex@example.com",
    "timestamp": "2024-01-15T08:00:00Z",
    "mealType": "Breakfast",
    "description": "Eggs and toast",
    "calories": 350,
    "protein": 25,
    "carbs": 20,
    "fat": 18,
    "fiber": 2
  }
]
```

### Field Specifications

#### Metric Types

| Type | Value Format | Valid Range | Example |
|------|--------------|-------------|---------|
| WEIGHT | number | 20-1000 lbs | 185.5 |
| GLUCOSE | number | 20-700 mg/dL | 95 |
| KETONES | number | 0-20 mmol/L | 0.8 |
| WAIST | number | 10-100 inches | 34.5 |
| BP | "systolic/diastolic" (CSV) or object (JSON) | 50-300/30-200 mmHg | "120/80" |

#### Meal Types

- `Breakfast`
- `Lunch`
- `Dinner`
- `Snack`

#### Timestamp Format

ISO 8601 format: `YYYY-MM-DDTHH:mm:ssZ`

Example: `2024-01-15T08:00:00Z`

---

## Pre-Import Checklist

### Before Starting

- [ ] Database backup completed
- [ ] Users exist in system for all emails in import file
- [ ] Import file validated with `--dry-run`
- [ ] Estimated import time calculated
- [ ] Monitoring in place for database performance

### Data Quality Checks

1. **User Verification**
   ```bash
   # Extract unique emails from CSV
   cut -d',' -f1 data.csv | tail -n +2 | sort | uniq > emails.txt

   # Verify each email exists in system
   ```

2. **Value Range Check**
   - Weight: 20-1000 lbs
   - Glucose: 20-700 mg/dL
   - Ketones: 0-20 mmol/L
   - Waist: 10-100 inches
   - BP: 50-300/30-200 mmHg

3. **Timestamp Validation**
   - Not in the future
   - Not more than 5 years old
   - Proper ISO 8601 format

---

## Import Procedures

### Standard Import Procedure

1. **Prepare Environment**
   ```bash
   cd /path/to/Metabolic-Tracker
   export DATABASE_URL="your-database-url"
   ```

2. **Validate Data (Dry Run)**
   ```bash
   npx tsx server/import/csvImporter.ts --type metrics --file data.csv --dry-run
   ```

3. **Review Dry Run Results**
   - Check error count
   - Review warnings
   - Verify record counts

4. **Execute Import**
   ```bash
   npx tsx server/import/csvImporter.ts --type metrics --file data.csv
   ```

5. **Verify Import**
   - Check imported record counts
   - Spot-check sample records
   - Run validation queries

### Large Import Procedure (1000+ records)

1. **Split File** (optional for very large imports)
   ```bash
   split -l 1000 large_file.csv split_
   ```

2. **Import with Progress Tracking**
   ```bash
   npx tsx server/import/csvImporter.ts --type metrics --file data.csv --batch-size 50
   ```

3. **Monitor Database**
   - Watch for connection pool exhaustion
   - Monitor query performance
   - Check disk space

### Production Import Procedure

1. **Schedule During Low-Traffic Window**

2. **Notify Stakeholders**

3. **Create Database Backup**
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   ```

4. **Run Import with Verbose Logging**
   ```bash
   npx tsx server/import/csvImporter.ts --type metrics --file data.csv 2>&1 | tee import_$(date +%Y%m%d).log
   ```

5. **Validate Results**

6. **Monitor Application for Errors**

---

## Validation Procedures

### Post-Import Validation Checklist

- [ ] Record count matches source
- [ ] No unexpected duplicates
- [ ] Sample records match source data
- [ ] Analytics calculations work correctly
- [ ] Dashboard displays imported data
- [ ] Reports include imported data

### SQL Validation Queries

```sql
-- Count imported metrics by type
SELECT type, COUNT(*) as count
FROM metric_entries
WHERE source = 'import'
GROUP BY type;

-- Check for recent imports
SELECT type, timestamp, value_json, created_at
FROM metric_entries
WHERE source = 'import'
ORDER BY created_at DESC
LIMIT 20;

-- Verify backfill detection
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE created_at - timestamp > interval '1 hour') as backfilled
FROM metric_entries
WHERE source = 'import';

-- Food entry counts by meal type
SELECT meal_type, COUNT(*) as count
FROM food_entries
WHERE created_at > NOW() - interval '1 day'
GROUP BY meal_type;
```

### Application Validation

1. **Dashboard Check**
   - Log in as imported user
   - Verify metrics display correctly
   - Check trend calculations

2. **Reports Check**
   - Generate weekly report
   - Verify averages include imported data
   - Check date ranges work correctly

3. **Analytics Check**
   - Review admin analytics
   - Verify cohort averages
   - Check streak calculations

---

## Troubleshooting

### Common Errors

#### "User not found"

**Cause**: Email in import file doesn't match any user in database.

**Solution**:
1. Create user before import
2. Fix email in import file
3. Use `--continue-on-error` to skip

#### "Invalid timestamp"

**Cause**: Timestamp not in ISO 8601 format.

**Solution**: Convert timestamps to format: `YYYY-MM-DDTHH:mm:ssZ`

#### "Value out of range"

**Cause**: Metric value outside expected range.

**Solution**:
1. Verify data accuracy
2. Check unit conversions (e.g., kg to lbs)
3. Update validation ranges if legitimate

#### "Duplicate detected"

**Cause**: Similar entry already exists.

**Solution**:
1. Use `--skip-duplicates` if intentional re-import
2. Clean up source data
3. Delete existing duplicates if needed

### Performance Issues

#### Slow Import

1. Increase batch size: `--batch-size 200`
2. Skip duplicate checks: `--skip-duplicates`
3. Import during off-peak hours

#### Memory Issues

1. Decrease batch size: `--batch-size 25`
2. Split large files
3. Monitor system resources

### Database Issues

#### Connection Timeout

1. Reduce batch size
2. Add delays between batches
3. Check database connection pool

#### Disk Space

1. Monitor database size during import
2. Clean up old logs/backups
3. Scale database if needed

---

## Rollback Procedures

### Immediate Rollback

If import fails mid-process:

```sql
-- Delete imported records from current session
DELETE FROM metric_entries
WHERE source = 'import'
AND created_at > 'TIMESTAMP_OF_IMPORT_START';

DELETE FROM food_entries
WHERE created_at > 'TIMESTAMP_OF_IMPORT_START';
```

### Full Rollback from Backup

```bash
# Restore from backup
psql $DATABASE_URL < backup_YYYYMMDD.sql
```

### Selective Rollback

```sql
-- Delete specific user's imported data
DELETE FROM metric_entries
WHERE user_id = 'USER_ID'
AND source = 'import'
AND created_at > 'IMPORT_DATE';
```

---

## Performance Benchmarks

| Data Volume | Dry Run | Import (no dup check) | Import (with dup check) |
|-------------|---------|----------------------|------------------------|
| 100 records | <1s | ~2s | ~5s |
| 500 records | ~1s | ~5s | ~20s |
| 1000 records | ~2s | ~10s | ~40s |
| 5000 records | ~5s | ~30s | ~3min |

*Note: Times vary based on database performance and network latency.*

---

## Security Considerations

1. **Audit Logging**: All imports are logged in audit system
2. **Source Tracking**: Imported entries marked with `source: "import"`
3. **Backfill Detection**: Historical imports detected and handled appropriately
4. **Access Control**: Import scripts require database credentials
5. **Data Validation**: All data validated before insertion

---

## Contact

For import assistance or issues:
- Check existing documentation first
- Review error logs for specific messages
- Consult with database administrator for large imports

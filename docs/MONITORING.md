# Monitoring & Observability Guide

## Overview

The Metabolic-Tracker application includes comprehensive monitoring for the pilot deployment:

- **Health Checks**: Liveness, readiness, and dependency health
- **Application Metrics**: Request rates, latency, errors, memory usage
- **Business Metrics**: Pilot success KPIs, user engagement, feature adoption
- **Synthetic Monitoring**: Automated tests for critical paths
- **Alerting**: Multi-channel notifications for issues

---

## Health Check Endpoints

### `/health/live`
**Purpose**: Basic liveness check - is the process running?

**When to use**: Kubernetes liveness probes, load balancer health checks.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "checks": {
    "process": true,
    "memory": {
      "used": 128,
      "total": 512,
      "percentage": 25
    }
  }
}
```

### `/health/ready`
**Purpose**: Readiness check - can the application handle requests?

**When to use**: Kubernetes readiness probes, deployment verification.

**Response**:
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "memory": true,
    "diskSpace": true
  },
  "details": {
    "database": "OK (45ms)",
    "memory": "OK (25%)"
  }
}
```

### `/health/db`
**Purpose**: Detailed database health check.

**Response**:
```json
{
  "status": "healthy",
  "checks": {
    "connection": true,
    "queryTime": 45,
    "poolStatus": "active"
  }
}
```

### `/health/external`
**Purpose**: External service dependency status.

**Response**:
```json
{
  "status": "healthy",
  "services": {
    "openai": { "status": "up" },
    "sentry": { "status": "up" },
    "neon": { "status": "up" }
  }
}
```

### `/api/admin/health` (Authenticated)
**Purpose**: Combined health status for admin dashboards.

---

## Application Metrics

### `/metrics` (Prometheus Format)
Exposes metrics in Prometheus text format for external monitoring.

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total 12345

# HELP nodejs_heap_size_bytes Node.js heap size
# TYPE nodejs_heap_size_bytes gauge
nodejs_heap_size_used_bytes 134217728

# HELP http_error_rate Current error rate
# TYPE http_error_rate gauge
http_error_rate 0.01
```

### `/api/admin/metrics` (Authenticated)
Returns detailed application metrics:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "requests": {
    "total": 12345,
    "successful": 12200,
    "failed": 145,
    "byStatusCode": { "200": 11000, "201": 1200, "500": 145 }
  },
  "system": {
    "memory": { "heapUsed": 128, "percentUsed": 25 },
    "uptime": 3600,
    "eventLoop": { "lagMs": 5 }
  },
  "errors": {
    "total": 145,
    "rate": 0.01,
    "recentErrors": [...]
  },
  "health": {
    "overall": "healthy",
    "alerts": []
  }
}
```

---

## Business Metrics

### `/api/admin/business-metrics`
Full business metrics snapshot for the pilot.

### `/api/admin/business-metrics/summary`
Quick KPI dashboard:

```json
{
  "kpis": [
    {
      "name": "Enrolled Participants",
      "value": 45,
      "target": 50,
      "status": "good"
    },
    {
      "name": "Daily Active Users",
      "value": 35,
      "target": 40,
      "status": "warning"
    }
  ],
  "pilotScore": 78,
  "pilotStatus": "on_track"
}
```

### `/api/admin/business-metrics/pilot`
Detailed pilot success metrics:

- Enrollment progress vs target
- DAU rate vs expectations
- Data quality (entries per user per day)
- Coach interaction coverage
- Overall pilot score

### `/api/admin/business-metrics/engagement`
User engagement metrics:

- Total users by role
- Daily/weekly/monthly active users
- DAU/WAU rates
- Retention metrics

### `/api/admin/business-metrics/coaches`
Coach activity metrics:

- Participants per coach
- Message volume
- Response times

---

## Synthetic Monitoring

Automated tests that run on a schedule to detect issues proactively.

### Available Tests

| Test Name | Description | Critical |
|-----------|-------------|----------|
| `database_connectivity` | Basic DB connection test | Yes |
| `database_write_read` | DB write/read operations | Yes |
| `user_table_accessible` | Users table queryable | Yes |
| `metrics_table_accessible` | Metrics table queryable | Yes |
| `food_table_accessible` | Food entries table queryable | Yes |
| `complex_query_performance` | Analytics query performance | No |
| `messages_table_accessible` | Messages table queryable | No |
| `audit_logs_accessible` | Audit logs table queryable | No |

### API Endpoints

**Run all tests**:
```bash
curl -X POST /api/admin/synthetic/run
```

**Get last results**:
```bash
curl /api/admin/synthetic/summary
```

**Start periodic monitoring** (default: every 5 minutes):
```bash
curl -X POST /api/admin/synthetic/start \
  -H "Content-Type: application/json" \
  -d '{"intervalMinutes": 5}'
```

**Stop periodic monitoring**:
```bash
curl -X POST /api/admin/synthetic/stop
```

---

## Alerting

### Configuration

Set these environment variables for alerting:

```env
# Slack notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# Email notifications
ALERT_EMAIL_RECIPIENTS=admin@example.com,ops@example.com

# SMS notifications (Twilio)
ALERT_SMS_NUMBERS=+1234567890
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1987654321

# Generic webhook
ALERT_WEBHOOK_URL=https://your-service.com/webhook
```

### Alert Severity Levels

| Level | Channels | Cooldown | Use Case |
|-------|----------|----------|----------|
| CRITICAL | Slack, SMS, Email | 5 min | Production down, data loss |
| HIGH | Slack, Email | 15 min | Significant degradation |
| MEDIUM | Slack | 60 min | Elevated errors |
| LOW | Console | 120 min | Minor issues |

### Built-in Alert Rules

1. **Critical Error Immediate**: Any CRITICAL error triggers alert
2. **High Error Spike**: 10+ HIGH errors in 5 minutes
3. **Error Rate Spike**: Error rate 3x normal baseline
4. **New Error Type**: Previously unseen error
5. **User Impact High**: 10+ users affected by errors

### Testing Alerts

```bash
# Send test alert
curl -X POST /api/admin/alerting/test \
  -H "Content-Type: application/json" \
  -d '{"severity": "medium", "title": "Test", "description": "Testing alerts"}'

# Evaluate all rules
curl -X POST /api/admin/alerting/evaluate
```

---

## Monitoring Dashboard

### `/api/admin/monitoring/dashboard`

Comprehensive dashboard combining all monitoring data:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "health": {
    "overall": "healthy",
    "components": {
      "liveness": "healthy",
      "readiness": "healthy",
      "database": "healthy",
      "external": "healthy"
    }
  },
  "application": {
    "health": { "overall": "healthy", "alerts": [] },
    "requestsPerMinute": 45,
    "errorRate": 0.01,
    "memoryPercent": 25,
    "uptime": 86400
  },
  "pilot": {
    "pilotScore": 78,
    "pilotStatus": "on_track",
    "kpis": [...]
  },
  "synthetic": {
    "overall": "healthy",
    "passed": 8,
    "failed": 0
  },
  "performance": {
    "overall": "healthy",
    "budgetViolations": 0,
    "slowQueries": 0
  }
}
```

---

## Operational Runbook

### Daily Checks

1. **Review pilot KPIs**: `/api/admin/business-metrics/summary`
   - Check enrollment progress
   - Monitor DAU rate
   - Review pilot score trend

2. **Check health status**: `/api/admin/monitoring/dashboard`
   - Verify all components healthy
   - Review any alerts

3. **Review error patterns**: `/api/admin/errors/metrics`
   - Check for new error types
   - Review error rate trends

### Weekly Tasks

1. **Synthetic test review**
   - Verify all tests passing
   - Review test duration trends

2. **Performance review**: `/api/admin/performance/summary`
   - Check for budget violations
   - Review slow query logs

3. **Engagement analysis**: `/api/admin/business-metrics/engagement`
   - Identify low-engagement users
   - Review retention metrics

### Incident Response

#### High Error Rate
1. Check `/health/ready` for degraded components
2. Review `/api/admin/errors/metrics` for error patterns
3. Check `/api/admin/synthetic/summary` for failing tests
4. Review application logs

#### Database Issues
1. Check `/health/db` for connection status
2. Review slow queries in `/api/admin/performance/summary`
3. Check Neon dashboard for capacity/limits
4. Consider point-in-time recovery if data corruption

#### Performance Degradation
1. Check `/api/admin/performance/realtime` for current metrics
2. Review `/api/admin/synthetic/summary` for latency trends
3. Check memory usage in `/api/admin/metrics`
4. Review database query patterns

---

## External Monitoring Integration

### Prometheus

Configure Prometheus to scrape `/metrics`:

```yaml
scrape_configs:
  - job_name: 'metabolic-tracker'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana

Import dashboards using the Prometheus metrics:
- Request rate and error rate
- Memory and CPU usage
- Database query latency
- Business KPIs

### Uptime Monitoring (External)

Configure external uptime monitors to hit:
- `/health/live` - Every 1 minute
- `/health/ready` - Every 5 minutes
- `/health/db` - Every 5 minutes

### Sentry Integration

Errors are automatically reported to Sentry when `SENTRY_DSN` is configured. View:
- Error trends and frequencies
- Stack traces and context
- User impact analysis
- Release tracking

---

## Thresholds Reference

### Performance Budgets

| Metric | Warning | Critical |
|--------|---------|----------|
| API Response Time | 1000ms | 3000ms |
| DB Query Time | 500ms | 2000ms |
| Error Rate | 1% | 5% |
| p95 Response Time | 2000ms | 5000ms |

### Resource Limits

| Resource | Limit |
|----------|-------|
| Memory | 512 MB |
| CPU | 80% |
| DB Connections | 20 |
| Concurrent Requests | 100 |

---

## Quick Reference Commands

```bash
# Health checks
curl http://localhost:5000/health/live
curl http://localhost:5000/health/ready
curl http://localhost:5000/health/db

# Prometheus metrics
curl http://localhost:5000/metrics

# Admin endpoints (require authentication)
# Use session cookie or API token

# Full dashboard
GET /api/admin/monitoring/dashboard

# Business metrics
GET /api/admin/business-metrics/summary
GET /api/admin/business-metrics/pilot

# Run synthetic tests
POST /api/admin/synthetic/run

# Test alerting
POST /api/admin/alerting/test
```

# Technical Troubleshooting Guide

Quick reference for diagnosing and resolving common issues.

---

## Quick Diagnostics

### System Status Check

```bash
# Check all health endpoints
curl http://localhost:5000/health/live
curl http://localhost:5000/health/ready
curl http://localhost:5000/health/db
curl http://localhost:5000/health/external

# Run synthetic tests
curl -X POST http://localhost:5000/api/admin/synthetic/run \
  -H "Authorization: Bearer [token]"

# Check application metrics
curl http://localhost:5000/metrics
```

### Log Locations

| Log Type | Location | Contains |
|----------|----------|----------|
| Application | stdout/stderr | Request logs, errors |
| Audit | Database | User actions |
| Error | Sentry | Exceptions, stack traces |
| Performance | In-memory | Response times, slow queries |

---

## Authentication Issues

### User Cannot Log In

**Symptoms:**
- "Invalid credentials" error
- Login form submits but nothing happens
- Redirect loop after login

**Diagnostic Steps:**

1. **Verify user exists:**
   ```sql
   SELECT id, email, status, role FROM users WHERE email = 'user@example.com';
   ```

2. **Check account status:**
   - `status = 'active'` - Account is active
   - `status = 'inactive'` - Account deactivated

3. **Check for lockout:**
   - Review audit logs for failed login attempts
   - Check rate limiting (5 failed attempts = 15 min lockout)

4. **Verify password:**
   - Reset password via admin
   - Check if `forcePasswordReset` is true

**Solutions:**

| Issue | Solution |
|-------|----------|
| Wrong password | Reset via admin panel |
| Account inactive | Reactivate in admin |
| Rate limited | Wait 15 minutes or clear lockout |
| Email typo | Verify correct email address |

### Session Expired Errors

**Cause:** Session timeout (30 min default)

**Solutions:**
- User logs in again
- Check `SESSION_SECRET` env variable is set
- Verify session store is functioning

### Password Reset Not Working

**Diagnostic Steps:**
1. Check email delivery logs
2. Verify `SMTP_*` environment variables
3. Check spam folder
4. Verify reset link not expired (1 hour)

---

## Data Entry Issues

### Data Not Appearing

**Symptoms:**
- Entry saved but not showing in list
- Charts missing recent data
- "No data" message despite entries

**Diagnostic Steps:**

1. **Check entry was saved:**
   ```sql
   SELECT * FROM metric_entries WHERE user_id = 'xxx' ORDER BY created_at DESC LIMIT 5;
   ```

2. **Check for client-side caching:**
   - Hard refresh (Ctrl+Shift+R)
   - Clear browser cache
   - Try incognito mode

3. **Check date filters:**
   - Verify date range includes entry date
   - Check timezone handling

4. **Check user association:**
   - Verify entry has correct `user_id`
   - Verify user is viewing their own data

**Solutions:**

| Issue | Solution |
|-------|----------|
| Cache stale | Clear browser cache, refresh |
| Wrong date filter | Adjust date range |
| Entry not saved | Check network tab for errors |
| Wrong user context | Log out and back in |

### Food Analysis Not Working

**Symptoms:**
- "Analysis failed" error
- AI returns incorrect results
- Photo upload stuck

**Diagnostic Steps:**

1. **Check OpenAI integration:**
   ```bash
   curl http://localhost:5000/health/external
   # Look for openai status
   ```

2. **Verify API key:**
   - Check `OPENAI_API_KEY` is set
   - Verify key is valid and has quota

3. **Check photo format:**
   - Supported: JPG, PNG
   - Max size: 10MB
   - Good lighting, clear image

**Solutions:**

| Issue | Solution |
|-------|----------|
| API key invalid | Update OPENAI_API_KEY |
| Quota exceeded | Check OpenAI dashboard, add credits |
| Photo too large | Compress or resize image |
| Bad lighting | Retake photo with better lighting |

---

## Display Issues

### Charts Not Loading

**Symptoms:**
- Blank chart area
- Loading spinner never completes
- Error message in chart space

**Diagnostic Steps:**

1. **Check browser console:**
   - Open DevTools (F12)
   - Look for JavaScript errors
   - Check Network tab for failed requests

2. **Check data exists:**
   ```sql
   SELECT COUNT(*) FROM metric_entries WHERE user_id = 'xxx';
   ```

3. **Test in different browser:**
   - Chrome (recommended)
   - Safari
   - Firefox

**Solutions:**

| Issue | Solution |
|-------|----------|
| JS error | Clear cache, try different browser |
| No data | Ensure entries exist for date range |
| Network error | Check connectivity, refresh |
| Browser old | Update browser to latest version |

### Layout/Styling Issues

**Symptoms:**
- Elements overlapping
- Buttons not clickable
- Mobile layout broken

**Solutions:**
1. Clear browser cache
2. Disable browser extensions
3. Try different browser
4. Check for CSS conflicts if customizations made

---

## Performance Issues

### Slow Page Load

**Symptoms:**
- Pages take >3 seconds to load
- Frequent loading spinners
- Timeout errors

**Diagnostic Steps:**

1. **Check backend performance:**
   ```bash
   curl http://localhost:5000/api/admin/performance/realtime
   ```

2. **Run performance tests:**
   ```bash
   npm run perf:baseline
   ```

3. **Check slow queries:**
   ```bash
   npm run perf:db
   ```

4. **Check network:**
   - Browser DevTools > Network tab
   - Look for slow requests (>1s)

**Solutions:**

| Issue | Solution |
|-------|----------|
| Slow queries | Add indexes, optimize queries |
| Large payload | Add pagination, lazy loading |
| Network latency | Check CDN, server location |
| Memory pressure | Increase server resources |

### Database Connection Issues

**Symptoms:**
- "Database unavailable" errors
- Intermittent failures
- Timeout errors

**Diagnostic Steps:**

1. **Check database health:**
   ```bash
   curl http://localhost:5000/health/db
   ```

2. **Test direct connection:**
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

3. **Check connection pool:**
   - Review connection count
   - Check for leaked connections

**Solutions:**

| Issue | Solution |
|-------|----------|
| Connection refused | Check DATABASE_URL, network |
| Pool exhausted | Increase pool size, fix leaks |
| Timeout | Check Neon dashboard for issues |
| SSL error | Verify SSL settings in connection |

---

## Integration Issues

### Sentry Not Receiving Errors

**Diagnostic Steps:**
1. Verify `SENTRY_DSN` is set
2. Check Sentry dashboard for quota
3. Test with manual error report

**Test Error Reporting:**
```bash
curl -X POST http://localhost:5000/api/admin/errors/test-alert
```

### Email Not Sending

**Diagnostic Steps:**
1. Verify SMTP settings
2. Check email service dashboard
3. Review spam folder
4. Test with simple email

**Required Environment Variables:**
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
```

---

## Import Issues

### CSV Import Fails

**Common Errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| "Invalid date format" | Wrong date format | Use YYYY-MM-DD |
| "Email already exists" | Duplicate email | Remove or update existing |
| "Required field missing" | Empty required cell | Fill in data |
| "Invalid metric type" | Typo in type | Use exact type names |
| "User not found" | Wrong user ID | Verify ID exists |

**Diagnostic Steps:**

1. **Download error report:**
   - Import shows which rows failed
   - Each error has row number

2. **Validate CSV format:**
   - UTF-8 encoding
   - Comma delimiter
   - No special characters in headers

3. **Check data types:**
   - Dates: YYYY-MM-DD
   - Numbers: No formatting
   - Text: No leading/trailing spaces

### Bulk Import Slow

**Cause:** Large dataset without batching

**Solutions:**
- Split into smaller files (<1000 rows)
- Import during off-peak hours
- Use batch import feature if available

---

## Mobile-Specific Issues

### App Not Loading on Mobile

**Solutions:**
1. Check internet connection
2. Clear browser cache and cookies
3. Try different browser
4. Check for iOS/Android updates

### Touch Elements Not Working

**Solutions:**
1. Ensure no zoom is applied
2. Check for overlapping elements
3. Try landscape/portrait mode
4. Clear cache and refresh

### Photos Not Uploading

**Solutions:**
1. Check photo permissions
2. Reduce photo size
3. Check internet connection
4. Try different photo format

---

## Emergency Procedures

### Application Down

1. **Check health endpoint:**
   ```bash
   curl http://localhost:5000/health/live
   ```

2. **Check process running:**
   ```bash
   ps aux | grep node
   ```

3. **Check logs:**
   ```bash
   # View recent logs
   tail -100 /var/log/app.log
   ```

4. **Restart if needed:**
   ```bash
   npm run start
   ```

5. **If still down:** See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)

### Database Unresponsive

1. Check Neon dashboard for status
2. Check connection string
3. Test with psql
4. If persists, see Disaster Recovery docs

---

## Browser Compatibility

### Supported Browsers

| Browser | Minimum Version | Status |
|---------|-----------------|--------|
| Chrome | 90+ | Full support |
| Safari | 14+ | Full support |
| Firefox | 90+ | Full support |
| Edge | 90+ | Full support |
| IE | Any | Not supported |

### Known Browser Issues

**Safari:**
- Private mode may break session persistence
- Some date pickers behave differently

**Firefox:**
- PDF export may require popup permission

---

## Getting Help

### Information to Gather

Before contacting support, collect:

1. **User details:** Email, role, user ID
2. **Browser:** Name, version, OS
3. **Error message:** Exact text, screenshot
4. **Steps to reproduce:** What were you doing?
5. **Timestamp:** When did it happen?
6. **Network info:** Request ID if shown

### Support Channels

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| User help | support@metabolic-tracker.app | 24 hours |
| Urgent bug | urgent@metabolic-tracker.app | 4 hours |
| Security | security@metabolic-tracker.app | 2 hours |

---

## Diagnostic Commands Quick Reference

```bash
# Health checks
curl http://localhost:5000/health/live
curl http://localhost:5000/health/ready
curl http://localhost:5000/health/db

# Performance
npm run perf:baseline
npm run perf:db

# Synthetic tests
curl -X POST http://localhost:5000/api/admin/synthetic/run

# Database check
psql $DATABASE_URL -c "SELECT NOW()"

# Application metrics
curl http://localhost:5000/metrics
```

---

*When in doubt, clear cache, refresh, and try again. Most issues are cache-related.*

# Data Protection & Encryption Audit Report

**Audit Date:** 2026-02-02
**Application:** Metabolic-Tracker (Healthcare App)
**Auditor:** Security Review

---

## Executive Summary

This audit evaluates data protection controls for a healthcare application handling Protected Health Information (PHI). The application has **moderate security posture** with several areas requiring immediate attention for HIPAA compliance.

| Category | Risk Level | Issues Found |
|----------|-----------|--------------|
| Encryption in Transit | **MEDIUM** | Cookie secure flag conditional, no HSTS |
| Encryption at Rest | **HIGH** | No field-level encryption for PHI |
| Data Exposure in Logs | **HIGH** | Full API responses logged, error messages exposed |
| URL/Request Safety | **LOW** | No sensitive data in URLs |

---

## 1. ENCRYPTION IN TRANSIT

### 1.1 HTTPS/TLS Configuration

**Status:** Partially Configured

**Findings:**

| File | Line | Finding | Severity |
|------|------|---------|----------|
| [server/auth.ts](server/auth.ts#L91) | 91 | Cookie `secure` flag only enabled when `NODE_ENV === "production"` | MEDIUM |
| [server/auth.ts](server/auth.ts#L101-L106) | 101-106 | `trust proxy` only set in production | LOW |
| [server/middleware/security.ts](server/middleware/security.ts#L323) | 323 | CSRF cookie `secure` flag conditional on production | MEDIUM |

**Good Practices Observed:**
- Session cookies use `httpOnly: true` to prevent XSS access
- `sameSite: "lax"` configured for CSRF protection
- Custom session cookie name `metabolic.sid` (doesn't reveal framework)

**Issues:**

1. **No HSTS Header** - The application doesn't enforce HTTP Strict Transport Security
   ```typescript
   // Missing in security headers middleware
   res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
   ```

2. **No Forced HTTPS Redirect** - In production, HTTP requests should redirect to HTTPS

**Recommendations:**
```typescript
// Add to server/middleware/security.ts securityHeaders()
if (process.env.NODE_ENV === "production") {
  res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

// Add HTTPS redirect middleware
export function forceHttps(): RequestHandler {
  return (req, res, next) => {
    if (process.env.NODE_ENV === "production" && !req.secure) {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  };
}
```

### 1.2 External HTTP Connections

**Status:** Good

**Finding:** No plaintext HTTP connections to external services were found. The application uses:
- HTTPS for OpenAI API calls (via official SDK)
- PostgreSQL connection string (typically includes SSL settings)

### 1.3 WebSocket Security

**Status:** N/A

**Finding:** No WebSocket connections are implemented in the application code. The `ws` package in dependencies appears unused for real-time features.

---

## 2. ENCRYPTION AT REST

### 2.1 Database Configuration

**Status:** Needs Improvement

**Current State:**
- Database: PostgreSQL via Neon (cloud-hosted)
- Connection: Uses `DATABASE_URL` environment variable
- File: [server/storage.ts](server/storage.ts#L33-L35)

```typescript
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
});
```

**Findings:**

| Issue | Severity | Location |
|-------|----------|----------|
| No SSL enforcement verified in connection | MEDIUM | server/storage.ts:33 |
| No connection string validation | LOW | server/storage.ts:34 |

**Recommendation:**
```typescript
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
});
```

### 2.2 PHI/PII Stored in Database

**Status:** HIGH RISK - No Field-Level Encryption

The following PHI/PII is stored **in plaintext** in the database:

| Table | Field | Data Type | PHI Classification |
|-------|-------|-----------|-------------------|
| `users` | `email` | text | PII - Identifier |
| `users` | `phone` | text | PII - Identifier |
| `users` | `dateOfBirth` | timestamp | PHI - Demographic |
| `users` | `name` | text | PII - Identifier |
| `metric_entries` | `valueJson` | jsonb | PHI - Health Data |
| `metric_entries` | `notes` | text | PHI - Health Data |
| `food_entries` | `rawText` | text | PHI - Health Data |
| `food_entries` | `aiOutputJson` | jsonb | PHI - Health Data |
| `food_entries` | `userCorrectionsJson` | jsonb | PHI - Health Data |
| `food_entries` | `photoUrl` | text | PHI - Health Data |
| `messages` | `body` | text | PHI - Communications |
| `reports` | `summaryJson` | jsonb | PHI - Health Summary |

**Schema Location:** [shared/schema.ts](shared/schema.ts#L21-L155)

**Recommendations for HIPAA Compliance:**

1. **Implement Field-Level Encryption for PHI:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY!; // 32 bytes for AES-256

export function encryptPHI(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(PHI_ENCRYPTION_KEY, "hex"), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptPHI(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(PHI_ENCRYPTION_KEY, "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

2. **Encrypt at minimum:**
   - `metric_entries.valueJson` (blood pressure, glucose, weight, ketones)
   - `metric_entries.notes`
   - `food_entries.rawText`
   - `messages.body`

3. **Consider database-level encryption:**
   - Enable PostgreSQL Transparent Data Encryption (TDE) if available
   - Use Neon's encryption-at-rest features

### 2.3 Session Storage

**Status:** Medium Risk

**Finding:** Sessions stored in memory using `memorystore`

**Location:** [server/auth.ts](server/auth.ts#L96-L98)
```typescript
store: new MemoryStore({
  checkPeriod: SESSION_CONFIG.checkPeriod,
}),
```

**Issues:**
- Sessions lost on server restart
- Not suitable for multi-server deployments
- Memory store mentioned as needing Redis in production

**Recommendation:** Use `connect-pg-simple` for PostgreSQL session storage:
```typescript
import connectPgSimple from "connect-pg-simple";
const PgSession = connectPgSimple(session);

store: new PgSession({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true,
}),
```

---

## 3. DATA EXPOSURE RISKS

### 3.1 Logging Sensitive Data

**Status:** HIGH RISK

**Finding 1: Full API Response Logging**

**Location:** [server/index.ts](server/index.ts#L49-L58)
```typescript
res.on("finish", () => {
  const duration = Date.now() - start;
  if (path.startsWith("/api")) {
    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if (capturedJsonResponse) {
      logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`; // LOGS FULL RESPONSE
    }
    log(logLine);
  }
});
```

**Impact:** All API responses including user data, health metrics, and messages are logged in plaintext.

**Recommendation:**
```typescript
// Sanitize responses before logging
const sanitizeResponse = (response: any): any => {
  if (!response) return response;
  const sanitized = { ...response };
  const sensitiveFields = ['passwordHash', 'email', 'phone', 'dateOfBirth', 'body', 'valueJson', 'rawText'];
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  return sanitized;
};

// In logging middleware
logLine += ` :: ${JSON.stringify(sanitizeResponse(capturedJsonResponse))}`;
```

**Finding 2: Seed Scripts Log Passwords**

**Location:** [server/seed.ts](server/seed.ts#L81), [server/seedIfEmpty.ts](server/seedIfEmpty.ts#L76)
```typescript
console.log("✅ Password for all: password123");
```

**Impact:** Passwords visible in logs. While these are test accounts, this pattern could leak to production.

**Recommendation:** Remove password logging or ensure seed scripts only run in development.

**Finding 3: Authorization Attempt Logging**

**Location:** [server/middleware/authorization.ts](server/middleware/authorization.ts#L22-L27)
```typescript
console.warn("[UNAUTHORIZED ACCESS ATTEMPT]", JSON.stringify({
  userId: details.userId,
  userRole: details.userRole,
  attemptedAction: details.attemptedAction,
  resourceId: details.resourceId,
  ipAddress: details.ipAddress,
  // ...
}));
```

**Impact:** This logging is appropriate for security monitoring, but should use a proper logging service with secure storage.

### 3.2 Error Messages in API Responses

**Status:** MEDIUM RISK

**Finding:** Internal error messages exposed to clients

**Locations:** Multiple routes in [server/routes.ts](server/routes.ts)
```typescript
// Examples at lines 101, 174, 191, 213, etc.
res.status(500).json({ message: error.message });
```

**Impact:** Database errors, file system errors, or other internal errors leak to clients, potentially revealing:
- Database schema information
- File paths
- Internal service configurations

**Recommendation:**
```typescript
// Generic error handler
function handleError(res: Response, error: any, context: string): void {
  console.error(`Error in ${context}:`, error);

  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ message: "An internal error occurred" });
  } else {
    res.status(500).json({ message: error.message, stack: error.stack });
  }
}

// Usage
} catch (error: any) {
  handleError(res, error, "createMetricEntry");
}
```

### 3.3 API Response Sanitization

**Status:** Good (with exceptions)

**Good Practices:**
- Password hashes consistently removed before sending user data:
```typescript
// server/routes.ts:457, 497, 515, 526, 541, 584, 616, 643
const sanitized = participants.map(({ passwordHash, ...rest }) => rest);
res.json(sanitized);
```

**Exceptions:**
- Full user object sometimes returned with `forcePasswordReset` flag visible (acceptable)
- Metric and food entries return all fields including health data (necessary but should be encrypted at rest)

### 3.4 File Upload Security

**Status:** Good

**Location:** [server/routes.ts](server/routes.ts#L33-L43)
```typescript
const upload = multer({
  storage: multer.memoryStorage(),  // Good: No disk storage
  limits: { fileSize: 10 * 1024 * 1024 }, // Good: 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});
```

**Good Practices:**
- Memory storage (no files written to disk)
- File size limit enforced (10MB)
- MIME type validation (images only)

**Recommendations:**
1. Add magic byte validation (actual file content check)
2. Implement virus scanning before processing
3. Consider content-type revalidation after upload

---

## 4. URL & REQUEST SAFETY

### 4.1 Sensitive Data in URLs

**Status:** Good

**Finding:** No sensitive data found in URL parameters for state-changing operations.

**Analysis of Query Parameters:**
| Route | Parameters | Risk |
|-------|------------|------|
| GET /api/metrics | type, from, to | LOW - Non-sensitive filters |
| GET /api/food | from, to | LOW - Date filters |
| GET /api/admin/analytics/* | range, coachId | LOW - Non-sensitive |
| GET /api/admin/deliveries | limit | LOW - Pagination |
| GET /api/macro-progress | date | LOW - Date filter |

### 4.2 GET Requests with Sensitive Data

**Status:** Good

**Finding:** All sensitive operations use POST, PUT, PATCH, DELETE methods.

- Login: `POST /api/auth/login`
- Password change: `POST /api/auth/change-password`
- User creation: `POST /api/admin/participants`

### 4.3 Stack Traces in Production

**Status:** Good (Partial)

**Finding:** Stack traces are handled in Vite for development:
```typescript
// server/vite.ts:54
vite.ssrFixStacktrace(e as Error);
```

**Issue:** Global error handler in [server/index.ts](server/index.ts#L68-L74) throws error after sending response:
```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  throw err;  // This throws after responding - logs stack trace
});
```

**Recommendation:**
```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;

  // Log full error for debugging
  console.error("Unhandled error:", err);

  // Send generic message in production
  const message = process.env.NODE_ENV === "production"
    ? "Internal Server Error"
    : err.message || "Internal Server Error";

  res.status(status).json({ message });
});
```

---

## 5. RECOMMENDATIONS SUMMARY

### Critical (Immediate Action Required)

1. **Implement PHI field-level encryption** for health data in `metric_entries`, `food_entries`, and `messages` tables
2. **Stop logging full API responses** - sanitize or remove response body logging
3. **Sanitize error messages** in production - don't expose internal errors

### High Priority

4. **Add HSTS header** for HTTPS enforcement
5. **Switch to PostgreSQL session storage** using `connect-pg-simple`
6. **Add SSL enforcement** to database connection in production

### Medium Priority

7. **Implement structured logging** with a proper logging service (not console.log)
8. **Add file content validation** (magic bytes) for uploads
9. **Remove password logging** from seed scripts

### Low Priority

10. **Create `.env.example`** file documenting required environment variables
11. **Document encryption key management** procedures
12. **Implement audit logging** for PHI access

---

## 6. COMPLIANCE CONSIDERATIONS

For HIPAA compliance, the following controls should be implemented:

| HIPAA Requirement | Current Status | Gap |
|-------------------|----------------|-----|
| Access Controls (§164.312(a)(1)) | ✅ Implemented | Role-based access control in place |
| Audit Controls (§164.312(b)) | ⚠️ Partial | Need structured audit logging |
| Integrity Controls (§164.312(c)(1)) | ✅ Implemented | CSRF protection, input validation |
| Transmission Security (§164.312(e)(1)) | ⚠️ Partial | Need HSTS, verify TLS settings |
| Encryption (§164.312(a)(2)(iv)) | ❌ Not Implemented | Need field-level encryption for PHI |

---

## Appendix: Files Reviewed

| File | Purpose |
|------|---------|
| server/index.ts | Express server entry, logging middleware |
| server/auth.ts | Authentication, session configuration |
| server/routes.ts | API endpoints, error handling |
| server/storage.ts | Database access layer |
| server/middleware/security.ts | Security middleware |
| server/middleware/authorization.ts | Authorization middleware |
| shared/schema.ts | Database schema definitions |
| server/seed.ts, seedIfEmpty.ts | Database seeding scripts |


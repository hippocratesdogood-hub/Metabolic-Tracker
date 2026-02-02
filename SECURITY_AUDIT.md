# Security Audit Report: Metabolic OS (Metabolic-Tracker)

**Audit Date:** February 2, 2026
**Auditor:** Claude Code Security Review
**Codebase Version:** Commit b103723

---

## Executive Summary

This security audit identified **3 Critical**, **2 High**, **4 Medium**, and **3 Low** severity issues in the Metabolic-Tracker application. The most severe issues involve missing ownership verification on data modification endpoints, allowing any authenticated user to modify or delete other users' health data.

| Severity | Count | Immediate Action Required |
|----------|-------|---------------------------|
| Critical | 3 | Yes - Fix before production |
| High | 2 | Yes - Fix within 1 week |
| Medium | 4 | Recommended |
| Low | 3 | Best practice |

---

## 1. AUTHENTICATION ANALYSIS

### 1.1 Authentication Mechanism

**Type:** Session-based authentication with Passport.js
**Strategy:** Local (email/password)
**File:** [server/auth.ts](server/auth.ts)

| Component | Implementation | Status |
|-----------|----------------|--------|
| Password Hashing | scrypt with 16-byte random salt | ✅ Secure |
| Password Comparison | Timing-safe comparison (`timingSafeEqual`) | ✅ Secure |
| Session Storage | In-memory (MemoryStore) | ⚠️ Not production-ready |
| JWT/Tokens | Not implemented | N/A |
| OAuth | Not implemented | N/A |

### 1.2 Session Configuration

**File:** [server/auth.ts:42-63](server/auth.ts#L42-L63)

```typescript
const sessionSettings: session.SessionOptions = {
  secret: process.env.REPL_ID || "metabolic-magic-secret",  // ⚠️ ISSUE
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({ checkPeriod: 86400000 }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  },
};
```

**Issues Identified:**
- Fallback session secret is hardcoded
- No `httpOnly` flag on cookies
- No `sameSite` attribute on cookies
- Session timeout is 7 days (excessive for health data)

### 1.3 Authentication Endpoints

| Endpoint | Method | Auth Required | Line |
|----------|--------|---------------|------|
| `/api/auth/signup` | POST | No | [routes.ts:56](server/routes.ts#L56) |
| `/api/auth/login` | POST | No | [routes.ts:91](server/routes.ts#L91) |
| `/api/auth/logout` | POST | Yes | [routes.ts:95](server/routes.ts#L95) |
| `/api/auth/me` | GET | No (returns 401) | [routes.ts:102](server/routes.ts#L102) |
| `/api/auth/change-password` | POST | Yes | [routes.ts:111](server/routes.ts#L111) |

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC)

### 2.1 Defined Roles

**File:** [shared/schema.ts:7](shared/schema.ts#L7)

| Role | Description | Count of Protected Routes |
|------|-------------|---------------------------|
| `participant` | Regular users tracking health data | 18 routes |
| `coach` | Can view assigned participants | 6 routes |
| `admin` | Full system access | 16 routes |

### 2.2 Role Hierarchy & Permissions

```
admin
  ├── All participant permissions
  ├── All coach permissions
  ├── User management (create, update roles, reset passwords)
  ├── Prompt/Rule management
  └── Full analytics access

coach
  ├── All participant permissions
  ├── View all participants list
  ├── View/set participant macro targets
  └── Filtered analytics access

participant
  ├── Own metrics CRUD
  ├── Own food entries CRUD
  ├── Own macro targets (read only)
  └── Messaging with assigned coach
```

### 2.3 Authorization Middleware

**File:** [server/routes.ts:48-53](server/routes.ts#L48-L53)

```typescript
function requireAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}
```

**Issue:** No role-based middleware exists. Role checks are done inline in each route handler, leading to inconsistent implementation.

### 2.4 Route Authorization Matrix

| Route Pattern | Auth | participant | coach | admin | Line |
|---------------|------|-------------|-------|-------|------|
| `POST /api/metrics` | ✅ | ✅ | ✅ | ✅ | 155 |
| `GET /api/metrics` | ✅ | ✅ | ✅ | ✅ | 176 |
| `PUT /api/metrics/:id` | ✅ | ✅* | ✅* | ✅* | 191 |
| `DELETE /api/metrics/:id` | ✅ | ✅* | ✅* | ✅* | 203 |
| `POST /api/food` | ✅ | ✅ | ✅ | ✅ | 216 |
| `GET /api/food` | ✅ | ✅ | ✅ | ✅ | 237 |
| `PUT /api/food/:id` | ✅ | ✅* | ✅* | ✅* | 251 |
| `GET /api/admin/participants` | ✅ | ❌ | ✅ | ✅ | 377 |
| `GET /api/admin/users` | ✅ | ❌ | ❌ | ✅ | 426 |
| `PATCH /api/admin/users/:id/role` | ✅ | ❌ | ❌ | ✅ | 440 |
| `POST /api/admin/participants` | ✅ | ❌ | ❌ | ✅ | 493 |
| `POST /api/admin/participants/:id/reset-password` | ✅ | ❌ | ❌ | ✅ | 532 |

**\* CRITICAL:** These routes lack ownership verification - any authenticated user can access any record.

---

## 3. DATA ISOLATION AUDIT

### 3.1 Database Query Analysis

**File:** [server/storage.ts](server/storage.ts)

| Method | User Filtering | Ownership Check | Status |
|--------|----------------|-----------------|--------|
| `getMetricEntries(userId)` | ✅ Yes | N/A (read) | ✅ Safe |
| `createMetricEntry(data)` | ✅ Uses req.user.id | N/A (create) | ✅ Safe |
| `updateMetricEntry(id, data)` | ❌ **None** | ❌ **None** | 🔴 **CRITICAL** |
| `deleteMetricEntry(id)` | ❌ **None** | ❌ **None** | 🔴 **CRITICAL** |
| `getFoodEntries(userId)` | ✅ Yes | N/A (read) | ✅ Safe |
| `createFoodEntry(data)` | ✅ Uses req.user.id | N/A (create) | ✅ Safe |
| `updateFoodEntry(id, data)` | ❌ **None** | ❌ **None** | 🔴 **CRITICAL** |
| `getMacroTarget(userId)` | ✅ Yes | N/A (read) | ✅ Safe |
| `getConversationsForUser(userId)` | ✅ Yes | N/A (read) | ✅ Safe |
| `getConversation(id)` | - | ✅ Checked in route | ✅ Safe |

### 3.2 Vulnerable Code Paths

#### CRITICAL: Metric Entry Update (No Ownership Check)

**File:** [server/routes.ts:191-201](server/routes.ts#L191-L201)

```typescript
app.put("/api/metrics/:id", requireAuth, async (req, res) => {
  try {
    const entry = await storage.updateMetricEntry(req.params.id, req.body);
    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    res.json(entry);
    // ❌ NO CHECK: req.user.id === entry.userId
```

**Attack Vector:** Authenticated user A can modify user B's health metrics by knowing/guessing the entry ID.

#### CRITICAL: Metric Entry Delete (No Ownership Check)

**File:** [server/routes.ts:203-213](server/routes.ts#L203-L213)

```typescript
app.delete("/api/metrics/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await storage.deleteMetricEntry(req.params.id);
    // ❌ NO CHECK: Does this entry belong to req.user?
```

**Attack Vector:** Any authenticated user can delete any metric entry.

#### CRITICAL: Food Entry Update (No Ownership Check)

**File:** [server/routes.ts:251-261](server/routes.ts#L251-L261)

```typescript
app.put("/api/food/:id", requireAuth, async (req, res) => {
  try {
    const entry = await storage.updateFoodEntry(req.params.id, req.body);
    // ❌ NO CHECK: req.user.id === entry.userId
```

### 3.3 Properly Secured Routes (Reference)

**Conversation Messages** - [server/routes.ts:927-944](server/routes.ts#L927-L944)

```typescript
app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const conversation = await storage.getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  // ✅ CORRECT: Ownership verification
  if (conversation.participantId !== req.user!.id && conversation.coachId !== req.user!.id) {
    return res.status(403).json({ message: "Forbidden" });
  }
```

---

## 4. FINDINGS BY SEVERITY

### 🔴 CRITICAL (Fix Immediately)

#### C1: Insecure Direct Object Reference - Metric Entry Update

**Location:** [server/routes.ts:191-201](server/routes.ts#L191-L201)
**CVSS Score:** 8.1 (High)
**Description:** The PUT `/api/metrics/:id` endpoint does not verify that the authenticated user owns the metric entry being updated.

**Impact:** Any authenticated user can modify any other user's health metrics (blood pressure, glucose, weight, etc.), potentially causing:
- Medical data tampering
- False health records
- Patient safety risks

**Recommended Fix:**
```typescript
app.put("/api/metrics/:id", requireAuth, async (req, res) => {
  try {
    // First, fetch the entry to check ownership
    const existing = await storage.getMetricEntryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Entry not found" });
    }

    // Verify ownership (or admin role)
    if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const entry = await storage.updateMetricEntry(req.params.id, req.body);
    res.json(entry);
```

---

#### C2: Insecure Direct Object Reference - Metric Entry Delete

**Location:** [server/routes.ts:203-213](server/routes.ts#L203-L213)
**CVSS Score:** 8.1 (High)
**Description:** The DELETE `/api/metrics/:id` endpoint does not verify ownership.

**Impact:** Any authenticated user can delete any other user's health records.

**Recommended Fix:**
```typescript
app.delete("/api/metrics/:id", requireAuth, async (req, res) => {
  try {
    const existing = await storage.getMetricEntryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Entry not found" });
    }

    if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await storage.deleteMetricEntry(req.params.id);
    res.status(204).send();
```

---

#### C3: Insecure Direct Object Reference - Food Entry Update

**Location:** [server/routes.ts:251-261](server/routes.ts#L251-L261)
**CVSS Score:** 7.5 (High)
**Description:** The PUT `/api/food/:id` endpoint does not verify that the authenticated user owns the food entry.

**Impact:** Any authenticated user can modify any other user's food logs and nutrition data.

**Recommended Fix:**
```typescript
app.put("/api/food/:id", requireAuth, async (req, res) => {
  try {
    const existing = await storage.getFoodEntryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Entry not found" });
    }

    if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const entry = await storage.updateFoodEntry(req.params.id, req.body);
    res.json(entry);
```

---

### 🟠 HIGH (Fix Within 1 Week)

#### H1: Hardcoded Fallback Session Secret

**Location:** [server/auth.ts:45](server/auth.ts#L45)
**Description:** The session secret falls back to a hardcoded value `"metabolic-magic-secret"` when `REPL_ID` is not set.

**Impact:** Session tokens can be forged if the secret is known, allowing session hijacking.

**Recommended Fix:**
```typescript
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}
```

---

#### H2: In-Memory Session Store

**Location:** [server/auth.ts:48](server/auth.ts#L48)
**Description:** Sessions are stored in memory using `MemoryStore`, which:
- Loses all sessions on server restart
- Cannot scale horizontally
- Memory leaks over time

**Impact:**
- Users unexpectedly logged out on deploys
- Cannot run multiple server instances
- DoS risk from memory exhaustion

**Recommended Fix:** Use Redis or PostgreSQL session store:
```typescript
import connectPgSimple from "connect-pg-simple";
const PgSession = connectPgSimple(session);

store: new PgSession({
  conString: process.env.DATABASE_URL,
  tableName: "user_sessions",
}),
```

---

### 🟡 MEDIUM (Recommended)

#### M1: Missing Cookie Security Flags

**Location:** [server/auth.ts:54-59](server/auth.ts#L54-L59)
**Description:** Session cookies lack `httpOnly` and `sameSite` attributes.

**Impact:**
- Without `httpOnly`: JavaScript can access session cookies (XSS risk)
- Without `sameSite`: CSRF attacks possible

**Recommended Fix:**
```typescript
cookie: {
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000,  // Reduce to 24 hours
},
```

---

#### M2: No Rate Limiting on Authentication

**Location:** [server/routes.ts:91](server/routes.ts#L91)
**Description:** Login endpoint has no rate limiting, enabling brute force attacks.

**Recommended Fix:**
```typescript
import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { message: "Too many login attempts, please try again later" },
});

app.post("/api/auth/login", loginLimiter, passport.authenticate("local"), ...);
```

---

#### M3: Missing Food Entry Delete Endpoint

**Location:** [server/routes.ts](server/routes.ts)
**Description:** No DELETE endpoint exists for food entries, creating an inconsistent API.

**Recommended Fix:** Add with ownership verification:
```typescript
app.delete("/api/food/:id", requireAuth, async (req, res) => {
  const existing = await storage.getFoodEntryById(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: "Entry not found" });
  }
  if (existing.userId !== req.user!.id && req.user!.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  await storage.deleteFoodEntry(req.params.id);
  res.status(204).send();
});
```

---

#### M4: Excessive Session Duration

**Location:** [server/auth.ts:57](server/auth.ts#L57)
**Description:** Sessions last 7 days, which is excessive for health data.

**Recommended Fix:** Reduce to 24 hours with refresh mechanism.

---

### 🟢 LOW (Best Practice)

#### L1: Weak Password Policy

**Location:** [server/routes.ts:114](server/routes.ts#L114)
**Description:** Only minimum 10 character requirement. No complexity rules.

**Recommended Fix:** Add complexity requirements:
```typescript
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{10,}$/;
```

---

#### L2: No MFA/2FA Support

**Description:** Single-factor authentication only.

**Recommended Fix:** Implement TOTP-based 2FA for admin and coach accounts.

---

#### L3: Missing Security Headers

**Description:** No Content-Security-Policy, X-Frame-Options, or other security headers.

**Recommended Fix:** Add helmet middleware:
```typescript
import helmet from "helmet";
app.use(helmet());
```

---

## 5. PRIORITIZED ACTION LIST

### Immediate (Before Production)

| Priority | Issue | File | Effort |
|----------|-------|------|--------|
| 1 | Fix metric entry update ownership | routes.ts:191 | Low |
| 2 | Fix metric entry delete ownership | routes.ts:203 | Low |
| 3 | Fix food entry update ownership | routes.ts:251 | Low |
| 4 | Add getMetricEntryById to storage | storage.ts | Low |
| 5 | Add getFoodEntryById to storage | storage.ts | Low |

### Short-Term (Within 1 Week)

| Priority | Issue | File | Effort |
|----------|-------|------|--------|
| 6 | Remove hardcoded session secret | auth.ts:45 | Low |
| 7 | Add cookie security flags | auth.ts:54-59 | Low |
| 8 | Add login rate limiting | routes.ts:91 | Low |
| 9 | Add DELETE /api/food/:id endpoint | routes.ts | Low |

### Medium-Term (Within 1 Month)

| Priority | Issue | File | Effort |
|----------|-------|------|--------|
| 10 | Replace MemoryStore with Redis/PG | auth.ts:48 | Medium |
| 11 | Add security headers (helmet) | index.ts | Low |
| 12 | Reduce session duration | auth.ts:57 | Low |
| 13 | Strengthen password policy | routes.ts:114 | Low |

### Long-Term (Roadmap)

| Priority | Issue | Effort |
|----------|-------|--------|
| 14 | Implement 2FA for admin/coach | High |
| 15 | Add comprehensive audit logging | Medium |
| 16 | Implement role-based middleware | Medium |

---

## 6. STORAGE LAYER HELPER METHODS NEEDED

Add these methods to [server/storage.ts](server/storage.ts):

```typescript
async getMetricEntryById(id: string): Promise<MetricEntry | undefined> {
  const [entry] = await db
    .select()
    .from(metricEntries)
    .where(eq(metricEntries.id, id));
  return entry;
}

async getFoodEntryById(id: string): Promise<FoodEntry | undefined> {
  const [entry] = await db
    .select()
    .from(foodEntries)
    .where(eq(foodEntries.id, id));
  return entry;
}

async deleteFoodEntry(id: string): Promise<boolean> {
  const result = await db
    .delete(foodEntries)
    .where(eq(foodEntries.id, id));
  return result.rowCount > 0;
}
```

---

## 7. CONCLUSION

The Metabolic-Tracker application has a solid authentication foundation using Passport.js with secure password hashing. However, **critical data isolation vulnerabilities** in the metric and food entry endpoints must be addressed immediately before production deployment.

The three critical IDOR (Insecure Direct Object Reference) vulnerabilities allow any authenticated user to modify or delete any other user's health data, which could have serious implications for patient safety and data integrity in a health application.

**Recommended Immediate Actions:**
1. Add ownership verification to all PUT/DELETE endpoints
2. Add helper methods to storage layer for fetching individual entries
3. Remove hardcoded session secret fallback
4. Add cookie security flags

---

*Report generated by Claude Code Security Review*

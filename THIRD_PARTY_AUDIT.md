# Third-Party Integration & External API Security Audit

**Audit Date:** 2026-02-02
**Application:** Metabolic-Tracker (Healthcare App)

---

## Executive Summary

This audit identifies all third-party integrations and external API calls in the Metabolic-Tracker application, assessing data flows, credential management, and HIPAA compliance considerations.

| Category | Risk Level | Finding |
|----------|-----------|---------|
| **OpenAI API** | **HIGH** | PHI (food descriptions, meal photos) sent to non-HIPAA-compliant service |
| **Credential Storage** | **GOOD** | API keys stored in environment variables |
| **NPM Dependencies** | **HIGH** | 11 vulnerabilities (4 high severity) |
| **Secret Exposure** | **GOOD** | .env is in .gitignore |

---

## 1. External Service Inventory

### 1.1 OpenAI API

**Purpose:** Food analysis (text and image recognition for nutrition estimation)

| Attribute | Value |
|-----------|-------|
| **SDK Version** | openai ^6.15.0 |
| **Models Used** | gpt-4o-mini, gpt-5.1, gpt-image-1 |
| **Endpoints** | /api/food/analyze, /api/food/analyze-image |
| **HIPAA BAA Available** | ❌ No (OpenAI does not sign BAAs for standard API) |

**Data Sent to OpenAI:**

| Data Type | Endpoint | PHI Risk |
|-----------|----------|----------|
| Food descriptions (rawText) | /api/food/analyze | **MEDIUM** - May contain dietary restrictions, health conditions |
| Meal photos | /api/food/analyze-image | **HIGH** - Images may reveal health conditions |
| Additional text context | /api/food/analyze-image | **MEDIUM** - User-provided meal context |

**Code Locations:**
- [server/routes.ts:342-383](server/routes.ts#L342-L383) - Text analysis
- [server/routes.ts:385-462](server/routes.ts#L385-L462) - Image analysis
- [server/replit_integrations/chat/routes.ts](server/replit_integrations/chat/routes.ts) - Chat integration
- [server/replit_integrations/image/client.ts](server/replit_integrations/image/client.ts) - Image generation

**Credential Configuration:**
```typescript
// server/routes.ts:28-31
const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;
```

**HIPAA Compliance Status:** ❌ **NOT COMPLIANT**

OpenAI's standard API does not offer HIPAA compliance or Business Associate Agreements (BAAs). Health data (food consumption patterns, meal photos) sent to OpenAI may constitute PHI under HIPAA.

**Recommendations:**
1. **Immediate:** Add user consent disclosure that AI features transmit data to third parties
2. **Short-term:** Evaluate HIPAA-compliant AI alternatives (Azure OpenAI with BAA, AWS HealthScribe)
3. **Long-term:** Consider on-premises or private cloud AI models for PHI processing

---

### 1.2 PostgreSQL Database (Neon)

**Purpose:** Primary data storage

| Attribute | Value |
|-----------|-------|
| **Driver** | pg ^8.16.3 |
| **ORM** | drizzle-orm ^0.39.3 |
| **Connection** | DATABASE_URL environment variable |

**Data Stored:**
- User PII (email, phone, date of birth)
- Health metrics (blood pressure, glucose, weight, ketones)
- Food consumption data
- Messaging between participants and coaches

**Code Location:** [server/storage.ts:33-42](server/storage.ts#L33-L42)

**Security Configuration:**
```typescript
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }
    : process.env.DATABASE_URL?.includes("ssl=true")
      ? { rejectUnauthorized: false }
      : false,
});
```

**HIPAA Compliance Status:** ⚠️ **DEPENDENT ON PROVIDER**

Neon (if used) offers HIPAA-compliant hosting with BAA available on enterprise plans. Verify:
- [ ] BAA is signed with database provider
- [ ] Database encryption at rest is enabled
- [ ] Database backups are encrypted

---

### 1.3 Session Storage

**Purpose:** User session management

| Environment | Storage |
|-------------|---------|
| Development | memorystore (in-memory) |
| Production | connect-pg-simple (PostgreSQL) |

**Code Location:** [server/auth.ts:87-100](server/auth.ts#L87-L100)

**Security:** Sessions stored in database with auto-pruning, no external service calls.

---

## 2. Credential Management Assessment

### 2.1 Environment Variables Used

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Session cookie signing | Production |
| `PHI_ENCRYPTION_KEY` | Field-level encryption | Production |
| `OPENAI_API_KEY` | OpenAI API access | Optional |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit AI integration | Optional |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Custom OpenAI endpoint | Optional |
| `PORT` | Server port | No (default: 5000) |
| `NODE_ENV` | Environment mode | No |

### 2.2 Secrets in Version Control

**Status:** ✅ **GOOD**

The `.gitignore` file properly excludes sensitive files:
```
.env
.env.local
```

**Verification:** No hardcoded secrets found in TypeScript/JavaScript source files.

---

## 3. NPM Dependency Security Audit

### 3.1 Vulnerability Summary

```
11 vulnerabilities (2 low, 5 moderate, 4 high)
```

### 3.2 High Severity Vulnerabilities

| Package | Severity | Description | Fix |
|---------|----------|-------------|-----|
| **jspdf** ≤4.0.0 | HIGH | Multiple vulnerabilities including XSS, DoS | Upgrade to >4.0.0 |
| **qs** <6.14.1 | HIGH | DoS via memory exhaustion | `npm audit fix` |
| **express** | HIGH | Inherits qs vulnerability | Update via body-parser |

### 3.3 Moderate Severity Vulnerabilities

| Package | Severity | Description |
|---------|----------|-------------|
| **esbuild** ≤0.24.2 | Moderate | Development server request bypass |
| **lodash** 4.x | Moderate | Prototype pollution in _.unset/_.omit |
| **on-headers** <1.1.0 | Moderate | HTTP response header manipulation |

### 3.4 Remediation Commands

```bash
# Fix non-breaking vulnerabilities
npm audit fix

# Fix all vulnerabilities (may include breaking changes)
npm audit fix --force

# Or manually update specific packages
npm update jspdf qs express-session
```

---

## 4. Data Flow Analysis

### 4.1 Data Sent to External Services

```
┌─────────────────┐      ┌─────────────────┐
│   User Browser  │      │   Mobile App    │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │  HTTPS (TLS 1.2+)      │
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────┐
│           Metabolic-Tracker API         │
│         (Express.js Server)             │
└────┬───────────────┬───────────────┬────┘
     │               │               │
     │ SSL           │ HTTPS         │ SSL
     │               │               │
     ▼               ▼               ▼
┌─────────┐   ┌─────────────┐   ┌─────────┐
│PostgreSQL│   │  OpenAI API  │   │ Session │
│ (Neon)  │   │ (api.openai │   │  Store  │
│         │   │    .com)    │   │  (PG)   │
└─────────┘   └─────────────┘   └─────────┘
    PHI            PHI*             Session
   Storage       Processing         Data
```

*PHI processed but not stored by OpenAI (per their data usage policy)

### 4.2 PHI/PII Transmission Summary

| Data Type | Internal Storage | External Transmission |
|-----------|------------------|----------------------|
| Email, Phone | PostgreSQL | ❌ None |
| Date of Birth | PostgreSQL | ❌ None |
| Health Metrics | PostgreSQL | ❌ None |
| Food Descriptions | PostgreSQL | ⚠️ OpenAI (for analysis) |
| Meal Photos | Not stored | ⚠️ OpenAI (for analysis) |
| Messages | PostgreSQL | ❌ None |

---

## 5. HIPAA Compliance Checklist

### 5.1 Technical Safeguards

| Requirement | Status | Notes |
|-------------|--------|-------|
| Access Controls | ✅ | Role-based access implemented |
| Encryption in Transit | ✅ | TLS/HTTPS enforced |
| Encryption at Rest | ⚠️ | DB encryption depends on provider; field-level encryption available |
| Audit Logging | ⚠️ | Basic logging; needs enhancement |
| Automatic Logoff | ✅ | 30-minute session timeout |

### 5.2 Administrative Safeguards

| Requirement | Status | Action Required |
|-------------|--------|-----------------|
| BAA with Database Provider | ❓ | Verify with Neon |
| BAA with AI Provider | ❌ | OpenAI does not offer standard BAA |
| Data Processing Agreement | ❌ | Needed for OpenAI |
| Risk Assessment | ⚠️ | This audit; needs formal documentation |

### 5.3 Third-Party Service HIPAA Status

| Service | HIPAA Compliant | BAA Available |
|---------|-----------------|---------------|
| OpenAI API | ❌ No | ❌ No |
| Neon PostgreSQL | ⚠️ Enterprise only | ⚠️ Enterprise only |
| Replit Hosting | ❓ Verify | ❓ Verify |

---

## 6. Recommendations

### 6.1 Critical (Immediate Action)

1. **OpenAI PHI Transmission**
   - Add explicit user consent for AI-powered food analysis
   - Display disclosure: "Food descriptions and images are processed by OpenAI"
   - Consider making AI features opt-in

2. **NPM Vulnerabilities**
   ```bash
   npm audit fix
   ```

### 6.2 High Priority

3. **HIPAA-Compliant AI Alternative**
   - Evaluate Azure OpenAI Service (offers BAA)
   - Evaluate AWS HealthScribe
   - Consider local/on-premises AI models

4. **Database Provider BAA**
   - Verify BAA status with Neon
   - If unavailable, migrate to HIPAA-compliant provider (AWS RDS, Azure PostgreSQL)

### 6.3 Medium Priority

5. **Enhanced Audit Logging**
   - Implement structured logging for PHI access
   - Log all third-party API calls with sanitized payloads

6. **Data Minimization**
   - Review what data is sent to OpenAI
   - Strip unnecessary context from food analysis requests

### 6.4 Documentation Required

7. **Privacy Policy Updates**
   - Document third-party data processors
   - Describe AI data handling

8. **User Consent Mechanism**
   - Implement explicit consent for AI features
   - Allow users to opt-out of AI analysis

---

## 7. Files Reviewed

| File | Integration |
|------|-------------|
| server/routes.ts | OpenAI API calls |
| server/storage.ts | PostgreSQL connection |
| server/auth.ts | Session storage |
| server/replit_integrations/chat/routes.ts | Replit AI chat |
| server/replit_integrations/image/client.ts | Replit AI images |
| package.json | Dependency audit |
| .gitignore | Secret exclusion |
| .env.example | Credential documentation |

---

## Appendix A: OpenAI Data Usage Policy

Per OpenAI's API data usage policy (as of 2024):
- API data is **not used to train models** by default
- Data may be retained for **30 days** for abuse monitoring
- No HIPAA BAA available for standard API access

For healthcare applications, this retention period may conflict with data minimization principles.

---

## Appendix B: Recommended HIPAA-Compliant Alternatives

| Provider | Service | HIPAA BAA | Notes |
|----------|---------|-----------|-------|
| Microsoft Azure | Azure OpenAI | ✅ Yes | GPT-4 with BAA |
| Amazon AWS | Bedrock | ✅ Yes | Claude, Llama models |
| Google Cloud | Vertex AI | ✅ Yes | Gemini, PaLM models |
| Anthropic | Claude API | ⚠️ Enterprise | Contact for BAA |


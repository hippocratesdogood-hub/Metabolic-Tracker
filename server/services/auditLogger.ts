/**
 * Audit Logging Service
 *
 * HIPAA-compliant audit logging for security and compliance.
 *
 * Key principles:
 * - Immutable: Logs are append-only, never updated or deleted
 * - No PHI: Only resource IDs stored, never actual health data
 * - Complete: All security-relevant events captured
 * - Timestamped: All entries include timezone-aware timestamps
 *
 * Retention: 6+ years per HIPAA requirements (enforced via database policies)
 */

import type { Request } from "express";
import { db } from "../storage";
import {
  auditLogs,
  type AuditAction,
  type AuditResult,
  type AuditResourceType,
} from "../../shared/schema";

/** Minimal user info needed for audit logging */
export interface AuditUser {
  id: string;
  role: string;
}

export interface AuditContext {
  /** The authenticated user performing the action (null for unauthenticated) */
  user?: AuditUser | null;
  /** Express request for extracting IP, user agent, path */
  req?: Request;
  /** ID of the resource being accessed/modified */
  resourceId?: string;
  /** If action affects another user (e.g., coach viewing participant data) */
  targetUserId?: string;
  /** Additional metadata (must not contain PHI) */
  metadata?: Record<string, unknown>;
  /** Error code for failures */
  errorCode?: string;
  /** Error message for failures (must not contain PHI) */
  errorMessage?: string;
}

/**
 * Extract client IP address from request
 * Handles proxied requests (X-Forwarded-For header)
 */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    // X-Forwarded-For can contain multiple IPs; first is the client
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0].split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Extract user agent, truncated to prevent excessive storage
 */
function getUserAgent(req: Request): string {
  const ua = req.headers["user-agent"] || "unknown";
  // Truncate to 500 chars to prevent abuse
  return ua.substring(0, 500);
}

/**
 * Sanitize metadata to ensure no PHI is logged
 * Removes or redacts potentially sensitive fields
 */
function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!metadata) return null;

  const sensitiveFields = [
    "password",
    "passwordHash",
    "email",
    "phone",
    "dateOfBirth",
    "dob",
    "ssn",
    "address",
    "healthData",
    "diagnosis",
    "medication",
    "valueJson",
    "rawText",
    "body",
    "notes",
    "aiOutputJson",
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      // Don't recurse into nested objects to avoid complexity
      sanitized[key] = "[OBJECT]";
    } else {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * Main audit logging function
 *
 * @param action - The action being performed
 * @param result - The result of the action (SUCCESS, FAILURE, DENIED)
 * @param resourceType - The type of resource being affected
 * @param context - Additional context (user, request, metadata)
 */
export async function logAuditEvent(
  action: AuditAction,
  result: AuditResult,
  resourceType: AuditResourceType,
  context: AuditContext = {}
): Promise<void> {
  try {
    const { user, req, resourceId, targetUserId, metadata, errorCode, errorMessage } =
      context;

    await db.insert(auditLogs).values({
      timestamp: new Date(),
      userId: user?.id ?? null,
      userRole: user?.role ?? null,
      action,
      result,
      resourceType,
      resourceId: resourceId ?? null,
      targetUserId: targetUserId ?? null,
      ipAddress: req ? getClientIp(req) : null,
      userAgent: req ? getUserAgent(req) : null,
      requestPath: req?.path ?? null,
      requestMethod: req?.method ?? null,
      metadata: sanitizeMetadata(metadata),
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
    });
  } catch (error) {
    // Audit logging should never crash the application
    // Log to console as fallback, but don't throw
    console.error("[AUDIT_LOG_ERROR] Failed to write audit log:", {
      action,
      result,
      resourceType,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// ============================================================================
// Convenience functions for common audit events
// ============================================================================

/**
 * Log a successful login
 */
export async function auditLoginSuccess(user: AuditUser, req: Request): Promise<void> {
  await logAuditEvent("LOGIN_SUCCESS", "SUCCESS", "SESSION", {
    user,
    req,
    metadata: { authMethod: "local" },
  });
}

/**
 * Log a failed login attempt
 */
export async function auditLoginFailure(
  req: Request,
  email: string,
  reason: string
): Promise<void> {
  await logAuditEvent("LOGIN_FAILURE", "FAILURE", "SESSION", {
    req,
    // Don't store the actual email, just that a login was attempted
    metadata: {
      reason,
      // Hash or truncate email to allow pattern detection without storing PII
      emailDomain: email.includes("@") ? email.split("@")[1] : "unknown",
    },
    errorCode: "AUTH_FAILED",
    errorMessage: reason,
  });
}

/**
 * Log a logout event
 */
export async function auditLogout(user: AuditUser, req: Request): Promise<void> {
  await logAuditEvent("LOGOUT", "SUCCESS", "SESSION", { user, req });
}

/**
 * Log access to PHI (viewing health data)
 */
export async function auditPhiAccess(
  user: AuditUser,
  req: Request,
  resourceType: AuditResourceType,
  resourceId: string,
  targetUserId?: string
): Promise<void> {
  await logAuditEvent("PHI_VIEW", "SUCCESS", resourceType, {
    user,
    req,
    resourceId,
    targetUserId,
  });
}

/**
 * Log PHI export operation
 */
export async function auditPhiExport(
  user: AuditUser,
  req: Request,
  resourceType: AuditResourceType,
  exportFormat: string,
  recordCount: number,
  targetUserId?: string
): Promise<void> {
  await logAuditEvent("PHI_EXPORT", "SUCCESS", resourceType, {
    user,
    req,
    targetUserId,
    metadata: {
      exportFormat,
      recordCount,
    },
  });
}

/**
 * Log record creation
 */
export async function auditRecordCreate(
  user: AuditUser,
  req: Request,
  resourceType: AuditResourceType,
  resourceId: string
): Promise<void> {
  await logAuditEvent("RECORD_CREATE", "SUCCESS", resourceType, {
    user,
    req,
    resourceId,
  });
}

/**
 * Log record update
 */
export async function auditRecordUpdate(
  user: AuditUser,
  req: Request,
  resourceType: AuditResourceType,
  resourceId: string,
  changedFields?: string[]
): Promise<void> {
  await logAuditEvent("RECORD_UPDATE", "SUCCESS", resourceType, {
    user,
    req,
    resourceId,
    metadata: changedFields ? { changedFields } : undefined,
  });
}

/**
 * Log record deletion
 */
export async function auditRecordDelete(
  user: AuditUser,
  req: Request,
  resourceType: AuditResourceType,
  resourceId: string
): Promise<void> {
  await logAuditEvent("RECORD_DELETE", "SUCCESS", resourceType, {
    user,
    req,
    resourceId,
  });
}

/**
 * Log role change
 */
export async function auditRoleChange(
  user: AuditUser,
  req: Request,
  targetUserId: string,
  oldRole: string,
  newRole: string
): Promise<void> {
  await logAuditEvent("ROLE_CHANGE", "SUCCESS", "USER", {
    user,
    req,
    targetUserId,
    metadata: { oldRole, newRole },
  });
}

/**
 * Log coach assignment
 */
export async function auditCoachAssignment(
  user: AuditUser,
  req: Request,
  participantId: string,
  coachId: string | null,
  previousCoachId: string | null
): Promise<void> {
  await logAuditEvent("COACH_ASSIGNMENT", "SUCCESS", "USER", {
    user,
    req,
    targetUserId: participantId,
    metadata: {
      newCoachId: coachId ?? "unassigned",
      previousCoachId: previousCoachId ?? "none",
    },
  });
}

/**
 * Log authorization failure (access denied)
 */
export async function auditAccessDenied(
  user: AuditUser | null,
  req: Request,
  resourceType: AuditResourceType,
  resourceId?: string,
  reason?: string
): Promise<void> {
  await logAuditEvent("ACCESS_DENIED", "DENIED", resourceType, {
    user: user ?? undefined,
    req,
    resourceId,
    errorCode: "ACCESS_DENIED",
    errorMessage: reason ?? "Insufficient permissions",
  });
}

/**
 * Log rate limit exceeded
 */
export async function auditRateLimitExceeded(
  req: Request,
  endpoint: string
): Promise<void> {
  await logAuditEvent("RATE_LIMIT_EXCEEDED", "DENIED", "SYSTEM", {
    req,
    metadata: { endpoint },
    errorCode: "RATE_LIMIT",
    errorMessage: "Too many requests",
  });
}

/**
 * Log user creation by admin
 */
export async function auditUserCreated(
  adminUser: AuditUser,
  req: Request,
  newUserId: string,
  newUserRole: string
): Promise<void> {
  await logAuditEvent("USER_CREATED", "SUCCESS", "USER", {
    user: adminUser,
    req,
    resourceId: newUserId,
    metadata: { newUserRole },
  });
}

/**
 * Log password change
 */
export async function auditPasswordChange(
  user: AuditUser,
  req: Request,
  selfChange: boolean
): Promise<void> {
  await logAuditEvent("PASSWORD_CHANGE", "SUCCESS", "USER", {
    user,
    req,
    resourceId: user.id,
    metadata: { selfChange },
  });
}

/**
 * Log report generation
 */
export async function auditReportGenerated(
  user: AuditUser,
  req: Request,
  reportType: string,
  targetUserId?: string
): Promise<void> {
  await logAuditEvent("REPORT_GENERATED", "SUCCESS", "REPORT", {
    user,
    req,
    targetUserId,
    metadata: { reportType },
  });
}

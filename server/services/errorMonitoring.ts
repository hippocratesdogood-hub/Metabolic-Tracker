/**
 * Error Monitoring Service
 *
 * Comprehensive error tracking, classification, and alerting for the Metabolic-Tracker pilot.
 * Integrates with Sentry for production error monitoring while maintaining HIPAA compliance.
 *
 * IMPORTANT: This service NEVER logs PHI (Protected Health Information).
 * All user context is limited to user ID and role - no health data, names, or emails.
 */

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import type { Request, Response, NextFunction } from "express";

// ============================================================================
// ERROR SEVERITY CLASSIFICATION
// ============================================================================

export enum ErrorSeverity {
  /** Data loss, security breach, auth failure, payment issues */
  CRITICAL = "critical",
  /** Feature broken for all users, calculation errors, data corruption */
  HIGH = "high",
  /** Feature broken for some users, performance degradation */
  MEDIUM = "medium",
  /** UI glitches, non-blocking errors, deprecation warnings */
  LOW = "low",
}

export interface ErrorContext {
  /** User ID (no PHI) */
  userId?: string;
  /** User role */
  userRole?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** Action being performed */
  action?: string;
  /** Resource type involved */
  resourceType?: string;
  /** Resource ID (no PHI) */
  resourceId?: string;
  /** Additional safe metadata (no PHI) */
  metadata?: Record<string, string | number | boolean>;
}

export interface ErrorReport {
  severity: ErrorSeverity;
  error: Error;
  context: ErrorContext;
  fingerprint?: string[];
  tags?: Record<string, string>;
}

// ============================================================================
// ERROR CLASSIFICATION RULES
// ============================================================================

interface ErrorClassificationRule {
  pattern: RegExp | string;
  severity: ErrorSeverity;
  category: string;
  shouldAlert: boolean;
}

const ERROR_CLASSIFICATION_RULES: ErrorClassificationRule[] = [
  // CRITICAL - Immediate attention required
  {
    pattern: /unauthorized|authentication.*fail|invalid.*token|session.*expired/i,
    severity: ErrorSeverity.CRITICAL,
    category: "auth",
    shouldAlert: true,
  },
  {
    pattern: /security|injection|xss|csrf/i,
    severity: ErrorSeverity.CRITICAL,
    category: "security",
    shouldAlert: true,
  },
  {
    pattern: /data.*loss|corruption|integrity/i,
    severity: ErrorSeverity.CRITICAL,
    category: "data_integrity",
    shouldAlert: true,
  },
  {
    pattern: /database.*connection|pool.*exhausted|deadlock/i,
    severity: ErrorSeverity.CRITICAL,
    category: "database",
    shouldAlert: true,
  },

  // HIGH - Urgent but not immediate
  {
    pattern: /calculation.*error|formula.*invalid|NaN|Infinity/i,
    severity: ErrorSeverity.HIGH,
    category: "calculation",
    shouldAlert: true,
  },
  {
    pattern: /unique.*constraint|duplicate.*entry|conflict/i,
    severity: ErrorSeverity.HIGH,
    category: "data",
    shouldAlert: false,
  },
  {
    pattern: /openai|ai.*service|api.*timeout/i,
    severity: ErrorSeverity.HIGH,
    category: "external_service",
    shouldAlert: true,
  },
  {
    pattern: /permission.*denied|forbidden|access.*denied/i,
    severity: ErrorSeverity.HIGH,
    category: "authorization",
    shouldAlert: false,
  },

  // MEDIUM - Monitor but don't wake anyone up
  {
    pattern: /validation.*failed|invalid.*input|bad.*request/i,
    severity: ErrorSeverity.MEDIUM,
    category: "validation",
    shouldAlert: false,
  },
  {
    pattern: /not.*found|404|resource.*missing/i,
    severity: ErrorSeverity.MEDIUM,
    category: "not_found",
    shouldAlert: false,
  },
  {
    pattern: /rate.*limit|too.*many.*requests|throttl/i,
    severity: ErrorSeverity.MEDIUM,
    category: "rate_limit",
    shouldAlert: false,
  },
  {
    pattern: /timeout|timed.*out|slow.*query/i,
    severity: ErrorSeverity.MEDIUM,
    category: "performance",
    shouldAlert: true,
  },

  // LOW - Log but don't alert
  {
    pattern: /deprecated|warning|notice/i,
    severity: ErrorSeverity.LOW,
    category: "deprecation",
    shouldAlert: false,
  },
  {
    pattern: /ui|render|display|layout/i,
    severity: ErrorSeverity.LOW,
    category: "ui",
    shouldAlert: false,
  },
];

// ============================================================================
// SENTRY CONFIGURATION
// ============================================================================

let sentryInitialized = false;

/**
 * Initialize Sentry error monitoring.
 * Call this once during application startup.
 */
export function initializeErrorMonitoring(): void {
  if (sentryInitialized) {
    console.warn("[ErrorMonitoring] Already initialized");
    return;
  }

  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || "development";

  if (!dsn) {
    console.warn("[ErrorMonitoring] SENTRY_DSN not configured. Error tracking disabled.");
    sentryInitialized = true;
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: process.env.npm_package_version || "unknown",

    // Performance monitoring
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    profilesSampleRate: environment === "production" ? 0.1 : 1.0,

    integrations: [
      nodeProfilingIntegration(),
    ],

    // Filter out sensitive data BEFORE it leaves the server
    beforeSend(event, hint) {
      // Only process error events, pass through transactions
      if (event.type === "transaction") {
        return event;
      }
      // Remove any potential PHI from the event
      return sanitizeEvent(event) as typeof event;
    },

    // Filter breadcrumbs for PHI
    beforeBreadcrumb(breadcrumb) {
      return sanitizeBreadcrumb(breadcrumb);
    },

    // Don't send errors in test environment
    enabled: environment !== "test",

    // Ignore common non-errors
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error exception captured",
      "Network request failed",
      "Load failed",
    ],
  });

  sentryInitialized = true;
  console.log(`[ErrorMonitoring] Initialized for ${environment} environment`);
}

// ============================================================================
// PHI SANITIZATION (HIPAA COMPLIANCE)
// ============================================================================

const PHI_PATTERNS = [
  /email/i,
  /phone/i,
  /name/i,
  /address/i,
  /ssn/i,
  /social.*security/i,
  /dob|birth/i,
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /glucose/i,
  /ketone/i,
  /weight/i,
  /blood.*pressure/i,
  /bp/i,
  /waist/i,
  /measurement/i,
  /health/i,
  /medical/i,
  /diagnosis/i,
  /treatment/i,
  /medication/i,
  /calorie/i,
  /protein/i,
  /carb/i,
  /fat/i,
  /fiber/i,
  /macro/i,
  /food/i,
  /meal/i,
];

/**
 * Check if a key might contain PHI
 */
function mightContainPhi(key: string): boolean {
  return PHI_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitize an object by removing PHI fields
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (mightContainPhi(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a Sentry event to remove PHI
 */
function sanitizeEvent(event: Sentry.Event): Sentry.Event {
  // Sanitize request data
  if (event.request) {
    if (event.request.data) {
      event.request.data = sanitizeObject(
        typeof event.request.data === "string"
          ? { body: "[REDACTED]" }
          : (event.request.data as Record<string, unknown>)
      );
    }
    if (event.request.headers) {
      // Remove potentially sensitive headers
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-api-key"];
    }
    if (event.request.query_string) {
      event.request.query_string = "[REDACTED]";
    }
  }

  // Sanitize extra data
  if (event.extra) {
    event.extra = sanitizeObject(event.extra as Record<string, unknown>);
  }

  // Sanitize contexts
  if (event.contexts) {
    event.contexts = sanitizeObject(event.contexts as Record<string, unknown>) as typeof event.contexts;
  }

  // Sanitize user data - only keep ID and role
  if (event.user) {
    event.user = {
      id: event.user.id,
      // Remove email, username, ip_address, etc.
    };
  }

  return event;
}

/**
 * Sanitize a breadcrumb to remove PHI
 */
function sanitizeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.data) {
    breadcrumb.data = sanitizeObject(breadcrumb.data as Record<string, unknown>);
  }
  if (breadcrumb.message) {
    // Check if message might contain PHI
    for (const pattern of PHI_PATTERNS) {
      if (pattern.test(breadcrumb.message)) {
        breadcrumb.message = "[REDACTED]";
        break;
      }
    }
  }
  return breadcrumb;
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify an error based on its message and stack trace
 */
export function classifyError(error: Error): { severity: ErrorSeverity; category: string; shouldAlert: boolean } {
  const errorString = `${error.message} ${error.stack || ""}`;

  for (const rule of ERROR_CLASSIFICATION_RULES) {
    const pattern = typeof rule.pattern === "string" ? new RegExp(rule.pattern, "i") : rule.pattern;
    if (pattern.test(errorString)) {
      return {
        severity: rule.severity,
        category: rule.category,
        shouldAlert: rule.shouldAlert,
      };
    }
  }

  // Default to MEDIUM severity for unknown errors
  return {
    severity: ErrorSeverity.MEDIUM,
    category: "unknown",
    shouldAlert: false,
  };
}

// ============================================================================
// ERROR TRACKING API
// ============================================================================

/**
 * Report an error to the monitoring system.
 * This is the main entry point for error tracking.
 */
export function reportError(report: ErrorReport): string {
  const { severity, error, context, fingerprint, tags } = report;
  const classification = classifyError(error);

  // Set Sentry scope
  Sentry.withScope((scope) => {
    // Set severity level
    scope.setLevel(severityToSentryLevel(severity));

    // Set user context (ID only - no PHI)
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    // Set tags for filtering
    scope.setTags({
      severity,
      category: classification.category,
      userRole: context.userRole || "unknown",
      action: context.action || "unknown",
      ...tags,
    });

    // Set safe context
    scope.setContext("error_context", {
      requestId: context.requestId,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      ...context.metadata,
    });

    // Set fingerprint for grouping
    if (fingerprint) {
      scope.setFingerprint(fingerprint);
    }

    // Capture the exception
    Sentry.captureException(error);
  });

  // Log to console as well (for development and backup)
  const logLevel = severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH ? "error" : "warn";
  console[logLevel](
    `[${severity.toUpperCase()}] ${classification.category}: ${error.message}`,
    {
      requestId: context.requestId,
      userId: context.userId,
      action: context.action,
    }
  );

  // Return event ID for reference
  return Sentry.lastEventId() || "no-event-id";
}

/**
 * Convert our severity to Sentry level
 */
function severityToSentryLevel(severity: ErrorSeverity): Sentry.SeverityLevel {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return "fatal";
    case ErrorSeverity.HIGH:
      return "error";
    case ErrorSeverity.MEDIUM:
      return "warning";
    case ErrorSeverity.LOW:
      return "info";
  }
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Express middleware to add request ID and set up error context
 */
export function requestTrackingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate and attach request ID
  const requestId = generateRequestId();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  // Set request context for Sentry
  Sentry.setTag("request_id", requestId);

  next();
}

/**
 * Express error handling middleware
 * Should be added LAST in the middleware chain
 */
export function errorHandlingMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const classification = classifyError(err);

  // Build error context
  const context: ErrorContext = {
    userId: (req.user as any)?.id,
    userRole: (req.user as any)?.role,
    requestId: req.requestId,
    action: `${req.method} ${req.path}`,
    metadata: {
      statusCode: res.statusCode || 500,
      method: req.method,
      path: req.path,
    },
  };

  // Report to monitoring
  const eventId = reportError({
    severity: classification.severity,
    error: err,
    context,
    tags: {
      endpoint: req.path,
      method: req.method,
    },
  });

  // Send appropriate response
  const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;

  // In production, don't leak error details
  const message =
    process.env.NODE_ENV === "production" && statusCode === 500
      ? "Internal Server Error"
      : err.message;

  res.status(statusCode).json({
    message,
    requestId: req.requestId,
    eventId: process.env.NODE_ENV !== "production" ? eventId : undefined,
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Capture a message (non-error) with severity
 */
export function captureMessage(message: string, severity: ErrorSeverity, context?: ErrorContext): void {
  Sentry.withScope((scope) => {
    scope.setLevel(severityToSentryLevel(severity));
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context) {
      scope.setContext("message_context", context as Record<string, unknown>);
    }
    Sentry.captureMessage(message);
  });
}

/**
 * Set user context for subsequent error reports
 */
export function setUserContext(userId: string, role: string): void {
  Sentry.setUser({ id: userId });
  Sentry.setTag("userRole", role);
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext(): void {
  Sentry.setUser(null);
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, string | number | boolean>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    data: data ? sanitizeObject(data) : undefined,
    level: "info",
  });
}

/**
 * Flush pending events (call before shutdown)
 */
export async function flushEvents(timeout: number = 2000): Promise<boolean> {
  return Sentry.close(timeout);
}

// ============================================================================
// TYPE AUGMENTATION
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export default {
  initializeErrorMonitoring,
  reportError,
  classifyError,
  captureMessage,
  setUserContext,
  clearUserContext,
  addBreadcrumb,
  flushEvents,
  requestTrackingMiddleware,
  errorHandlingMiddleware,
  ErrorSeverity,
};

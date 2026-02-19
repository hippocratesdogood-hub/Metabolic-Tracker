/**
 * Client-Side Error Tracking
 *
 * Comprehensive error tracking for the Metabolic-Tracker frontend.
 * Integrates with Sentry for production monitoring while maintaining HIPAA compliance.
 *
 * IMPORTANT: This module NEVER captures PHI. All user context is limited to
 * user ID and role - no health data, names, emails, or measurements.
 */

import * as Sentry from "@sentry/react";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Initialize Sentry for client-side error tracking.
 * Call this once during app initialization.
 */
export function initializeErrorTracking(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN || "https://c6affe32264ac72d5bb3ad37462f400e@o4510829883555840.ingest.us.sentry.io/4510829891944448";
  const environment = import.meta.env.MODE || "development";

  if (!dsn) {
    console.warn("[ErrorTracking] VITE_SENTRY_DSN not configured. Error tracking disabled.");
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: import.meta.env.VITE_APP_VERSION || "unknown",

    // Performance monitoring
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,

    // Only trace internal API calls (top-level in Sentry v8)
    tracePropagationTargets: [/^\/api\//],

    // Session replay (with PHI filtering)
    replaysSessionSampleRate: environment === "production" ? 0.1 : 0,
    replaysOnErrorSampleRate: environment === "production" ? 1.0 : 0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text by default (HIPAA compliance)
        maskAllText: true,
        // Block all media
        blockAllMedia: true,
        // Mask all inputs
        maskAllInputs: true,
      }),
    ],

    // Filter sensitive data before sending
    beforeSend(event, hint) {
      // Only process error events, pass through transactions
      if (event.type === "transaction") {
        return event;
      }
      return sanitizeClientEvent(event) as typeof event;
    },

    // Filter breadcrumbs for sensitive data
    beforeBreadcrumb(breadcrumb) {
      return sanitizeBreadcrumb(breadcrumb);
    },

    // Don't send errors in development by default
    enabled: environment === "production" || import.meta.env.VITE_ENABLE_ERROR_TRACKING === "true",

    // Ignore common non-errors
    ignoreErrors: [
      // Network errors
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      "NetworkError",
      // Browser-specific
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Extension errors
      "Extension context invalidated",
      // User navigation
      "AbortError",
      // Non-errors
      "Non-Error exception captured",
      "Non-Error promise rejection captured",
    ],

    // Don't track these URLs
    denyUrls: [
      // Chrome extensions
      /extensions\//i,
      /^chrome:\/\//i,
      // Firefox extensions
      /^moz-extension:\/\//i,
    ],
  });

  console.log(`[ErrorTracking] Initialized for ${environment} environment`);
}

// ============================================================================
// PHI SANITIZATION
// ============================================================================

const PHI_PATTERNS = [
  /email/i,
  /phone/i,
  /name/i,
  /address/i,
  /password/i,
  /glucose/i,
  /ketone/i,
  /weight/i,
  /bp|blood.?pressure/i,
  /waist/i,
  /calorie/i,
  /protein/i,
  /carb/i,
  /fat/i,
  /fiber/i,
  /macro/i,
  /food/i,
  /meal/i,
  /health/i,
  /medical/i,
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
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a Sentry event to remove PHI
 */
function sanitizeClientEvent(event: Sentry.Event): Sentry.Event {
  // Sanitize request data
  if (event.request?.data) {
    event.request.data = "[REDACTED]";
  }

  // Sanitize extra data
  if (event.extra) {
    event.extra = sanitizeObject(event.extra as Record<string, unknown>);
  }

  // Sanitize user - only keep ID
  if (event.user) {
    event.user = { id: event.user.id };
  }

  return event;
}

/**
 * Sanitize a breadcrumb
 */
function sanitizeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  // Filter out breadcrumbs that might contain PHI
  if (breadcrumb.category === "console" && breadcrumb.message) {
    for (const pattern of PHI_PATTERNS) {
      if (pattern.test(breadcrumb.message)) {
        return null; // Don't include this breadcrumb
      }
    }
  }

  if (breadcrumb.data) {
    breadcrumb.data = sanitizeObject(breadcrumb.data as Record<string, unknown>);
  }

  return breadcrumb;
}

// ============================================================================
// ERROR TRACKING API
// ============================================================================

export enum ErrorSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export interface ErrorContext {
  userId?: string;
  userRole?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Report an error to the tracking system
 */
export function reportError(
  error: Error,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context?: ErrorContext
): string {
  const eventId = Sentry.withScope((scope) => {
    // Set severity
    scope.setLevel(severityToSentryLevel(severity));

    // Set user context (ID only)
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }

    // Set tags
    scope.setTags({
      severity,
      component: context?.component || "unknown",
      action: context?.action || "unknown",
      userRole: context?.userRole || "unknown",
    });

    // Set safe metadata
    if (context?.metadata) {
      scope.setContext("metadata", sanitizeObject(context.metadata));
    }

    return Sentry.captureException(error);
  });

  // Also log to console in development
  if (import.meta.env.MODE !== "production") {
    console.error(`[${severity.toUpperCase()}]`, error, context);
  }

  return eventId || "";
}

/**
 * Report a message (non-error)
 */
export function reportMessage(
  message: string,
  severity: ErrorSeverity = ErrorSeverity.LOW,
  context?: ErrorContext
): void {
  Sentry.withScope((scope) => {
    scope.setLevel(severityToSentryLevel(severity));
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    Sentry.captureMessage(message);
  });
}

/**
 * Convert severity to Sentry level
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
// USER CONTEXT
// ============================================================================

/**
 * Set user context for subsequent error reports.
 * Only stores user ID and role (no PHI).
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

// ============================================================================
// BREADCRUMBS
// ============================================================================

/**
 * Add a navigation breadcrumb
 */
export function trackNavigation(from: string, to: string): void {
  Sentry.addBreadcrumb({
    category: "navigation",
    message: `Navigate: ${from} -> ${to}`,
    level: "info",
  });
}

/**
 * Add a user action breadcrumb
 */
export function trackUserAction(action: string, component?: string): void {
  Sentry.addBreadcrumb({
    category: "user",
    message: action,
    data: component ? { component } : undefined,
    level: "info",
  });
}

/**
 * Add an API call breadcrumb
 */
export function trackApiCall(method: string, endpoint: string, status?: number): void {
  Sentry.addBreadcrumb({
    category: "api",
    message: `${method} ${endpoint}`,
    data: status ? { status } : undefined,
    level: status && status >= 400 ? "error" : "info",
  });
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

/**
 * Start a performance span (Sentry v8 API)
 */
export function startSpan(name: string, op: string, callback: () => void): void {
  Sentry.startSpan({ name, op }, callback);
}

// ============================================================================
// REACT INTEGRATION
// ============================================================================

/**
 * Sentry error boundary wrapper
 * Use this to wrap components that might throw errors
 */
export const ErrorBoundary = Sentry.ErrorBoundary;

/**
 * HOC for profiling React components
 */
export const withProfiler = Sentry.withProfiler;

/**
 * Hook for reporting errors from functional components
 */
export function useErrorBoundary() {
  return {
    reportError: (error: Error, severity?: ErrorSeverity) => {
      reportError(error, severity || ErrorSeverity.HIGH, {
        component: "useErrorBoundary",
      });
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeErrorTracking,
  reportError,
  reportMessage,
  setUserContext,
  clearUserContext,
  trackNavigation,
  trackUserAction,
  trackApiCall,
  startSpan,
  ErrorBoundary,
  withProfiler,
  useErrorBoundary,
  ErrorSeverity,
};

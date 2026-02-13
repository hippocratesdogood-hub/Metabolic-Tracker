/**
 * Error Metrics Collection Service
 *
 * Collects and aggregates error metrics for dashboard visualization and alerting.
 * Provides real-time error rate monitoring and trend analysis.
 *
 * IMPORTANT: This service tracks error counts and categories only - never PHI.
 */

import { ErrorSeverity, classifyError } from "./errorMonitoring";
import { alertingService, AlertMetrics, AlertMessage } from "./alerting";

// ============================================================================
// TYPES
// ============================================================================

interface ErrorMetric {
  timestamp: Date;
  severity: ErrorSeverity;
  category: string;
  userId?: string;
  requestId?: string;
}

interface ErrorSummary {
  total: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<string, number>;
  affectedUsers: Set<string>;
}

interface DashboardMetrics {
  /** Current error rate per minute */
  errorRatePerMinute: number;
  /** Error rate trend (positive = increasing, negative = decreasing) */
  errorRateTrend: number;
  /** Errors in the last 5 minutes by severity */
  last5MinBySeverity: Record<ErrorSeverity, number>;
  /** Errors in the last hour by severity */
  lastHourBySeverity: Record<ErrorSeverity, number>;
  /** Top error categories in the last hour */
  topCategories: Array<{ category: string; count: number }>;
  /** Number of unique affected users in the last hour */
  affectedUsersCount: number;
  /** New error types seen in the last hour */
  newErrorTypes: string[];
  /** Time of last error */
  lastErrorTime: Date | null;
  /** Time series data for charts (last 24 hours, hourly buckets) */
  timeSeries: Array<{ hour: string; count: number; severity: Record<ErrorSeverity, number> }>;
}

// ============================================================================
// ERROR METRICS SERVICE
// ============================================================================

class ErrorMetricsService {
  private metrics: ErrorMetric[] = [];
  private knownErrorTypes: Set<string> = new Set();
  private baselineErrorRate: number = 0;
  private baselineLastUpdated: Date | null = null;

  // Retention settings
  private readonly RETENTION_HOURS = 24;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Record an error metric
   */
  recordError(
    error: Error,
    context: { userId?: string; requestId?: string } = {}
  ): void {
    const classification = classifyError(error);

    const metric: ErrorMetric = {
      timestamp: new Date(),
      severity: classification.severity,
      category: classification.category,
      userId: context.userId,
      requestId: context.requestId,
    };

    this.metrics.push(metric);

    // Track if this is a new error type
    const errorKey = `${classification.category}:${error.message.substring(0, 50)}`;
    if (!this.knownErrorTypes.has(errorKey)) {
      this.knownErrorTypes.add(errorKey);
    }

    // Check if we should trigger alerts
    this.checkAlertConditions();
  }

  /**
   * Get metrics for the dashboard
   */
  getDashboardMetrics(): DashboardMetrics {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get metrics for different time windows
    const last5Min = this.getMetricsSince(fiveMinutesAgo);
    const lastHour = this.getMetricsSince(oneHourAgo);
    const last24Hours = this.getMetricsSince(twentyFourHoursAgo);

    // Calculate error rate
    const currentRate = last5Min.total / 5;
    const previousRate = this.baselineErrorRate;
    const trend = previousRate > 0 ? ((currentRate - previousRate) / previousRate) * 100 : 0;

    // Get top categories
    const categoryEntries = Object.entries(lastHour.byCategory);
    categoryEntries.sort((a, b) => b[1] - a[1]);
    const topCategories = categoryEntries.slice(0, 5).map(([category, count]) => ({
      category,
      count,
    }));

    // Find new error types in the last hour
    const newErrorTypes: string[] = [];
    const recentMetrics = this.metrics.filter((m) => m.timestamp >= oneHourAgo);
    const recentTypes = new Set<string>();
    for (const m of recentMetrics) {
      recentTypes.add(m.category);
    }
    for (const type of Array.from(recentTypes)) {
      if (!this.wasKnownBefore(type, oneHourAgo)) {
        newErrorTypes.push(type);
      }
    }

    // Build time series (hourly buckets for last 24 hours)
    const timeSeries = this.buildTimeSeries(last24Hours);

    // Get last error time
    const lastError = this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;

    return {
      errorRatePerMinute: Math.round(currentRate * 100) / 100,
      errorRateTrend: Math.round(trend * 10) / 10,
      last5MinBySeverity: last5Min.bySeverity,
      lastHourBySeverity: lastHour.bySeverity,
      topCategories,
      affectedUsersCount: lastHour.affectedUsers.size,
      newErrorTypes,
      lastErrorTime: lastError?.timestamp || null,
      timeSeries,
    };
  }

  /**
   * Get alert metrics for rule evaluation
   */
  getAlertMetrics(): AlertMetrics {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const last5Min = this.getMetricsSince(fiveMinutesAgo);
    const lastHour = this.getMetricsSince(oneHourAgo);

    // Find new error types
    const newErrorTypes: string[] = [];
    const recentTypes = new Set<string>();
    const recentMetrics = this.metrics.filter((m) => m.timestamp >= oneHourAgo);
    for (const m of recentMetrics) {
      recentTypes.add(m.category);
    }
    for (const type of Array.from(recentTypes)) {
      if (!this.wasKnownBefore(type, oneHourAgo)) {
        newErrorTypes.push(type);
      }
    }

    return {
      errorCountLast5Min: last5Min.total,
      errorCountLast1Hour: lastHour.total,
      errorRatePerMinute: last5Min.total / 5,
      baselineErrorRatePerMinute: this.baselineErrorRate,
      criticalErrorCount: last5Min.bySeverity[ErrorSeverity.CRITICAL] || 0,
      highErrorCount: last5Min.bySeverity[ErrorSeverity.HIGH] || 0,
      newErrorTypes,
      affectedUsers: lastHour.affectedUsers.size,
    };
  }

  /**
   * Update baseline error rate (call periodically, e.g., daily)
   */
  updateBaseline(): void {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const dayMetrics = this.getMetricsSince(oneDayAgo);
    this.baselineErrorRate = dayMetrics.total / (24 * 60); // errors per minute
    this.baselineLastUpdated = now;

    console.log(`[ErrorMetrics] Updated baseline: ${this.baselineErrorRate.toFixed(2)} errors/min`);
  }

  /**
   * Get summary of metrics since a given time
   */
  private getMetricsSince(since: Date): ErrorSummary {
    const filtered = this.metrics.filter((m) => m.timestamp >= since);

    const summary: ErrorSummary = {
      total: filtered.length,
      bySeverity: {
        [ErrorSeverity.CRITICAL]: 0,
        [ErrorSeverity.HIGH]: 0,
        [ErrorSeverity.MEDIUM]: 0,
        [ErrorSeverity.LOW]: 0,
      },
      byCategory: {},
      affectedUsers: new Set(),
    };

    for (const metric of filtered) {
      summary.bySeverity[metric.severity]++;
      summary.byCategory[metric.category] = (summary.byCategory[metric.category] || 0) + 1;
      if (metric.userId) {
        summary.affectedUsers.add(metric.userId);
      }
    }

    return summary;
  }

  /**
   * Check if an error type was known before a given time
   */
  private wasKnownBefore(type: string, before: Date): boolean {
    return this.metrics.some((m) => m.category === type && m.timestamp < before);
  }

  /**
   * Build time series data for charts
   */
  private buildTimeSeries(
    metrics: ErrorSummary
  ): Array<{ hour: string; count: number; severity: Record<ErrorSeverity, number> }> {
    const now = new Date();
    const series: Array<{ hour: string; count: number; severity: Record<ErrorSeverity, number> }> = [];

    // Create 24 hourly buckets
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const hourMetrics = this.metrics.filter(
        (m) => m.timestamp >= hourStart && m.timestamp < hourEnd
      );

      const severity: Record<ErrorSeverity, number> = {
        [ErrorSeverity.CRITICAL]: 0,
        [ErrorSeverity.HIGH]: 0,
        [ErrorSeverity.MEDIUM]: 0,
        [ErrorSeverity.LOW]: 0,
      };

      for (const m of hourMetrics) {
        severity[m.severity]++;
      }

      series.push({
        hour: hourStart.toISOString(),
        count: hourMetrics.length,
        severity,
      });
    }

    return series;
  }

  /**
   * Check alert conditions and fire alerts if needed
   */
  private async checkAlertConditions(): Promise<void> {
    const metrics = this.getAlertMetrics();

    // Check for critical errors (immediate alert)
    if (metrics.criticalErrorCount > 0) {
      const recentCritical = this.metrics
        .filter((m) => m.severity === ErrorSeverity.CRITICAL)
        .slice(-1)[0];

      await alertingService.sendAlert({
        severity: ErrorSeverity.CRITICAL,
        title: "Critical Error Detected",
        description: `A critical error occurred in category: ${recentCritical?.category || "unknown"}`,
        category: recentCritical?.category || "unknown",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date(),
        dashboardUrl: process.env.SENTRY_DASHBOARD_URL,
      });
    }

    // Evaluate all alert rules
    await alertingService.evaluateRules(metrics);
  }

  /**
   * Clean up old metrics to prevent memory growth
   */
  private cleanup(): void {
    const cutoff = new Date(Date.now() - this.RETENTION_HOURS * 60 * 60 * 1000);
    const beforeCount = this.metrics.length;
    this.metrics = this.metrics.filter((m) => m.timestamp >= cutoff);
    const removed = beforeCount - this.metrics.length;

    if (removed > 0) {
      console.log(`[ErrorMetrics] Cleaned up ${removed} old metrics`);
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup timer (for shutdown)
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.metrics = [];
    this.knownErrorTypes.clear();
    this.baselineErrorRate = 0;
    this.baselineLastUpdated = null;
  }
}

// Export singleton instance
export const errorMetricsService = new ErrorMetricsService();

// Export class for testing
export { ErrorMetricsService };

// Export types
export type { ErrorMetric, ErrorSummary, DashboardMetrics };

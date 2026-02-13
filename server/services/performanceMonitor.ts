/**
 * Performance Monitoring Service
 *
 * Tracks API response times, database query performance, and system metrics.
 * Provides real-time performance data and alerts when budgets are exceeded.
 */

import { PERFORMANCE_BUDGETS, MONITORING_THRESHOLDS } from "../config/performance";
import { reportError, ErrorSeverity, captureMessage } from "./errorMonitoring";

// ============================================================================
// TYPES
// ============================================================================

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: Date;
  type: "api" | "db" | "render" | "external";
  metadata?: Record<string, unknown>;
}

interface PerformanceStats {
  count: number;
  mean: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

interface PerformanceSummary {
  api: Record<string, PerformanceStats>;
  database: Record<string, PerformanceStats>;
  slowQueries: Array<{ query: string; duration: number; timestamp: Date }>;
  budgetViolations: Array<{ metric: string; value: number; budget: number }>;
  overallHealth: "healthy" | "degraded" | "critical";
}

// ============================================================================
// PERFORMANCE MONITOR SERVICE
// ============================================================================

class PerformanceMonitorService {
  private metrics: PerformanceMetric[] = [];
  private slowQueries: Array<{ query: string; duration: number; timestamp: Date }> = [];
  private readonly maxMetrics = 10000;
  private readonly retentionMs = 60 * 60 * 1000; // 1 hour

  /**
   * Record an API response time
   */
  recordApiResponse(endpoint: string, method: string, duration: number, statusCode: number): void {
    const name = `${method} ${endpoint}`;

    this.metrics.push({
      name,
      duration,
      timestamp: new Date(),
      type: "api",
      metadata: { statusCode, endpoint, method },
    });

    // Check against budget
    this.checkApiBudget(endpoint, duration);

    // Cleanup old metrics
    this.cleanup();
  }

  /**
   * Record a database query time
   */
  recordDbQuery(queryName: string, duration: number, sql?: string): void {
    this.metrics.push({
      name: queryName,
      duration,
      timestamp: new Date(),
      type: "db",
      metadata: { sql: sql?.substring(0, 200) },
    });

    // Log slow queries
    if (duration > MONITORING_THRESHOLDS.slowQueryThreshold) {
      this.slowQueries.push({
        query: queryName,
        duration,
        timestamp: new Date(),
      });

      console.warn(`[Performance] Slow query detected: ${queryName} (${duration}ms)`);

      // Report critical slow queries
      if (duration > MONITORING_THRESHOLDS.critical.dbQueryTime) {
        captureMessage(
          `Critical slow query: ${queryName} took ${duration}ms`,
          ErrorSeverity.HIGH,
          { action: "slow_query", metadata: { queryName, duration } }
        );
      }
    }

    this.cleanup();
  }

  /**
   * Record external service call time
   */
  recordExternalCall(service: string, duration: number): void {
    this.metrics.push({
      name: service,
      duration,
      timestamp: new Date(),
      type: "external",
    });
  }

  /**
   * Check if API response time exceeds budget
   */
  private checkApiBudget(endpoint: string, duration: number): void {
    // Find matching budget
    let budget = PERFORMANCE_BUDGETS.apiResponse.getMetrics; // default

    if (endpoint.includes("/auth")) {
      budget = PERFORMANCE_BUDGETS.apiResponse.authentication;
    } else if (endpoint.includes("/metrics")) {
      budget = endpoint.includes("POST")
        ? PERFORMANCE_BUDGETS.apiResponse.createMetric
        : PERFORMANCE_BUDGETS.apiResponse.getMetrics;
    } else if (endpoint.includes("/food")) {
      budget = endpoint.includes("POST")
        ? PERFORMANCE_BUDGETS.apiResponse.createFoodEntry
        : PERFORMANCE_BUDGETS.apiResponse.getFoodEntries;
    } else if (endpoint.includes("/analytics")) {
      budget = PERFORMANCE_BUDGETS.apiResponse.getAnalytics;
    } else if (endpoint.includes("/report")) {
      budget = PERFORMANCE_BUDGETS.apiResponse.generateReport;
    }

    if (duration > budget) {
      console.warn(`[Performance] API budget exceeded: ${endpoint} took ${duration}ms (budget: ${budget}ms)`);
    }

    if (duration > MONITORING_THRESHOLDS.critical.apiResponseTime) {
      captureMessage(
        `Critical API latency: ${endpoint} took ${duration}ms`,
        ErrorSeverity.HIGH,
        { action: "api_latency", metadata: { endpoint, duration, budget } }
      );
    }
  }

  /**
   * Get performance statistics for a metric
   */
  private calculateStats(values: number[]): PerformanceStats {
    if (values.length === 0) {
      return { count: 0, mean: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      mean: Math.round(sum / values.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get performance summary
   */
  getSummary(since?: Date): PerformanceSummary {
    const cutoff = since || new Date(Date.now() - 60 * 60 * 1000); // Last hour

    const recentMetrics = this.metrics.filter((m) => m.timestamp >= cutoff);

    // Group by type and name
    const apiMetrics: Record<string, number[]> = {};
    const dbMetrics: Record<string, number[]> = {};

    for (const metric of recentMetrics) {
      if (metric.type === "api") {
        if (!apiMetrics[metric.name]) apiMetrics[metric.name] = [];
        apiMetrics[metric.name].push(metric.duration);
      } else if (metric.type === "db") {
        if (!dbMetrics[metric.name]) dbMetrics[metric.name] = [];
        dbMetrics[metric.name].push(metric.duration);
      }
    }

    // Calculate stats
    const apiStats: Record<string, PerformanceStats> = {};
    const dbStats: Record<string, PerformanceStats> = {};

    for (const [name, values] of Object.entries(apiMetrics)) {
      apiStats[name] = this.calculateStats(values);
    }

    for (const [name, values] of Object.entries(dbMetrics)) {
      dbStats[name] = this.calculateStats(values);
    }

    // Find budget violations
    const budgetViolations: Array<{ metric: string; value: number; budget: number }> = [];

    for (const [name, stats] of Object.entries(apiStats)) {
      if (stats.p95 > MONITORING_THRESHOLDS.warning.apiResponseTime) {
        budgetViolations.push({
          metric: `API: ${name}`,
          value: stats.p95,
          budget: MONITORING_THRESHOLDS.warning.apiResponseTime,
        });
      }
    }

    for (const [name, stats] of Object.entries(dbStats)) {
      if (stats.p95 > MONITORING_THRESHOLDS.warning.dbQueryTime) {
        budgetViolations.push({
          metric: `DB: ${name}`,
          value: stats.p95,
          budget: MONITORING_THRESHOLDS.warning.dbQueryTime,
        });
      }
    }

    // Determine overall health
    let overallHealth: "healthy" | "degraded" | "critical" = "healthy";

    const criticalViolations = budgetViolations.filter(
      (v) => v.value > MONITORING_THRESHOLDS.critical.apiResponseTime ||
             v.value > MONITORING_THRESHOLDS.critical.dbQueryTime
    );

    if (criticalViolations.length > 0) {
      overallHealth = "critical";
    } else if (budgetViolations.length > 0) {
      overallHealth = "degraded";
    }

    return {
      api: apiStats,
      database: dbStats,
      slowQueries: this.slowQueries.filter((q) => q.timestamp >= cutoff).slice(-20),
      budgetViolations,
      overallHealth,
    };
  }

  /**
   * Get real-time metrics for dashboard
   */
  getRealTimeMetrics(): {
    requestsPerMinute: number;
    avgResponseTime: number;
    errorRate: number;
    activeSlowQueries: number;
  } {
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentMetrics = this.metrics.filter(
      (m) => m.type === "api" && m.timestamp >= oneMinuteAgo
    );

    const requestsPerMinute = recentMetrics.length;
    const avgResponseTime = recentMetrics.length > 0
      ? Math.round(recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length)
      : 0;

    const errors = recentMetrics.filter(
      (m) => m.metadata?.statusCode && (m.metadata.statusCode as number) >= 500
    );
    const errorRate = recentMetrics.length > 0 ? errors.length / recentMetrics.length : 0;

    const fiveMinutesAgo = new Date(Date.now() - 300000);
    const activeSlowQueries = this.slowQueries.filter((q) => q.timestamp >= fiveMinutesAgo).length;

    return {
      requestsPerMinute,
      avgResponseTime,
      errorRate,
      activeSlowQueries,
    };
  }

  /**
   * Cleanup old metrics
   */
  private cleanup(): void {
    const cutoff = new Date(Date.now() - this.retentionMs);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.filter((m) => m.timestamp >= cutoff);
    }

    // Keep only recent slow queries
    this.slowQueries = this.slowQueries.filter((q) => q.timestamp >= cutoff);
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.metrics = [];
    this.slowQueries = [];
  }
}

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Measure execution time of an async function
 */
export async function measureAsync<T>(
  name: string,
  type: "api" | "db" | "external",
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = Math.round(performance.now() - start);
    if (type === "db") {
      performanceMonitor.recordDbQuery(name, duration);
    } else if (type === "external") {
      performanceMonitor.recordExternalCall(name, duration);
    }
  }
}

/**
 * Create a timing middleware for Express
 */
export function performanceMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = performance.now();

    res.on("finish", () => {
      const duration = Math.round(performance.now() - start);
      const endpoint = req.route?.path || req.path;
      performanceMonitor.recordApiResponse(endpoint, req.method, duration, res.statusCode);
    });

    next();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const performanceMonitor = new PerformanceMonitorService();

export default {
  performanceMonitor,
  measureAsync,
  performanceMiddleware,
};

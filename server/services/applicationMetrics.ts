/**
 * Application Metrics Service
 *
 * Collects and exposes application-level metrics for monitoring:
 * - Request metrics (count, latency, status codes)
 * - System metrics (memory, CPU, event loop)
 * - Error metrics (count by type, rate)
 * - Dependency metrics (database, external services)
 */

import { performanceMonitor } from "./performanceMonitor";
import { MONITORING_THRESHOLDS, PERFORMANCE_BUDGETS } from "../config/performance";

// ============================================================================
// TYPES
// ============================================================================

interface RequestMetrics {
  total: number;
  successful: number;
  failed: number;
  byStatusCode: Record<string, number>;
  byEndpoint: Record<string, {
    count: number;
    avgLatency: number;
    errors: number;
  }>;
}

interface SystemMetrics {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentUsed: number;
  };
  uptime: number;
  nodeVersion: string;
  platform: string;
  eventLoop: {
    lagMs: number;
  };
}

interface ErrorMetrics {
  total: number;
  byType: Record<string, number>;
  rate: number;
  recentErrors: Array<{
    type: string;
    message: string;
    timestamp: Date;
    endpoint?: string;
  }>;
}

interface DependencyMetrics {
  database: {
    status: "up" | "down" | "degraded";
    avgQueryTime: number;
    slowQueries: number;
    connectionPool: string;
  };
  externalServices: Record<string, {
    status: "up" | "down" | "degraded";
    avgLatency: number;
    errorRate: number;
  }>;
}

export interface ApplicationMetricsSnapshot {
  timestamp: string;
  requests: RequestMetrics;
  system: SystemMetrics;
  errors: ErrorMetrics;
  dependencies: DependencyMetrics;
  health: {
    overall: "healthy" | "degraded" | "unhealthy";
    alerts: string[];
  };
}

// ============================================================================
// APPLICATION METRICS SERVICE
// ============================================================================

class ApplicationMetricsService {
  private requestCounts: Record<string, { success: number; error: number; latencies: number[] }> = {};
  private statusCodeCounts: Record<string, number> = {};
  private errors: Array<{ type: string; message: string; timestamp: Date; endpoint?: string }> = [];
  private totalRequests = 0;
  private totalErrors = 0;
  private startTime = Date.now();
  private eventLoopLag = 0;
  private eventLoopMonitorInterval?: NodeJS.Timeout;

  constructor() {
    this.startEventLoopMonitoring();
  }

  /**
   * Start monitoring event loop lag
   */
  private startEventLoopMonitoring(): void {
    let lastCheck = Date.now();
    this.eventLoopMonitorInterval = setInterval(() => {
      const now = Date.now();
      const expected = 100; // Check every 100ms
      this.eventLoopLag = now - lastCheck - expected;
      lastCheck = now;
    }, 100);

    // Don't prevent process exit
    this.eventLoopMonitorInterval.unref();
  }

  /**
   * Record an HTTP request
   */
  recordRequest(
    endpoint: string,
    method: string,
    statusCode: number,
    latencyMs: number
  ): void {
    const key = `${method} ${endpoint}`;

    if (!this.requestCounts[key]) {
      this.requestCounts[key] = { success: 0, error: 0, latencies: [] };
    }

    if (statusCode >= 400) {
      this.requestCounts[key].error++;
      this.totalErrors++;
    } else {
      this.requestCounts[key].success++;
    }

    this.requestCounts[key].latencies.push(latencyMs);

    // Keep only last 1000 latencies per endpoint
    if (this.requestCounts[key].latencies.length > 1000) {
      this.requestCounts[key].latencies.shift();
    }

    // Track status codes
    const statusKey = String(statusCode);
    this.statusCodeCounts[statusKey] = (this.statusCodeCounts[statusKey] || 0) + 1;

    this.totalRequests++;
  }

  /**
   * Record an error
   */
  recordError(type: string, message: string, endpoint?: string): void {
    this.errors.push({
      type,
      message,
      timestamp: new Date(),
      endpoint,
    });

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors.shift();
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): ApplicationMetricsSnapshot {
    const perfSummary = performanceMonitor.getSummary();
    const realtime = performanceMonitor.getRealTimeMetrics();

    // Calculate request metrics
    const requests: RequestMetrics = {
      total: this.totalRequests,
      successful: this.totalRequests - this.totalErrors,
      failed: this.totalErrors,
      byStatusCode: { ...this.statusCodeCounts },
      byEndpoint: {},
    };

    for (const [endpoint, data] of Object.entries(this.requestCounts)) {
      const avgLatency = data.latencies.length > 0
        ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length)
        : 0;

      requests.byEndpoint[endpoint] = {
        count: data.success + data.error,
        avgLatency,
        errors: data.error,
      };
    }

    // Calculate system metrics
    const memUsage = process.memoryUsage();
    const system: SystemMetrics = {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        percentUsed: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      nodeVersion: process.version,
      platform: process.platform,
      eventLoop: {
        lagMs: this.eventLoopLag,
      },
    };

    // Calculate error metrics
    const errors: ErrorMetrics = {
      total: this.errors.length,
      byType: {},
      rate: realtime.errorRate,
      recentErrors: this.errors.slice(-10),
    };

    for (const error of this.errors) {
      errors.byType[error.type] = (errors.byType[error.type] || 0) + 1;
    }

    // Calculate dependency metrics
    const dbStats = Object.values(perfSummary.database)[0] || { mean: 0 };
    const dependencies: DependencyMetrics = {
      database: {
        status: perfSummary.slowQueries.length > 5 ? "degraded" : "up",
        avgQueryTime: dbStats.mean || 0,
        slowQueries: perfSummary.slowQueries.length,
        connectionPool: "active",
      },
      externalServices: {},
    };

    // Determine health status
    const alerts: string[] = [];
    let overall: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (realtime.errorRate > MONITORING_THRESHOLDS.critical.errorRate) {
      alerts.push(`Critical: Error rate ${(realtime.errorRate * 100).toFixed(1)}% exceeds threshold`);
      overall = "unhealthy";
    } else if (realtime.errorRate > MONITORING_THRESHOLDS.warning.errorRate) {
      alerts.push(`Warning: Error rate ${(realtime.errorRate * 100).toFixed(1)}% elevated`);
      overall = "degraded";
    }

    if (realtime.avgResponseTime > MONITORING_THRESHOLDS.critical.apiResponseTime) {
      alerts.push(`Critical: Avg response time ${realtime.avgResponseTime}ms exceeds threshold`);
      overall = "unhealthy";
    } else if (realtime.avgResponseTime > MONITORING_THRESHOLDS.warning.apiResponseTime) {
      alerts.push(`Warning: Avg response time ${realtime.avgResponseTime}ms elevated`);
      if (overall !== "unhealthy") overall = "degraded";
    }

    if (system.memory.percentUsed > 90) {
      alerts.push(`Critical: Memory usage at ${system.memory.percentUsed}%`);
      overall = "unhealthy";
    } else if (system.memory.percentUsed > 80) {
      alerts.push(`Warning: Memory usage at ${system.memory.percentUsed}%`);
      if (overall !== "unhealthy") overall = "degraded";
    }

    if (this.eventLoopLag > 100) {
      alerts.push(`Warning: Event loop lag ${this.eventLoopLag}ms`);
      if (overall !== "unhealthy") overall = "degraded";
    }

    return {
      timestamp: new Date().toISOString(),
      requests,
      system,
      errors,
      dependencies,
      health: {
        overall,
        alerts,
      },
    };
  }

  /**
   * Get metrics in Prometheus format (for external monitoring systems)
   */
  getPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Request metrics
    lines.push("# HELP http_requests_total Total number of HTTP requests");
    lines.push("# TYPE http_requests_total counter");
    lines.push(`http_requests_total ${metrics.requests.total}`);

    lines.push("# HELP http_requests_successful_total Successful HTTP requests");
    lines.push("# TYPE http_requests_successful_total counter");
    lines.push(`http_requests_successful_total ${metrics.requests.successful}`);

    lines.push("# HELP http_requests_failed_total Failed HTTP requests");
    lines.push("# TYPE http_requests_failed_total counter");
    lines.push(`http_requests_failed_total ${metrics.requests.failed}`);

    // Status code breakdown
    lines.push("# HELP http_requests_by_status HTTP requests by status code");
    lines.push("# TYPE http_requests_by_status counter");
    for (const [code, count] of Object.entries(metrics.requests.byStatusCode)) {
      lines.push(`http_requests_by_status{status="${code}"} ${count}`);
    }

    // Memory metrics
    lines.push("# HELP nodejs_heap_size_bytes Node.js heap size in bytes");
    lines.push("# TYPE nodejs_heap_size_bytes gauge");
    lines.push(`nodejs_heap_size_used_bytes ${metrics.system.memory.heapUsed * 1024 * 1024}`);
    lines.push(`nodejs_heap_size_total_bytes ${metrics.system.memory.heapTotal * 1024 * 1024}`);

    // Uptime
    lines.push("# HELP nodejs_uptime_seconds Node.js process uptime");
    lines.push("# TYPE nodejs_uptime_seconds gauge");
    lines.push(`nodejs_uptime_seconds ${metrics.system.uptime}`);

    // Event loop lag
    lines.push("# HELP nodejs_eventloop_lag_ms Event loop lag in milliseconds");
    lines.push("# TYPE nodejs_eventloop_lag_ms gauge");
    lines.push(`nodejs_eventloop_lag_ms ${metrics.system.eventLoop.lagMs}`);

    // Error rate
    lines.push("# HELP http_error_rate Current error rate");
    lines.push("# TYPE http_error_rate gauge");
    lines.push(`http_error_rate ${metrics.errors.rate}`);

    // Database metrics
    lines.push("# HELP db_query_time_avg_ms Average database query time");
    lines.push("# TYPE db_query_time_avg_ms gauge");
    lines.push(`db_query_time_avg_ms ${metrics.dependencies.database.avgQueryTime}`);

    lines.push("# HELP db_slow_queries_total Number of slow queries");
    lines.push("# TYPE db_slow_queries_total counter");
    lines.push(`db_slow_queries_total ${metrics.dependencies.database.slowQueries}`);

    return lines.join("\n");
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.requestCounts = {};
    this.statusCodeCounts = {};
    this.errors = [];
    this.totalRequests = 0;
    this.totalErrors = 0;
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.eventLoopMonitorInterval) {
      clearInterval(this.eventLoopMonitorInterval);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const applicationMetrics = new ApplicationMetricsService();

export default {
  applicationMetrics,
};

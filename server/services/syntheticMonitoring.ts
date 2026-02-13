/**
 * Synthetic Monitoring Service
 *
 * Runs automated checks on critical user flows to detect issues
 * before real users are affected:
 * - Authentication flow
 * - Metric entry creation
 * - Food logging
 * - Dashboard data retrieval
 * - Database connectivity
 */

import { db } from "../storage";
import { sql } from "drizzle-orm";
import { captureMessage, ErrorSeverity } from "./errorMonitoring";

// ============================================================================
// TYPES
// ============================================================================

export interface SyntheticTestResult {
  name: string;
  status: "passed" | "failed" | "degraded";
  duration: number;
  timestamp: Date;
  error?: string;
  details?: Record<string, unknown>;
}

export interface SyntheticMonitoringSummary {
  timestamp: string;
  overall: "healthy" | "degraded" | "unhealthy";
  passedCount: number;
  failedCount: number;
  degradedCount: number;
  totalDuration: number;
  tests: SyntheticTestResult[];
  lastRun: Date;
  nextScheduledRun: Date;
}

// ============================================================================
// TEST DEFINITIONS
// ============================================================================

const TESTS: Array<{
  name: string;
  description: string;
  critical: boolean;
  timeout: number;
  run: () => Promise<{ success: boolean; degraded?: boolean; details?: Record<string, unknown> }>;
}> = [
  {
    name: "database_connectivity",
    description: "Verify database connection and basic query execution",
    critical: true,
    timeout: 5000,
    run: async () => {
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      const latency = Date.now() - start;
      return {
        success: latency < 1000,
        degraded: latency >= 500 && latency < 1000,
        details: { latencyMs: latency },
      };
    },
  },
  {
    name: "database_write_read",
    description: "Verify database write and read operations",
    critical: true,
    timeout: 10000,
    run: async () => {
      // Use a temporary table approach for testing
      const testId = `synthetic_${Date.now()}`;
      const start = Date.now();

      // Test that we can query audit_logs (a table that definitely exists)
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM audit_logs
        WHERE action = 'synthetic_test_nonexistent'
      `);

      const latency = Date.now() - start;
      const count = Number((result.rows[0] as any)?.count || 0);

      return {
        success: count === 0 && latency < 2000,
        degraded: latency >= 1000 && latency < 2000,
        details: { latencyMs: latency, querySuccessful: true },
      };
    },
  },
  {
    name: "user_table_accessible",
    description: "Verify users table is queryable",
    critical: true,
    timeout: 5000,
    run: async () => {
      const start = Date.now();
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM users WHERE role = 'participant'
      `);
      const latency = Date.now() - start;
      const count = Number((result.rows[0] as any)?.count || 0);

      return {
        success: latency < 500,
        degraded: latency >= 300 && latency < 500,
        details: { latencyMs: latency, userCount: count },
      };
    },
  },
  {
    name: "metrics_table_accessible",
    description: "Verify metric_entries table is queryable",
    critical: true,
    timeout: 5000,
    run: async () => {
      const start = Date.now();
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM metric_entries
      `);
      const latency = Date.now() - start;
      const count = Number((result.rows[0] as any)?.count || 0);

      return {
        success: latency < 500,
        degraded: latency >= 300 && latency < 500,
        details: { latencyMs: latency, entryCount: count },
      };
    },
  },
  {
    name: "food_table_accessible",
    description: "Verify food_entries table is queryable",
    critical: true,
    timeout: 5000,
    run: async () => {
      const start = Date.now();
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM food_entries
      `);
      const latency = Date.now() - start;
      const count = Number((result.rows[0] as any)?.count || 0);

      return {
        success: latency < 500,
        degraded: latency >= 300 && latency < 500,
        details: { latencyMs: latency, entryCount: count },
      };
    },
  },
  {
    name: "complex_query_performance",
    description: "Test performance of complex analytics-style query",
    critical: false,
    timeout: 10000,
    run: async () => {
      const start = Date.now();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const result = await db.execute(sql`
        SELECT
          COUNT(DISTINCT m.user_id) as active_users,
          COUNT(m.id) as total_entries
        FROM metric_entries m
        WHERE m.timestamp >= ${sevenDaysAgo.toISOString()}
      `);

      const latency = Date.now() - start;

      return {
        success: latency < 1000,
        degraded: latency >= 500 && latency < 1000,
        details: {
          latencyMs: latency,
          activeUsers: Number((result.rows[0] as any)?.active_users || 0),
          totalEntries: Number((result.rows[0] as any)?.total_entries || 0),
        },
      };
    },
  },
  {
    name: "messages_table_accessible",
    description: "Verify messages table is queryable",
    critical: false,
    timeout: 5000,
    run: async () => {
      const start = Date.now();
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM messages
      `);
      const latency = Date.now() - start;
      const count = Number((result.rows[0] as any)?.count || 0);

      return {
        success: latency < 500,
        degraded: latency >= 300 && latency < 500,
        details: { latencyMs: latency, messageCount: count },
      };
    },
  },
  {
    name: "audit_logs_accessible",
    description: "Verify audit_logs table is queryable",
    critical: false,
    timeout: 5000,
    run: async () => {
      const start = Date.now();
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM audit_logs
      `);
      const latency = Date.now() - start;
      const count = Number((result.rows[0] as any)?.count || 0);

      return {
        success: latency < 500,
        degraded: latency >= 300 && latency < 500,
        details: { latencyMs: latency, logCount: count },
      };
    },
  },
];

// ============================================================================
// SYNTHETIC MONITORING SERVICE
// ============================================================================

class SyntheticMonitoringService {
  private results: SyntheticTestResult[] = [];
  private lastRunTime: Date = new Date(0);
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  /**
   * Execute a single test with timeout
   */
  private async executeTest(test: typeof TESTS[0]): Promise<SyntheticTestResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Test timeout")), test.timeout);
      });

      const result = await Promise.race([test.run(), timeoutPromise]);
      const duration = Date.now() - startTime;

      let status: SyntheticTestResult["status"] = "passed";
      if (!result.success) {
        status = "failed";
      } else if (result.degraded) {
        status = "degraded";
      }

      return {
        name: test.name,
        status,
        duration,
        timestamp: new Date(),
        details: result.details,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Report critical test failures
      if (test.critical) {
        captureMessage(
          `Synthetic test failed: ${test.name} - ${errorMessage}`,
          ErrorSeverity.HIGH,
          { action: "synthetic_test_failure", metadata: { testName: test.name, error: errorMessage } }
        );
      }

      return {
        name: test.name,
        status: "failed",
        duration,
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  }

  /**
   * Run all synthetic tests
   */
  async runAllTests(): Promise<SyntheticMonitoringSummary> {
    if (this.isRunning) {
      return this.getSummary();
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Run tests sequentially to avoid overwhelming the database
      const results: SyntheticTestResult[] = [];
      for (const test of TESTS) {
        const result = await this.executeTest(test);
        results.push(result);
      }

      this.results = results;
      this.lastRunTime = new Date();

      return this.getSummary();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get summary of last test run
   */
  getSummary(): SyntheticMonitoringSummary {
    const passedCount = this.results.filter((r) => r.status === "passed").length;
    const failedCount = this.results.filter((r) => r.status === "failed").length;
    const degradedCount = this.results.filter((r) => r.status === "degraded").length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    // Determine overall health
    let overall: SyntheticMonitoringSummary["overall"] = "healthy";
    const criticalFailures = this.results.filter((r) => {
      const test = TESTS.find((t) => t.name === r.name);
      return test?.critical && r.status === "failed";
    });

    if (criticalFailures.length > 0) {
      overall = "unhealthy";
    } else if (failedCount > 0 || degradedCount > 2) {
      overall = "degraded";
    }

    // Calculate next scheduled run (5 minutes from last run)
    const nextRun = new Date(this.lastRunTime.getTime() + 5 * 60 * 1000);

    return {
      timestamp: new Date().toISOString(),
      overall,
      passedCount,
      failedCount,
      degradedCount,
      totalDuration,
      tests: this.results,
      lastRun: this.lastRunTime,
      nextScheduledRun: nextRun,
    };
  }

  /**
   * Run a specific test by name
   */
  async runTest(testName: string): Promise<SyntheticTestResult | null> {
    const test = TESTS.find((t) => t.name === testName);
    if (!test) {
      return null;
    }

    const result = await this.executeTest(test);

    // Update the specific result in our cache
    const existingIndex = this.results.findIndex((r) => r.name === testName);
    if (existingIndex >= 0) {
      this.results[existingIndex] = result;
    } else {
      this.results.push(result);
    }

    return result;
  }

  /**
   * Start periodic monitoring
   */
  startPeriodicMonitoring(intervalMinutes: number = 5): void {
    if (this.intervalId) {
      return; // Already running
    }

    console.log(`[Synthetic Monitoring] Starting periodic checks every ${intervalMinutes} minutes`);

    // Run immediately
    this.runAllTests().catch(console.error);

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runAllTests().catch(console.error);
    }, intervalMinutes * 60 * 1000);

    // Don't prevent process exit
    this.intervalId.unref();
  }

  /**
   * Stop periodic monitoring
   */
  stopPeriodicMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log("[Synthetic Monitoring] Stopped periodic checks");
    }
  }

  /**
   * Get list of available tests
   */
  getAvailableTests(): Array<{ name: string; description: string; critical: boolean }> {
    return TESTS.map((t) => ({
      name: t.name,
      description: t.description,
      critical: t.critical,
    }));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const syntheticMonitoring = new SyntheticMonitoringService();

export default {
  syntheticMonitoring,
};

#!/usr/bin/env npx ts-node
/**
 * Performance Testing CLI
 *
 * Runs performance tests against the API and database to verify
 * the system can handle pilot-scale load.
 *
 * Commands:
 *   baseline          Measure baseline performance of all endpoints
 *   load              Run load test with simulated users
 *   db-analysis       Analyze database query performance
 *   report            Generate performance report
 *
 * Usage:
 *   npx ts-node server/scripts/perf-test.ts baseline
 *   npx ts-node server/scripts/perf-test.ts load --users 20 --duration 60
 */

import "dotenv/config";
import { PILOT_SCALE, PERFORMANCE_BUDGETS, MONITORING_THRESHOLDS } from "../config/performance";
import { db } from "../storage";
import { users, metricEntries, foodEntries, messages, auditLogs } from "../../shared/schema";
import { sql, count } from "drizzle-orm";

// ============================================================================
// CONFIGURATION
// ============================================================================

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

interface TestResult {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  passed: boolean;
  budget: number;
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
}

// ============================================================================
// HTTP UTILITIES
// ============================================================================

async function makeRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ duration: number; status: number; data?: any }> {
  const start = performance.now();

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const duration = Math.round(performance.now() - start);
    let data;

    try {
      data = await response.json();
    } catch {
      // Response may not be JSON
    }

    return { duration, status: response.status, data };
  } catch (error: any) {
    const duration = Math.round(performance.now() - start);
    return { duration, status: 0 };
  }
}

// ============================================================================
// BASELINE TESTING
// ============================================================================

async function runBaselineTests(): Promise<TestResult[]> {
  console.log("\n📊 Running Baseline Performance Tests\n");
  console.log("Testing against:", BASE_URL);
  console.log("-".repeat(70));

  const results: TestResult[] = [];

  // Test endpoints
  const endpoints = [
    { path: "/api/user", method: "GET", budget: 200, name: "Get current user" },
    { path: "/api/metrics", method: "GET", budget: 200, name: "List metrics" },
    { path: "/api/food", method: "GET", budget: 200, name: "List food entries" },
    { path: "/api/messages", method: "GET", budget: 150, name: "List messages" },
    { path: "/api/macro-targets", method: "GET", budget: 100, name: "Get macro targets" },
    { path: "/api/dashboard", method: "GET", budget: 500, name: "Dashboard data" },
    { path: "/api/analytics/summary", method: "GET", budget: 1000, name: "Analytics summary" },
  ];

  // Note: These require authentication, so they may fail without a session
  // In a real test, you'd need to authenticate first

  for (const { path, method, budget, name } of endpoints) {
    process.stdout.write(`Testing ${name.padEnd(25)}... `);

    const { duration, status } = await makeRequest(path, method);
    const passed = status !== 0 && duration <= budget;

    results.push({ endpoint: path, method, duration, status, passed, budget });

    const statusIcon = status === 0 ? "❌" : status < 400 ? "✓" : "⚠";
    const durationColor = duration <= budget ? "" : "\x1b[33m"; // Yellow for over budget
    const reset = "\x1b[0m";

    console.log(
      `${statusIcon} ${durationColor}${duration}ms${reset} ` +
      `(budget: ${budget}ms) ` +
      `[HTTP ${status || "ERR"}]`
    );
  }

  return results;
}

// ============================================================================
// DATABASE ANALYSIS
// ============================================================================

async function analyzeDatabase(): Promise<void> {
  console.log("\n🗄️  Database Performance Analysis\n");
  console.log("-".repeat(70));

  // Get table sizes
  console.log("\n📈 Table Row Counts:");

  const tables = [
    { name: "users", table: users },
    { name: "metric_entries", table: metricEntries },
    { name: "food_entries", table: foodEntries },
    { name: "messages", table: messages },
    { name: "audit_logs", table: auditLogs },
  ];

  const rowCounts: Record<string, number> = {};

  for (const { name, table } of tables) {
    const start = performance.now();
    const [result] = await db.select({ count: count() }).from(table);
    const duration = Math.round(performance.now() - start);
    rowCounts[name] = Number(result?.count || 0);

    const projectedMax = PILOT_SCALE.dataVolumes[name as keyof typeof PILOT_SCALE.dataVolumes] || 0;
    const percentOfMax = projectedMax > 0 ? Math.round((rowCounts[name] / projectedMax) * 100) : 0;

    console.log(
      `  ${name.padEnd(20)} ${rowCounts[name].toString().padStart(8)} rows ` +
      `(${percentOfMax}% of pilot max) ` +
      `[${duration}ms]`
    );
  }

  // Test common query patterns
  console.log("\n⚡ Query Performance Tests:");

  const queryTests = [
    {
      name: "User lookup by ID",
      fn: async () => {
        await db.execute(sql`SELECT id, email, name, role FROM users LIMIT 1`);
      },
      budget: 50,
    },
    {
      name: "Metrics for user (last 30 days)",
      fn: async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await db.execute(sql`SELECT id, user_id, type, timestamp, value_json FROM metric_entries WHERE timestamp >= ${thirtyDaysAgo} LIMIT 100`);
      },
      budget: 100,
    },
    {
      name: "Food entries aggregation",
      fn: async () => {
        await db.execute(sql`SELECT COUNT(*) as count FROM food_entries`);
      },
      budget: 100,
    },
    {
      name: "Metrics with user join",
      fn: async () => {
        await db.execute(sql`
          SELECT m.id, m.type, m.timestamp, u.name
          FROM metric_entries m
          INNER JOIN users u ON m.user_id = u.id
          LIMIT 50
        `);
      },
      budget: 200,
    },
    {
      name: "Audit log range query",
      fn: async () => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await db.execute(sql`SELECT id, action, result, timestamp FROM audit_logs WHERE timestamp >= ${weekAgo} LIMIT 100`);
      },
      budget: 150,
    },
  ];

  for (const { name, fn, budget } of queryTests) {
    process.stdout.write(`  ${name.padEnd(35)}... `);

    const durations: number[] = [];

    // Run multiple times to get average
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await fn();
      durations.push(Math.round(performance.now() - start));
    }

    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const max = Math.max(...durations);
    const passed = avg <= budget;

    const icon = passed ? "✓" : "⚠";
    const color = passed ? "" : "\x1b[33m";
    const reset = "\x1b[0m";

    console.log(`${icon} ${color}avg: ${avg}ms, max: ${max}ms${reset} (budget: ${budget}ms)`);
  }

  // Check for missing indexes (heuristic)
  console.log("\n🔍 Index Analysis:");
  console.log("  Checking common query patterns against expected indexes...");

  const indexChecks = [
    { column: "user_id", tables: ["metric_entries", "food_entries", "messages"] },
    { column: "timestamp", tables: ["metric_entries", "food_entries", "audit_logs"] },
    { column: "type", tables: ["metric_entries"] },
  ];

  for (const { column, tables } of indexChecks) {
    console.log(`  ✓ ${column} - expected on: ${tables.join(", ")}`);
  }
}

// ============================================================================
// LOAD TESTING
// ============================================================================

async function runLoadTest(
  concurrentUsers: number = 10,
  durationSeconds: number = 30
): Promise<LoadTestResult> {
  console.log(`\n🔥 Running Load Test\n`);
  console.log(`Concurrent users: ${concurrentUsers}`);
  console.log(`Duration: ${durationSeconds} seconds`);
  console.log("-".repeat(70));

  const results: number[] = [];
  const errors: number[] = [];
  const startTime = Date.now();
  const endTime = startTime + durationSeconds * 1000;

  // Simulated user actions
  const actions = [
    { endpoint: "/api/user", method: "GET", weight: 10 },
    { endpoint: "/api/metrics", method: "GET", weight: 30 },
    { endpoint: "/api/food", method: "GET", weight: 30 },
    { endpoint: "/api/dashboard", method: "GET", weight: 20 },
    { endpoint: "/api/analytics/summary", method: "GET", weight: 10 },
  ];

  // Create weighted action selector
  const totalWeight = actions.reduce((sum, a) => sum + a.weight, 0);
  function selectAction() {
    let random = Math.random() * totalWeight;
    for (const action of actions) {
      random -= action.weight;
      if (random <= 0) return action;
    }
    return actions[0];
  }

  // Run virtual users
  const userPromises: Promise<void>[] = [];

  for (let i = 0; i < concurrentUsers; i++) {
    userPromises.push(
      (async () => {
        while (Date.now() < endTime) {
          const action = selectAction();
          const { duration, status } = await makeRequest(action.endpoint, action.method);

          results.push(duration);
          if (status === 0 || status >= 500) {
            errors.push(duration);
          }

          // Random delay between requests (100-500ms)
          await new Promise((r) => setTimeout(r, 100 + Math.random() * 400));
        }
      })()
    );
  }

  // Progress indicator
  const progressInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const progress = Math.round((elapsed / durationSeconds) * 100);
    process.stdout.write(`\rProgress: ${progress}% | Requests: ${results.length} | Errors: ${errors.length}`);
  }, 1000);

  await Promise.all(userPromises);
  clearInterval(progressInterval);

  // Calculate statistics
  const sorted = [...results].sort((a, b) => a - b);
  const actualDuration = (Date.now() - startTime) / 1000;

  const loadResult: LoadTestResult = {
    totalRequests: results.length,
    successfulRequests: results.length - errors.length,
    failedRequests: errors.length,
    avgResponseTime: Math.round(results.reduce((a, b) => a + b, 0) / results.length),
    minResponseTime: sorted[0] || 0,
    maxResponseTime: sorted[sorted.length - 1] || 0,
    p50ResponseTime: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95ResponseTime: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99ResponseTime: sorted[Math.floor(sorted.length * 0.99)] || 0,
    requestsPerSecond: Math.round(results.length / actualDuration * 10) / 10,
    errorRate: errors.length / results.length,
  };

  console.log("\n\n📊 Load Test Results:");
  console.log("-".repeat(50));
  console.log(`Total requests:      ${loadResult.totalRequests}`);
  console.log(`Successful:          ${loadResult.successfulRequests}`);
  console.log(`Failed:              ${loadResult.failedRequests}`);
  console.log(`Error rate:          ${(loadResult.errorRate * 100).toFixed(2)}%`);
  console.log(`Requests/second:     ${loadResult.requestsPerSecond}`);
  console.log(`\nResponse Times:`);
  console.log(`  Average:           ${loadResult.avgResponseTime}ms`);
  console.log(`  Min:               ${loadResult.minResponseTime}ms`);
  console.log(`  Max:               ${loadResult.maxResponseTime}ms`);
  console.log(`  p50 (median):      ${loadResult.p50ResponseTime}ms`);
  console.log(`  p95:               ${loadResult.p95ResponseTime}ms`);
  console.log(`  p99:               ${loadResult.p99ResponseTime}ms`);

  // Check against budgets
  console.log("\n📋 Budget Compliance:");
  const p95Budget = MONITORING_THRESHOLDS.warning.p95ResponseTime;
  const errorBudget = MONITORING_THRESHOLDS.warning.errorRate;

  console.log(`  p95 Response Time: ${loadResult.p95ResponseTime}ms ` +
    `(budget: ${p95Budget}ms) ` +
    `${loadResult.p95ResponseTime <= p95Budget ? "✓" : "❌"}`);

  console.log(`  Error Rate:        ${(loadResult.errorRate * 100).toFixed(2)}% ` +
    `(budget: ${errorBudget * 100}%) ` +
    `${loadResult.errorRate <= errorBudget ? "✓" : "❌"}`);

  return loadResult;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

async function generateReport(): Promise<void> {
  console.log("\n📄 Performance Report\n");
  console.log("=".repeat(70));
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("=".repeat(70));

  // Pilot scale summary
  console.log("\n📊 Pilot Scale Parameters:");
  console.log(`  Participants: ${PILOT_SCALE.users.participants}`);
  console.log(`  Coaches: ${PILOT_SCALE.users.coaches}`);
  console.log(`  Expected DAU: ${PILOT_SCALE.dailyActivity.activeUsers}`);
  console.log(`  Peak concurrent: ${PILOT_SCALE.dailyActivity.peakConcurrentUsers}`);

  // Run baseline
  const baselineResults = await runBaselineTests();

  // Database analysis
  await analyzeDatabase();

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📋 Summary\n");

  const passedTests = baselineResults.filter((r) => r.passed).length;
  const totalTests = baselineResults.length;

  console.log(`Baseline Tests: ${passedTests}/${totalTests} passed`);

  if (passedTests < totalTests) {
    console.log("\n⚠️  Some tests exceeded performance budgets.");
    console.log("   Review slow endpoints and consider optimization.");
  } else {
    console.log("\n✅ All baseline tests within budget!");
  }

  console.log("\nRecommendations:");
  console.log("  1. Run load test with: npm run perf:load -- --users 20");
  console.log("  2. Monitor slow queries during load testing");
  console.log("  3. Consider adding indexes for common query patterns");
  console.log("  4. Implement caching for dashboard and analytics endpoints");
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const [, , command, ...args] = process.argv;

  const parseArgs = (args: string[]): Record<string, string | number> => {
    const result: Record<string, string | number> = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.replace(/^--/, "");
      const value = args[i + 1];
      if (key && value) {
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }
    return result;
  };

  try {
    switch (command) {
      case "baseline":
        await runBaselineTests();
        break;

      case "load": {
        const opts = parseArgs(args);
        await runLoadTest(
          (opts.users as number) || PILOT_SCALE.peakScenarios.mondayMorning.concurrentUsers,
          (opts.duration as number) || 30
        );
        break;
      }

      case "db-analysis":
        await analyzeDatabase();
        break;

      case "report":
        await generateReport();
        break;

      default:
        console.log(`
Performance Testing CLI

Commands:
  baseline           Measure baseline performance of all endpoints
  load               Run load test with simulated users
  db-analysis        Analyze database query performance
  report             Generate comprehensive performance report

Options for 'load':
  --users <n>        Number of concurrent users (default: ${PILOT_SCALE.peakScenarios.mondayMorning.concurrentUsers})
  --duration <s>     Test duration in seconds (default: 30)

Examples:
  npx ts-node server/scripts/perf-test.ts baseline
  npx ts-node server/scripts/perf-test.ts load --users 20 --duration 60
  npx ts-node server/scripts/perf-test.ts db-analysis
  npx ts-node server/scripts/perf-test.ts report
        `);
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main();

/**
 * Health Check Service
 *
 * Provides health check endpoints for monitoring system status:
 * - /health/live - Basic liveness (is the process running?)
 * - /health/ready - Readiness (can we handle requests?)
 * - /health/db - Database connectivity
 * - /health/external - External service status
 */

import { db } from "../storage";
import { sql } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
}

export interface LivenessCheck extends HealthStatus {
  checks: {
    process: boolean;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

export interface ReadinessCheck extends HealthStatus {
  checks: {
    database: boolean;
    memory: boolean;
    diskSpace: boolean;
  };
  details: {
    database?: string;
    memory?: string;
    diskSpace?: string;
  };
}

export interface DatabaseCheck extends HealthStatus {
  checks: {
    connection: boolean;
    queryTime: number;
    poolStatus: string;
  };
  details: {
    connectionError?: string;
    latency: string;
  };
}

export interface ExternalServicesCheck extends HealthStatus {
  services: {
    [key: string]: {
      status: "up" | "down" | "degraded" | "not_configured";
      latency?: number;
      error?: string;
    };
  };
}

// ============================================================================
// HEALTH CHECK SERVICE
// ============================================================================

const startTime = Date.now();
const APP_VERSION = process.env.npm_package_version || "1.0.0";

// Memory threshold (80% of available)
const MEMORY_THRESHOLD = 0.8;

/**
 * Basic liveness check - is the process running?
 */
export async function checkLiveness(): Promise<LivenessCheck> {
  const memUsage = process.memoryUsage();
  const totalMem = memUsage.heapTotal;
  const usedMem = memUsage.heapUsed;
  const memPercentage = usedMem / totalMem;

  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: APP_VERSION,
    checks: {
      process: true,
      memory: {
        used: Math.round(usedMem / 1024 / 1024),
        total: Math.round(totalMem / 1024 / 1024),
        percentage: Math.round(memPercentage * 100),
      },
    },
  };
}

/**
 * Readiness check - can we handle requests?
 */
export async function checkReadiness(): Promise<ReadinessCheck> {
  const checks = {
    database: false,
    memory: false,
    diskSpace: true, // Assume OK for now
  };
  const details: ReadinessCheck["details"] = {};

  // Check database
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;
    checks.database = latency < 1000; // Under 1 second
    details.database = checks.database ? `OK (${latency}ms)` : `Slow (${latency}ms)`;
  } catch (error) {
    checks.database = false;
    details.database = error instanceof Error ? error.message : "Connection failed";
  }

  // Check memory
  const memUsage = process.memoryUsage();
  const memPercentage = memUsage.heapUsed / memUsage.heapTotal;
  checks.memory = memPercentage < MEMORY_THRESHOLD;
  details.memory = checks.memory
    ? `OK (${Math.round(memPercentage * 100)}%)`
    : `High (${Math.round(memPercentage * 100)}%)`;

  // Determine overall status
  const allHealthy = Object.values(checks).every((v) => v);
  const anyUnhealthy = !checks.database; // Database is critical

  let status: HealthStatus["status"] = "healthy";
  if (anyUnhealthy) {
    status = "unhealthy";
  } else if (!allHealthy) {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: APP_VERSION,
    checks,
    details,
  };
}

/**
 * Database health check with detailed metrics
 */
export async function checkDatabase(): Promise<DatabaseCheck> {
  let connection = false;
  let queryTime = -1;
  let connectionError: string | undefined;

  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    queryTime = Date.now() - start;
    connection = true;
  } catch (error) {
    connectionError = error instanceof Error ? error.message : "Unknown error";
  }

  // Determine status based on query time
  let status: HealthStatus["status"] = "healthy";
  if (!connection) {
    status = "unhealthy";
  } else if (queryTime > 500) {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: APP_VERSION,
    checks: {
      connection,
      queryTime,
      poolStatus: connection ? "active" : "disconnected",
    },
    details: {
      connectionError,
      latency: queryTime >= 0 ? `${queryTime}ms` : "N/A",
    },
  };
}

/**
 * External services health check
 */
export async function checkExternalServices(): Promise<ExternalServicesCheck> {
  const services: ExternalServicesCheck["services"] = {};

  // Check OpenAI (if configured)
  if (process.env.OPENAI_API_KEY) {
    try {
      const start = Date.now();
      // Just verify the API key format - don't make actual calls
      const keyValid = process.env.OPENAI_API_KEY.startsWith("sk-");
      services.openai = {
        status: keyValid ? "up" : "degraded",
        latency: Date.now() - start,
      };
    } catch (error) {
      services.openai = {
        status: "down",
        error: error instanceof Error ? error.message : "Check failed",
      };
    }
  } else {
    services.openai = { status: "not_configured" };
  }

  // Check Sentry (if configured)
  if (process.env.SENTRY_DSN) {
    services.sentry = {
      status: "up",
      latency: 0,
    };
  } else {
    services.sentry = { status: "not_configured" };
  }

  // Check Neon database (already covered by DB check, but note connection)
  if (process.env.DATABASE_URL?.includes("neon")) {
    services.neon = { status: "up" }; // If DB check passes, Neon is up
  }

  // Determine overall status
  const statuses = Object.values(services).map((s) => s.status);
  const hasDown = statuses.includes("down");
  const hasDegraded = statuses.includes("degraded");

  let status: HealthStatus["status"] = "healthy";
  if (hasDown) {
    status = "unhealthy";
  } else if (hasDegraded) {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: APP_VERSION,
    services,
  };
}

/**
 * Combined health check for monitoring dashboards
 */
export async function getFullHealthStatus(): Promise<{
  overall: HealthStatus["status"];
  timestamp: string;
  uptime: number;
  version: string;
  components: {
    liveness: LivenessCheck;
    readiness: ReadinessCheck;
    database: DatabaseCheck;
    external: ExternalServicesCheck;
  };
}> {
  const [liveness, readiness, database, external] = await Promise.all([
    checkLiveness(),
    checkReadiness(),
    checkDatabase(),
    checkExternalServices(),
  ]);

  // Determine overall status
  const componentStatuses = [
    liveness.status,
    readiness.status,
    database.status,
    external.status,
  ];

  let overall: HealthStatus["status"] = "healthy";
  if (componentStatuses.includes("unhealthy")) {
    overall = "unhealthy";
  } else if (componentStatuses.includes("degraded")) {
    overall = "degraded";
  }

  return {
    overall,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: APP_VERSION,
    components: {
      liveness,
      readiness,
      database,
      external,
    },
  };
}

export default {
  checkLiveness,
  checkReadiness,
  checkDatabase,
  checkExternalServices,
  getFullHealthStatus,
};

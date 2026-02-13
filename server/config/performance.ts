/**
 * Performance Configuration and Pilot Scale Parameters
 *
 * Defines expected load for the pilot cohort and performance budgets
 * that must be met for a stable user experience.
 */

// ============================================================================
// PILOT SCALE PARAMETERS
// ============================================================================

export const PILOT_SCALE = {
  // User counts
  users: {
    participants: 50,        // Patient participants
    coaches: 5,              // Health coaches
    admins: 2,               // System administrators
    total: 57,
  },

  // Daily activity expectations
  dailyActivity: {
    activeUsers: 40,                    // ~70% DAU rate
    peakConcurrentUsers: 15,            // ~30% of DAU at peak
    metricsEntriesPerUser: 3,           // Glucose, BP, weight/waist
    foodEntriesPerUser: 4,              // 3 meals + snacks
    messagesPerCoach: 20,               // Coach-participant messages
    reportsGenerated: 10,               // Daily/weekly reports
  },

  // Peak load scenarios
  peakScenarios: {
    mondayMorning: {
      description: "Monday 8-9 AM: Users logging weekend backfill + morning entries",
      concurrentUsers: 25,
      entriesPerMinute: 30,
    },
    eveningLogging: {
      description: "6-8 PM: End of day logging surge",
      concurrentUsers: 20,
      entriesPerMinute: 25,
    },
    coachReview: {
      description: "Coach reviewing multiple patients",
      concurrentDashboards: 5,
      queriesPerSecond: 10,
    },
  },

  // Data volume projections (at pilot end - 12 weeks)
  dataVolumes: {
    metricEntries: 50 * 3 * 7 * 12,     // ~12,600 entries
    foodEntries: 50 * 4 * 7 * 12,       // ~16,800 entries
    messages: 5 * 20 * 7 * 12,          // ~8,400 messages
    auditLogs: 50 * 10 * 7 * 12,        // ~42,000 audit entries
  },
};

// ============================================================================
// PERFORMANCE BUDGETS
// ============================================================================

export const PERFORMANCE_BUDGETS = {
  // Page load times (seconds)
  pageLoad: {
    login: 1.5,
    dashboard: 2.5,
    metricEntry: 2.0,
    foodLog: 2.0,
    trends: 3.0,
    coachDashboard: 3.0,
    adminPanel: 3.0,
    reports: 4.0,
  },

  // API response times (milliseconds)
  apiResponse: {
    authentication: 300,
    getMetrics: 200,
    createMetric: 150,
    getFoodEntries: 200,
    createFoodEntry: 500,     // Includes AI processing
    getMessages: 150,
    sendMessage: 100,
    getDashboard: 500,
    getAnalytics: 1000,
    generateReport: 3000,
    bulkImport: 10000,
  },

  // Database query times (milliseconds)
  databaseQuery: {
    simple: 50,               // Single table, indexed lookup
    moderate: 200,            // Joins, aggregations
    complex: 500,             // Analytics, reporting queries
    maximum: 1000,            // Absolute maximum before alert
  },

  // Frontend metrics
  frontend: {
    bundleSizeKB: 500,        // Total JS bundle
    firstContentfulPaint: 1500,
    largestContentfulPaint: 2500,
    timeToInteractive: 3000,
    cumulativeLayoutShift: 0.1,
  },

  // Resource limits
  resources: {
    maxMemoryMB: 512,
    maxCPUPercent: 80,
    dbConnectionPoolSize: 20,
    maxConcurrentRequests: 100,
  },
};

// ============================================================================
// MONITORING THRESHOLDS
// ============================================================================

export const MONITORING_THRESHOLDS = {
  // Alert if exceeded
  warning: {
    apiResponseTime: 1000,    // 1 second
    dbQueryTime: 500,
    errorRate: 0.01,          // 1% error rate
    p95ResponseTime: 2000,
  },

  // Critical alert if exceeded
  critical: {
    apiResponseTime: 3000,    // 3 seconds
    dbQueryTime: 2000,
    errorRate: 0.05,          // 5% error rate
    p95ResponseTime: 5000,
  },

  // Slow query log threshold (ms)
  slowQueryThreshold: 500,
};

// ============================================================================
// CACHING CONFIGURATION
// ============================================================================

export const CACHE_CONFIG = {
  // Cache TTL in seconds
  ttl: {
    userProfile: 300,         // 5 minutes
    dashboardStats: 60,       // 1 minute (frequently changing)
    analyticsData: 300,       // 5 minutes
    coachParticipantList: 60, // 1 minute
    promptRules: 3600,        // 1 hour (rarely changes)
    reports: 1800,            // 30 minutes
  },

  // Maximum cache sizes
  maxSize: {
    userProfiles: 100,
    dashboardCache: 50,
    analyticsCache: 20,
  },
};

// ============================================================================
// RATE LIMITING
// ============================================================================

export const RATE_LIMITS = {
  // Requests per minute
  api: {
    authenticated: 100,
    unauthenticated: 20,
    bulkOperations: 5,
    reportGeneration: 10,
    aiOperations: 30,
  },

  // Per-user limits
  perUser: {
    metricsPerHour: 50,
    foodEntriesPerHour: 30,
    messagesPerHour: 100,
    exportsPerDay: 5,
  },
};

export default {
  PILOT_SCALE,
  PERFORMANCE_BUDGETS,
  MONITORING_THRESHOLDS,
  CACHE_CONFIG,
  RATE_LIMITS,
};

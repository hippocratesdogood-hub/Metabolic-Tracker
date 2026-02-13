/**
 * Business Metrics Service
 *
 * Tracks key business and pilot success metrics:
 * - User engagement (DAU, retention, session duration)
 * - Feature adoption (which features are being used)
 * - Health tracking activity (metrics logged, food entries)
 * - Coach-participant interaction metrics
 * - Pilot success indicators
 */

import { db } from "../storage";
import { sql } from "drizzle-orm";
import { PILOT_SCALE } from "../config/performance";

// ============================================================================
// TYPES
// ============================================================================

export interface UserEngagementMetrics {
  totalUsers: number;
  activeToday: number;
  activeThisWeek: number;
  activeThisMonth: number;
  dauRate: number; // Daily Active User rate
  wauRate: number; // Weekly Active User rate
  retention: {
    day1: number;
    day7: number;
    day30: number;
  };
}

export interface FeatureUsageMetrics {
  metricsLogging: {
    usersLogging: number;
    totalEntries: number;
    avgEntriesPerUser: number;
  };
  foodTracking: {
    usersLogging: number;
    totalEntries: number;
    avgEntriesPerUser: number;
    aiAnalysisUsed: number;
  };
  messaging: {
    activeConversations: number;
    totalMessages: number;
    avgResponseTime: number;
  };
  reports: {
    generated: number;
    exported: number;
  };
}

export interface CoachMetrics {
  totalCoaches: number;
  activeCoaches: number;
  participantsPerCoach: Record<string, number>;
  avgResponseTime: number;
  messagesPerDay: number;
}

export interface PilotSuccessMetrics {
  enrollment: {
    target: number;
    actual: number;
    percentage: number;
  };
  engagement: {
    targetDAU: number;
    actualDAU: number;
    percentage: number;
  };
  dataQuality: {
    avgEntriesPerUserPerDay: number;
    targetEntriesPerDay: number;
    percentage: number;
  };
  coachInteraction: {
    participantsWithRecentContact: number;
    percentage: number;
  };
  healthIndicators: {
    usersLoggingRegularly: number;
    percentage: number;
  };
  overallScore: number;
  status: "on_track" | "at_risk" | "behind";
}

export interface BusinessMetricsSnapshot {
  timestamp: string;
  period: string;
  engagement: UserEngagementMetrics;
  features: FeatureUsageMetrics;
  coaches: CoachMetrics;
  pilotSuccess: PilotSuccessMetrics;
}

// ============================================================================
// BUSINESS METRICS SERVICE
// ============================================================================

class BusinessMetricsService {
  /**
   * Get user engagement metrics
   */
  async getUserEngagement(): Promise<UserEngagementMetrics> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get total users
    const totalUsersResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM users WHERE role = 'participant'
    `);
    const totalUsers = Number((totalUsersResult.rows[0] as any)?.count || 0);

    // Get users active today (users who logged metrics or food entries)
    const activeTodayResult = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT user_id FROM metric_entries WHERE timestamp >= ${today.toISOString()}
        UNION
        SELECT user_id FROM food_entries WHERE logged_at >= ${today.toISOString()}
      ) AS active_users
    `);
    const activeToday = Number((activeTodayResult.rows[0] as any)?.count || 0);

    // Get users active this week
    const activeWeekResult = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT user_id FROM metric_entries WHERE timestamp >= ${weekAgo.toISOString()}
        UNION
        SELECT user_id FROM food_entries WHERE logged_at >= ${weekAgo.toISOString()}
      ) AS active_users
    `);
    const activeThisWeek = Number((activeWeekResult.rows[0] as any)?.count || 0);

    // Get users active this month
    const activeMonthResult = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as count FROM (
        SELECT user_id FROM metric_entries WHERE timestamp >= ${monthAgo.toISOString()}
        UNION
        SELECT user_id FROM food_entries WHERE logged_at >= ${monthAgo.toISOString()}
      ) AS active_users
    `);
    const activeThisMonth = Number((activeMonthResult.rows[0] as any)?.count || 0);

    return {
      totalUsers,
      activeToday,
      activeThisWeek,
      activeThisMonth,
      dauRate: totalUsers > 0 ? Math.round((activeToday / totalUsers) * 100) / 100 : 0,
      wauRate: totalUsers > 0 ? Math.round((activeThisWeek / totalUsers) * 100) / 100 : 0,
      retention: {
        day1: 0, // Would require user creation date tracking
        day7: totalUsers > 0 ? Math.round((activeThisWeek / totalUsers) * 100) : 0,
        day30: totalUsers > 0 ? Math.round((activeThisMonth / totalUsers) * 100) : 0,
      },
    };
  }

  /**
   * Get feature usage metrics
   */
  async getFeatureUsage(): Promise<FeatureUsageMetrics> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Metrics logging stats
    const metricsResult = await db.execute(sql`
      SELECT
        COUNT(DISTINCT user_id) as users_logging,
        COUNT(*) as total_entries
      FROM metric_entries
      WHERE timestamp >= ${thirtyDaysAgo.toISOString()}
    `);
    const metricsRow = metricsResult.rows[0] as any;

    // Food tracking stats
    const foodResult = await db.execute(sql`
      SELECT
        COUNT(DISTINCT user_id) as users_logging,
        COUNT(*) as total_entries,
        SUM(CASE WHEN ai_generated = true THEN 1 ELSE 0 END) as ai_used
      FROM food_entries
      WHERE logged_at >= ${thirtyDaysAgo.toISOString()}
    `);
    const foodRow = foodResult.rows[0] as any;

    // Message stats
    const messageResult = await db.execute(sql`
      SELECT
        COUNT(DISTINCT conversation_id) as active_conversations,
        COUNT(*) as total_messages
      FROM messages
      WHERE created_at >= ${thirtyDaysAgo.toISOString()}
    `);
    const messageRow = messageResult.rows[0] as any;

    const usersLoggingMetrics = Number(metricsRow?.users_logging || 0);
    const usersLoggingFood = Number(foodRow?.users_logging || 0);
    const totalMetricEntries = Number(metricsRow?.total_entries || 0);
    const totalFoodEntries = Number(foodRow?.total_entries || 0);

    return {
      metricsLogging: {
        usersLogging: usersLoggingMetrics,
        totalEntries: totalMetricEntries,
        avgEntriesPerUser: usersLoggingMetrics > 0
          ? Math.round((totalMetricEntries / usersLoggingMetrics) * 10) / 10
          : 0,
      },
      foodTracking: {
        usersLogging: usersLoggingFood,
        totalEntries: totalFoodEntries,
        avgEntriesPerUser: usersLoggingFood > 0
          ? Math.round((totalFoodEntries / usersLoggingFood) * 10) / 10
          : 0,
        aiAnalysisUsed: Number(foodRow?.ai_used || 0),
      },
      messaging: {
        activeConversations: Number(messageRow?.active_conversations || 0),
        totalMessages: Number(messageRow?.total_messages || 0),
        avgResponseTime: 0, // Would require response time tracking
      },
      reports: {
        generated: 0, // Would require report tracking
        exported: 0,
      },
    };
  }

  /**
   * Get coach metrics
   */
  async getCoachMetrics(): Promise<CoachMetrics> {
    // Get coach counts
    const coachResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM users WHERE role = 'coach'
    `);
    const totalCoaches = Number((coachResult.rows[0] as any)?.count || 0);

    // Get participants per coach
    const assignmentResult = await db.execute(sql`
      SELECT
        u.id as coach_id,
        u.first_name,
        u.last_name,
        COUNT(p.id) as participant_count
      FROM users u
      LEFT JOIN users p ON p.coach_id = u.id AND p.role = 'participant'
      WHERE u.role = 'coach'
      GROUP BY u.id, u.first_name, u.last_name
    `);

    const participantsPerCoach: Record<string, number> = {};
    for (const row of assignmentResult.rows as any[]) {
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.coach_id;
      participantsPerCoach[name] = Number(row.participant_count || 0);
    }

    // Get active coaches (sent messages in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeCoachResult = await db.execute(sql`
      SELECT COUNT(DISTINCT sender_id) as count
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE u.role = 'coach' AND m.created_at >= ${sevenDaysAgo.toISOString()}
    `);
    const activeCoaches = Number((activeCoachResult.rows[0] as any)?.count || 0);

    // Get messages per day (last 7 days)
    const messageCountResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE u.role = 'coach' AND m.created_at >= ${sevenDaysAgo.toISOString()}
    `);
    const totalCoachMessages = Number((messageCountResult.rows[0] as any)?.count || 0);

    return {
      totalCoaches,
      activeCoaches,
      participantsPerCoach,
      avgResponseTime: 0, // Would require response time tracking
      messagesPerDay: Math.round((totalCoachMessages / 7) * 10) / 10,
    };
  }

  /**
   * Calculate pilot success metrics
   */
  async getPilotSuccess(): Promise<PilotSuccessMetrics> {
    const engagement = await this.getUserEngagement();
    const features = await this.getFeatureUsage();
    const coaches = await this.getCoachMetrics();

    // Enrollment metrics
    const enrollmentTarget = PILOT_SCALE.users.participants;
    const enrollmentActual = engagement.totalUsers;
    const enrollmentPercentage = Math.round((enrollmentActual / enrollmentTarget) * 100);

    // DAU metrics
    const dauTarget = PILOT_SCALE.dailyActivity.activeUsers;
    const dauActual = engagement.activeToday;
    const dauPercentage = Math.round((dauActual / dauTarget) * 100);

    // Data quality (entries per user per day)
    const targetEntriesPerDay = PILOT_SCALE.dailyActivity.metricsEntriesPerUser +
                                PILOT_SCALE.dailyActivity.foodEntriesPerUser;
    const actualEntriesPerDay = (features.metricsLogging.avgEntriesPerUser +
                                 features.foodTracking.avgEntriesPerUser) / 30; // 30-day average
    const dataQualityPercentage = Math.round((actualEntriesPerDay / targetEntriesPerDay) * 100);

    // Coach interaction (participants with messages in last 7 days)
    const participantsWithContact = features.messaging.activeConversations;
    const coachContactPercentage = enrollmentActual > 0
      ? Math.round((participantsWithContact / enrollmentActual) * 100)
      : 0;

    // Regular logging (logged in last 3 days)
    const usersLoggingRegularly = Math.max(
      features.metricsLogging.usersLogging,
      features.foodTracking.usersLogging
    );
    const regularLoggingPercentage = enrollmentActual > 0
      ? Math.round((usersLoggingRegularly / enrollmentActual) * 100)
      : 0;

    // Calculate overall score (weighted average)
    const weights = {
      enrollment: 0.2,
      engagement: 0.25,
      dataQuality: 0.25,
      coachContact: 0.15,
      regularLogging: 0.15,
    };

    const overallScore = Math.round(
      weights.enrollment * Math.min(enrollmentPercentage, 100) +
      weights.engagement * Math.min(dauPercentage, 100) +
      weights.dataQuality * Math.min(dataQualityPercentage, 100) +
      weights.coachContact * Math.min(coachContactPercentage, 100) +
      weights.regularLogging * Math.min(regularLoggingPercentage, 100)
    );

    // Determine status
    let status: "on_track" | "at_risk" | "behind" = "on_track";
    if (overallScore < 50) {
      status = "behind";
    } else if (overallScore < 70) {
      status = "at_risk";
    }

    return {
      enrollment: {
        target: enrollmentTarget,
        actual: enrollmentActual,
        percentage: enrollmentPercentage,
      },
      engagement: {
        targetDAU: dauTarget,
        actualDAU: dauActual,
        percentage: dauPercentage,
      },
      dataQuality: {
        avgEntriesPerUserPerDay: Math.round(actualEntriesPerDay * 100) / 100,
        targetEntriesPerDay,
        percentage: dataQualityPercentage,
      },
      coachInteraction: {
        participantsWithRecentContact: participantsWithContact,
        percentage: coachContactPercentage,
      },
      healthIndicators: {
        usersLoggingRegularly,
        percentage: regularLoggingPercentage,
      },
      overallScore,
      status,
    };
  }

  /**
   * Get complete business metrics snapshot
   */
  async getMetricsSnapshot(): Promise<BusinessMetricsSnapshot> {
    const [engagement, features, coaches, pilotSuccess] = await Promise.all([
      this.getUserEngagement(),
      this.getFeatureUsage(),
      this.getCoachMetrics(),
      this.getPilotSuccess(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      period: "last_30_days",
      engagement,
      features,
      coaches,
      pilotSuccess,
    };
  }

  /**
   * Get summary for quick dashboard view
   */
  async getDashboardSummary(): Promise<{
    timestamp: string;
    kpis: Array<{
      name: string;
      value: number;
      target: number;
      unit: string;
      status: "good" | "warning" | "critical";
    }>;
    pilotScore: number;
    pilotStatus: string;
  }> {
    const pilot = await this.getPilotSuccess();
    const engagement = await this.getUserEngagement();

    return {
      timestamp: new Date().toISOString(),
      kpis: [
        {
          name: "Enrolled Participants",
          value: pilot.enrollment.actual,
          target: pilot.enrollment.target,
          unit: "users",
          status: pilot.enrollment.percentage >= 80 ? "good" :
                  pilot.enrollment.percentage >= 50 ? "warning" : "critical",
        },
        {
          name: "Daily Active Users",
          value: pilot.engagement.actualDAU,
          target: pilot.engagement.targetDAU,
          unit: "users",
          status: pilot.engagement.percentage >= 70 ? "good" :
                  pilot.engagement.percentage >= 50 ? "warning" : "critical",
        },
        {
          name: "DAU Rate",
          value: Math.round(engagement.dauRate * 100),
          target: 70,
          unit: "%",
          status: engagement.dauRate >= 0.7 ? "good" :
                  engagement.dauRate >= 0.5 ? "warning" : "critical",
        },
        {
          name: "Data Quality",
          value: pilot.dataQuality.percentage,
          target: 100,
          unit: "%",
          status: pilot.dataQuality.percentage >= 70 ? "good" :
                  pilot.dataQuality.percentage >= 50 ? "warning" : "critical",
        },
      ],
      pilotScore: pilot.overallScore,
      pilotStatus: pilot.status,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const businessMetrics = new BusinessMetricsService();

export default {
  businessMetrics,
};

import { db } from "./storage";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import * as schema from "@shared/schema";

export interface AnalyticsOverview {
  totalParticipants: number;
  activeParticipants: number;
  inactiveParticipants: number;
  newParticipants7Days: number;
  newParticipants30Days: number;
  averageWeeklyAdherence: number;
  participantsWithStreak3Days: number;
  participantsWithStreak3DaysPercent: number;
}

export interface HealthFlag {
  type: "high_glucose" | "elevated_bp" | "missed_logging" | "low_ketones";
  participantId: string;
  participantName: string;
  participantEmail: string;
  coachId: string | null;
  coachName: string | null;
  lastLogDate: string | null;
  details: string;
}

export interface FlagsAnalytics {
  highGlucoseCount: number;
  elevatedBpCount: number;
  missedLoggingCount: number;
  lowKetonesCount: number;
  flags: HealthFlag[];
}

export interface MacroAnalytics {
  participantsMeetingProtein: number;
  participantsMeetingProteinPercent: number;
  participantsOverCarbs: number;
  participantsOverCarbsPercent: number;
  averageProteinVsTarget: number;
  totalWithTargets: number;
}

export interface OutcomeMetric {
  metricType: string;
  meanChange: number;
  participantCount: number;
  limitedData: boolean;
}

export interface OutcomesAnalytics {
  weight: OutcomeMetric;
  waist: OutcomeMetric;
  fastingGlucose: OutcomeMetric;
}

export interface CoachWorkload {
  coachId: string;
  coachName: string;
  participantCount: number;
  unreadMessages: number;
  flaggedParticipants: number;
}

function getDateRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export class AnalyticsService {
  async getOverview(range: number = 7, coachId?: string): Promise<AnalyticsOverview> {
    const { start, end } = getDateRange(range);
    const thirtyDaysAgo = getDateRange(30).start;
    const sevenDaysAgo = getDateRange(7).start;

    let participantsQuery = db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const allParticipants = await participantsQuery;
    
    const filteredParticipants = coachId 
      ? allParticipants.filter(p => p.coachId === coachId)
      : allParticipants;
    
    const participantIds = filteredParticipants.map(p => p.id);
    
    if (participantIds.length === 0) {
      return {
        totalParticipants: 0,
        activeParticipants: 0,
        inactiveParticipants: 0,
        newParticipants7Days: 0,
        newParticipants30Days: 0,
        averageWeeklyAdherence: 0,
        participantsWithStreak3Days: 0,
        participantsWithStreak3DaysPercent: 0,
      };
    }

    const activeSet = new Set<string>();
    
    const metricEntries = await db.select()
      .from(schema.metricEntries)
      .where(gte(schema.metricEntries.timestamp, start));
    
    const foodEntries = await db.select()
      .from(schema.foodEntries)
      .where(gte(schema.foodEntries.timestamp, start));
    
    metricEntries.forEach(e => {
      if (participantIds.includes(e.userId)) activeSet.add(e.userId);
    });
    foodEntries.forEach(e => {
      if (participantIds.includes(e.userId)) activeSet.add(e.userId);
    });

    const newParticipants7 = filteredParticipants.filter(p => p.createdAt >= sevenDaysAgo).length;
    const newParticipants30 = filteredParticipants.filter(p => p.createdAt >= thirtyDaysAgo).length;

    const adherenceScores: number[] = [];
    const streakCounts: number[] = [];

    for (const userId of participantIds) {
      const userMetrics = metricEntries.filter(e => e.userId === userId);
      const userFood = foodEntries.filter(e => e.userId === userId);
      
      const dailyMetrics = new Map<string, Set<string>>();
      const dailyLogs = new Map<string, boolean>();
      
      userMetrics.forEach(e => {
        const day = e.timestamp.toISOString().split('T')[0];
        if (!dailyMetrics.has(day)) dailyMetrics.set(day, new Set());
        dailyMetrics.get(day)!.add(e.type);
        dailyLogs.set(day, true);
      });
      
      userFood.forEach(e => {
        const day = e.timestamp.toISOString().split('T')[0];
        dailyLogs.set(day, true);
      });

      let totalAdherence = 0;
      let daysWithMetrics = 0;
      dailyMetrics.forEach((types) => {
        totalAdherence += types.size / 5;
        daysWithMetrics++;
      });
      if (daysWithMetrics > 0) {
        adherenceScores.push(totalAdherence / Math.min(daysWithMetrics, 7));
      }

      const sortedDays = Array.from(dailyLogs.keys()).sort().reverse();
      let streak = 0;
      const today = new Date().toISOString().split('T')[0];
      for (let i = 0; i < sortedDays.length; i++) {
        const expectedDay = new Date();
        expectedDay.setDate(expectedDay.getDate() - i);
        const expected = expectedDay.toISOString().split('T')[0];
        if (sortedDays.includes(expected)) {
          streak++;
        } else {
          break;
        }
      }
      streakCounts.push(streak);
    }

    const avgAdherence = adherenceScores.length > 0 
      ? adherenceScores.reduce((a, b) => a + b, 0) / adherenceScores.length 
      : 0;
    
    const with3DayStreak = streakCounts.filter(s => s >= 3).length;

    return {
      totalParticipants: filteredParticipants.length,
      activeParticipants: activeSet.size,
      inactiveParticipants: filteredParticipants.length - activeSet.size,
      newParticipants7Days: newParticipants7,
      newParticipants30Days: newParticipants30,
      averageWeeklyAdherence: Math.round(avgAdherence * 100),
      participantsWithStreak3Days: with3DayStreak,
      participantsWithStreak3DaysPercent: filteredParticipants.length > 0 
        ? Math.round((with3DayStreak / filteredParticipants.length) * 100) 
        : 0,
    };
  }

  async getFlags(range: number = 7, coachId?: string): Promise<FlagsAnalytics> {
    const { start } = getDateRange(range);
    const threeDaysAgo = getDateRange(3).start;
    
    const allParticipants = await db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const coaches = await db.select().from(schema.users).where(eq(schema.users.role, "coach"));
    const coachMap = new Map(coaches.map(c => [c.id, c.name]));
    
    const filteredParticipants = coachId 
      ? allParticipants.filter(p => p.coachId === coachId)
      : allParticipants;
    
    const participantIds = filteredParticipants.map(p => p.id);
    const participantMap = new Map(filteredParticipants.map(p => [p.id, p]));
    
    const flags: HealthFlag[] = [];
    
    const allMetrics = await db.select()
      .from(schema.metricEntries)
      .where(gte(schema.metricEntries.timestamp, start));
    
    const allFood = await db.select()
      .from(schema.foodEntries)
      .where(gte(schema.foodEntries.timestamp, start));

    for (const userId of participantIds) {
      const participant = participantMap.get(userId)!;
      const userMetrics = allMetrics.filter(e => e.userId === userId);
      const userFood = allFood.filter(e => e.userId === userId);
      
      const glucoseEntries = userMetrics
        .filter(e => e.type === "GLUCOSE" && e.timestamp >= threeDaysAgo)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      const highGlucoseDays = new Set<string>();
      glucoseEntries.forEach(e => {
        const val = e.valueJson as any;
        const value = val?.value || val?.fasting || 0;
        if (value >= 110) {
          highGlucoseDays.add(e.timestamp.toISOString().split('T')[0]);
        }
      });
      
      if (highGlucoseDays.size >= 3) {
        flags.push({
          type: "high_glucose",
          participantId: userId,
          participantName: participant.name,
          participantEmail: participant.email,
          coachId: participant.coachId,
          coachName: participant.coachId ? coachMap.get(participant.coachId) || null : null,
          lastLogDate: glucoseEntries[0]?.timestamp.toISOString().split('T')[0] || null,
          details: `High fasting glucose (≥110) on ${highGlucoseDays.size} days`,
        });
      }

      const bpEntries = userMetrics
        .filter(e => e.type === "BP")
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      const elevatedBpDays = new Set<string>();
      bpEntries.forEach(e => {
        const val = e.valueJson as any;
        const systolic = val?.systolic || 0;
        const diastolic = val?.diastolic || 0;
        if (systolic >= 140 || diastolic >= 90) {
          elevatedBpDays.add(e.timestamp.toISOString().split('T')[0]);
        }
      });
      
      if (elevatedBpDays.size >= 2) {
        flags.push({
          type: "elevated_bp",
          participantId: userId,
          participantName: participant.name,
          participantEmail: participant.email,
          coachId: participant.coachId,
          coachName: participant.coachId ? coachMap.get(participant.coachId) || null : null,
          lastLogDate: bpEntries[0]?.timestamp.toISOString().split('T')[0] || null,
          details: `Elevated BP (≥140/90) on ${elevatedBpDays.size} days in last 7 days`,
        });
      }

      const allUserLogs = [...userMetrics, ...userFood].sort((a, b) => 
        b.timestamp.getTime() - a.timestamp.getTime()
      );
      
      if (allUserLogs.length === 0) {
        const daysSinceCreation = Math.floor(
          (Date.now() - participant.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceCreation >= 3) {
          flags.push({
            type: "missed_logging",
            participantId: userId,
            participantName: participant.name,
            participantEmail: participant.email,
            coachId: participant.coachId,
            coachName: participant.coachId ? coachMap.get(participant.coachId) || null : null,
            lastLogDate: null,
            details: `No logs since account creation (${daysSinceCreation} days)`,
          });
        }
      } else {
        const lastLog = allUserLogs[0];
        const daysSinceLog = Math.floor(
          (Date.now() - lastLog.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceLog >= 3) {
          flags.push({
            type: "missed_logging",
            participantId: userId,
            participantName: participant.name,
            participantEmail: participant.email,
            coachId: participant.coachId,
            coachName: participant.coachId ? coachMap.get(participant.coachId) || null : null,
            lastLogDate: lastLog.timestamp.toISOString().split('T')[0],
            details: `No logs for ${daysSinceLog} days`,
          });
        }
      }
    }

    return {
      highGlucoseCount: flags.filter(f => f.type === "high_glucose").length,
      elevatedBpCount: flags.filter(f => f.type === "elevated_bp").length,
      missedLoggingCount: flags.filter(f => f.type === "missed_logging").length,
      lowKetonesCount: flags.filter(f => f.type === "low_ketones").length,
      flags,
    };
  }

  async getMacros(range: number = 7, coachId?: string): Promise<MacroAnalytics> {
    const { start } = getDateRange(range);
    
    const allParticipants = await db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const filteredParticipants = coachId 
      ? allParticipants.filter(p => p.coachId === coachId)
      : allParticipants;
    
    const participantIds = filteredParticipants.map(p => p.id);
    
    const targets = await db.select().from(schema.macroTargets);
    const targetMap = new Map(targets.map(t => [t.userId, t]));
    
    const foodEntries = await db.select()
      .from(schema.foodEntries)
      .where(gte(schema.foodEntries.timestamp, start));

    let meetingProtein = 0;
    let overCarbs = 0;
    let totalProteinRatio = 0;
    let participantsWithData = 0;

    for (const userId of participantIds) {
      const target = targetMap.get(userId);
      if (!target || !target.proteinG) continue;
      
      const userFood = foodEntries.filter(e => e.userId === userId);
      if (userFood.length === 0) continue;

      let totalProtein = 0;
      let totalCarbs = 0;
      
      userFood.forEach(entry => {
        const macros = (entry.userCorrectionsJson as any) || (entry.aiOutputJson as any);
        if (macros) {
          totalProtein += macros.protein || 0;
          totalCarbs += macros.carbs || 0;
        }
      });

      const avgDailyProtein = totalProtein / range;
      const avgDailyCarbs = totalCarbs / range;
      
      participantsWithData++;
      
      const proteinTarget = target.proteinG;
      const carbsTarget = target.carbsG || 100;
      
      if (Math.abs(avgDailyProtein - proteinTarget) / proteinTarget <= 0.1) {
        meetingProtein++;
      }
      
      if (avgDailyCarbs > carbsTarget * 1.1) {
        overCarbs++;
      }
      
      totalProteinRatio += avgDailyProtein / proteinTarget;
    }

    const participantsWithTargets = participantIds.filter(id => targetMap.has(id)).length;

    return {
      participantsMeetingProtein: meetingProtein,
      participantsMeetingProteinPercent: participantsWithData > 0 
        ? Math.round((meetingProtein / participantsWithData) * 100) 
        : 0,
      participantsOverCarbs: overCarbs,
      participantsOverCarbsPercent: participantsWithData > 0 
        ? Math.round((overCarbs / participantsWithData) * 100) 
        : 0,
      averageProteinVsTarget: participantsWithData > 0 
        ? Math.round((totalProteinRatio / participantsWithData) * 100) 
        : 0,
      totalWithTargets: participantsWithTargets,
    };
  }

  async getOutcomes(range: number = 30, coachId?: string): Promise<OutcomesAnalytics> {
    const { start } = getDateRange(range);
    
    const allParticipants = await db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const filteredParticipants = coachId 
      ? allParticipants.filter(p => p.coachId === coachId)
      : allParticipants;
    
    const participantIds = filteredParticipants.map(p => p.id);
    
    const metricEntries = await db.select()
      .from(schema.metricEntries)
      .where(gte(schema.metricEntries.timestamp, start));

    const calculateChange = (type: string, valueExtractor: (val: any) => number): OutcomeMetric => {
      const changes: number[] = [];
      
      for (const userId of participantIds) {
        const userEntries = metricEntries
          .filter(e => e.userId === userId && e.type === type)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        if (userEntries.length >= 2) {
          const earliest = valueExtractor(userEntries[0].valueJson);
          const latest = valueExtractor(userEntries[userEntries.length - 1].valueJson);
          if (earliest && latest) {
            changes.push(latest - earliest);
          }
        }
      }
      
      return {
        metricType: type,
        meanChange: changes.length > 0 
          ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10 
          : 0,
        participantCount: changes.length,
        limitedData: changes.length < 5,
      };
    };

    return {
      weight: calculateChange("WEIGHT", (v) => v?.value || v?.weight || 0),
      waist: calculateChange("WAIST", (v) => v?.value || v?.waist || 0),
      fastingGlucose: calculateChange("GLUCOSE", (v) => v?.value || v?.fasting || 0),
    };
  }

  async getCoachWorkload(range: number = 7): Promise<CoachWorkload[]> {
    const coaches = await db.select().from(schema.users).where(eq(schema.users.role, "coach"));
    const participants = await db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const conversations = await db.select().from(schema.conversations);
    const messages = await db.select().from(schema.messages);
    
    const flagsData = await this.getFlags(range);
    const flagsByCoach = new Map<string, number>();
    flagsData.flags.forEach(f => {
      if (f.coachId) {
        flagsByCoach.set(f.coachId, (flagsByCoach.get(f.coachId) || 0) + 1);
      }
    });

    return coaches.map(coach => {
      const coachParticipants = participants.filter(p => p.coachId === coach.id);
      
      const coachConversations = conversations.filter(c => c.coachId === coach.id);
      const conversationIds = coachConversations.map(c => c.id);
      
      const unreadCount = messages.filter(m => 
        conversationIds.includes(m.conversationId) && 
        m.senderId !== coach.id &&
        !m.readAt
      ).length;

      return {
        coachId: coach.id,
        coachName: coach.name,
        participantCount: coachParticipants.length,
        unreadMessages: unreadCount,
        flaggedParticipants: flagsByCoach.get(coach.id) || 0,
      };
    });
  }
}

export const analyticsService = new AnalyticsService();

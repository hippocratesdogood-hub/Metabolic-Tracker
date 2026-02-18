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
  bp: OutcomeMetric;
  previous?: {
    weight: OutcomeMetric;
    waist: OutcomeMetric;
    fastingGlucose: OutcomeMetric;
    bp: OutcomeMetric;
  };
}

export interface TrendDataPoint {
  weekLabel: string;
  weekStart: string;
  avgWeight: number | null;
  avgSystolic: number | null;
  avgGlucose: number | null;
  engagementCount: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
}

export interface DemographicsAnalytics {
  ageDistribution: DistributionBucket[];
  weightDistribution: DistributionBucket[];
  totalParticipants: number;
  participantsWithDob: number;
  participantsWithWeight: number;
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

/**
 * Convert Date to local date string (YYYY-MM-DD)
 * Uses local timezone to match user expectation of "today"
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

      // Check for low ketones (<0.1 mmol/L on 3+ days in 3-day window)
      const ketoneEntries = userMetrics
        .filter(e => e.type === "KETONES" && e.timestamp >= threeDaysAgo)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const lowKetoneDays = new Set<string>();
      ketoneEntries.forEach(e => {
        const val = e.valueJson as any;
        const value = val?.value ?? (e.normalizedValue ?? 0);
        if (value < 0.1) {
          lowKetoneDays.add(e.timestamp.toISOString().split('T')[0]);
        }
      });

      if (lowKetoneDays.size >= 3) {
        flags.push({
          type: "low_ketones",
          participantId: userId,
          participantName: participant.name,
          participantEmail: participant.email,
          coachId: participant.coachId,
          coachName: participant.coachId ? coachMap.get(participant.coachId) || null : null,
          lastLogDate: ketoneEntries[0]?.timestamp.toISOString().split('T')[0] || null,
          details: `Low ketones (<0.1 mmol/L) on ${lowKetoneDays.size} days`,
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
      
      const daysWithFood = new Set<string>();
      userFood.forEach(entry => {
        const macros = (entry.userCorrectionsJson as any) || (entry.aiOutputJson as any);
        if (macros) {
          totalProtein += macros.protein || 0;
          totalCarbs += macros.carbs || 0;
        }
        daysWithFood.add(toLocalDateString(entry.timestamp));
      });

      // Use actual days with data, not the range period
      const daysCount = daysWithFood.size || 1;
      const avgDailyProtein = totalProtein / daysCount;
      const avgDailyCarbs = totalCarbs / daysCount;
      
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

  private _calculateOutcomesFromEntries(
    metricEntries: any[],
    participantIds: string[]
  ): { weight: OutcomeMetric; waist: OutcomeMetric; fastingGlucose: OutcomeMetric; bp: OutcomeMetric } {
    const calculateChange = (type: string, valueExtractor: (val: any) => number): OutcomeMetric => {
      const changes: number[] = [];

      for (const userId of participantIds) {
        const userEntries = metricEntries
          .filter(e => e.userId === userId && e.type === type)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        if (userEntries.length >= 2) {
          const earliest = valueExtractor(userEntries[0].valueJson);
          const latest = valueExtractor(userEntries[userEntries.length - 1].valueJson);
          if (earliest !== undefined && earliest !== null &&
              latest !== undefined && latest !== null) {
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
      bp: calculateChange("BP", (v) => v?.systolic || 0),
    };
  }

  async getOutcomes(range: number = 30, coachId?: string, compare: boolean = false): Promise<OutcomesAnalytics> {
    const allParticipants = await db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const filteredParticipants = coachId
      ? allParticipants.filter(p => p.coachId === coachId)
      : allParticipants;
    const participantIds = filteredParticipants.map(p => p.id);

    // Current period
    const { start } = getDateRange(range);
    const currentEntries = await db.select()
      .from(schema.metricEntries)
      .where(gte(schema.metricEntries.timestamp, start));

    const current = this._calculateOutcomesFromEntries(currentEntries, participantIds);

    if (!compare) {
      return current;
    }

    // Previous period: [now - 2*range, now - range]
    const prevEnd = new Date();
    prevEnd.setDate(prevEnd.getDate() - range);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - range);
    prevStart.setHours(0, 0, 0, 0);

    const prevEntries = await db.select()
      .from(schema.metricEntries)
      .where(and(
        gte(schema.metricEntries.timestamp, prevStart),
        lte(schema.metricEntries.timestamp, prevEnd)
      ));

    const previous = this._calculateOutcomesFromEntries(prevEntries, participantIds);

    return { ...current, previous };
  }

  async getTrends(range: number = 30, coachId?: string): Promise<TrendDataPoint[]> {
    const { start } = getDateRange(range);

    const allParticipants = await db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const filteredParticipants = coachId
      ? allParticipants.filter(p => p.coachId === coachId)
      : allParticipants;
    const participantIds = new Set(filteredParticipants.map(p => p.id));

    const metricEntries = await db.select()
      .from(schema.metricEntries)
      .where(gte(schema.metricEntries.timestamp, start));

    const foodEntries = await db.select()
      .from(schema.foodEntries)
      .where(gte(schema.foodEntries.timestamp, start));

    // Group by ISO week (Monday start)
    const getWeekStart = (date: Date): string => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().split('T')[0];
    };

    const formatWeekLabel = (isoDate: string): string => {
      const d = new Date(isoDate + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const weekBuckets = new Map<string, {
      weights: number[];
      systolics: number[];
      glucoses: number[];
      foodCount: number;
    }>();

    for (const entry of metricEntries) {
      if (!participantIds.has(entry.userId)) continue;
      const week = getWeekStart(entry.timestamp);
      if (!weekBuckets.has(week)) {
        weekBuckets.set(week, { weights: [], systolics: [], glucoses: [], foodCount: 0 });
      }
      const bucket = weekBuckets.get(week)!;
      const val = entry.valueJson as any;

      if (entry.type === 'WEIGHT' && (val?.value || val?.weight)) {
        bucket.weights.push(val.value || val.weight);
      } else if (entry.type === 'BP' && val?.systolic) {
        bucket.systolics.push(val.systolic);
      } else if (entry.type === 'GLUCOSE' && (val?.value || val?.fasting)) {
        bucket.glucoses.push(val.value || val.fasting);
      }
    }

    for (const entry of foodEntries) {
      if (!participantIds.has(entry.userId)) continue;
      const week = getWeekStart(entry.timestamp);
      if (!weekBuckets.has(week)) {
        weekBuckets.set(week, { weights: [], systolics: [], glucoses: [], foodCount: 0 });
      }
      weekBuckets.get(week)!.foodCount++;
    }

    const avg = (arr: number[]) => arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
      : null;

    return Array.from(weekBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, data]) => ({
        weekLabel: formatWeekLabel(weekStart),
        weekStart,
        avgWeight: avg(data.weights),
        avgSystolic: avg(data.systolics),
        avgGlucose: avg(data.glucoses),
        engagementCount: data.foodCount,
      }));
  }

  async getDemographics(coachId?: string): Promise<DemographicsAnalytics> {
    const allParticipants = await db.select().from(schema.users).where(eq(schema.users.role, "participant"));
    const filteredParticipants = coachId
      ? allParticipants.filter(p => p.coachId === coachId)
      : allParticipants;
    const participantIds = new Set(filteredParticipants.map(p => p.id));

    // Age distribution
    const ageBucketDefs = [
      { label: '18-24', min: 18, max: 24 },
      { label: '25-29', min: 25, max: 29 },
      { label: '30-34', min: 30, max: 34 },
      { label: '35-39', min: 35, max: 39 },
      { label: '40-44', min: 40, max: 44 },
      { label: '45-49', min: 45, max: 49 },
      { label: '50-54', min: 50, max: 54 },
      { label: '55-59', min: 55, max: 59 },
      { label: '60-64', min: 60, max: 64 },
      { label: '65+', min: 65, max: 999 },
    ];

    const now = new Date();
    let participantsWithDob = 0;
    const ages: number[] = [];

    for (const p of filteredParticipants) {
      if (!p.dateOfBirth) continue;
      participantsWithDob++;
      const age = Math.floor((now.getTime() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      ages.push(age);
    }

    const ageDistribution = ageBucketDefs.map(bucket => ({
      label: bucket.label,
      count: ages.filter(a => a >= bucket.min && a <= bucket.max).length,
    }));

    // Weight distribution — latest WEIGHT entry per participant
    const allWeightEntries = await db.select()
      .from(schema.metricEntries)
      .where(eq(schema.metricEntries.type, 'WEIGHT'));

    const latestWeightByUser = new Map<string, { value: number; ts: number }>();
    for (const entry of allWeightEntries) {
      if (!participantIds.has(entry.userId)) continue;
      const val = (entry.valueJson as any)?.value || (entry.valueJson as any)?.weight;
      if (!val) continue;
      const existing = latestWeightByUser.get(entry.userId);
      if (!existing || entry.timestamp.getTime() > existing.ts) {
        latestWeightByUser.set(entry.userId, { value: val, ts: entry.timestamp.getTime() });
      }
    }

    const weightBucketDefs = [
      { label: '<100 lbs', min: 0, max: 99.9 },
      { label: '100-119 lbs', min: 100, max: 119.9 },
      { label: '120-139 lbs', min: 120, max: 139.9 },
      { label: '140-159 lbs', min: 140, max: 159.9 },
      { label: '160-179 lbs', min: 160, max: 179.9 },
      { label: '180-199 lbs', min: 180, max: 199.9 },
      { label: '200-219 lbs', min: 200, max: 219.9 },
      { label: '220-239 lbs', min: 220, max: 239.9 },
      { label: '240+ lbs', min: 240, max: 9999 },
    ];

    const weights = Array.from(latestWeightByUser.values()).map(w => w.value);
    const weightDistribution = weightBucketDefs.map(bucket => ({
      label: bucket.label,
      count: weights.filter(w => w >= bucket.min && w <= bucket.max).length,
    }));

    return {
      ageDistribution,
      weightDistribution,
      totalParticipants: filteredParticipants.length,
      participantsWithDob,
      participantsWithWeight: latestWeightByUser.size,
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

  /**
   * Get consistency metrics for a specific user.
   *
   * Product Decision: Daily loggers see traditional streak, weekly loggers see
   * consistency percentage (% of weeks with at least one log).
   */
  async getUserConsistencyMetrics(userId: string, weeksToAnalyze: number = 12): Promise<ConsistencyMetrics> {
    const { start } = getDateRange(weeksToAnalyze * 7);

    const metricEntries = await db
      .select()
      .from(schema.metricEntries)
      .where(and(eq(schema.metricEntries.userId, userId), gte(schema.metricEntries.timestamp, start)));

    const foodEntries = await db
      .select()
      .from(schema.foodEntries)
      .where(and(eq(schema.foodEntries.userId, userId), gte(schema.foodEntries.timestamp, start)));

    // Combine all log dates
    const allDates = [
      ...metricEntries.map((e) => e.timestamp),
      ...foodEntries.map((e) => e.timestamp),
    ];

    const pattern = detectLoggingPattern(allDates);
    const streak = calculateStreak(allDates);
    const consistency = calculateConsistencyPercent(allDates, weeksToAnalyze);

    // Recommend streak for daily loggers, consistency for weekly/sporadic
    const recommendedMetric = pattern.type === "daily" ? "streak" : "consistency";

    return {
      streak,
      consistencyPercent: consistency.percent,
      pattern,
      recommendedMetric,
      weeksWithLogs: consistency.weeksWithLogs,
      totalWeeks: consistency.totalWeeks,
    };
  }
}

// ============================================================================
// CONSISTENCY METRICS HELPER FUNCTIONS
// ============================================================================

export interface LoggingPattern {
  /** Type of logger: daily (logs most days) or weekly (logs ~once per week) */
  type: "daily" | "weekly" | "sporadic";
  /** Average days between logs */
  averageGap: number;
  /** Total number of log entries in the period */
  totalEntries: number;
}

export interface ConsistencyMetrics {
  /** Traditional streak: consecutive days with at least one log */
  streak: number;
  /** Consistency percentage: % of weeks with at least one log */
  consistencyPercent: number;
  /** Detected logging pattern */
  pattern: LoggingPattern;
  /** Recommended metric to show: "streak" for daily loggers, "consistency" for weekly */
  recommendedMetric: "streak" | "consistency";
  /** Number of weeks with at least one entry */
  weeksWithLogs: number;
  /** Total weeks in the calculation period */
  totalWeeks: number;
}

/**
 * Detect a user's logging pattern based on their entry history.
 */
function detectLoggingPattern(logDates: Date[]): LoggingPattern {
  if (logDates.length < 3) {
    return { type: "sporadic", averageGap: 0, totalEntries: logDates.length };
  }

  const sorted = [...logDates].sort((a, b) => a.getTime() - b.getTime());

  let totalGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    totalGap += gap;
  }
  const averageGap = totalGap / (sorted.length - 1);

  let type: LoggingPattern["type"];
  if (averageGap <= 2) {
    type = "daily";
  } else if (averageGap <= 10) {
    type = "weekly";
  } else {
    type = "sporadic";
  }

  return { type, averageGap: Math.round(averageGap * 10) / 10, totalEntries: sorted.length };
}

/**
 * Calculate consistency percentage: % of weeks with at least one log.
 */
function calculateConsistencyPercent(
  logDates: Date[],
  weeksToAnalyze: number = 12
): { percent: number; weeksWithLogs: number; totalWeeks: number } {
  if (logDates.length === 0) {
    return { percent: 0, weeksWithLogs: 0, totalWeeks: weeksToAnalyze };
  }

  const now = new Date();
  const weeksWithEntries = new Set<string>();

  logDates.forEach((date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek);
    const weekKey = d.toISOString().split("T")[0];
    weeksWithEntries.add(weekKey);
  });

  const analysisStart = new Date(now);
  analysisStart.setDate(analysisStart.getDate() - weeksToAnalyze * 7);

  let validWeeksWithLogs = 0;
  weeksWithEntries.forEach((weekKey) => {
    const weekDate = new Date(weekKey);
    if (weekDate >= analysisStart) {
      validWeeksWithLogs++;
    }
  });

  validWeeksWithLogs = Math.min(validWeeksWithLogs, weeksToAnalyze);
  const percent = Math.round((validWeeksWithLogs / weeksToAnalyze) * 100);
  return { percent, weeksWithLogs: validWeeksWithLogs, totalWeeks: weeksToAnalyze };
}

/**
 * Calculate streak for a user based on their log dates.
 */
function calculateStreak(logDates: Date[]): number {
  if (logDates.length === 0) return 0;

  const uniqueDays = new Set<string>();
  logDates.forEach((date) => {
    uniqueDays.add(date.toISOString().split("T")[0]);
  });

  const sortedDays = Array.from(uniqueDays).sort().reverse();

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i <= sortedDays.length; i++) {
    const expectedDay = new Date(today);
    expectedDay.setDate(expectedDay.getDate() - i);
    const expected = expectedDay.toISOString().split("T")[0];

    if (sortedDays.includes(expected)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export const analyticsService = new AnalyticsService();

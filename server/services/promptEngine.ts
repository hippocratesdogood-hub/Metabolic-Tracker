/**
 * Prompt Engine Service
 *
 * Evaluates prompt rules and delivers coaching prompts to users.
 *
 * ARCHITECTURE:
 * - Prompts: Message templates with personalization tokens
 * - Rules: Conditions that trigger prompt delivery
 * - Deliveries: Records of sent prompts (for cooldown/deduplication)
 *
 * TRIGGER TYPES:
 * - schedule: Time-based (daily at 8am, weekly on Monday)
 * - event: Metric-based (glucose > 110, missed logging)
 * - missed: Inactivity-based (no logs for X days)
 *
 * SAFETY:
 * - Cooldown periods prevent spam
 * - Backfilled entries don't trigger prompts
 * - Rate limiting per user
 */

import { db } from "../storage";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { isBackfilledEntry } from "../storage";

// ============================================================================
// Types
// ============================================================================

export interface Prompt {
  id: string;
  key: string;
  name: string;
  category: "reminder" | "intervention" | "education";
  messageTemplate: string;
  channel: "in_app" | "email" | "sms";
  active: boolean;
}

export interface PromptRule {
  id: string;
  key: string;
  promptId: string;
  triggerType: "schedule" | "event" | "missed";
  scheduleJson: ScheduleConfig | null;
  conditionsJson: ConditionConfig | null;
  cooldownHours: number;
  priority: number;
  active: boolean;
}

export interface ScheduleConfig {
  /** Cron expression or simplified format */
  cron?: string;
  /** Hour of day (0-23) */
  hour?: number;
  /** Day of week (0-6, 0=Sunday) */
  dayOfWeek?: number;
  /** Day of month (1-31) */
  dayOfMonth?: number;
}

export interface ConditionConfig {
  /** Metric type to check */
  metricType?: "GLUCOSE" | "BP" | "WEIGHT" | "WAIST" | "KETONES";
  /** Comparison operator */
  operator?: "gt" | "gte" | "lt" | "lte" | "eq";
  /** Threshold value */
  value?: number;
  /** For BP: diastolic threshold */
  diastolicValue?: number;
  /** Number of consecutive occurrences required */
  consecutiveDays?: number;
  /** Days without activity */
  inactiveDays?: number;
}

export interface UserContext {
  id: string;
  name: string;
  email: string;
  lastLogDate: Date | null;
  daysSinceLastLog: number | null;
  metrics: MetricSummary;
  targets: MacroTargetSummary | null;
}

export interface MetricSummary {
  glucose: { latest: number | null; average7Day: number | null; highDays: number };
  bp: { latest: { systolic: number; diastolic: number } | null; elevatedDays: number };
  weight: { latest: number | null; change30Day: number | null };
  ketones: { latest: number | null };
}

export interface MacroTargetSummary {
  proteinG: number | null;
  carbsG: number | null;
  caloriesKcal: number | null;
}

export interface DeliveryResult {
  success: boolean;
  promptId: string;
  userId: string;
  message: string;
  channel: string;
  error?: string;
}

// ============================================================================
// Prompt Engine Class
// ============================================================================

export class PromptEngine {
  /**
   * Evaluate all active rules for a user and fire matching prompts
   */
  async evaluateAndFire(userId: string): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    // Get user context
    const context = await this.getUserContext(userId);
    if (!context) return results;

    // Get active rules ordered by priority
    const rules = await this.getActiveRules();

    for (const rule of rules) {
      // Check cooldown
      if (await this.isInCooldown(userId, rule.promptId, rule.cooldownHours)) {
        continue;
      }

      // Evaluate rule conditions
      if (this.evaluateRule(rule, context)) {
        const prompt = await this.getPrompt(rule.promptId);
        if (prompt && prompt.active) {
          const result = await this.deliverPrompt(prompt, rule, context);
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Check all users and fire due prompts (for scheduled batch processing)
   */
  async processScheduledPrompts(): Promise<Map<string, DeliveryResult[]>> {
    const allResults = new Map<string, DeliveryResult[]>();

    // Get all active participants
    const participants = await db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, "participant"),
          eq(schema.users.status, "active")
        )
      );

    for (const user of participants) {
      const results = await this.evaluateAndFire(user.id);
      if (results.length > 0) {
        allResults.set(user.id, results);
      }
    }

    return allResults;
  }

  /**
   * Fire event-triggered prompts when a metric is logged
   * Called after metric entry creation
   */
  async onMetricLogged(
    userId: string,
    metricType: string,
    entry: { timestamp: Date; createdAt: Date; valueJson: unknown }
  ): Promise<DeliveryResult[]> {
    // Don't trigger for backfilled entries
    if (isBackfilledEntry(entry)) {
      return [];
    }

    const results: DeliveryResult[] = [];
    const context = await this.getUserContext(userId);
    if (!context) return results;

    // Get event-triggered rules for this metric type
    const rules = await this.getEventRulesForMetric(metricType);

    for (const rule of rules) {
      if (await this.isInCooldown(userId, rule.promptId, rule.cooldownHours)) {
        continue;
      }

      if (this.evaluateRule(rule, context)) {
        const prompt = await this.getPrompt(rule.promptId);
        if (prompt && prompt.active) {
          const result = await this.deliverPrompt(prompt, rule, context);
          results.push(result);
        }
      }
    }

    return results;
  }

  // ============================================================================
  // Rule Evaluation
  // ============================================================================

  /**
   * Evaluate if a rule's conditions are met
   */
  evaluateRule(rule: PromptRule, context: UserContext): boolean {
    const conditions = rule.conditionsJson as ConditionConfig | null;

    switch (rule.triggerType) {
      case "schedule":
        return this.evaluateSchedule(rule.scheduleJson as ScheduleConfig | null);

      case "missed":
        return this.evaluateMissedLogging(conditions, context);

      case "event":
        return this.evaluateEventCondition(conditions, context);

      default:
        return false;
    }
  }

  /**
   * Check if current time matches schedule
   */
  evaluateSchedule(schedule: ScheduleConfig | null): boolean {
    if (!schedule) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const currentDayOfWeek = now.getDay();
    const currentDayOfMonth = now.getDate();

    // Check hour (if specified)
    if (schedule.hour !== undefined && schedule.hour !== currentHour) {
      return false;
    }

    // Check day of week (if specified)
    if (schedule.dayOfWeek !== undefined && schedule.dayOfWeek !== currentDayOfWeek) {
      return false;
    }

    // Check day of month (if specified)
    if (schedule.dayOfMonth !== undefined && schedule.dayOfMonth !== currentDayOfMonth) {
      return false;
    }

    return true;
  }

  /**
   * Check for missed logging
   */
  evaluateMissedLogging(
    conditions: ConditionConfig | null,
    context: UserContext
  ): boolean {
    const inactiveDays = conditions?.inactiveDays ?? 3;
    return (
      context.daysSinceLastLog !== null && context.daysSinceLastLog >= inactiveDays
    );
  }

  /**
   * Evaluate metric-based event conditions
   */
  evaluateEventCondition(
    conditions: ConditionConfig | null,
    context: UserContext
  ): boolean {
    if (!conditions) return false;

    const { metricType, operator, value, diastolicValue, consecutiveDays } =
      conditions;

    switch (metricType) {
      case "GLUCOSE":
        return this.evaluateGlucoseCondition(
          context.metrics.glucose,
          operator,
          value,
          consecutiveDays
        );

      case "BP":
        return this.evaluateBpCondition(
          context.metrics.bp,
          operator,
          value,
          diastolicValue,
          consecutiveDays
        );

      case "WEIGHT":
        return this.evaluateWeightCondition(
          context.metrics.weight,
          operator,
          value
        );

      case "KETONES":
        return this.evaluateKetoneCondition(
          context.metrics.ketones,
          operator,
          value
        );

      default:
        return false;
    }
  }

  /**
   * Evaluate glucose conditions
   */
  evaluateGlucoseCondition(
    glucose: MetricSummary["glucose"],
    operator?: string,
    value?: number,
    consecutiveDays?: number
  ): boolean {
    // High glucose flag: >= 110 on 3+ consecutive days
    if (consecutiveDays && consecutiveDays >= 3) {
      return glucose.highDays >= consecutiveDays;
    }

    // Single value comparison
    if (glucose.latest === null || value === undefined) return false;

    return this.compare(glucose.latest, operator, value);
  }

  /**
   * Evaluate BP conditions
   */
  evaluateBpCondition(
    bp: MetricSummary["bp"],
    operator?: string,
    systolicValue?: number,
    diastolicValue?: number,
    consecutiveDays?: number
  ): boolean {
    // Elevated BP flag: systolic >= 140 OR diastolic >= 90 on 2+ days
    if (consecutiveDays && consecutiveDays >= 2) {
      return bp.elevatedDays >= consecutiveDays;
    }

    // Single value comparison
    if (bp.latest === null) return false;

    // If both thresholds provided, trigger if EITHER is exceeded
    // If only one provided, check only that one
    const hasSystolic = systolicValue !== undefined;
    const hasDiastolic = diastolicValue !== undefined;

    const systolicMatch = hasSystolic
      ? this.compare(bp.latest.systolic, operator, systolicValue)
      : false;
    const diastolicMatch = hasDiastolic
      ? this.compare(bp.latest.diastolic, operator, diastolicValue)
      : false;

    if (hasSystolic && hasDiastolic) {
      return systolicMatch || diastolicMatch; // Either triggers
    } else if (hasSystolic) {
      return systolicMatch;
    } else if (hasDiastolic) {
      return diastolicMatch;
    }
    return false;
  }

  /**
   * Evaluate weight conditions
   */
  evaluateWeightCondition(
    weight: MetricSummary["weight"],
    operator?: string,
    value?: number
  ): boolean {
    if (weight.latest === null || value === undefined) return false;
    return this.compare(weight.latest, operator, value);
  }

  /**
   * Evaluate ketone conditions
   */
  evaluateKetoneCondition(
    ketones: MetricSummary["ketones"],
    operator?: string,
    value?: number
  ): boolean {
    if (ketones.latest === null || value === undefined) return false;
    return this.compare(ketones.latest, operator, value);
  }

  /**
   * Generic comparison function
   */
  compare(actual: number, operator: string | undefined, expected: number): boolean {
    switch (operator) {
      case "gt":
        return actual > expected;
      case "gte":
        return actual >= expected;
      case "lt":
        return actual < expected;
      case "lte":
        return actual <= expected;
      case "eq":
        return actual === expected;
      default:
        return false;
    }
  }

  // ============================================================================
  // Template Personalization
  // ============================================================================

  /**
   * Replace tokens in message template with user-specific data
   */
  personalizeMessage(template: string, context: UserContext): string {
    let message = template;

    // User info
    message = message.replace(/\{\{name\}\}/g, context.name || "there");
    message = message.replace(
      /\{\{firstName\}\}/g,
      context.name?.split(" ")[0] || "there"
    );

    // Glucose
    message = message.replace(
      /\{\{glucose\.latest\}\}/g,
      context.metrics.glucose.latest?.toString() ?? "--"
    );
    message = message.replace(
      /\{\{glucose\.average\}\}/g,
      context.metrics.glucose.average7Day?.toFixed(0) ?? "--"
    );
    message = message.replace(
      /\{\{glucose\.highDays\}\}/g,
      context.metrics.glucose.highDays.toString()
    );

    // BP
    if (context.metrics.bp.latest) {
      message = message.replace(
        /\{\{bp\.latest\}\}/g,
        `${context.metrics.bp.latest.systolic}/${context.metrics.bp.latest.diastolic}`
      );
    } else {
      message = message.replace(/\{\{bp\.latest\}\}/g, "--/--");
    }
    message = message.replace(
      /\{\{bp\.elevatedDays\}\}/g,
      context.metrics.bp.elevatedDays.toString()
    );

    // Weight
    message = message.replace(
      /\{\{weight\.latest\}\}/g,
      context.metrics.weight.latest?.toFixed(1) ?? "--"
    );
    message = message.replace(
      /\{\{weight\.change\}\}/g,
      context.metrics.weight.change30Day !== null
        ? (context.metrics.weight.change30Day > 0 ? "+" : "") +
            context.metrics.weight.change30Day.toFixed(1)
        : "--"
    );

    // Ketones
    message = message.replace(
      /\{\{ketones\.latest\}\}/g,
      context.metrics.ketones.latest?.toFixed(1) ?? "--"
    );

    // Days since last log
    message = message.replace(
      /\{\{daysSinceLog\}\}/g,
      context.daysSinceLastLog?.toString() ?? "0"
    );

    // Targets
    if (context.targets) {
      message = message.replace(
        /\{\{target\.protein\}\}/g,
        context.targets.proteinG?.toString() ?? "--"
      );
      message = message.replace(
        /\{\{target\.carbs\}\}/g,
        context.targets.carbsG?.toString() ?? "--"
      );
      message = message.replace(
        /\{\{target\.calories\}\}/g,
        context.targets.caloriesKcal?.toString() ?? "--"
      );
    }

    // Clean up any remaining tokens with "--"
    message = message.replace(/\{\{[^}]+\}\}/g, "--");

    return message;
  }

  // ============================================================================
  // Delivery
  // ============================================================================

  /**
   * Deliver a prompt to a user
   */
  async deliverPrompt(
    prompt: Prompt,
    rule: PromptRule,
    context: UserContext
  ): Promise<DeliveryResult> {
    try {
      const message = this.personalizeMessage(prompt.messageTemplate, context);

      // Record the delivery
      await db.insert(schema.promptDeliveries).values({
        userId: context.id,
        promptId: prompt.id,
        triggerContextJson: {
          ruleId: rule.id,
          ruleKey: rule.key,
          triggerType: rule.triggerType,
          metrics: context.metrics,
        },
        status: "sent",
      });

      // TODO: Actually send via channel (in_app, email, sms)
      // For now, just record the delivery
      // await this.sendViaChannel(prompt.channel, context, message);

      return {
        success: true,
        promptId: prompt.id,
        userId: context.id,
        message,
        channel: prompt.channel,
      };
    } catch (error) {
      return {
        success: false,
        promptId: prompt.id,
        userId: context.id,
        message: "",
        channel: prompt.channel,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  /**
   * Get user context for personalization and rule evaluation
   */
  async getUserContext(userId: string): Promise<UserContext | null> {
    // Get user
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) return null;

    // Get recent metrics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const metrics = await db
      .select()
      .from(schema.metricEntries)
      .where(
        and(
          eq(schema.metricEntries.userId, userId),
          gte(schema.metricEntries.timestamp, thirtyDaysAgo)
        )
      )
      .orderBy(desc(schema.metricEntries.timestamp));

    // Get last food entry for activity check
    const [lastFood] = await db
      .select()
      .from(schema.foodEntries)
      .where(eq(schema.foodEntries.userId, userId))
      .orderBy(desc(schema.foodEntries.timestamp))
      .limit(1);

    // Calculate last log date
    const lastMetricDate = metrics[0]?.timestamp;
    const lastFoodDate = lastFood?.timestamp;
    const lastLogDate =
      lastMetricDate && lastFoodDate
        ? new Date(Math.max(lastMetricDate.getTime(), lastFoodDate.getTime()))
        : lastMetricDate || lastFoodDate || null;

    const daysSinceLastLog = lastLogDate
      ? Math.floor((Date.now() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Get macro targets
    const [macroTarget] = await db
      .select()
      .from(schema.macroTargets)
      .where(eq(schema.macroTargets.userId, userId));

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      lastLogDate,
      daysSinceLastLog,
      metrics: this.summarizeMetrics(metrics),
      targets: macroTarget
        ? {
            proteinG: macroTarget.proteinG,
            carbsG: macroTarget.carbsG,
            caloriesKcal: macroTarget.caloriesKcal,
          }
        : null,
    };
  }

  /**
   * Summarize metrics for context
   */
  summarizeMetrics(metrics: schema.MetricEntry[]): MetricSummary {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Glucose
    const glucoseEntries = metrics.filter((m) => m.type === "GLUCOSE");
    const recentGlucose = glucoseEntries.filter(
      (m) => m.timestamp >= sevenDaysAgo
    );
    const glucoseValues = recentGlucose.map(
      (m) => (m.valueJson as any)?.value || (m.valueJson as any)?.fasting || 0
    );
    const highGlucoseDays = new Set(
      glucoseEntries
        .filter((m) => m.timestamp >= threeDaysAgo)
        .filter((m) => {
          const val = (m.valueJson as any)?.value || (m.valueJson as any)?.fasting || 0;
          return val >= 110;
        })
        .map((m) => m.timestamp.toISOString().split("T")[0])
    ).size;

    // BP
    const bpEntries = metrics.filter((m) => m.type === "BP");
    const latestBp = bpEntries[0];
    const elevatedBpDays = new Set(
      bpEntries
        .filter((m) => {
          const val = m.valueJson as any;
          return (val?.systolic || 0) >= 140 || (val?.diastolic || 0) >= 90;
        })
        .map((m) => m.timestamp.toISOString().split("T")[0])
    ).size;

    // Weight
    const weightEntries = metrics.filter((m) => m.type === "WEIGHT");
    const latestWeight = weightEntries[0];
    const oldestWeight = weightEntries[weightEntries.length - 1];
    const weightChange =
      latestWeight && oldestWeight
        ? ((latestWeight.valueJson as any)?.value || 0) -
          ((oldestWeight.valueJson as any)?.value || 0)
        : null;

    // Ketones
    const ketoneEntries = metrics.filter((m) => m.type === "KETONES");
    const latestKetone = ketoneEntries[0];

    return {
      glucose: {
        latest: glucoseEntries[0]
          ? (glucoseEntries[0].valueJson as any)?.value ||
            (glucoseEntries[0].valueJson as any)?.fasting ||
            null
          : null,
        average7Day:
          glucoseValues.length > 0
            ? glucoseValues.reduce((a, b) => a + b, 0) / glucoseValues.length
            : null,
        highDays: highGlucoseDays,
      },
      bp: {
        latest: latestBp
          ? {
              systolic: (latestBp.valueJson as any)?.systolic || 0,
              diastolic: (latestBp.valueJson as any)?.diastolic || 0,
            }
          : null,
        elevatedDays: elevatedBpDays,
      },
      weight: {
        latest: latestWeight
          ? (latestWeight.valueJson as any)?.value || null
          : null,
        change30Day: weightChange,
      },
      ketones: {
        latest: latestKetone
          ? (latestKetone.valueJson as any)?.value || null
          : null,
      },
    };
  }

  /**
   * Get active prompt rules ordered by priority
   */
  async getActiveRules(): Promise<PromptRule[]> {
    const rules = await db
      .select()
      .from(schema.promptRules)
      .where(eq(schema.promptRules.active, true))
      .orderBy(desc(schema.promptRules.priority));

    return rules as PromptRule[];
  }

  /**
   * Get event rules for a specific metric type
   */
  async getEventRulesForMetric(metricType: string): Promise<PromptRule[]> {
    const rules = await db
      .select()
      .from(schema.promptRules)
      .where(
        and(
          eq(schema.promptRules.active, true),
          eq(schema.promptRules.triggerType, "event")
        )
      )
      .orderBy(desc(schema.promptRules.priority));

    // Filter by metric type in conditions
    return (rules as PromptRule[]).filter((rule) => {
      const conditions = rule.conditionsJson as ConditionConfig | null;
      return conditions?.metricType === metricType;
    });
  }

  /**
   * Get a prompt by ID
   */
  async getPrompt(promptId: string): Promise<Prompt | null> {
    const [prompt] = await db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.id, promptId));

    return prompt as Prompt | null;
  }

  /**
   * Check if user is in cooldown period for a prompt
   */
  async isInCooldown(
    userId: string,
    promptId: string,
    cooldownHours: number
  ): Promise<boolean> {
    const cooldownStart = new Date();
    cooldownStart.setHours(cooldownStart.getHours() - cooldownHours);

    const [recent] = await db
      .select()
      .from(schema.promptDeliveries)
      .where(
        and(
          eq(schema.promptDeliveries.userId, userId),
          eq(schema.promptDeliveries.promptId, promptId),
          gte(schema.promptDeliveries.firedAt, cooldownStart)
        )
      )
      .limit(1);

    return recent !== undefined;
  }
}

// Export singleton instance
export const promptEngine = new PromptEngine();

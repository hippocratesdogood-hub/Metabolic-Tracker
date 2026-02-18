import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { encryptPHI, decryptPHI } from "./utils/encryption";

/**
 * Determines if an entry is backfilled by comparing timestamp to createdAt.
 * An entry is considered backfilled if its timestamp is more than 1 hour before createdAt.
 * 
 * IMPORTANT: Backfilled entries should NOT trigger prompts or be included in real-time
 * report calculations to avoid retroactive notifications.
 */
export function isBackfilledEntry(entry: { timestamp: Date; createdAt: Date }): boolean {
  const hourMs = 60 * 60 * 1000;
  return entry.createdAt.getTime() - entry.timestamp.getTime() > hourMs;
}
import type {
  User,
  InsertUser,
  MetricEntry,
  InsertMetricEntry,
  FoodEntry,
  InsertFoodEntry,
  Conversation,
  Message,
  InsertMessage,
  MacroTarget,
  InsertMacroTarget,
  Prompt,
  PromptRule,
  AuditLog,
  AuditAction,
  AuditResourceType,
} from "@shared/schema";

// Configure PostgreSQL pool with SSL in production
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  // Enable SSL in production for encrypted database connections
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : process.env.DATABASE_URL?.includes("ssl=true")
      ? { rejectUnauthorized: false }
      : false,
});

export const db = drizzle(pool, { schema });

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getAllParticipants(): Promise<User[]>;

  // Metrics
  createMetricEntry(entry: InsertMetricEntry): Promise<MetricEntry>;
  getMetricEntryById(id: string): Promise<MetricEntry | undefined>;
  getMetricEntries(userId: string, type?: string, from?: Date, to?: Date): Promise<MetricEntry[]>;
  updateMetricEntry(id: string, data: Partial<InsertMetricEntry>, editedBy?: string): Promise<MetricEntry | undefined>;
  deleteMetricEntry(id: string): Promise<boolean>;

  // Food
  createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry>;
  getFoodEntryById(id: string): Promise<FoodEntry | undefined>;
  getFoodEntries(userId: string, from?: Date, to?: Date): Promise<FoodEntry[]>;
  getFoodEntriesByDate(userId: string, date: Date): Promise<FoodEntry[]>;
  updateFoodEntry(id: string, data: Partial<InsertFoodEntry>): Promise<FoodEntry | undefined>;
  deleteFoodEntry(id: string): Promise<boolean>;
  toggleFoodEntryFavorite(id: string): Promise<FoodEntry | undefined>;
  getFavoriteFoodEntries(userId: string): Promise<FoodEntry[]>;

  // Macro Targets
  getMacroTarget(userId: string): Promise<MacroTarget | undefined>;
  upsertMacroTarget(userId: string, data: Partial<InsertMacroTarget>): Promise<MacroTarget>;

  // Messaging
  getOrCreateConversation(participantId: string, coachId: string): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsForUser(userId: string): Promise<Conversation[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;
  markMessageRead(messageId: string): Promise<void>;

  // Admin - Users
  getAllUsers(): Promise<User[]>;
  getCoaches(): Promise<User[]>;
  assignCoach(participantId: string, coachId: string): Promise<User | undefined>;

  // Admin - Prompts
  getPrompts(): Promise<Prompt[]>;
  getPrompt(id: string): Promise<Prompt | undefined>;
  createPrompt(data: Partial<Prompt>): Promise<Prompt>;
  updatePrompt(id: string, data: Partial<Prompt>): Promise<Prompt | undefined>;
  deletePrompt(id: string): Promise<boolean>;

  // Admin - Prompt Rules
  getPromptRules(): Promise<PromptRule[]>;
  createPromptRule(data: Partial<PromptRule>): Promise<PromptRule>;
  updatePromptRule(id: string, data: Partial<PromptRule>): Promise<PromptRule | undefined>;
  deletePromptRule(id: string): Promise<boolean>;

  // Admin - Prompt Deliveries
  getPromptDeliveries(limit?: number): Promise<any[]>;

  // Audit Logs (read-only - no create/update/delete methods here; use auditLogger service)
  getAuditLogs(filters: AuditLogFilters): Promise<{ logs: AuditLog[]; total: number }>;
  getAuditLogById(id: string): Promise<AuditLog | undefined>;
  getAuditLogStats(days: number): Promise<AuditLogStats>;
}

export interface AuditLogFilters {
  /** Filter by user ID */
  userId?: string;
  /** Filter by target user ID */
  targetUserId?: string;
  /** Filter by action type(s) */
  actions?: AuditAction[];
  /** Filter by resource type(s) */
  resourceTypes?: AuditResourceType[];
  /** Filter by result (SUCCESS, FAILURE, DENIED) */
  result?: "SUCCESS" | "FAILURE" | "DENIED";
  /** Filter by start date */
  from?: Date;
  /** Filter by end date */
  to?: Date;
  /** Filter by IP address (partial match) */
  ipAddress?: string;
  /** Pagination: limit */
  limit?: number;
  /** Pagination: offset */
  offset?: number;
}

export interface AuditLogStats {
  totalEvents: number;
  byAction: Record<string, number>;
  byResult: Record<string, number>;
  byResourceType: Record<string, number>;
  uniqueUsers: number;
  uniqueIps: number;
}

export class PostgresStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const results = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return results[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const results = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return results[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const results = await db.insert(schema.users).values(user).returning();
    return results[0];
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const results = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return results[0];
  }

  async getAllParticipants(): Promise<User[]> {
    return db.select().from(schema.users).where(eq(schema.users.role, "participant"));
  }

  // Metrics
  private decryptMetricNotes(entry: MetricEntry): MetricEntry {
    if (entry.notes) return { ...entry, notes: decryptPHI(entry.notes) };
    return entry;
  }

  async createMetricEntry(entry: InsertMetricEntry): Promise<MetricEntry> {
    const encrypted = entry.notes ? { ...entry, notes: encryptPHI(entry.notes) } : entry;
    const results = await db.insert(schema.metricEntries).values(encrypted).returning();
    return this.decryptMetricNotes(results[0]);
  }

  async getMetricEntryById(id: string): Promise<MetricEntry | undefined> {
    const results = await db.select().from(schema.metricEntries).where(eq(schema.metricEntries.id, id));
    return results[0] ? this.decryptMetricNotes(results[0]) : undefined;
  }

  async getMetricEntries(
    userId: string,
    type?: string,
    from?: Date,
    to?: Date
  ): Promise<MetricEntry[]> {
    const conditions = [eq(schema.metricEntries.userId, userId)];

    if (type) {
      conditions.push(eq(schema.metricEntries.type, type as any));
    }
    if (from) {
      conditions.push(gte(schema.metricEntries.timestamp, from));
    }
    if (to) {
      conditions.push(lte(schema.metricEntries.timestamp, to));
    }

    const entries = await db
      .select()
      .from(schema.metricEntries)
      .where(and(...conditions))
      .orderBy(desc(schema.metricEntries.timestamp));
    return entries.map((e) => this.decryptMetricNotes(e));
  }

  async updateMetricEntry(id: string, data: Partial<InsertMetricEntry>, editedBy?: string): Promise<MetricEntry | undefined> {
    // Get existing entry to store previous value for audit trail
    const existing = await this.getMetricEntryById(id);
    if (!existing) {
      return undefined;
    }

    // Prepare update with edit tracking
    const updateData: Partial<InsertMetricEntry> & {
      editedAt?: Date;
      editedBy?: string;
      previousValueJson?: unknown;
    } = {
      ...data,
    };

    // If we have an editor and the value is changing, track the edit
    if (editedBy) {
      updateData.editedAt = new Date();
      updateData.editedBy = editedBy;
      // Store previous value if valueJson is being updated
      if (data.valueJson) {
        updateData.previousValueJson = existing.valueJson;
      }
    }

    // Encrypt notes if being updated
    if (updateData.notes) {
      updateData.notes = encryptPHI(updateData.notes);
    }

    const results = await db
      .update(schema.metricEntries)
      .set(updateData)
      .where(eq(schema.metricEntries.id, id))
      .returning();
    return results[0] ? this.decryptMetricNotes(results[0]) : undefined;
  }

  async deleteMetricEntry(id: string): Promise<boolean> {
    const results = await db
      .delete(schema.metricEntries)
      .where(eq(schema.metricEntries.id, id))
      .returning();
    return results.length > 0;
  }

  // Food
  private decryptFoodRawText(entry: FoodEntry): FoodEntry {
    if (entry.rawText) return { ...entry, rawText: decryptPHI(entry.rawText) };
    return entry;
  }

  async createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry> {
    const encrypted = entry.rawText ? { ...entry, rawText: encryptPHI(entry.rawText) } : entry;
    const results = await db.insert(schema.foodEntries).values(encrypted).returning();
    return this.decryptFoodRawText(results[0]);
  }

  async getFoodEntryById(id: string): Promise<FoodEntry | undefined> {
    const results = await db.select().from(schema.foodEntries).where(eq(schema.foodEntries.id, id));
    return results[0] ? this.decryptFoodRawText(results[0]) : undefined;
  }

  async getFoodEntries(userId: string, from?: Date, to?: Date): Promise<FoodEntry[]> {
    const conditions = [eq(schema.foodEntries.userId, userId)];

    if (from) {
      conditions.push(gte(schema.foodEntries.timestamp, from));
    }
    if (to) {
      conditions.push(lte(schema.foodEntries.timestamp, to));
    }

    const entries = await db
      .select()
      .from(schema.foodEntries)
      .where(and(...conditions))
      .orderBy(desc(schema.foodEntries.timestamp));
    return entries.map((e) => this.decryptFoodRawText(e));
  }

  async updateFoodEntry(id: string, data: Partial<InsertFoodEntry>): Promise<FoodEntry | undefined> {
    const encrypted = data.rawText ? { ...data, rawText: encryptPHI(data.rawText) } : data;
    const results = await db
      .update(schema.foodEntries)
      .set(encrypted)
      .where(eq(schema.foodEntries.id, id))
      .returning();
    return results[0] ? this.decryptFoodRawText(results[0]) : undefined;
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    const results = await db
      .delete(schema.foodEntries)
      .where(eq(schema.foodEntries.id, id))
      .returning();
    return results.length > 0;
  }

  async toggleFoodEntryFavorite(id: string): Promise<FoodEntry | undefined> {
    const entry = await this.getFoodEntryById(id);
    if (!entry) return undefined;

    const currentTags = (entry.tags as Record<string, unknown>) || {};
    const isFavorite = !currentTags.isFavorite;
    const newTags = { ...currentTags, isFavorite };

    const results = await db
      .update(schema.foodEntries)
      .set({ tags: newTags })
      .where(eq(schema.foodEntries.id, id))
      .returning();
    return results[0] ? this.decryptFoodRawText(results[0]) : undefined;
  }

  async getFavoriteFoodEntries(userId: string): Promise<FoodEntry[]> {
    // Get all favorite entries, most recent first
    const entries = await db
      .select()
      .from(schema.foodEntries)
      .where(
        and(
          eq(schema.foodEntries.userId, userId),
          sql`${schema.foodEntries.tags}->>'isFavorite' = 'true'`
        )
      )
      .orderBy(desc(schema.foodEntries.timestamp));

    // Decrypt rawText before deduplication
    const decrypted = entries.map((e) => this.decryptFoodRawText(e));

    // Deduplicate by rawText — keep most recent of each unique meal
    const seen = new Set<string>();
    return decrypted.filter((entry) => {
      const key = (entry.rawText || '').toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async getFoodEntriesByDate(userId: string, date: Date): Promise<FoodEntry[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const entries = await db
      .select()
      .from(schema.foodEntries)
      .where(
        and(
          eq(schema.foodEntries.userId, userId),
          gte(schema.foodEntries.timestamp, startOfDay),
          lte(schema.foodEntries.timestamp, endOfDay)
        )
      )
      .orderBy(schema.foodEntries.timestamp);
    return entries.map((e) => this.decryptFoodRawText(e));
  }

  // Macro Targets
  async getMacroTarget(userId: string): Promise<MacroTarget | undefined> {
    const results = await db
      .select()
      .from(schema.macroTargets)
      .where(eq(schema.macroTargets.userId, userId));
    return results[0];
  }

  async upsertMacroTarget(userId: string, data: Partial<InsertMacroTarget>): Promise<MacroTarget> {
    const existing = await this.getMacroTarget(userId);
    
    if (existing) {
      const results = await db
        .update(schema.macroTargets)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.macroTargets.userId, userId))
        .returning();
      return results[0];
    } else {
      const results = await db
        .insert(schema.macroTargets)
        .values({ ...data, userId })
        .returning();
      return results[0];
    }
  }

  // Messaging
  async getOrCreateConversation(participantId: string, coachId: string): Promise<Conversation> {
    const existing = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.participantId, participantId),
          eq(schema.conversations.coachId, coachId)
        )
      );

    if (existing[0]) {
      return existing[0];
    }

    const results = await db
      .insert(schema.conversations)
      .values({ participantId, coachId })
      .returning();
    return results[0];
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const results = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, id));
    return results[0];
  }

  async getConversationsForUser(userId: string): Promise<Conversation[]> {
    return db
      .select()
      .from(schema.conversations)
      .where(
        sql`${schema.conversations.participantId} = ${userId} OR ${schema.conversations.coachId} = ${userId}`
      );
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const encrypted = { ...message, body: encryptPHI(message.body) };
    const results = await db.insert(schema.messages).values(encrypted).returning();
    return { ...results[0], body: decryptPHI(results[0].body) };
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt);
    return messages.map((m) => ({ ...m, body: decryptPHI(m.body) }));
  }

  async markMessageRead(messageId: string): Promise<void> {
    await db
      .update(schema.messages)
      .set({ readAt: new Date() })
      .where(eq(schema.messages.id, messageId));
  }

  // Admin - Users
  async getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users).orderBy(schema.users.name);
  }

  async getCoaches(): Promise<User[]> {
    return db.select().from(schema.users).where(eq(schema.users.role, "coach"));
  }

  async assignCoach(participantId: string, coachId: string): Promise<User | undefined> {
    const results = await db
      .update(schema.users)
      .set({ coachId, updatedAt: new Date() })
      .where(eq(schema.users.id, participantId))
      .returning();
    return results[0];
  }

  // Admin - Prompts
  async getPrompts(): Promise<Prompt[]> {
    return db.select().from(schema.prompts).orderBy(desc(schema.prompts.createdAt));
  }

  async getPrompt(id: string): Promise<Prompt | undefined> {
    const results = await db.select().from(schema.prompts).where(eq(schema.prompts.id, id));
    return results[0];
  }

  async createPrompt(data: Partial<Prompt>): Promise<Prompt> {
    const results = await db.insert(schema.prompts).values(data as any).returning();
    return results[0];
  }

  async updatePrompt(id: string, data: Partial<Prompt>): Promise<Prompt | undefined> {
    const results = await db
      .update(schema.prompts)
      .set(data)
      .where(eq(schema.prompts.id, id))
      .returning();
    return results[0];
  }

  async deletePrompt(id: string): Promise<boolean> {
    const results = await db.delete(schema.prompts).where(eq(schema.prompts.id, id)).returning();
    return results.length > 0;
  }

  // Admin - Prompt Rules
  async getPromptRules(): Promise<PromptRule[]> {
    return db.select().from(schema.promptRules).orderBy(desc(schema.promptRules.priority));
  }

  async createPromptRule(data: Partial<PromptRule>): Promise<PromptRule> {
    const results = await db.insert(schema.promptRules).values(data as any).returning();
    return results[0];
  }

  async updatePromptRule(id: string, data: Partial<PromptRule>): Promise<PromptRule | undefined> {
    const results = await db
      .update(schema.promptRules)
      .set(data)
      .where(eq(schema.promptRules.id, id))
      .returning();
    return results[0];
  }

  async deletePromptRule(id: string): Promise<boolean> {
    const results = await db.delete(schema.promptRules).where(eq(schema.promptRules.id, id)).returning();
    return results.length > 0;
  }

  // Admin - Prompt Deliveries
  async getPromptDeliveries(limit: number = 100): Promise<any[]> {
    return db
      .select()
      .from(schema.promptDeliveries)
      .orderBy(desc(schema.promptDeliveries.firedAt))
      .limit(limit);
  }

  // Audit Logs (read-only queries)
  async getAuditLogs(filters: AuditLogFilters): Promise<{ logs: AuditLog[]; total: number }> {
    const conditions: any[] = [];

    if (filters.userId) {
      conditions.push(eq(schema.auditLogs.userId, filters.userId));
    }
    if (filters.targetUserId) {
      conditions.push(eq(schema.auditLogs.targetUserId, filters.targetUserId));
    }
    if (filters.actions && filters.actions.length > 0) {
      conditions.push(sql`${schema.auditLogs.action} = ANY(${filters.actions})`);
    }
    if (filters.resourceTypes && filters.resourceTypes.length > 0) {
      conditions.push(sql`${schema.auditLogs.resourceType} = ANY(${filters.resourceTypes})`);
    }
    if (filters.result) {
      conditions.push(eq(schema.auditLogs.result, filters.result));
    }
    if (filters.from) {
      conditions.push(gte(schema.auditLogs.timestamp, filters.from));
    }
    if (filters.to) {
      conditions.push(lte(schema.auditLogs.timestamp, filters.to));
    }
    if (filters.ipAddress) {
      conditions.push(sql`${schema.auditLogs.ipAddress} LIKE ${`%${filters.ipAddress}%`}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.auditLogs)
      .where(whereClause);
    const total = countResult[0]?.count || 0;

    // Get paginated results
    let query = db
      .select()
      .from(schema.auditLogs)
      .where(whereClause)
      .orderBy(desc(schema.auditLogs.timestamp));

    if (filters.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    if (filters.offset) {
      query = query.offset(filters.offset) as typeof query;
    }

    const logs = await query;

    return { logs, total };
  }

  async getAuditLogById(id: string): Promise<AuditLog | undefined> {
    const results = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.id, id));
    return results[0];
  }

  async getAuditLogStats(days: number): Promise<AuditLogStats> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Total events
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.auditLogs)
      .where(gte(schema.auditLogs.timestamp, since));
    const totalEvents = totalResult[0]?.count || 0;

    // By action
    const byActionResult = await db
      .select({
        action: schema.auditLogs.action,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.auditLogs)
      .where(gte(schema.auditLogs.timestamp, since))
      .groupBy(schema.auditLogs.action);
    const byAction: Record<string, number> = {};
    for (const row of byActionResult) {
      byAction[row.action] = row.count;
    }

    // By result
    const byResultResult = await db
      .select({
        result: schema.auditLogs.result,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.auditLogs)
      .where(gte(schema.auditLogs.timestamp, since))
      .groupBy(schema.auditLogs.result);
    const byResult: Record<string, number> = {};
    for (const row of byResultResult) {
      byResult[row.result] = row.count;
    }

    // By resource type
    const byResourceResult = await db
      .select({
        resourceType: schema.auditLogs.resourceType,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.auditLogs)
      .where(gte(schema.auditLogs.timestamp, since))
      .groupBy(schema.auditLogs.resourceType);
    const byResourceType: Record<string, number> = {};
    for (const row of byResourceResult) {
      byResourceType[row.resourceType] = row.count;
    }

    // Unique users
    const uniqueUsersResult = await db
      .select({ count: sql<number>`count(DISTINCT user_id)::int` })
      .from(schema.auditLogs)
      .where(gte(schema.auditLogs.timestamp, since));
    const uniqueUsers = uniqueUsersResult[0]?.count || 0;

    // Unique IPs
    const uniqueIpsResult = await db
      .select({ count: sql<number>`count(DISTINCT ip_address)::int` })
      .from(schema.auditLogs)
      .where(gte(schema.auditLogs.timestamp, since));
    const uniqueIps = uniqueIpsResult[0]?.count || 0;

    return {
      totalEvents,
      byAction,
      byResult,
      byResourceType,
      uniqueUsers,
      uniqueIps,
    };
  }
}

export const storage = new PostgresStorage();

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import * as schema from "@shared/schema";

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
} from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
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
  updateMetricEntry(id: string, data: Partial<InsertMetricEntry>): Promise<MetricEntry | undefined>;
  deleteMetricEntry(id: string): Promise<boolean>;

  // Food
  createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry>;
  getFoodEntryById(id: string): Promise<FoodEntry | undefined>;
  getFoodEntries(userId: string, from?: Date, to?: Date): Promise<FoodEntry[]>;
  getFoodEntriesByDate(userId: string, date: Date): Promise<FoodEntry[]>;
  updateFoodEntry(id: string, data: Partial<InsertFoodEntry>): Promise<FoodEntry | undefined>;
  deleteFoodEntry(id: string): Promise<boolean>;

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
  async createMetricEntry(entry: InsertMetricEntry): Promise<MetricEntry> {
    const results = await db.insert(schema.metricEntries).values(entry).returning();
    return results[0];
  }

  async getMetricEntryById(id: string): Promise<MetricEntry | undefined> {
    const results = await db.select().from(schema.metricEntries).where(eq(schema.metricEntries.id, id));
    return results[0];
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

    return db
      .select()
      .from(schema.metricEntries)
      .where(and(...conditions))
      .orderBy(desc(schema.metricEntries.timestamp));
  }

  async updateMetricEntry(id: string, data: Partial<InsertMetricEntry>): Promise<MetricEntry | undefined> {
    const results = await db
      .update(schema.metricEntries)
      .set(data)
      .where(eq(schema.metricEntries.id, id))
      .returning();
    return results[0];
  }

  async deleteMetricEntry(id: string): Promise<boolean> {
    const results = await db
      .delete(schema.metricEntries)
      .where(eq(schema.metricEntries.id, id))
      .returning();
    return results.length > 0;
  }

  // Food
  async createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry> {
    const results = await db.insert(schema.foodEntries).values(entry).returning();
    return results[0];
  }

  async getFoodEntryById(id: string): Promise<FoodEntry | undefined> {
    const results = await db.select().from(schema.foodEntries).where(eq(schema.foodEntries.id, id));
    return results[0];
  }

  async getFoodEntries(userId: string, from?: Date, to?: Date): Promise<FoodEntry[]> {
    const conditions = [eq(schema.foodEntries.userId, userId)];
    
    if (from) {
      conditions.push(gte(schema.foodEntries.timestamp, from));
    }
    if (to) {
      conditions.push(lte(schema.foodEntries.timestamp, to));
    }

    return db
      .select()
      .from(schema.foodEntries)
      .where(and(...conditions))
      .orderBy(desc(schema.foodEntries.timestamp));
  }

  async updateFoodEntry(id: string, data: Partial<InsertFoodEntry>): Promise<FoodEntry | undefined> {
    const results = await db
      .update(schema.foodEntries)
      .set(data)
      .where(eq(schema.foodEntries.id, id))
      .returning();
    return results[0];
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    const results = await db
      .delete(schema.foodEntries)
      .where(eq(schema.foodEntries.id, id))
      .returning();
    return results.length > 0;
  }

  async getFoodEntriesByDate(userId: string, date: Date): Promise<FoodEntry[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return db
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
    const results = await db.insert(schema.messages).values(message).returning();
    return results[0];
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt);
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
}

export const storage = new PostgresStorage();

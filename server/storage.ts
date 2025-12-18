import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
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

  // Metrics
  createMetricEntry(entry: InsertMetricEntry): Promise<MetricEntry>;
  getMetricEntries(userId: string, type?: string, from?: Date, to?: Date): Promise<MetricEntry[]>;
  updateMetricEntry(id: string, data: Partial<InsertMetricEntry>): Promise<MetricEntry | undefined>;
  deleteMetricEntry(id: string): Promise<boolean>;

  // Food
  createFoodEntry(entry: InsertFoodEntry): Promise<FoodEntry>;
  getFoodEntries(userId: string, from?: Date, to?: Date): Promise<FoodEntry[]>;
  getFoodEntriesByDate(userId: string, date: Date): Promise<FoodEntry[]>;
  updateFoodEntry(id: string, data: Partial<InsertFoodEntry>): Promise<FoodEntry | undefined>;

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

  // Metrics
  async createMetricEntry(entry: InsertMetricEntry): Promise<MetricEntry> {
    const results = await db.insert(schema.metricEntries).values(entry).returning();
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
}

export const storage = new PostgresStorage();

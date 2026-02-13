import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, real, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["participant", "coach", "admin"]);
export const unitsPreferenceEnum = pgEnum("units_preference", ["US", "Metric"]);
export const metricTypeEnum = pgEnum("metric_type", ["BP", "WAIST", "GLUCOSE", "KETONES", "WEIGHT"]);
export const entrySourceEnum = pgEnum("entry_source", ["manual", "import"]);
export const foodInputTypeEnum = pgEnum("food_input_type", ["text", "photo", "voice"]);
export const mealTypeEnum = pgEnum("meal_type", ["Breakfast", "Lunch", "Dinner", "Snack"]);
export const promptCategoryEnum = pgEnum("prompt_category", ["reminder", "intervention", "education"]);
export const promptChannelEnum = pgEnum("prompt_channel", ["in_app", "email", "sms"]);
export const triggerTypeEnum = pgEnum("trigger_type", ["schedule", "event", "missed"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["sent", "failed", "opened"]);

// Audit log enums
export const auditActionEnum = pgEnum("audit_action", [
  // Authentication events
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "SESSION_EXPIRED",
  "PASSWORD_CHANGE",
  "PASSWORD_RESET_REQUEST",
  "PASSWORD_RESET_COMPLETE",
  // Data access events
  "PHI_VIEW",
  "PHI_EXPORT",
  "BULK_DATA_ACCESS",
  "REPORT_GENERATED",
  // Data modification events
  "RECORD_CREATE",
  "RECORD_UPDATE",
  "RECORD_DELETE",
  // Permission/role events
  "ROLE_CHANGE",
  "COACH_ASSIGNMENT",
  "PERMISSION_GRANTED",
  "PERMISSION_REVOKED",
  // Authorization events
  "AUTH_FAILURE",
  "ACCESS_DENIED",
  "RATE_LIMIT_EXCEEDED",
  // Admin actions
  "USER_CREATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "CONFIG_CHANGE",
]);

export const auditResultEnum = pgEnum("audit_result", ["SUCCESS", "FAILURE", "DENIED"]);

export const auditResourceTypeEnum = pgEnum("audit_resource_type", [
  "USER",
  "METRIC_ENTRY",
  "FOOD_ENTRY",
  "MESSAGE",
  "CONVERSATION",
  "REPORT",
  "SESSION",
  "SYSTEM",
]);

// Tables
export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: roleEnum("role").default("participant").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  dateOfBirth: timestamp("date_of_birth"),
  timezone: text("timezone").default("America/Los_Angeles").notNull(),
  unitsPreference: unitsPreferenceEnum("units_preference").default("US").notNull(),
  programStartDate: timestamp("program_start_date"),
  height: integer("height"), // in cm
  coachId: varchar("coach_id").references((): any => users.id),
  notificationPreferencesJson: jsonb("notification_preferences_json"),
  status: userStatusEnum("status").default("active").notNull(),
  forcePasswordReset: boolean("force_password_reset").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const metricEntries = pgTable("metric_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  type: metricTypeEnum("type").notNull(),
  rawUnit: text("raw_unit"),
  normalizedValue: real("normalized_value"),
  valueJson: jsonb("value_json").notNull(),
  source: entrySourceEnum("source").default("manual").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Edit tracking fields
  editedAt: timestamp("edited_at"),
  editedBy: varchar("edited_by").references(() => users.id),
  previousValueJson: jsonb("previous_value_json"), // Stores value before edit for audit
}, (table) => ({
  // Unique constraint to prevent duplicate imports
  uniqueUserTimestampType: uniqueIndex("metric_entries_user_timestamp_type_idx")
    .on(table.userId, table.timestamp, table.type),
}));

export const foodEntries = pgTable("food_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  inputType: foodInputTypeEnum("input_type").notNull(),
  mealType: mealTypeEnum("meal_type").default("Breakfast").notNull(),
  rawText: text("raw_text"),
  photoUrl: text("photo_url"),
  voiceUrl: text("voice_url"),
  aiOutputJson: jsonb("ai_output_json"),
  userCorrectionsJson: jsonb("user_corrections_json"),
  tags: jsonb("tags"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const macroTargets = pgTable("macro_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  calories: integer("calories"),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  fiberG: integer("fiber_g"),
  breakfastCalories: integer("breakfast_calories"),
  breakfastProteinG: integer("breakfast_protein_g"),
  breakfastCarbsG: integer("breakfast_carbs_g"),
  breakfastFatG: integer("breakfast_fat_g"),
  lunchCalories: integer("lunch_calories"),
  lunchProteinG: integer("lunch_protein_g"),
  lunchCarbsG: integer("lunch_carbs_g"),
  lunchFatG: integer("lunch_fat_g"),
  dinnerCalories: integer("dinner_calories"),
  dinnerProteinG: integer("dinner_protein_g"),
  dinnerCarbsG: integer("dinner_carbs_g"),
  dinnerFatG: integer("dinner_fat_g"),
  snackCalories: integer("snack_calories"),
  snackProteinG: integer("snack_protein_g"),
  snackCarbsG: integer("snack_carbs_g"),
  snackFatG: integer("snack_fat_g"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  participantId: varchar("participant_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  coachId: varchar("coach_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  body: text("body").notNull(),
  attachmentsJson: jsonb("attachments_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});

export const prompts = pgTable("prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: promptCategoryEnum("category").notNull(),
  messageTemplate: text("message_template").notNull(),
  channel: promptChannelEnum("channel").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const promptRules = pgTable("prompt_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  promptId: varchar("prompt_id").references(() => prompts.id, { onDelete: "cascade" }).notNull(),
  triggerType: triggerTypeEnum("trigger_type").notNull(),
  scheduleJson: jsonb("schedule_json"),
  conditionsJson: jsonb("conditions_json"),
  cooldownHours: integer("cooldown_hours").notNull(),
  priority: integer("priority").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const promptDeliveries = pgTable("prompt_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  promptId: varchar("prompt_id").references(() => prompts.id, { onDelete: "cascade" }).notNull(),
  firedAt: timestamp("fired_at").defaultNow().notNull(),
  triggerContextJson: jsonb("trigger_context_json"),
  status: deliveryStatusEnum("status").default("sent").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  summaryJson: jsonb("summary_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Audit Logs Table
 *
 * HIPAA Compliance Requirements:
 * - Immutable: No UPDATE or DELETE operations allowed (enforced at application level)
 * - Retention: 6+ years (configured via database policies)
 * - No PHI: Only resource IDs stored, not actual health data
 * - Timestamps: With timezone for accurate audit trails
 */
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Timestamp with timezone for accurate audit trails
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),

  // Actor information (who performed the action)
  userId: varchar("user_id"), // Nullable for unauthenticated actions (failed logins)
  userRole: text("user_role"), // Role at time of action (stored as text for historical accuracy)

  // Action details
  action: auditActionEnum("action").notNull(),
  result: auditResultEnum("result").notNull(),

  // Resource information (what was affected)
  resourceType: auditResourceTypeEnum("resource_type").notNull(),
  resourceId: varchar("resource_id"), // ID of affected resource (no PHI)

  // Target user (for actions affecting another user, like coach viewing participant data)
  targetUserId: varchar("target_user_id"),

  // Request context (sanitized - no PHI)
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestPath: text("request_path"),
  requestMethod: text("request_method"),

  // Additional context (sanitized metadata, no PHI)
  // Examples: { "reason": "invalid_password" }, { "oldRole": "participant", "newRole": "coach" }
  metadata: jsonb("metadata"),

  // Error information for failures
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email(),
  name: z.string().min(1),
  passwordHash: z.string().min(1),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMetricEntrySchema = createInsertSchema(metricEntries, {
  type: z.enum(["BP", "WAIST", "GLUCOSE", "KETONES", "WEIGHT"]),
  valueJson: z.any(),
}).omit({ id: true, createdAt: true });

export const insertFoodEntrySchema = createInsertSchema(foodEntries, {
  inputType: z.enum(["text", "photo", "voice"]),
  mealType: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
}).omit({ id: true, createdAt: true });

export const insertMacroTargetSchema = createInsertSchema(macroTargets).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export const insertPromptSchema = createInsertSchema(prompts, {
  key: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["reminder", "intervention", "education"]),
  messageTemplate: z.string().min(1),
  channel: z.enum(["in_app", "email", "sms"]),
}).omit({ id: true, createdAt: true });

export const insertPromptRuleSchema = createInsertSchema(promptRules, {
  key: z.string().min(1),
  promptId: z.string().min(1),
  triggerType: z.enum(["schedule", "event", "missed"]),
  cooldownHours: z.number().int().min(0),
  priority: z.number().int().min(0),
}).omit({ id: true, createdAt: true });

export const insertAuditLogSchema = createInsertSchema(auditLogs, {
  action: z.enum([
    "LOGIN_SUCCESS", "LOGIN_FAILURE", "LOGOUT", "SESSION_EXPIRED",
    "PASSWORD_CHANGE", "PASSWORD_RESET_REQUEST", "PASSWORD_RESET_COMPLETE",
    "PHI_VIEW", "PHI_EXPORT", "BULK_DATA_ACCESS", "REPORT_GENERATED",
    "RECORD_CREATE", "RECORD_UPDATE", "RECORD_DELETE",
    "ROLE_CHANGE", "COACH_ASSIGNMENT", "PERMISSION_GRANTED", "PERMISSION_REVOKED",
    "AUTH_FAILURE", "ACCESS_DENIED", "RATE_LIMIT_EXCEEDED",
    "USER_CREATED", "USER_DEACTIVATED", "USER_REACTIVATED", "CONFIG_CHANGE",
  ]),
  result: z.enum(["SUCCESS", "FAILURE", "DENIED"]),
  resourceType: z.enum([
    "USER", "METRIC_ENTRY", "FOOD_ENTRY", "MESSAGE",
    "CONVERSATION", "REPORT", "SESSION", "SYSTEM",
  ]),
}).omit({ id: true });

// Select/Insert Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type MetricEntry = typeof metricEntries.$inferSelect;
export type InsertMetricEntry = z.infer<typeof insertMetricEntrySchema>;

export type FoodEntry = typeof foodEntries.$inferSelect;
export type InsertFoodEntry = z.infer<typeof insertFoodEntrySchema>;

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Prompt = typeof prompts.$inferSelect;
export type PromptRule = typeof promptRules.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type MacroTarget = typeof macroTargets.$inferSelect;
export type InsertMacroTarget = z.infer<typeof insertMacroTargetSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Audit action type for type-safe action names
export type AuditAction = InsertAuditLog["action"];
export type AuditResult = InsertAuditLog["result"];
export type AuditResourceType = InsertAuditLog["resourceType"];

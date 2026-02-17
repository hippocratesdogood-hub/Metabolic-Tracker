import pg from "pg";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * Run database migrations at startup.
 * Safe to run multiple times — all operations are idempotent.
 */
export async function runMigrations() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    // Check if the users table already exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      );
    `);

    // Always ensure session table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);

    if (result.rows[0].exists) {
      console.log("[migrate] Database tables already exist, running incremental migrations...");
      await runIncrementalMigrations(pool);
      return;
    }

    console.log("[migrate] No tables found, running initial migration...");

    const statements = MIGRATION_SQL.split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await pool.query(statement);
    }

    // Create session table for connect-pg-simple
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);

    console.log("[migrate] Migration completed successfully — all tables created.");
    await runIncrementalMigrations(pool);
  } catch (err) {
    console.error("[migrate] Migration failed:", err);
    throw err;
  } finally {
    await pool.end();
  }
}

/**
 * Incremental migrations that run every startup (all idempotent).
 */
async function runIncrementalMigrations(pool: pg.Pool) {
  // Migration: Add ai_consent_given column
  await pool.query(`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_consent_given" boolean DEFAULT false;
  `);

  // Migration: Deactivate test accounts in production
  if (process.env.NODE_ENV === "production") {
    const testEmails = [
      "alex@example.com",
      "jordan@example.com",
      "coach@example.com",
      "admin@example.com",
    ];
    const deactivated = await pool.query(`
      UPDATE "users" SET "status" = 'inactive'
      WHERE "email" = ANY($1) AND "status" = 'active'
    `, [testEmails]);
    if (deactivated.rowCount && deactivated.rowCount > 0) {
      console.log(`[migrate] Deactivated ${deactivated.rowCount} test account(s).`);
    }

    // Migration: Create production admin account (one-time)
    const adminCheck = await pool.query(
      `SELECT id FROM "users" WHERE "email" = $1`,
      ["drchad@theadaptlab.com"]
    );
    if (adminCheck.rows.length === 0) {
      const tempPassword = randomBytes(16).toString("hex");
      const hashedPassword = await hashPassword(tempPassword);
      await pool.query(`
        INSERT INTO "users" ("id", "role", "name", "email", "password_hash", "status", "force_password_reset")
        VALUES (gen_random_uuid(), 'admin', 'Dr. Chad Larson', $1, $2, 'active', true)
      `, ["drchad@theadaptlab.com", hashedPassword]);
      console.log("[migrate] ========================================");
      console.log("[migrate] ADMIN ACCOUNT CREATED");
      console.log("[migrate] Email: drchad@theadaptlab.com");
      console.log(`[migrate] Temporary password: ${tempPassword}`);
      console.log("[migrate] Please change this password after first login.");
      console.log("[migrate] ========================================");
    }
  }

  console.log("[migrate] Incremental migrations complete.");
}

const MIGRATION_SQL = `
CREATE TYPE "public"."audit_action" AS ENUM('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'SESSION_EXPIRED', 'PASSWORD_CHANGE', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETE', 'PHI_VIEW', 'PHI_EXPORT', 'BULK_DATA_ACCESS', 'REPORT_GENERATED', 'RECORD_CREATE', 'RECORD_UPDATE', 'RECORD_DELETE', 'ROLE_CHANGE', 'COACH_ASSIGNMENT', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'AUTH_FAILURE', 'ACCESS_DENIED', 'RATE_LIMIT_EXCEEDED', 'USER_CREATED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'CONFIG_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."audit_resource_type" AS ENUM('USER', 'METRIC_ENTRY', 'FOOD_ENTRY', 'MESSAGE', 'CONVERSATION', 'REPORT', 'SESSION', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('SUCCESS', 'FAILURE', 'DENIED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('sent', 'failed', 'opened');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."food_input_type" AS ENUM('text', 'photo', 'voice');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack');--> statement-breakpoint
CREATE TYPE "public"."metric_type" AS ENUM('BP', 'WAIST', 'GLUCOSE', 'KETONES', 'WEIGHT');--> statement-breakpoint
CREATE TYPE "public"."prompt_category" AS ENUM('reminder', 'intervention', 'education');--> statement-breakpoint
CREATE TYPE "public"."prompt_channel" AS ENUM('in_app', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('participant', 'coach', 'admin');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('schedule', 'event', 'missed');--> statement-breakpoint
CREATE TYPE "public"."units_preference" AS ENUM('US', 'Metric');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" varchar,
	"user_role" text,
	"action" "audit_action" NOT NULL,
	"result" "audit_result" NOT NULL,
	"resource_type" "audit_resource_type" NOT NULL,
	"resource_id" varchar,
	"target_user_id" varchar,
	"ip_address" text,
	"user_agent" text,
	"request_path" text,
	"request_method" text,
	"metadata" jsonb,
	"error_code" text,
	"error_message" text
);--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "food_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"input_type" "food_input_type" NOT NULL,
	"meal_type" "meal_type" DEFAULT 'Breakfast' NOT NULL,
	"raw_text" text,
	"photo_url" text,
	"voice_url" text,
	"ai_output_json" jsonb,
	"user_corrections_json" jsonb,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "macro_targets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"calories" integer,
	"protein_g" integer,
	"carbs_g" integer,
	"fat_g" integer,
	"fiber_g" integer,
	"breakfast_calories" integer,
	"breakfast_protein_g" integer,
	"breakfast_carbs_g" integer,
	"breakfast_fat_g" integer,
	"lunch_calories" integer,
	"lunch_protein_g" integer,
	"lunch_carbs_g" integer,
	"lunch_fat_g" integer,
	"dinner_calories" integer,
	"dinner_protein_g" integer,
	"dinner_carbs_g" integer,
	"dinner_fat_g" integer,
	"snack_calories" integer,
	"snack_protein_g" integer,
	"snack_carbs_g" integer,
	"snack_fat_g" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "macro_targets_user_id_unique" UNIQUE("user_id")
);--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"body" text NOT NULL,
	"attachments_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);--> statement-breakpoint
CREATE TABLE "metric_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"type" "metric_type" NOT NULL,
	"raw_unit" text,
	"normalized_value" real,
	"value_json" jsonb NOT NULL,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp,
	"edited_by" varchar,
	"previous_value_json" jsonb
);--> statement-breakpoint
CREATE TABLE "prompt_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"prompt_id" varchar NOT NULL,
	"fired_at" timestamp DEFAULT now() NOT NULL,
	"trigger_context_json" jsonb,
	"status" "delivery_status" DEFAULT 'sent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "prompt_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"prompt_id" varchar NOT NULL,
	"trigger_type" "trigger_type" NOT NULL,
	"schedule_json" jsonb,
	"conditions_json" jsonb,
	"cooldown_hours" integer NOT NULL,
	"priority" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_rules_key_unique" UNIQUE("key")
);--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" "prompt_category" NOT NULL,
	"message_template" text NOT NULL,
	"channel" "prompt_channel" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_key_unique" UNIQUE("key")
);--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"summary_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "role" DEFAULT 'participant' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"phone" text,
	"date_of_birth" timestamp,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"units_preference" "units_preference" DEFAULT 'US' NOT NULL,
	"program_start_date" timestamp,
	"height" integer,
	"coach_id" varchar,
	"notification_preferences_json" jsonb,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"force_password_reset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_id_users_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macro_targets" ADD CONSTRAINT "macro_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_deliveries" ADD CONSTRAINT "prompt_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_deliveries" ADD CONSTRAINT "prompt_deliveries_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_rules" ADD CONSTRAINT "prompt_rules_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_user_timestamp_type_idx" ON "metric_entries" USING btree ("user_id","timestamp","type");
`;

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
  // Destructive migrations (DROP COLUMN / DROP TABLE) never run automatically on
  // boot. They are one-time historical fixes that have long since been applied;
  // leaving them unconditional meant an unattended deploy could destroy patient
  // data if a database ever presented the legacy shape. Set
  // ALLOW_DESTRUCTIVE_MIGRATIONS=true for a single deliberate deploy to apply one.
  const allowDestructive = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "true";

  // Migration: Add ai_consent_given column
  await pool.query(`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_consent_given" boolean DEFAULT false;
  `);

  // Migration: Onboarding gate (B3). Default true so ADD COLUMN backfills all
  // existing rows as "already onboarded" — real/admin-created users are never
  // dropped into the wizard. The GHL provisioning webhook explicitly sets this
  // false for newly provisioned pilot members.
  await pool.query(`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_complete" boolean NOT NULL DEFAULT true;
  `);

  // Migration: Clinical protocol fields on users
  await pool.query(`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "glp1_status" boolean DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "program_phase_override" text;
  `);

  // Migration: Clinical protocol fields on macro_targets
  await pool.query(`
    ALTER TABLE "macro_targets" ADD COLUMN IF NOT EXISTS "net_carbs_threshold" integer;
  `);
  await pool.query(`
    ALTER TABLE "macro_targets" ADD COLUMN IF NOT EXISTS "target_meal_count" integer DEFAULT 3;
  `);
  await pool.query(`
    ALTER TABLE "macro_targets" ADD COLUMN IF NOT EXISTS "eating_window_start" text DEFAULT '08:00';
  `);
  await pool.query(`
    ALTER TABLE "macro_targets" ADD COLUMN IF NOT EXISTS "eating_window_end" text DEFAULT '20:00';
  `);

  // Migration: Food entry eaten_at (user-adjustable consumption time)
  await pool.query(`
    ALTER TABLE "food_entries" ADD COLUMN IF NOT EXISTS "eaten_at" timestamp;
  `);

  // Migration: per-item provenance on food entries (food analysis v1.2 P2).
  // These two columns are declared in shared/schema.ts and are queried at runtime,
  // but were previously only ever created by `drizzle-kit push --force` on boot —
  // they existed in production by side effect and were absent from this migration
  // path entirely. A database rebuilt from runMigrations() alone (disaster recovery,
  // a new environment) would have been missing them and broken food queries.
  // parent_meal_id self-references food_entries so an expanded meal's items cascade
  // with their parent.
  await pool.query(`
    ALTER TABLE "food_entries" ADD COLUMN IF NOT EXISTS "parent_meal_id" varchar;
  `);
  await pool.query(`
    ALTER TABLE "food_entries" ADD COLUMN IF NOT EXISTS "item_name" text;
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'food_entries_parent_meal_id_food_entries_id_fk'
      ) THEN
        ALTER TABLE "food_entries"
          ADD CONSTRAINT "food_entries_parent_meal_id_food_entries_id_fk"
          FOREIGN KEY ("parent_meal_id") REFERENCES "food_entries"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  // Migration: Recipe Builder tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "recipes" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "participant_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "total_servings" numeric NOT NULL DEFAULT '1',
      "created_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "recipe_id" varchar NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
      "food_name" text NOT NULL,
      "nutritionix_food_id" text,
      "quantity" numeric NOT NULL DEFAULT '1',
      "unit" text,
      "calories" numeric NOT NULL DEFAULT '0',
      "protein" numeric NOT NULL DEFAULT '0',
      "carbs" numeric NOT NULL DEFAULT '0',
      "fat" numeric NOT NULL DEFAULT '0'
    );
  `);

  // Migration: Biomarker reference table (lab interpretation engine)
  // Postgres lacks CREATE TYPE IF NOT EXISTS, so the DO block swallows
  // duplicate_object on re-runs.
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "biomarker_category" AS ENUM (
        'metabolic', 'lipid', 'inflammation', 'thyroid', 'hormones',
        'nutrients', 'liver', 'kidney', 'cbc', 'derived'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "flag_direction" AS ENUM (
        'high_bad', 'low_bad', 'both_bad', 'high_good'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "biomarkers" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "slug" varchar(64) NOT NULL UNIQUE,
      "name" varchar(128) NOT NULL,
      "abbreviation" varchar(32),
      "unit" varchar(32) NOT NULL,
      "category" "biomarker_category" NOT NULL,
      "flag_direction" "flag_direction" NOT NULL DEFAULT 'both_bad',
      "standard_low" real,
      "standard_high" real,
      "optimal_low" real,
      "optimal_high" real,
      "critical_low" real,
      "critical_high" real,
      "is_derived" boolean NOT NULL DEFAULT false,
      "derivation_formula" varchar(256),
      "clinical_note" text,
      "description" text,
      "patient_explanation" text,
      "sort_order" integer NOT NULL DEFAULT 0,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  // Migration: name the biomarkers.slug unique constraint to match Drizzle.
  // The inline `UNIQUE` above lets Postgres auto-name it "biomarkers_slug_key",
  // but schema.ts declares `.unique()`, which Drizzle names "biomarkers_slug_unique".
  // drizzle-kit sees that name difference as drift and proposes re-adding the
  // constraint — a data-loss-class change that prompts to TRUNCATE the table and
  // blocks on stdin even under `push --force`. Renaming makes the two agree, so a
  // schema diff against a DB built purely by runMigrations() comes back empty.
  // Non-destructive: renames in place, touches no rows, no-op once already renamed.
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'biomarkers_slug_key')
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'biomarkers_slug_unique') THEN
        ALTER TABLE "biomarkers" RENAME CONSTRAINT "biomarkers_slug_key" TO "biomarkers_slug_unique";
      END IF;
    END $$;
  `);

  const { seedBiomarkers } = await import("./biomarkerSeedData");
  await seedBiomarkers(pool);

  // Migration: Lab results table (minimal — panels/reports deferred to Phase 2)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "lab_results" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "biomarker_id" varchar NOT NULL REFERENCES "biomarkers"("id"),
      "value" real NOT NULL,
      "collected_at" timestamp NOT NULL,
      "notes" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);

  // Migration: Add LAB_PDF_EXTRACT to audit_action enum (Phase 2 PDF ingestion)
  await pool.query(`
    ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'LAB_PDF_EXTRACT';
  `);
  // Composite index enables O(log n) "latest value per biomarker per user"
  // lookups, which is the hot path for biomarker-gated rule evaluation.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "lab_results_user_biomarker_collected_idx"
      ON "lab_results" ("user_id", "biomarker_id", "collected_at" DESC);
  `);

  // Migration: Glucose context for backdated/today device-metric entries.
  // Nullable — existing rows stay NULL; new entries opt in.
  //
  // Creates the CURRENT 4-value shape directly. This originally created the older
  // ('fasting','random','post_meal') shape and relied on the drop-and-recreate block
  // below to upgrade it — which meant every fresh build churned through a destructive
  // DROP TYPE as part of normal setup. Now that destructive steps are gated behind
  // ALLOW_DESTRUCTIVE_MIGRATIONS, a fresh build must land on the right shape the
  // first time; otherwise it would be left with the legacy 3-value enum.
  // Databases that still hold the old shape are detected and reported below.
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "glucose_context" AS ENUM ('fasting', 'post_meal_1h', 'post_meal_2h', 'random');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE "metric_entries"
      ADD COLUMN IF NOT EXISTS "glucose_context" "glucose_context";
  `);

  // Migration: Expand glucose_context enum from 3 → 4 values.
  // Replaces the initial (fasting, random, post_meal) shape with
  // (fasting, post_meal_1h, post_meal_2h, random) to preserve the
  // 1h/2h clinical distinction. Column has zero rows populated at
  // this point, so drop + recreate is safe. The conditional check
  // detects the *old* enum (presence of 'post_meal') so the drop
  // only fires the first time this block runs against a DB seeded
  // with the prior shape. Subsequent boots are no-ops.
  // GATED (see allowDestructive above): only a DB still carrying the pre-expansion
  // 3-value enum needs this, and no such database should exist anymore. A fresh
  // build never triggers it — the bootstrap SQL doesn't create glucose_context at
  // all, so the CREATE TYPE below makes the new shape directly.
  {
    const legacy = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'glucose_context' AND e.enumlabel = 'post_meal'
      ) AS needs_migration;
    `);
    if (legacy.rows[0].needs_migration) {
      if (allowDestructive) {
        console.warn("[migrate] ALLOW_DESTRUCTIVE_MIGRATIONS=true — dropping legacy glucose_context column + type");
        await pool.query(`ALTER TABLE "metric_entries" DROP COLUMN IF EXISTS "glucose_context";`);
        await pool.query(`DROP TYPE "glucose_context";`);
      } else {
        console.warn(
          "[migrate] SKIPPED a destructive migration: this database still has the legacy " +
            "3-value glucose_context enum. Dropping it would DELETE the metric_entries.glucose_context " +
            "column. Re-deploy once with ALLOW_DESTRUCTIVE_MIGRATIONS=true to apply it deliberately."
        );
      }
    }
  }
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "glucose_context" AS ENUM ('fasting', 'post_meal_1h', 'post_meal_2h', 'random');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE "metric_entries"
      ADD COLUMN IF NOT EXISTS "glucose_context" "glucose_context";
  `);

  // Migration: Day View per-meal feel-state tags.
  // Keyed by (user_id, date, meal_type) so a single nullable tag exists per
  // meal occurrence on a day, independent of food-entry edits/deletes.
  // Reuses the existing "meal_type" enum (Breakfast|Lunch|Dinner|Snack) and
  // uses a dedicated "feel_state" enum for consistency with the rest of
  // the codebase's pgEnum convention.
  //
  // Schema swap (text+CHECK → enum): if a prior boot created the table with
  // a text feel_state column, drop it here so the recreate below picks up
  // the enum type. Guarded so the drop only fires once — subsequent boots
  // see feel_state as USER-DEFINED and skip. Mirrors the conditional-drop
  // pattern used for the glucose_context enum expansion above.
  // GATED (see allowDestructive above): DROP TABLE destroys every recorded feel
  // state. Only fires for a DB whose meal_feel_states.feel_state is still `text`
  // from an early boot; a fresh build creates it with the enum directly.
  {
    const legacy = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'meal_feel_states'
          AND column_name = 'feel_state'
          AND data_type = 'text'
      ) AS needs_migration;
    `);
    if (legacy.rows[0].needs_migration) {
      if (allowDestructive) {
        console.warn("[migrate] ALLOW_DESTRUCTIVE_MIGRATIONS=true — dropping legacy text-typed meal_feel_states");
        await pool.query(`DROP TABLE "meal_feel_states";`);
      } else {
        console.warn(
          "[migrate] SKIPPED a destructive migration: meal_feel_states.feel_state is still text-typed. " +
            "Applying it would DROP the meal_feel_states table and all recorded feel states. " +
            "Re-deploy once with ALLOW_DESTRUCTIVE_MIGRATIONS=true to apply it deliberately."
        );
      }
    }
  }
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "feel_state" AS ENUM (
        'energized', 'neutral', 'sluggish', 'gut_symptoms', 'brain_fog'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "meal_feel_states" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "date" date NOT NULL,
      "meal_type" "meal_type" NOT NULL,
      "feel_state" "feel_state",
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "meal_feel_states_user_date_meal_idx"
      ON "meal_feel_states" ("user_id", "date", "meal_type");
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_meal_feel_states_user_date"
      ON "meal_feel_states" ("user_id", "date");
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
      // The generated password is NEVER logged. It previously went to stdout, which
      // on Railway means the bootstrap admin credential was sitting in the platform
      // log history in plaintext, readable by anyone with log access, forever.
      // Supply INITIAL_ADMIN_PASSWORD to set a password you already know; otherwise
      // a random one is set that nobody holds, and the account must be recovered by
      // resetting the hash directly (PILOT_RUNBOOK.md §3.1). force_password_reset is
      // true either way, so the first login must change it.
      const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
      const tempPassword = initialPassword || randomBytes(16).toString("hex");
      const hashedPassword = await hashPassword(tempPassword);
      await pool.query(`
        INSERT INTO "users" ("id", "role", "name", "email", "password_hash", "status", "force_password_reset")
        VALUES (gen_random_uuid(), 'admin', 'Dr. Chad Larson', $1, $2, 'active', true)
      `, ["drchad@theadaptlab.com", hashedPassword]);
      console.log("[migrate] ========================================");
      console.log("[migrate] ADMIN ACCOUNT CREATED — drchad@theadaptlab.com");
      console.log(
        initialPassword
          ? "[migrate] Password: set from INITIAL_ADMIN_PASSWORD (not logged). Must be changed on first login."
          : "[migrate] Password: randomly generated and NOT logged. Set INITIAL_ADMIN_PASSWORD and " +
            "redeploy, or reset the hash directly, to obtain access."
      );
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

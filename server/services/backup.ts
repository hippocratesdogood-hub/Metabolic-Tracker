/**
 * Database Backup Service
 *
 * Provides backup and restoration capabilities for the Metabolic-Tracker database.
 * Works alongside Neon's built-in Point-in-Time Recovery (PITR) for comprehensive
 * disaster recovery.
 *
 * NEON BUILT-IN FEATURES (automatically enabled):
 * - Continuous WAL archiving with 7-day retention (Free tier) or 30-day (Pro)
 * - Point-in-time recovery to any moment within retention window
 * - Automatic daily snapshots
 * - Branch-based backup testing
 *
 * THIS SERVICE PROVIDES:
 * - Manual pg_dump backups for long-term archival (HIPAA 6+ year requirement)
 * - User data export for compliance (GDPR, data portability)
 * - Backup verification and monitoring
 * - Restoration procedures and testing
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { db } from "../storage";
import {
  users,
  metricEntries,
  foodEntries,
  macroTargets,
  conversations,
  messages,
  auditLogs,
  reports,
  prompts,
  promptRules,
  promptDeliveries,
} from "../../shared/schema";
import { eq, sql } from "drizzle-orm";
import { reportError, ErrorSeverity } from "./errorMonitoring";
import { alertingService } from "./alerting";

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

const BACKUP_CONFIG = {
  // Backup directory (should be on external/cloud storage in production)
  backupDir: process.env.BACKUP_DIR || "./backups",

  // Retention periods (in days)
  retention: {
    daily: 30,      // Keep daily backups for 30 days
    weekly: 90,     // Keep weekly backups for 90 days
    monthly: 365,   // Keep monthly backups for 1 year
    yearly: 2555,   // Keep yearly backups for 7 years (HIPAA compliance)
    manual: 90,     // Keep manual backups for 90 days
  },

  // Backup schedule (for reference - actual scheduling via cron/external)
  schedule: {
    daily: "0 2 * * *",     // 2 AM daily
    weekly: "0 3 * * 0",    // 3 AM Sunday
    monthly: "0 4 1 * *",   // 4 AM 1st of month
    yearly: "0 5 1 1 *",    // 5 AM Jan 1st
  },

  // Maximum backup size before alerting (in bytes)
  maxExpectedSize: 500 * 1024 * 1024, // 500 MB

  // Minimum expected tables in backup
  expectedTables: [
    "users",
    "metric_entries",
    "food_entries",
    "macro_targets",
    "conversations",
    "messages",
    "audit_logs",
    "reports",
    "prompts",
    "prompt_rules",
    "prompt_deliveries",
  ],
};

// ============================================================================
// TYPES
// ============================================================================

interface BackupResult {
  success: boolean;
  filename?: string;
  filepath?: string;
  size?: number;
  duration?: number;
  tablesIncluded?: string[];
  rowCounts?: Record<string, number>;
  error?: string;
  timestamp: Date;
}

interface BackupMetadata {
  filename: string;
  timestamp: Date;
  size: number;
  type: "daily" | "weekly" | "monthly" | "yearly" | "manual";
  verified: boolean;
  tables: string[];
  rowCounts: Record<string, number>;
  databaseUrl: string; // Sanitized (no password)
  version: string;
}

interface RestoreResult {
  success: boolean;
  tablesRestored?: string[];
  rowsRestored?: Record<string, number>;
  duration?: number;
  error?: string;
  timestamp: Date;
}

interface UserDataExport {
  exportedAt: Date;
  userId: string;
  format: "json" | "csv";
  data: {
    profile: any;
    metrics: any[];
    foodEntries: any[];
    macroTargets: any;
    conversations: any[];
    messages: any[];
  };
}

// ============================================================================
// BACKUP SERVICE
// ============================================================================

class BackupService {
  private backupDir: string;

  constructor() {
    this.backupDir = BACKUP_CONFIG.backupDir;
    this.ensureBackupDirectory();
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log(`[Backup] Created backup directory: ${this.backupDir}`);
    }
  }

  /**
   * Get database connection info (sanitized)
   */
  private getDatabaseInfo(): { host: string; database: string; user: string } {
    const url = process.env.DATABASE_URL || "";
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        database: parsed.pathname.slice(1).split("?")[0],
        user: parsed.username,
      };
    } catch {
      return { host: "unknown", database: "unknown", user: "unknown" };
    }
  }

  /**
   * Create a manual pg_dump backup
   */
  async createBackup(type: BackupMetadata["type"] = "manual"): Promise<BackupResult> {
    const startTime = Date.now();
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `metabolic-tracker-${type}-${dateStr}.sql.gz`;
    const filepath = path.join(this.backupDir, filename);

    console.log(`[Backup] Starting ${type} backup: ${filename}`);

    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error("DATABASE_URL not configured");
      }

      // Get row counts before backup
      const rowCounts = await this.getRowCounts();

      // Create backup using pg_dump with compression
      // Note: Requires pg_dump to be installed on the system
      const command = `pg_dump "${databaseUrl}" --no-owner --no-acl | gzip > "${filepath}"`;

      await execAsync(command, { timeout: 300000 }); // 5 minute timeout

      // Verify backup was created
      if (!fs.existsSync(filepath)) {
        throw new Error("Backup file was not created");
      }

      const stats = fs.statSync(filepath);
      const duration = Date.now() - startTime;

      // Create metadata file
      const metadata: BackupMetadata = {
        filename,
        timestamp,
        size: stats.size,
        type,
        verified: false,
        tables: BACKUP_CONFIG.expectedTables,
        rowCounts,
        databaseUrl: this.getDatabaseInfo().host,
        version: "1.0.0",
      };

      const metadataPath = filepath.replace(".sql.gz", ".meta.json");
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      // Verify backup integrity
      const verified = await this.verifyBackup(filepath);
      metadata.verified = verified;
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      // Check for anomalies
      if (stats.size > BACKUP_CONFIG.maxExpectedSize) {
        console.warn(`[Backup] Warning: Backup size (${stats.size}) exceeds expected maximum`);
      }

      console.log(`[Backup] Completed: ${filename} (${Math.round(stats.size / 1024)}KB in ${duration}ms)`);

      return {
        success: true,
        filename,
        filepath,
        size: stats.size,
        duration,
        tablesIncluded: BACKUP_CONFIG.expectedTables,
        rowCounts,
        timestamp,
      };
    } catch (error: any) {
      console.error(`[Backup] Failed: ${error.message}`);

      // Report error
      reportError({
        severity: ErrorSeverity.CRITICAL,
        error,
        context: {
          action: "database_backup",
          metadata: { type, filename },
        },
      });

      // Send alert
      await alertingService.sendAlert({
        severity: ErrorSeverity.CRITICAL,
        title: "Database Backup Failed",
        description: `${type} backup failed: ${error.message}`,
        category: "backup",
        environment: process.env.NODE_ENV || "development",
        timestamp,
      });

      return {
        success: false,
        error: error.message,
        timestamp,
      };
    }
  }

  /**
   * Get current row counts for all tables
   */
  async getRowCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    try {
      const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
      counts.users = Number(usersCount?.count || 0);

      const [metricsCount] = await db.select({ count: sql<number>`count(*)` }).from(metricEntries);
      counts.metric_entries = Number(metricsCount?.count || 0);

      const [foodCount] = await db.select({ count: sql<number>`count(*)` }).from(foodEntries);
      counts.food_entries = Number(foodCount?.count || 0);

      const [macrosCount] = await db.select({ count: sql<number>`count(*)` }).from(macroTargets);
      counts.macro_targets = Number(macrosCount?.count || 0);

      const [convoCount] = await db.select({ count: sql<number>`count(*)` }).from(conversations);
      counts.conversations = Number(convoCount?.count || 0);

      const [msgCount] = await db.select({ count: sql<number>`count(*)` }).from(messages);
      counts.messages = Number(msgCount?.count || 0);

      const [auditCount] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs);
      counts.audit_logs = Number(auditCount?.count || 0);

      const [reportsCount] = await db.select({ count: sql<number>`count(*)` }).from(reports);
      counts.reports = Number(reportsCount?.count || 0);

      const [promptsCount] = await db.select({ count: sql<number>`count(*)` }).from(prompts);
      counts.prompts = Number(promptsCount?.count || 0);

      const [rulesCount] = await db.select({ count: sql<number>`count(*)` }).from(promptRules);
      counts.prompt_rules = Number(rulesCount?.count || 0);

      const [deliveriesCount] = await db.select({ count: sql<number>`count(*)` }).from(promptDeliveries);
      counts.prompt_deliveries = Number(deliveriesCount?.count || 0);
    } catch (error: any) {
      console.error(`[Backup] Failed to get row counts: ${error.message}`);
    }

    return counts;
  }

  /**
   * Verify backup file integrity
   */
  async verifyBackup(filepath: string): Promise<boolean> {
    try {
      // Check file exists and has content
      if (!fs.existsSync(filepath)) {
        return false;
      }

      const stats = fs.statSync(filepath);
      if (stats.size < 100) {
        return false;
      }

      // Test gunzip integrity
      await execAsync(`gunzip -t "${filepath}"`, { timeout: 60000 });

      // Check for expected table names in backup
      const { stdout } = await execAsync(`gunzip -c "${filepath}" | head -c 50000 | grep -c "CREATE TABLE"`, {
        timeout: 60000,
      });

      const tableCount = parseInt(stdout.trim(), 10);
      if (tableCount < 5) {
        console.warn(`[Backup] Warning: Only found ${tableCount} CREATE TABLE statements`);
        return false;
      }

      return true;
    } catch (error: any) {
      console.error(`[Backup] Verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * List available backups
   */
  listBackups(): BackupMetadata[] {
    const backups: BackupMetadata[] = [];

    try {
      const files = fs.readdirSync(this.backupDir);

      for (const file of files) {
        if (file.endsWith(".meta.json")) {
          const metaPath = path.join(this.backupDir, file);
          const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          backups.push(metadata);
        }
      }

      // Sort by timestamp descending
      backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error: any) {
      console.error(`[Backup] Failed to list backups: ${error.message}`);
    }

    return backups;
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<{ deleted: string[]; kept: string[] }> {
    const deleted: string[] = [];
    const kept: string[] = [];
    const now = Date.now();

    try {
      const backups = this.listBackups();

      for (const backup of backups) {
        const age = now - new Date(backup.timestamp).getTime();
        const ageDays = age / (1000 * 60 * 60 * 24);
        const retention = BACKUP_CONFIG.retention[backup.type] || BACKUP_CONFIG.retention.daily;

        if (ageDays > retention) {
          // Delete backup and metadata
          const backupPath = path.join(this.backupDir, backup.filename);
          const metaPath = backupPath.replace(".sql.gz", ".meta.json");

          if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

          deleted.push(backup.filename);
          console.log(`[Backup] Deleted expired backup: ${backup.filename}`);
        } else {
          kept.push(backup.filename);
        }
      }
    } catch (error: any) {
      console.error(`[Backup] Cleanup failed: ${error.message}`);
    }

    return { deleted, kept };
  }

  /**
   * Get backup health status
   */
  async getBackupHealth(): Promise<{
    status: "healthy" | "warning" | "critical";
    lastBackup: Date | null;
    backupCount: number;
    totalSize: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    const backups = this.listBackups();
    let totalSize = 0;

    for (const backup of backups) {
      totalSize += backup.size;
      if (!backup.verified) {
        issues.push(`Unverified backup: ${backup.filename}`);
      }
    }

    const lastBackup = backups.length > 0 ? new Date(backups[0].timestamp) : null;

    // Check if backup is recent
    if (!lastBackup) {
      issues.push("No backups found");
    } else {
      const hoursSinceBackup = (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60);
      if (hoursSinceBackup > 48) {
        issues.push(`Last backup was ${Math.round(hoursSinceBackup)} hours ago`);
      }
    }

    let status: "healthy" | "warning" | "critical" = "healthy";
    if (issues.length > 0 && issues.some((i) => i.includes("No backups") || i.includes("48"))) {
      status = "critical";
    } else if (issues.length > 0) {
      status = "warning";
    }

    return {
      status,
      lastBackup,
      backupCount: backups.length,
      totalSize,
      issues,
    };
  }
}

// ============================================================================
// USER DATA EXPORT SERVICE (Compliance)
// ============================================================================

class UserDataExportService {
  /**
   * Export all data for a specific user (GDPR data portability)
   */
  async exportUserData(userId: string, format: "json" | "csv" = "json"): Promise<UserDataExport> {
    console.log(`[DataExport] Exporting data for user: ${userId}`);

    // Get user profile
    const [profile] = await db.select().from(users).where(eq(users.id, userId));
    if (!profile) {
      throw new Error(`User not found: ${userId}`);
    }

    // Sanitize profile (remove password hash)
    const sanitizedProfile = { ...profile, passwordHash: undefined };

    // Get all user metrics
    const metrics = await db
      .select()
      .from(metricEntries)
      .where(eq(metricEntries.userId, userId));

    // Get all food entries
    const food = await db
      .select()
      .from(foodEntries)
      .where(eq(foodEntries.userId, userId));

    // Get macro targets
    const [macros] = await db
      .select()
      .from(macroTargets)
      .where(eq(macroTargets.userId, userId));

    // Get conversations
    const convos = await db
      .select()
      .from(conversations)
      .where(eq(conversations.participantId, userId));

    // Get messages from those conversations
    const convoIds = convos.map((c: { id: string }) => c.id);
    const msgs = convoIds.length > 0
      ? await db.select().from(messages).where(sql`${messages.conversationId} = ANY(${convoIds})`)
      : [];

    const exportData: UserDataExport = {
      exportedAt: new Date(),
      userId,
      format,
      data: {
        profile: sanitizedProfile,
        metrics,
        foodEntries: food,
        macroTargets: macros || null,
        conversations: convos,
        messages: msgs,
      },
    };

    console.log(`[DataExport] Completed export for user ${userId}: ${metrics.length} metrics, ${food.length} food entries`);

    return exportData;
  }

  /**
   * Delete all data for a specific user (GDPR right to erasure)
   * Note: Audit logs are retained for HIPAA compliance
   */
  async deleteUserData(userId: string): Promise<{
    deleted: Record<string, number>;
    retained: string[];
  }> {
    console.log(`[DataExport] Deleting data for user: ${userId}`);

    const deleted: Record<string, number> = {};

    // Delete in order of foreign key dependencies

    // Messages (via cascading delete on conversations)
    const convos = await db.select().from(conversations).where(eq(conversations.participantId, userId));
    for (const convo of convos) {
      const msgResult = await db.delete(messages).where(eq(messages.conversationId, convo.id));
    }
    deleted.messages = convos.length > 0 ? -1 : 0; // Cascaded

    // Conversations
    await db.delete(conversations).where(eq(conversations.participantId, userId));
    deleted.conversations = convos.length;

    // Prompt deliveries
    await db.delete(promptDeliveries).where(eq(promptDeliveries.userId, userId));
    deleted.prompt_deliveries = -1; // Count unknown

    // Reports
    await db.delete(reports).where(eq(reports.userId, userId));
    deleted.reports = -1;

    // Food entries
    await db.delete(foodEntries).where(eq(foodEntries.userId, userId));
    deleted.food_entries = -1;

    // Metric entries
    await db.delete(metricEntries).where(eq(metricEntries.userId, userId));
    deleted.metric_entries = -1;

    // Macro targets
    await db.delete(macroTargets).where(eq(macroTargets.userId, userId));
    deleted.macro_targets = -1;

    // Finally, the user record
    await db.delete(users).where(eq(users.id, userId));
    deleted.users = 1;

    // Note: Audit logs are retained for HIPAA compliance
    const retained = ["audit_logs (retained for HIPAA compliance)"];

    console.log(`[DataExport] Deleted user ${userId} and associated data`);

    return { deleted, retained };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const backupService = new BackupService();
export const userDataExportService = new UserDataExportService();

export {
  BackupResult,
  BackupMetadata,
  RestoreResult,
  UserDataExport,
  BACKUP_CONFIG,
};

export default {
  backupService,
  userDataExportService,
  BACKUP_CONFIG,
};

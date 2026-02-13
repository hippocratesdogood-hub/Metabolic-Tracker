#!/usr/bin/env npx ts-node
/**
 * Backup CLI Tool
 *
 * Command-line interface for database backup operations.
 * Run with: npx ts-node server/scripts/backup-cli.ts <command>
 *
 * Commands:
 *   create [type]     Create a new backup (daily|weekly|monthly|yearly|manual)
 *   list              List all available backups
 *   verify <file>     Verify a specific backup file
 *   cleanup           Remove expired backups based on retention policy
 *   health            Check backup system health
 *   export <userId>   Export all data for a user (GDPR compliance)
 *   restore-test      Test restoration to verify backup integrity
 *
 * Examples:
 *   npx ts-node server/scripts/backup-cli.ts create daily
 *   npx ts-node server/scripts/backup-cli.ts list
 *   npx ts-node server/scripts/backup-cli.ts export user-123-abc
 */

import "dotenv/config";
import { backupService, userDataExportService, BACKUP_CONFIG } from "../services/backup";
import * as fs from "fs";
import * as path from "path";

const commands: Record<string, (...args: string[]) => Promise<void>> = {
  /**
   * Create a backup
   */
  async create(type = "manual") {
    console.log(`\n📦 Creating ${type} backup...\n`);

    const validTypes = ["daily", "weekly", "monthly", "yearly", "manual"];
    if (!validTypes.includes(type)) {
      console.error(`Invalid backup type: ${type}`);
      console.error(`Valid types: ${validTypes.join(", ")}`);
      process.exit(1);
    }

    const result = await backupService.createBackup(type as any);

    if (result.success) {
      console.log("\n✅ Backup created successfully!");
      console.log(`   File: ${result.filename}`);
      console.log(`   Size: ${formatBytes(result.size || 0)}`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Tables: ${result.tablesIncluded?.join(", ")}`);
      console.log("\n   Row counts:");
      for (const [table, count] of Object.entries(result.rowCounts || {})) {
        console.log(`     ${table}: ${count}`);
      }
    } else {
      console.error("\n❌ Backup failed!");
      console.error(`   Error: ${result.error}`);
      process.exit(1);
    }
  },

  /**
   * List all backups
   */
  async list() {
    console.log("\n📋 Available Backups:\n");

    const backups = backupService.listBackups();

    if (backups.length === 0) {
      console.log("No backups found.");
      return;
    }

    console.log("| Date                | Type    | Size      | Verified | Tables |");
    console.log("|---------------------|---------|-----------|----------|--------|");

    for (const backup of backups) {
      const date = new Date(backup.timestamp).toISOString().slice(0, 19).replace("T", " ");
      const verified = backup.verified ? "✅" : "❌";
      console.log(
        `| ${date} | ${backup.type.padEnd(7)} | ${formatBytes(backup.size).padEnd(9)} | ${verified.padEnd(8)} | ${backup.tables.length.toString().padEnd(6)} |`
      );
    }

    console.log(`\nTotal: ${backups.length} backups`);
  },

  /**
   * Verify a backup
   */
  async verify(filename: string) {
    if (!filename) {
      console.error("Usage: verify <filename>");
      process.exit(1);
    }

    console.log(`\n🔍 Verifying backup: ${filename}\n`);

    const filepath = path.join(BACKUP_CONFIG.backupDir, filename);
    if (!fs.existsSync(filepath)) {
      console.error(`Backup file not found: ${filepath}`);
      process.exit(1);
    }

    const verified = await backupService.verifyBackup(filepath);

    if (verified) {
      console.log("✅ Backup verification passed!");
    } else {
      console.error("❌ Backup verification failed!");
      process.exit(1);
    }
  },

  /**
   * Clean up expired backups
   */
  async cleanup() {
    console.log("\n🧹 Cleaning up expired backups...\n");

    const result = await backupService.cleanupOldBackups();

    console.log(`Deleted: ${result.deleted.length} backups`);
    for (const file of result.deleted) {
      console.log(`  - ${file}`);
    }

    console.log(`\nKept: ${result.kept.length} backups`);
  },

  /**
   * Check backup health
   */
  async health() {
    console.log("\n🏥 Backup System Health:\n");

    const health = await backupService.getBackupHealth();

    const statusEmoji = {
      healthy: "✅",
      warning: "⚠️",
      critical: "🚨",
    };

    console.log(`Status: ${statusEmoji[health.status]} ${health.status.toUpperCase()}`);
    console.log(`Last backup: ${health.lastBackup?.toISOString() || "Never"}`);
    console.log(`Total backups: ${health.backupCount}`);
    console.log(`Total size: ${formatBytes(health.totalSize)}`);

    if (health.issues.length > 0) {
      console.log("\nIssues:");
      for (const issue of health.issues) {
        console.log(`  ⚠️ ${issue}`);
      }
    }
  },

  /**
   * Export user data (GDPR compliance)
   */
  async export(userId: string) {
    if (!userId) {
      console.error("Usage: export <userId>");
      process.exit(1);
    }

    console.log(`\n📤 Exporting data for user: ${userId}\n`);

    try {
      const exportData = await userDataExportService.exportUserData(userId, "json");

      const filename = `user-export-${userId}-${Date.now()}.json`;
      const filepath = path.join(BACKUP_CONFIG.backupDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

      console.log("✅ Export completed!");
      console.log(`   File: ${filepath}`);
      console.log(`   Profile: Included`);
      console.log(`   Metrics: ${exportData.data.metrics.length} entries`);
      console.log(`   Food entries: ${exportData.data.foodEntries.length} entries`);
      console.log(`   Conversations: ${exportData.data.conversations.length}`);
      console.log(`   Messages: ${exportData.data.messages.length}`);
    } catch (error: any) {
      console.error(`❌ Export failed: ${error.message}`);
      process.exit(1);
    }
  },

  /**
   * Test backup restoration (creates a test database)
   */
  async "restore-test"() {
    console.log("\n🧪 Testing backup restoration...\n");
    console.log("⚠️  This test requires manual execution with a test database.");
    console.log("   See docs/DISASTER_RECOVERY.md for full restoration procedures.\n");

    // Get the latest backup
    const backups = backupService.listBackups();
    if (backups.length === 0) {
      console.error("No backups available for testing.");
      process.exit(1);
    }

    const latestBackup = backups[0];
    console.log(`Latest backup: ${latestBackup.filename}`);
    console.log(`Created: ${new Date(latestBackup.timestamp).toISOString()}`);
    console.log(`Size: ${formatBytes(latestBackup.size)}`);
    console.log(`Verified: ${latestBackup.verified ? "Yes" : "No"}`);

    // Verify the backup
    const filepath = path.join(BACKUP_CONFIG.backupDir, latestBackup.filename);
    console.log("\nVerifying backup integrity...");
    const verified = await backupService.verifyBackup(filepath);

    if (verified) {
      console.log("✅ Backup integrity verified!");
      console.log("\nTo complete restoration test:");
      console.log("1. Create a test branch in Neon: neonctl branches create --name restore-test");
      console.log(`2. Restore backup: gunzip -c ${filepath} | psql <TEST_DATABASE_URL>`);
      console.log("3. Verify data integrity in test database");
      console.log("4. Delete test branch: neonctl branches delete restore-test");
    } else {
      console.error("❌ Backup integrity check failed!");
      process.exit(1);
    }
  },

  /**
   * Show help
   */
  async help() {
    console.log(`
Backup CLI Tool

Usage: npx ts-node server/scripts/backup-cli.ts <command> [args]

Commands:
  create [type]     Create a new backup (daily|weekly|monthly|yearly|manual)
  list              List all available backups
  verify <file>     Verify a specific backup file
  cleanup           Remove expired backups based on retention policy
  health            Check backup system health
  export <userId>   Export all data for a user (GDPR compliance)
  restore-test      Test restoration to verify backup integrity
  help              Show this help message

Examples:
  npx ts-node server/scripts/backup-cli.ts create daily
  npx ts-node server/scripts/backup-cli.ts list
  npx ts-node server/scripts/backup-cli.ts export user-123

Retention Policy:
  Daily backups:   ${BACKUP_CONFIG.retention.daily} days
  Weekly backups:  ${BACKUP_CONFIG.retention.weekly} days
  Monthly backups: ${BACKUP_CONFIG.retention.monthly} days
  Yearly backups:  ${BACKUP_CONFIG.retention.yearly} days (HIPAA 7-year requirement)
    `);
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Main execution
async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || !commands[command]) {
    await commands.help();
    if (command && !commands[command]) {
      console.error(`\nUnknown command: ${command}`);
    }
    process.exit(command ? 1 : 0);
  }

  try {
    await commands[command](...args);
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();

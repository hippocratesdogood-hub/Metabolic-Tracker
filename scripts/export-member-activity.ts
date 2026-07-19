import "dotenv/config";
import { pool } from "../server/storage";

/**
 * Weekly member-activity export (read-only) — feeds the GHL re-engagement
 * sequence (LAUNCH_CHECKLIST 4.4 / 6.4).
 *
 * Emits CSV to stdout:
 *   email, last_log_date, days_since_last_log, logs_last_7_days, member_since
 *
 * A "log" is any metric entry OR food entry. Scope: active participant accounts
 * only (admin/coach and known test/owner accounts are excluded). Dates are UTC.
 *
 * This script ONLY reads. It creates/updates nothing. Import the CSV into GHL by
 * hand — there is deliberately no endpoint, cron, or push integration.
 *
 * Run (against whatever DATABASE_URL points at — use the PROD connection string
 * for the real weekly export):
 *   npx tsx scripts/export-member-activity.ts > member-activity-$(date +%F).csv
 *
 * Status/among-lines go to stderr so stdout stays clean CSV.
 */

// Accounts to exclude beyond role filtering: seeded test domains + owner/test
// addresses. Edit this list if more test accounts are added to production.
const EXCLUDE_EMAILS = ["larson817@gmail.com"];
const EXCLUDE_DOMAINS = ["@example.com", "@dev.local"];

function toIsoDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Whole calendar days between two instants, compared as UTC dates so the result
// stays consistent with the UTC last_log_date shown in the CSV and lines up with
// a calendar-based inactivity trigger (no time-of-day off-by-one).
function daysBetween(from: Date, to: Date): number {
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const ms = utcDay(to) - utcDay(from);
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

// RFC-4180-ish CSV cell: quote if it contains comma/quote/newline.
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function main() {
  const domainClauses = EXCLUDE_DOMAINS.map((_, i) => `u.email NOT ILIKE $${i + 1}`).join(" AND ");
  const domainParams = EXCLUDE_DOMAINS.map((d) => `%${d}`);
  const emailListParam = `$${EXCLUDE_DOMAINS.length + 1}`;

  // Single read-only query. Per participant: most-recent log across metrics+food,
  // count of logs in the last 7 days, and signup date.
  const sql = `
    SELECT
      u.email,
      u.created_at AS member_since,
      (
        SELECT MAX(ts) FROM (
          SELECT MAX(timestamp) AS ts FROM metric_entries WHERE user_id = u.id
          UNION ALL
          SELECT MAX(timestamp) AS ts FROM food_entries   WHERE user_id = u.id
        ) latest
      ) AS last_log,
      (
        (SELECT COUNT(*) FROM metric_entries WHERE user_id = u.id AND timestamp >= NOW() - INTERVAL '7 days')
        +
        (SELECT COUNT(*) FROM food_entries   WHERE user_id = u.id AND timestamp >= NOW() - INTERVAL '7 days')
      ) AS logs_7d
    FROM users u
    WHERE u.role = 'participant'
      AND u.status = 'active'
      AND ${domainClauses}
      AND u.email <> ALL(${emailListParam})
    ORDER BY last_log ASC NULLS FIRST
  `;

  const params = [...domainParams, EXCLUDE_EMAILS];
  const { rows } = await pool.query(sql, params);

  const now = new Date();
  const header = ["email", "last_log_date", "days_since_last_log", "logs_last_7_days", "member_since"];
  const lines = [header.join(",")];

  for (const r of rows) {
    const memberSince: Date = new Date(r.member_since);
    const lastLog: Date | null = r.last_log ? new Date(r.last_log) : null;
    // Never-logged members are counted inactive since signup, so a member who
    // has done nothing since joining still surfaces to the 5-day trigger.
    const daysSince = lastLog ? daysBetween(lastLog, now) : daysBetween(memberSince, now);

    lines.push(
      [
        csvCell(r.email),
        csvCell(toIsoDate(lastLog)),
        csvCell(String(daysSince)),
        csvCell(String(r.logs_7d)),
        csvCell(toIsoDate(memberSince)),
      ].join(",")
    );
  }

  process.stdout.write(lines.join("\n") + "\n");
  process.stderr.write(`[export-member-activity] ${rows.length} active participant(s) exported.\n`);
  await pool.end();
}

main().catch((err) => {
  process.stderr.write(`[export-member-activity] FAILED: ${err?.message || err}\n`);
  process.exit(1);
});

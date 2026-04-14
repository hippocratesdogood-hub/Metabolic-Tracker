/**
 * Scheduler
 *
 * Hourly in-process tick that evaluates every active participant against the
 * prompt engine's scheduled + missed-logging rules. Event-triggered rules fire
 * inline in the metric-create route instead; this only covers the time-based
 * and inactivity-based paths.
 *
 * Runs inside the Express process so no extra Railway infra is required. If
 * the process restarts during a deploy, a single tick may be missed — the
 * cooldown logic in PromptEngine prevents duplicate sends in that case.
 */

import cron, { type ScheduledTask } from "node-cron";
import { promptEngine } from "./promptEngine";

let task: ScheduledTask | null = null;

export function startScheduler(): void {
  if (task) {
    console.log("[scheduler] already started, skipping");
    return;
  }

  // At minute 0 of every hour (server UTC). Per-user timezone offsets are
  // applied inside PromptEngine.evaluateSchedule() so a rule with hour=8
  // fires at 8 AM in each user's local zone.
  task = cron.schedule("0 * * * *", async () => {
    const startedAt = Date.now();
    try {
      const results = await promptEngine.processScheduledPrompts();
      let delivered = 0;
      results.forEach((list) => {
        delivered += list.length;
      });
      console.log(
        `[scheduler] hourly tick: ${delivered} prompts delivered across ${results.size} users in ${Date.now() - startedAt}ms`
      );
    } catch (err) {
      console.error("[scheduler] hourly tick failed", err);
    }
  });

  console.log("[scheduler] hourly prompt scheduler started");
}

export function stopScheduler(): void {
  if (task) {
    task.stop();
    task = null;
    console.log("[scheduler] stopped");
  }
}

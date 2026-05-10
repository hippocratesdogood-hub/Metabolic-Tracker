/**
 * Backdate Device Metrics — Acceptance Tests
 *
 * Verifies the three behavioral guarantees from the backdating spec:
 *   1. Backdated entries do not trigger the coaching prompt engine.
 *   2. Future-date entries are rejected by server-side validation.
 *   3. A 23:00 PT submission of "today" stores as today in user TZ, not
 *      bumped to tomorrow UTC.
 *
 * Mirrors the project's existing test convention (cf. promptEngine.test.ts):
 * we exercise the same predicates the handler uses rather than spinning up
 * Express. The handler at server/routes.ts (POST /api/metrics) wraps its
 * coaching call in `if (entryDateStr !== todayDateStr)` and rejects with 400
 * when `entryDateStr > todayDateStr`, both computed via toISODateInTZ.
 */

import { describe, it, expect } from "vitest";
import { toISODateInTZ, parseDateOnlyAsNoonInTZ } from "../utils/timezone";

const TZ = "America/Los_Angeles";

describe("Backdate device metrics — acceptance", () => {
  describe("(1) Backdated entries skip coaching", () => {
    it("flags a 5-day-old timestamp as backdated relative to today in user TZ", () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      const entryDateStr = toISODateInTZ(fiveDaysAgo, TZ);
      const todayDateStr = toISODateInTZ(new Date(), TZ);

      const isBackdated = entryDateStr !== todayDateStr;
      expect(isBackdated).toBe(true);
    });

    it("does NOT flag a same-instant entry as backdated", () => {
      const now = new Date();

      const entryDateStr = toISODateInTZ(now, TZ);
      const todayDateStr = toISODateInTZ(now, TZ);

      const isBackdated = entryDateStr !== todayDateStr;
      expect(isBackdated).toBe(false);
    });

    it("flags a 90-day-old timestamp as backdated (well past the old 30-day floor)", () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const entryDateStr = toISODateInTZ(ninetyDaysAgo, TZ);
      const todayDateStr = toISODateInTZ(new Date(), TZ);

      expect(entryDateStr).not.toBe(todayDateStr);
    });
  });

  describe("(2) Future-date entries rejected", () => {
    it("rejects a date string one day in the future in user TZ", () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowStr = toISODateInTZ(tomorrow, TZ);

      const entryTs = parseDateOnlyAsNoonInTZ(tomorrowStr, TZ);
      const entryDateStr = toISODateInTZ(entryTs, TZ);
      const todayDateStr = toISODateInTZ(new Date(), TZ);

      const isFuture = entryDateStr > todayDateStr;
      expect(isFuture).toBe(true);
    });

    it("does NOT reject today's date in user TZ", () => {
      const todayStr = toISODateInTZ(new Date(), TZ);

      const entryTs = parseDateOnlyAsNoonInTZ(todayStr, TZ);
      const entryDateStr = toISODateInTZ(entryTs, TZ);
      const todayDateStr = toISODateInTZ(new Date(), TZ);

      const isFuture = entryDateStr > todayDateStr;
      expect(isFuture).toBe(false);
    });

    it("does NOT reject a past date", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayStr = toISODateInTZ(yesterday, TZ);

      const entryTs = parseDateOnlyAsNoonInTZ(yesterdayStr, TZ);
      const entryDateStr = toISODateInTZ(entryTs, TZ);
      const todayDateStr = toISODateInTZ(new Date(), TZ);

      const isFuture = entryDateStr > todayDateStr;
      expect(isFuture).toBe(false);
    });
  });

  describe("(3) TZ edge case: 23:00 PT submission of 'today'", () => {
    it("stores 2026-05-09 (not 2026-05-10 UTC) when user at 23:00 PT submits date '2026-05-09'", () => {
      // Pacific is UTC-7 in May (PDT). 23:00 PT on 2026-05-09 = 06:00 UTC on 2026-05-10.
      // A naive UTC-date implementation would call this "2026-05-10".
      const fakeNowUtc = new Date("2026-05-10T06:00:00Z");

      // Sanity: in PT, this instant is still May 9.
      expect(toISODateInTZ(fakeNowUtc, TZ)).toBe("2026-05-09");

      // Frontend date picker shows "today" = 2026-05-09 in PT. Submit it.
      const storedTs = parseDateOnlyAsNoonInTZ("2026-05-09", TZ);

      // The stored timestamp's date, viewed in PT, must still be 2026-05-09.
      expect(toISODateInTZ(storedTs, TZ)).toBe("2026-05-09");

      // Concrete UTC: noon PDT (UTC-7) on May 9 = 19:00 UTC on May 9.
      expect(storedTs.toISOString()).toBe("2026-05-09T19:00:00.000Z");
    });

    it("handles PST (winter, UTC-8) for a January date", () => {
      // No DST in January. Noon PST = 20:00 UTC.
      const storedTs = parseDateOnlyAsNoonInTZ("2025-01-15", TZ);

      expect(toISODateInTZ(storedTs, TZ)).toBe("2025-01-15");
      expect(storedTs.toISOString()).toBe("2025-01-15T20:00:00.000Z");
    });

    it("handles a half-hour-offset zone (Asia/Kolkata, UTC+05:30)", () => {
      // Noon IST = 06:30 UTC. Exercises the formatToParts longOffset parser
      // for non-whole-hour offsets.
      const storedTs = parseDateOnlyAsNoonInTZ("2026-05-09", "Asia/Kolkata");

      expect(toISODateInTZ(storedTs, "Asia/Kolkata")).toBe("2026-05-09");
      expect(storedTs.toISOString()).toBe("2026-05-09T06:30:00.000Z");
    });
  });
});

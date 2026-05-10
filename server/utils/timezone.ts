// Returns the calendar date (YYYY-MM-DD) as it appears in `timezone`.
export function toISODateInTZ(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Treats `dateStr` (YYYY-MM-DD) as noon wall-time in `timezone` and returns the
// corresponding UTC Date. Noon avoids DST-transition ambiguity (transitions
// happen near 02:00). Used to anchor backdated device-metric entries to a
// stable mid-day timestamp regardless of when they were entered.
export function parseDateOnlyAsNoonInTZ(dateStr: string, timezone: string): Date {
  const wallAsUtc = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(wallAsUtc);
  const offsetStr = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = offsetStr.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return wallAsUtc;
  const sign = m[1] === "+" ? 1 : -1;
  const offsetMs = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60 * 1000;
  return new Date(wallAsUtc.getTime() - offsetMs);
}

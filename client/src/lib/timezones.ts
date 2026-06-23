// US timezones offered in the UI. Values are IANA timezone identifiers, which is
// what the scheduler / promptEngine pass to Intl.DateTimeFormat for local-hour math.
// Keep this list in sync with any server-side timezone validation.
export interface UsTimezoneOption {
  value: string; // IANA identifier
  label: string;
}

export const US_TIMEZONES: UsTimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
];

export const US_TIMEZONE_VALUES = US_TIMEZONES.map((tz) => tz.value);

export function isUsTimezone(value: string | null | undefined): boolean {
  return !!value && US_TIMEZONE_VALUES.includes(value);
}

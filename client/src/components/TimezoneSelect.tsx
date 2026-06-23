import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { US_TIMEZONES, isUsTimezone } from '@/lib/timezones';

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  'data-testid'?: string;
}

/**
 * Dropdown of US timezones (IANA identifiers). If the current value isn't one of
 * the standard US zones (e.g. a legacy free-text entry), it's still shown as a
 * selectable option so editing the rest of the form doesn't silently drop it.
 *
 * Two Radix quirks are worked around here, both surfaced when this Select sits
 * inside a <form> with a value pre-filled programmatically (e.g. via useEffect):
 *   1. We render the trigger label ourselves instead of relying on <SelectValue>,
 *      whose auto-derived text falls back to the placeholder when the value isn't
 *      set by a click. Computing the label from `value` keeps display in sync.
 *   2. We ignore empty onValueChange callbacks. Radix's hidden form-bubble select
 *      fires a spurious change="" on mount (no SelectItem is registered until the
 *      dropdown opens), which would otherwise clobber the pre-filled value. There
 *      is no empty option, so "" is never a legitimate user selection.
 */
export function TimezoneSelect({ value, onChange, 'data-testid': testId }: TimezoneSelectProps) {
  const showLegacyOption = !!value && !isUsTimezone(value);
  const selectedLabel =
    US_TIMEZONES.find((tz) => tz.value === value)?.label ??
    (value ? `${value} (current)` : '');

  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v); }}>
      <SelectTrigger data-testid={testId}>
        {selectedLabel ? (
          <span>{selectedLabel}</span>
        ) : (
          <span className="text-muted-foreground">Select timezone</span>
        )}
      </SelectTrigger>
      <SelectContent>
        {US_TIMEZONES.map((tz) => (
          <SelectItem key={tz.value} value={tz.value}>
            {tz.label}
          </SelectItem>
        ))}
        {showLegacyOption && (
          <SelectItem value={value}>{value} (current)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

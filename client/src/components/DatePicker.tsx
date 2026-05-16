import * as React from 'react';
import { isAfter, isBefore, startOfDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

type Align = 'start' | 'center' | 'end';

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  /** Earliest allowed date (inclusive). Dates before this are not selectable. */
  min?: Date;
  /** Latest allowed date (inclusive). Dates after this are not selectable. */
  max?: Date;
  /** When true, the trigger is disabled and the popover cannot open. */
  disabled?: boolean;
  /** Popover alignment relative to the trigger. */
  align?: Align;
  /** The trigger element. Caller supplies its own visual (button, badge, etc.). */
  children: React.ReactNode;
}

/**
 * Thin reusable wrapper around shadcn Popover + Calendar — extracted from the
 * Popover+Calendar pattern that was inlined in MetricEntryModal /
 * UnifiedMetricModal. The trigger is supplied as `children` so each caller
 * controls its own visual (button, chevron, date display, etc.).
 *
 * The popover closes automatically when a date is selected.
 */
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  align = 'start',
  children,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const minDay = min ? startOfDay(min) : undefined;
  const maxDay = max ? startOfDay(max) : undefined;

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            if (!date) return;
            onChange(date);
            setOpen(false);
          }}
          disabled={(date) => {
            if (minDay && isBefore(date, minDay)) return true;
            if (maxDay && isAfter(date, maxDay)) return true;
            return false;
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

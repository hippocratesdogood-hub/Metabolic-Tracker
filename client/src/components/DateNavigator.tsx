import { useLocation } from 'wouter';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO, addDays, subDays, isToday, isYesterday } from 'date-fns';
import { Button } from '@/components/ui/button';
import DatePicker from '@/components/DatePicker';

interface DateNavigatorProps {
  /** YYYY-MM-DD — the date currently displayed. */
  value: string;
}

function todayLocalISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Prev/next + tappable date display for the Day View. The display opens a
 * DatePicker popover anchored to itself. Prev/next push to the router so the
 * browser back button works.
 */
export default function DateNavigator({ value }: DateNavigatorProps) {
  const [, navigate] = useLocation();
  // parseISO("YYYY-MM-DD") returns midnight in local TZ — what we want for
  // display formatting via date-fns helpers.
  const date = parseISO(value);
  const today = todayLocalISO();
  const isAtToday = value >= today;

  const display = (() => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEE, MMM d');
  })();

  const goPrev = () => {
    const prev = subDays(date, 1);
    navigate(`/log/${format(prev, 'yyyy-MM-dd')}`);
  };
  const goNext = () => {
    if (isAtToday) return;
    const next = addDays(date, 1);
    navigate(`/log/${format(next, 'yyyy-MM-dd')}`);
  };
  const onPick = (d: Date) => {
    navigate(`/log/${format(d, 'yyyy-MM-dd')}`);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={goPrev}
        aria-label="Previous day"
        data-testid="button-day-prev"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>
      <DatePicker value={date} onChange={onPick} max={new Date()} align="center">
        <Button
          variant="ghost"
          className="font-medium"
          data-testid="button-day-display"
        >
          {display}
        </Button>
      </DatePicker>
      <Button
        variant="ghost"
        size="icon"
        onClick={goNext}
        disabled={isAtToday}
        aria-label="Next day"
        data-testid="button-day-next"
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );
}

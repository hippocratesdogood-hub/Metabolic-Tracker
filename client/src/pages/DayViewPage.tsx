import { useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import DateNavigator from '@/components/DateNavigator';

function todayLocalISO(): string {
  // Browser local TZ — matches the rest of the app's date conventions
  // (cf. FoodLog.tsx and macroProgress endpoint usage).
  return new Date().toLocaleDateString('en-CA');
}

function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return false;
  // Round-trip check rejects values like 2026-02-31 that pass the regex but
  // aren't real calendar dates.
  return d.toLocaleDateString('en-CA') === s;
}

/**
 * Day View — Stage 3 stub. Renders the DateNavigator and the raw JSON response
 * below it. Stage 4 replaces the <pre> with DailyTotals + MealSection components.
 */
export default function DayViewPage() {
  const [, params] = useRoute<{ date: string }>('/log/:date');
  const [, navigate] = useLocation();
  const dateParam = params?.date ?? '';
  const today = todayLocalISO();

  // Validate :date locally before firing the query. Backend re-validates and
  // 400s on its own — this guard just avoids a wasted round-trip and lets us
  // surface a friendly toast immediately.
  const valid = isValidDateStr(dateParam) && dateParam <= today;

  useEffect(() => {
    if (!dateParam) return;
    if (!isValidDateStr(dateParam)) {
      toast.error("That date isn't valid — showing today instead");
      navigate(`/log/${today}`, { replace: true });
      return;
    }
    if (dateParam > today) {
      toast.info('Cannot view future dates — showing today');
      navigate(`/log/${today}`, { replace: true });
    }
  }, [dateParam, today, navigate]);

  const query = useQuery({
    queryKey: ['day-log', dateParam],
    queryFn: () => api.getDayLog(dateParam),
    enabled: valid,
    retry: false,
  });

  // Defensive: if the backend rejects the date (e.g. an edge case our local
  // validator missed), redirect to today with a toast.
  useEffect(() => {
    if (!query.error) return;
    const msg = (query.error as Error).message || '';
    if (msg.toLowerCase().includes('future') || msg.toLowerCase().includes('invalid')) {
      toast.error('Could not load that date — showing today');
      navigate(`/log/${today}`, { replace: true });
    }
  }, [query.error, today, navigate]);

  if (!valid) return null; // mid-redirect

  return (
    <div className="space-y-4">
      <DateNavigator value={dateParam} />

      {query.isLoading && (
        <p className="text-sm text-muted-foreground" data-testid="day-view-loading">
          Loading…
        </p>
      )}

      {query.isError && !query.isLoading && (
        <div className="space-y-2" data-testid="day-view-error">
          <p className="text-sm">Couldn't load this day</p>
          <Button onClick={() => query.refetch()} size="sm">
            Retry
          </Button>
        </div>
      )}

      {query.data && !query.isError && (
        <pre
          className="text-xs bg-muted/40 p-3 rounded overflow-x-auto"
          data-testid="day-view-json"
        >
          {JSON.stringify(query.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

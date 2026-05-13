import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import DateNavigator from '@/components/DateNavigator';
import DailyTotals from '@/components/DailyTotals';
import MealSection, { type MealType } from '@/components/MealSection';
import FoodEditModal from '@/components/FoodEditModal';
import { type FeelState } from '@/components/FeelStatePicker';

const MEAL_ORDER: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function todayLocalISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return false;
  return d.toLocaleDateString('en-CA') === s;
}

export default function DayViewPage() {
  const [, params] = useRoute<{ date: string }>('/log/:date');
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const dateParam = params?.date ?? '';
  const today = todayLocalISO();
  const valid = isValidDateStr(dateParam) && dateParam <= today;

  const [editingEntry, setEditingEntry] = useState<any>(null);

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

  const queryKey = ['day-log', dateParam];
  const query = useQuery({
    queryKey,
    queryFn: () => api.getDayLog(dateParam),
    enabled: valid,
    retry: false,
  });

  // Defensive: backend error → toast + redirect.
  useEffect(() => {
    if (!query.error) return;
    const msg = (query.error as Error).message || '';
    if (msg.toLowerCase().includes('future') || msg.toLowerCase().includes('invalid')) {
      toast.error('Could not load that date — showing today');
      navigate(`/log/${today}`, { replace: true });
    }
  }, [query.error, today, navigate]);

  const handleFeelStateChange = async (mealType: MealType, next: FeelState | null) => {
    await api.setMealFeelState(dateParam, mealType, next);
    // Refetch so subtotals/feel-states reflect the latest authoritative state.
    await queryClient.invalidateQueries({ queryKey });
  };

  const handleEntryClick = (entry: any) => setEditingEntry(entry);
  const handleEditModalClose = (didChange: boolean) => {
    setEditingEntry(null);
    if (didChange) {
      void queryClient.invalidateQueries({ queryKey });
      // Also invalidate the FoodLog query in case the user navigates back.
      void queryClient.invalidateQueries({ queryKey: ['food'] });
    }
  };

  const handleAddClick = (mealType: MealType) => {
    // Pre-fill via URL params. FoodLog reads `mealType` and `date` on mount.
    navigate(`/food?mealType=${mealType}&date=${dateParam}`);
  };

  if (!valid) return null; // mid-redirect

  return (
    <div className="space-y-4">
      <DateNavigator value={dateParam} />

      {query.isLoading && <DayViewSkeleton />}

      {query.isError && !query.isLoading && (
        <Card className="border-none shadow-sm">
          <CardContent className="p-6 text-center space-y-3" data-testid="day-view-error">
            <p className="text-sm text-muted-foreground">Couldn't load this day</p>
            <Button onClick={() => query.refetch()} size="sm" variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && !query.isError && (
        <div className="space-y-3" data-testid="day-view-content">
          <DailyTotals
            totals={query.data.totals}
            targets={query.data.targets}
            carbRunway={query.data.carbRunway}
          />
          {MEAL_ORDER.map((mt) => (
            <MealSection
              key={mt}
              mealType={mt}
              data={query.data.meals[mt]}
              canAddEntries={query.data.canAddEntries}
              canTagFeelState={query.data.canTagFeelState}
              onFeelStateChange={(next) => handleFeelStateChange(mt, next)}
              onEntryClick={handleEntryClick}
              onAddClick={() => handleAddClick(mt)}
            />
          ))}
        </div>
      )}

      {editingEntry && (
        <FoodEditModal
          entry={editingEntry}
          onClose={() => handleEditModalClose(false)}
          onSaved={() => handleEditModalClose(true)}
          onDeleted={() => handleEditModalClose(true)}
        />
      )}
    </div>
  );
}

function DayViewSkeleton() {
  return (
    <div className="space-y-3" data-testid="day-view-loading">
      {/* Totals skeleton */}
      <Card className="border-none shadow-md bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* Meal-section skeletons */}
      {MEAL_ORDER.map((mt) => (
        <Card key={mt} className="border-none shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

import { Coffee, UtensilsCrossed, Moon, Cookie, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import FeelStatePicker, { type FeelState } from '@/components/FeelStatePicker';

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

const mealIcons: Record<MealType, any> = {
  Breakfast: Coffee,
  Lunch: UtensilsCrossed,
  Dinner: Moon,
  Snack: Cookie,
};

interface MealSectionData {
  entries: any[];
  subtotals: { calories: number; carbs: number; fat: number; protein: number };
  feelState: FeelState | null;
}

interface MealSectionProps {
  mealType: MealType;
  data: MealSectionData;
  canAddEntries: boolean;
  canTagFeelState: boolean;
  onFeelStateChange: (next: FeelState | null) => Promise<void>;
  onEntryClick: (entry: any) => void;
  onAddClick: () => void;
}

export default function MealSection({
  mealType,
  data,
  canAddEntries,
  canTagFeelState,
  onFeelStateChange,
  onEntryClick,
  onAddClick,
}: MealSectionProps) {
  const Icon = mealIcons[mealType];
  const { entries, subtotals, feelState } = data;
  const hasSubtotal =
    subtotals.calories || subtotals.carbs || subtotals.fat || subtotals.protein;

  return (
    <Card className="border-none shadow-sm" data-testid={`meal-section-${mealType.toLowerCase()}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header: meal name + right-aligned subtotal */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <h3 className="font-semibold text-sm">{mealType}</h3>
          </div>
          {hasSubtotal ? (
            <div className="text-xs text-muted-foreground tabular-nums text-right">
              <span>{Math.round(subtotals.calories)} cal</span>
              <span className="mx-1">·</span>
              <span>{Math.round(subtotals.carbs)}g C</span>
              <span className="mx-1">·</span>
              <span>{Math.round(subtotals.fat)}g F</span>
              <span className="mx-1">·</span>
              <span>{Math.round(subtotals.protein)}g P</span>
            </div>
          ) : null}
        </div>

        {/* Feel-state pill row (hidden when outside 30-day window) */}
        {canTagFeelState && (
          <FeelStatePicker value={feelState} onChange={onFeelStateChange} />
        )}

        {/* Body: entries or empty state */}
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">No entries</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onClick={() => onEntryClick(entry)} />
            ))}
          </div>
        )}

        {/* Footer: + Add food (hidden outside 30-day window) */}
        {canAddEntries && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={onAddClick}
            data-testid={`button-add-${mealType.toLowerCase()}`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add food
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function EntryRow({ entry, onClick }: { entry: any; onClick: () => void }) {
  const macros =
    entry.userCorrectionsJson?.macros ||
    entry.aiOutputJson?.macros ||
    null;
  const qualityScore =
    entry.userCorrectionsJson?.qualityScore ?? entry.aiOutputJson?.qualityScore ?? null;
  const eatenAt = entry.eatenAt || entry.timestamp;
  const timeLabel = eatenAt ? format(new Date(eatenAt), 'h:mm a') : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border bg-card/50 p-3',
        'hover:bg-accent/40 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
      )}
      data-testid={`entry-row-${entry.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-9 h-9 rounded-md flex items-center justify-center font-bold text-xs shrink-0',
            qualityScore == null
              ? 'bg-muted text-muted-foreground'
              : qualityScore >= 90
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : qualityScore >= 70
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
          )}
        >
          {qualityScore ?? '—'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm truncate">
              {entry.rawText || 'Food entry'}
            </span>
            {timeLabel && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                {timeLabel}
              </span>
            )}
          </div>
          {macros && (
            <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
              <span>{Math.round(macros.calories || 0)} cal</span>
              <span>{Math.round(macros.protein || 0)}g P</span>
              <span>{Math.round(macros.fat || 0)}g F</span>
              <span>{Math.round(macros.netCarbs ?? macros.carbs ?? 0)}g C</span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

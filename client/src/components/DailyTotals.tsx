import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DailyTotalsProps {
  totals: {
    calories: number;
    netCarbs: number;
    totalCarbs: number;
    fiber: number;
    fat: number;
    protein: number;
  };
  targets: {
    calories: number | null;
    carbs: number | null;
    fat: number | null;
    protein: number | null;
  };
  carbRunway: {
    remainingGrams: number;
    suggestion: string | null;
    overTargetCopy: string | null;
  };
}

interface TileProps {
  label: string;
  actual: number;
  target: number | null;
  unit: string;
  color: string;
}

function Tile({ label, actual, target, unit, color, children }: TileProps & { children?: React.ReactNode }) {
  const pct = target && target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold leading-none tabular-nums">
          {Math.round(actual)}
        </span>
        {target != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            / {target}
            {unit}
          </span>
        )}
        {target == null && unit && (
          <span className="text-xs text-muted-foreground">{unit}</span>
        )}
      </div>
      {target != null && target > 0 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', color)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {children}
    </div>
  );
}

export default function DailyTotals({ totals, targets, carbRunway }: DailyTotalsProps) {
  // Carbs runway copy: server is authoritative for suggestion + overTargetCopy.
  // Client only branches on the sign of remainingGrams to pick which line to show.
  const carbsFooter = (() => {
    if (targets.carbs == null) return null;
    const r = carbRunway.remainingGrams;
    if (r > 0 && carbRunway.suggestion) {
      return (
        <div className="text-[11px] leading-snug mt-1">
          <span className="font-semibold">{r}g remaining</span>{' '}
          <span className="text-muted-foreground">≈ {carbRunway.suggestion}</span>
        </div>
      );
    }
    if (r === 0) {
      return (
        <div className="text-[11px] font-semibold mt-1 text-green-600 dark:text-green-500">
          At target
        </div>
      );
    }
    if (r < 0 && carbRunway.overTargetCopy) {
      return (
        <div className="text-[11px] font-semibold mt-1 text-amber-600 dark:text-amber-500">
          {carbRunway.overTargetCopy}
        </div>
      );
    }
    return null;
  })();

  return (
    <Card className="border-none shadow-md bg-gradient-to-r from-primary/5 to-secondary/5">
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile
            label="Calories"
            actual={totals.calories}
            target={targets.calories}
            unit=""
            color="bg-orange-500"
          />
          <Tile
            label="Net Carbs"
            actual={totals.netCarbs}
            target={targets.carbs}
            unit="g"
            color="bg-red-500"
          >
            {carbsFooter}
          </Tile>
          <Tile
            label="Fat"
            actual={totals.fat}
            target={targets.fat}
            unit="g"
            color="bg-yellow-500"
          />
          <Tile
            label="Protein"
            actual={totals.protein}
            target={targets.protein}
            unit="g"
            color="bg-blue-500"
          />
        </div>
      </CardContent>
    </Card>
  );
}

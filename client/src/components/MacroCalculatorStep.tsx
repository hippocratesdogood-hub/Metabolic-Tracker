import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Calculator, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';

type Sex = 'male' | 'female';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very';

const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string; description: string }> = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little or no exercise, desk job' },
  { value: 'light', label: 'Lightly active', description: 'Daily walking, under 20 minutes of exercise' },
  { value: 'moderate', label: 'Moderately active', description: 'Physical job, or exercise several times a week' },
  { value: 'very', label: 'Very active', description: 'Physically demanding job, or intense daily exercise' },
];

interface CalcResult {
  proteinG: number;
  netCarbsG: number;
  fatG: number;
  calories: number;
  bodyFatPct: number;
}

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

/**
 * Macro target calculator — form + result. Used as an onboarding step and
 * from the dashboard's no-target prompt (inside a Dialog).
 *
 * Waist and weight are sourced from the member's metric entries: the latest
 * waist prefills an editable field (edits save as a new WAIST entry before
 * calculating), and the latest weight is shown but sourced server-side.
 */
export default function MacroCalculatorStep({ onComplete, onSkip }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const units = user?.unitsPreference ?? 'US';
  const isMetric = units === 'Metric';
  const lengthUnit = isMetric ? 'cm' : 'in';

  const weightUnit = isMetric ? 'kg' : 'lbs';

  const [sex, setSex] = useState<Sex | null>(null);
  const [heightFt, setHeightFt] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hip, setHip] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CalcResult | null>(null);

  const { data: waistEntries } = useQuery({
    queryKey: ['metrics', 'WAIST'],
    queryFn: () => api.getMetricEntries({ type: 'WAIST' }),
  });
  const { data: weightEntries } = useQuery({
    queryKey: ['metrics', 'WEIGHT'],
    queryFn: () => api.getMetricEntries({ type: 'WEIGHT' }),
  });

  const latestWaistValue = useMemo(() => {
    const vj = waistEntries?.[0]?.valueJson as { value?: number } | undefined;
    return typeof vj?.value === 'number' ? vj.value : null;
  }, [waistEntries]);
  const latestWeight = useMemo(() => {
    const entry = weightEntries?.[0];
    const vj = entry?.valueJson as { value?: number } | undefined;
    return typeof vj?.value === 'number' ? { value: vj.value, unit: entry?.rawUnit || weightUnit } : null;
  }, [weightEntries, weightUnit]);

  // No WEIGHT entry on record (e.g. an admin-created account that never ran
  // onboarding) → ask for weight here and save it as a metric entry, same
  // pattern as waist. Gated on the query having resolved so the field doesn't
  // flash while loading.
  const needsWeight = weightEntries !== undefined && latestWeight === null;

  // Prefill waist from the latest entry once it loads (don't clobber typing)
  useEffect(() => {
    if (latestWaistValue != null) {
      setWaist((prev) => (prev === '' ? String(latestWaistValue) : prev));
    }
  }, [latestWaistValue]);

  const heightValue = (): number | null => {
    if (isMetric) {
      const cm = Number(heightCm);
      return heightCm && Number.isFinite(cm) ? cm : null;
    }
    const ft = Number(heightFt);
    const inch = heightInches === '' ? 0 : Number(heightInches);
    if (!heightFt || !Number.isFinite(ft) || !Number.isFinite(inch)) return null;
    return ft * 12 + inch;
  };

  const formComplete =
    sex !== null &&
    activity !== null &&
    heightValue() !== null &&
    waist !== '' &&
    neck !== '' &&
    (sex !== 'female' || hip !== '') &&
    (!needsWeight || weight !== '');

  const calculate = async () => {
    if (!sex || !activity) return;
    setError('');
    setFieldErrors({});
    setSaving(true);
    try {
      // Metrics stay the source of truth for waist and weight: new or edited
      // values are saved as entries before the server reads "the most recent"
      if (needsWeight && weight) {
        await api.createMetricEntry({
          type: 'WEIGHT',
          valueJson: { value: Number(weight) },
          rawUnit: weightUnit,
        });
        queryClient.invalidateQueries({ queryKey: ['metrics', 'WEIGHT'] });
      }
      if (waist && Number(waist) !== latestWaistValue) {
        await api.createMetricEntry({
          type: 'WAIST',
          valueJson: { value: Number(waist) },
          rawUnit: lengthUnit,
        });
      }
      const height = heightValue();
      const data = await api.calculateMacroTarget({
        sex,
        activityLevel: activity,
        height: height!,
        neck: Number(neck),
        ...(sex === 'female' ? { hip: Number(hip) } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['macro-progress'] });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
        setError('');
      } else {
        setError(err instanceof Error ? err.message : 'Could not calculate your targets. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    const rows = [
      {
        label: 'Protein',
        value: `${result.proteinG} g`,
        context: 'The number that matters most. This is what protects your muscle while you lose weight.',
      },
      {
        label: 'Net carbs',
        value: `${result.netCarbsG} g`,
        context: 'Paired with your overnight fast, this is what moves you toward burning fat for fuel.',
      },
      {
        label: 'Fat',
        value: `${result.fatG} g`,
        context: 'Fills the rest of your energy needs.',
      },
      {
        label: 'Calories',
        value: result.calories.toLocaleString(),
        context: 'What the three above add up to.',
      },
    ];
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300">
        <CardHeader>
          <CardTitle>Your daily targets</CardTitle>
          <CardDescription>Calculated from your measurements, reviewed by your physician.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start gap-4 rounded-lg border border-border p-3">
                <div className="w-24 shrink-0">
                  <p className="text-sm text-muted-foreground">{row.label}</p>
                  <p className="text-xl font-heading font-bold">{row.value}</p>
                </div>
                <p className="text-sm text-muted-foreground pt-1">{row.context}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Based on an estimated body fat of {result.bodyFatPct}% from your tape measurements. This is an
            estimate — it won't match the body fat number from your scale, and neither is exact. No single
            body fat number should be treated as fact.
          </p>
          <p className="text-xs text-muted-foreground">Dr. Larson reviews every target. He may adjust yours.</p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={onComplete} data-testid="button-calculator-continue">
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardFooter>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5" /> Calculate your daily targets
        </CardTitle>
        <CardDescription>
          A few tape measurements are all it takes — the tape measure is in your device kit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Biological sex</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['female', 'male'] as const).map((s) => (
              <Button
                key={s}
                type="button"
                variant={sex === s ? 'default' : 'outline'}
                onClick={() => setSex(s)}
                data-testid={`button-sex-${s}`}
              >
                {s === 'female' ? 'Female' : 'Male'}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            We ask for biological sex, not gender identity, because the body-composition equation behind
            your targets is sex-specific.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="calc-height">Height</Label>
          {isMetric ? (
            <Input
              id="calc-height"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 168 (cm)"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="calc-height"
                type="number"
                inputMode="numeric"
                placeholder="ft"
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
              />
              <Input
                aria-label="Height inches"
                type="number"
                inputMode="numeric"
                placeholder="in"
                value={heightInches}
                onChange={(e) => setHeightInches(e.target.value)}
              />
            </div>
          )}
          {fieldErrors.height && <p className="text-sm text-red-500">{fieldErrors.height}</p>}
        </div>

        {needsWeight && (
          <div className="space-y-2">
            <Label htmlFor="calc-weight">Current weight ({weightUnit})</Label>
            <Input
              id="calc-weight"
              type="number"
              inputMode="decimal"
              placeholder={isMetric ? 'e.g. 96' : 'e.g. 212'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            {fieldErrors.weight && <p className="text-sm text-red-500">{fieldErrors.weight}</p>}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="calc-waist">Waist ({lengthUnit})</Label>
          <Input
            id="calc-waist"
            type="number"
            inputMode="decimal"
            placeholder={isMetric ? 'e.g. 102' : 'e.g. 40'}
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Measure at your navel, at the end of a normal exhale.</p>
          {fieldErrors.waist && <p className="text-sm text-red-500">{fieldErrors.waist}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="calc-neck">Neck ({lengthUnit})</Label>
          <Input
            id="calc-neck"
            type="number"
            inputMode="decimal"
            placeholder={isMetric ? 'e.g. 36' : 'e.g. 14'}
            value={neck}
            onChange={(e) => setNeck(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Measure just below the larynx, with the tape sloping slightly down at the front.
          </p>
          {fieldErrors.neck && <p className="text-sm text-red-500">{fieldErrors.neck}</p>}
        </div>

        {sex === 'female' && (
          <div className="space-y-2">
            <Label htmlFor="calc-hip">Hip ({lengthUnit})</Label>
            <Input
              id="calc-hip"
              type="number"
              inputMode="decimal"
              placeholder={isMetric ? 'e.g. 112' : 'e.g. 44'}
              value={hip}
              onChange={(e) => setHip(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Measure at the widest point.</p>
            {fieldErrors.hip && <p className="text-sm text-red-500">{fieldErrors.hip}</p>}
          </div>
        )}

        <div className="space-y-2">
          <Label>Activity level</Label>
          <div className="space-y-2">
            {ACTIVITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActivity(option.value)}
                data-testid={`button-activity-${option.value}`}
                className={cn(
                  'w-full text-left rounded-lg border p-3 transition-colors',
                  activity === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {latestWeight && (
          <p className="text-xs text-muted-foreground">
            Using your latest logged weight: {latestWeight.value} {latestWeight.unit}.
          </p>
        )}
        {!needsWeight && fieldErrors.weight && <p className="text-sm text-red-500">{fieldErrors.weight}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
      <CardFooter className={cn('flex', onSkip ? 'justify-between' : 'justify-end')}>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={saving}>
            Skip for now
          </Button>
        )}
        <Button onClick={calculate} disabled={!formComplete || saving} data-testid="button-calculate">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calculating...
            </>
          ) : (
            <>
              Calculate <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </CardFooter>
    </div>
  );
}

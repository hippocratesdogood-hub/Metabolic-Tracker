import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, Calculator, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type AdminMacroCalcInput, type AdminMacroCalcResult } from '@/lib/api';
import { convertLength, convertWeight } from '@shared/units';

type Sex = 'male' | 'female';
type ActivityLevel = AdminMacroCalcInput['activityLevel'];

const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string; description: string }> = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little or no exercise, desk job' },
  { value: 'light', label: 'Lightly active', description: 'Daily walking, under 20 minutes of exercise' },
  { value: 'moderate', label: 'Moderately active', description: 'Physical job, or exercise several times a week' },
  { value: 'very', label: 'Very active', description: 'Physically demanding job, or intense daily exercise' },
];

// Same copy as the review queue — staff see flags, members never do
const FLAG_LABELS: Record<string, string> = {
  bf_low: 'Body fat implausibly low — likely mismeasurement',
  bf_high: "Body fat above the formula's reliable range — likely mismeasurement",
  calories_low: 'Calorie target below the clinical floor',
  fat_low: 'Fat below 40 g — approaching essential fatty acid concerns',
  protein_high: 'Protein above 250 g — implausible for this population',
};

const NO_PARTICIPANT = 'none';

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Staff-facing macro calculator. Works standalone for consults and what-if
 * numbers; picking a participant prefills their profile and latest logged
 * measurements and unlocks applying the result as their live target.
 */
export default function MacroCalculatorAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const units = (user?.unitsPreference === 'Metric' ? 'Metric' : 'US') as 'US' | 'Metric';
  const isMetric = units === 'Metric';
  const lengthUnit = isMetric ? 'cm' : 'in';
  const weightUnit = isMetric ? 'kg' : 'lbs';

  const [participantId, setParticipantId] = useState(NO_PARTICIPANT);
  const [sex, setSex] = useState<Sex | null>(null);
  const [heightFt, setHeightFt] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hip, setHip] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);

  const [result, setResult] = useState<AdminMacroCalcResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const { data: participants = [] } = useQuery({
    queryKey: ['admin-participants'],
    queryFn: () => api.getParticipants(),
  });

  const selectedParticipant = participants.find((p: any) => p.id === participantId);

  const { data: prefill } = useQuery({
    queryKey: ['admin-macro-calculator-inputs', participantId],
    queryFn: () => api.getMacroCalculatorInputs(participantId),
    enabled: participantId !== NO_PARTICIPANT,
  });

  // Prefill from the participant's record once per selection; every field
  // stays editable. Refetches (e.g. after applying) must not wipe the form.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!prefill || prefilledFor.current === participantId) return;
    prefilledFor.current = participantId;
    setSex(prefill.sex);
    if (prefill.heightIn != null) {
      if (isMetric) {
        setHeightCm(String(Math.round(convertLength(prefill.heightIn, 'inches', 'cm'))));
      } else {
        const total = Math.round(prefill.heightIn);
        setHeightFt(String(Math.floor(total / 12)));
        setHeightInches(String(total % 12));
      }
    } else {
      setHeightFt('');
      setHeightInches('');
      setHeightCm('');
    }
    setWeight(prefill.weightLb != null ? oneDecimal(isMetric ? convertWeight(prefill.weightLb, 'lbs', 'kg') : prefill.weightLb) : '');
    setWaist(prefill.waistIn != null ? oneDecimal(isMetric ? convertLength(prefill.waistIn, 'inches', 'cm') : prefill.waistIn) : '');
    setNeck('');
    setHip('');
    setActivity(null);
  }, [prefill, participantId, isMetric]);

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

  const buildInput = (): AdminMacroCalcInput | null => {
    const height = heightValue();
    if (!sex || !activity || height === null || !weight || !waist || !neck) return null;
    if (sex === 'female' && !hip) return null;
    return {
      sex,
      activityLevel: activity,
      units,
      height,
      weight: Number(weight),
      waist: Number(waist),
      neck: Number(neck),
      ...(sex === 'female' ? { hip: Number(hip) } : {}),
    };
  };

  const input = buildInput();
  const inputKey = input ? JSON.stringify(input) : null;

  // Live preview: recompute shortly after the form is complete or changes
  useEffect(() => {
    if (!inputKey) {
      setResult(null);
      setFieldErrors({});
      setError('');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCalculating(true);
      try {
        const data = await api.previewAdminMacroCalculation(JSON.parse(inputKey));
        if (cancelled) return;
        setResult(data);
        setFieldErrors({});
        setError('');
      } catch (err) {
        if (cancelled) return;
        setResult(null);
        if (err instanceof ApiError && err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
          setError('');
        } else {
          setError(err instanceof Error ? err.message : 'Could not calculate targets.');
        }
      } finally {
        if (!cancelled) setCalculating(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputKey]);

  const apply = async () => {
    if (!input || participantId === NO_PARTICIPANT) return;
    setApplying(true);
    try {
      await api.applyAdminMacroCalculation(participantId, input);
      queryClient.invalidateQueries({ queryKey: ['admin-macro-calculator-inputs', participantId] });
      queryClient.invalidateQueries({ queryKey: ['macro-review-queue'] });
      toast.success(`Targets applied for ${selectedParticipant?.name ?? 'participant'}`);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not apply targets.');
    } finally {
      setApplying(false);
    }
  };

  const lbmDisplay = result
    ? isMetric
      ? `${oneDecimal(convertWeight(result.lbmLb, 'lbs', 'kg'))} kg`
      : `${Math.round(result.lbmLb)} lbs`
    : '';

  const current = prefill?.currentTarget;

  const fieldError = (key: string) =>
    fieldErrors[key] ? <p className="text-sm text-red-500">{fieldErrors[key]}</p> : null;

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2" data-testid="text-page-title">
            <Calculator className="w-6 h-6 text-primary" />
            Macro Calculator
          </h1>
          <p className="text-muted-foreground">
            Calculate daily macro targets from tape measurements. Optionally apply them to a participant.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Measurements</CardTitle>
            <CardDescription>
              Pick a participant to fill in their profile and latest logged weight and waist, or leave it blank
              for a quick calculation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Participant (optional)</Label>
              <Select value={participantId} onValueChange={setParticipantId}>
                <SelectTrigger data-testid="select-participant">
                  <SelectValue placeholder="No participant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARTICIPANT}>No participant (calculate only)</SelectItem>
                  {participants.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="text-muted-foreground">({p.email})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admin-calc-height">Height</Label>
                {isMetric ? (
                  <Input
                    id="admin-calc-height"
                    type="number"
                    inputMode="decimal"
                    placeholder="cm"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="admin-calc-height"
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
                {fieldError('height')}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-calc-weight">Weight ({weightUnit})</Label>
                <Input
                  id="admin-calc-weight"
                  type="number"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
                {fieldError('weight')}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-calc-waist">Waist ({lengthUnit})</Label>
                <Input
                  id="admin-calc-waist"
                  type="number"
                  inputMode="decimal"
                  value={waist}
                  onChange={(e) => setWaist(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">At the navel, end of a normal exhale.</p>
                {fieldError('waist')}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-calc-neck">Neck ({lengthUnit})</Label>
                <Input
                  id="admin-calc-neck"
                  type="number"
                  inputMode="decimal"
                  value={neck}
                  onChange={(e) => setNeck(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Just below the larynx, tape sloping slightly down.</p>
                {fieldError('neck')}
              </div>

              {sex === 'female' && (
                <div className="space-y-2">
                  <Label htmlFor="admin-calc-hip">Hip ({lengthUnit})</Label>
                  <Input
                    id="admin-calc-hip"
                    type="number"
                    inputMode="decimal"
                    value={hip}
                    onChange={(e) => setHip(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">At the widest point.</p>
                  {fieldError('hip')}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Activity level</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACTIVITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActivity(option.value)}
                    data-testid={`button-activity-${option.value}`}
                    className={cn(
                      'w-full text-left rounded-lg border p-3 transition-colors',
                      activity === option.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm lg:sticky lg:top-6" data-testid="card-macro-result">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Daily targets
              {calculating && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </CardTitle>
            <CardDescription>
              {result ? 'Updates as you edit the measurements.' : 'Fill in every measurement to see targets.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Protein', value: `${Math.round(result.targets.proteinG)} g` },
                    { label: 'Net carbs', value: `${Math.round(result.targets.netCarbsG)} g` },
                    { label: 'Fat', value: `${Math.round(result.targets.fatG)} g` },
                    { label: 'Calories', value: Math.round(result.targets.calories).toLocaleString() },
                  ].map((row) => (
                    <div key={row.label} className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">{row.label}</p>
                      <p className="text-xl font-heading font-bold">{row.value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Est. body fat {result.bodyFatPct}% · lean mass {lbmDisplay}
                </p>
                {result.flags.length > 0 && (
                  <div className="space-y-1">
                    {result.flags.map((flag) => (
                      <p key={flag} className="flex items-start gap-1.5 text-sm text-[#fa7921]">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        {FLAG_LABELS[flag] ?? flag}
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              error && <p className="text-sm text-red-500">{error}</p>
            )}

            {selectedParticipant && (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {current
                    ? `Current targets: ${Math.round(current.proteinG ?? 0)} g protein · ${Math.round(current.carbsG ?? 0)} g carbs · ${Math.round(current.fatG ?? 0)} g fat · ${Math.round(current.calories ?? 0).toLocaleString()} cal`
                    : `${selectedParticipant.name} has no targets yet.`}
                </p>
                <Button
                  className="w-full"
                  disabled={!result || calculating}
                  onClick={() => setConfirmOpen(true)}
                  data-testid="button-apply-targets"
                >
                  <Check className="w-4 h-4 mr-2" /> Apply to {selectedParticipant.name}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply these targets?</DialogTitle>
            <DialogDescription>
              They replace {selectedParticipant?.name}'s live targets right away. The calculation is saved to their
              record as reviewed by you.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <p className="text-sm">
              {Math.round(result.targets.proteinG)} g protein · {Math.round(result.targets.netCarbsG)} g net carbs ·{' '}
              {Math.round(result.targets.fatG)} g fat · {Math.round(result.targets.calories).toLocaleString()} calories
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={applying} data-testid="button-confirm-apply">
              {applying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Apply targets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

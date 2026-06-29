import React, { useState, useRef } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useData } from '@/lib/dataAdapter';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { format, isAfter, isToday, startOfDay } from 'date-fns';
import { Heart, Droplet, Activity, Scale, Ruler, Loader2, AlertCircle, CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getUnitLabels, normalizeMetricForStorage, type UnitsPreference } from '@shared/units';

interface UnifiedMetricModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastUsedDate?: Date;
  onDateChange?: (date: Date) => void;
}

type GlucoseContext = "fasting" | "post_meal_1h" | "post_meal_2h" | "random";

// Validation schemas — same ranges as MetricEntryModal but all optional
const bpSchema = z.object({
  systolic: z.coerce.number()
    .min(50, "Systolic too low (min 50)")
    .max(300, "Systolic too high (max 300)"),
  diastolic: z.coerce.number()
    .min(30, "Diastolic too low (min 30)")
    .max(200, "Diastolic too high (max 200)"),
}).refine(data => data.systolic > data.diastolic, {
  message: "Systolic must be higher than diastolic",
  path: ["systolic"],
});

const glucoseSchema = z.coerce.number()
  .min(20, "Glucose too low (min 20)")
  .max(600, "Glucose too high (max 600)");

const ketonesSchema = z.coerce.number()
  .min(0, "Cannot be negative")
  .max(10, "Too high (max 10)");

const weightSchema = z.coerce.number()
  .min(50, "Too low (min 50)")
  .max(700, "Too high (max 700)");

const waistSchema = z.coerce.number()
  .min(15, "Too low (min 15)")
  .max(100, "Too high (max 100)");

export default function UnifiedMetricModal({ isOpen, onClose, lastUsedDate, onDateChange }: UnifiedMetricModalProps) {
  const { refreshMetrics } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const unitsPref = (user?.unitsPreference ?? "US") as UnitsPreference;
  const unitLabels = getUnitLabels(unitsPref);

  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [glucose, setGlucose] = useState('');
  const [glucoseContext, setGlucoseContext] = useState<GlucoseContext | null>(null);
  const [ketones, setKetones] = useState('');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [notes, setNotes] = useState('');
  const [entryDate, setEntryDate] = useState<Date>(lastUsedDate ?? new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous re-entry guard: the `disabled={isSubmitting}` button only takes
  // effect after a re-render, so two fast taps can both fire handleSubmit before
  // the button disables. A ref blocks the second call immediately.
  const submitInFlight = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const maxDate = startOfDay(new Date());
  const isBackfill = !isToday(entryDate);

  const resetForm = () => {
    setSystolic(''); setDiastolic('');
    setGlucose(''); setGlucoseContext(null);
    setKetones(''); setWeight(''); setWaist('');
    setNotes(''); setErrors({}); setFormError(null);
  };

  React.useEffect(() => {
    if (isOpen) {
      setErrors({});
      setFormError(null);
      if (lastUsedDate) setEntryDate(lastUsedDate);
    }
  }, [isOpen, lastUsedDate]);

  const hasBP = systolic.trim() !== '' || diastolic.trim() !== '';
  const hasGlucose = glucose.trim() !== '';
  const hasKetones = ketones.trim() !== '';
  const hasWeight = weight.trim() !== '';
  const hasWaist = waist.trim() !== '';
  const hasAnyValue = hasBP || hasGlucose || hasKetones || hasWeight || hasWaist;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (hasBP) {
      if (systolic.trim() === '' || diastolic.trim() === '') {
        if (systolic.trim() === '') newErrors.systolic = "Both fields required for BP";
        if (diastolic.trim() === '') newErrors.diastolic = "Both fields required for BP";
      } else {
        try { bpSchema.parse({ systolic: Number(systolic), diastolic: Number(diastolic) }); }
        catch (err) {
          if (err instanceof z.ZodError) err.errors.forEach(e => { newErrors[e.path[0] as string] = e.message; });
        }
      }
    }

    if (hasGlucose) {
      try { glucoseSchema.parse(Number(glucose)); }
      catch (err) { if (err instanceof z.ZodError) newErrors.glucose = err.errors[0].message; }
    }

    if (hasKetones) {
      try { ketonesSchema.parse(Number(ketones)); }
      catch (err) { if (err instanceof z.ZodError) newErrors.ketones = err.errors[0].message; }
    }

    if (hasWeight) {
      try { weightSchema.parse(Number(weight)); }
      catch (err) { if (err instanceof z.ZodError) newErrors.weight = err.errors[0].message; }
    }

    if (hasWaist) {
      try { waistSchema.parse(Number(waist)); }
      catch (err) { if (err instanceof z.ZodError) newErrors.waist = err.errors[0].message; }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlight.current) return;
    if (!hasAnyValue) return;
    if (!validate()) return;

    submitInFlight.current = true;
    setIsSubmitting(true);
    setFormError(null);
    // Backdated entries are sent as YYYY-MM-DD (server anchors to noon in user TZ).
    // Today's entries send a full Date so the actual instant is preserved.
    const timestamp: Date | string = isBackfill
      ? format(entryDate, 'yyyy-MM-dd')
      : new Date();
    const saved: string[] = [];
    const failed: string[] = [];
    const failureErrors: Array<{ name: string; error: unknown }> = [];

    try {
      // Save each filled metric
      if (hasBP) {
        try {
          const normalized = normalizeMetricForStorage({
            type: 'BP', systolic: Number(systolic), diastolic: Number(diastolic), userPreference: unitsPref,
          });
          await api.createMetricEntry({
            type: 'BP', normalizedValue: normalized.normalizedValue, rawUnit: normalized.rawUnit,
            valueJson: normalized.valueJson, timestamp, notes: notes || undefined,
          });
          saved.push('Blood Pressure');
        } catch (err) { failed.push('Blood Pressure'); failureErrors.push({ name: 'Blood Pressure', error: err }); }
      }

      if (hasGlucose) {
        try {
          const normalized = normalizeMetricForStorage({
            type: 'GLUCOSE', value: Number(glucose), userPreference: unitsPref,
          });
          await api.createMetricEntry({
            type: 'GLUCOSE', normalizedValue: normalized.normalizedValue, rawUnit: normalized.rawUnit,
            valueJson: normalized.valueJson, timestamp, notes: notes || undefined,
            ...(glucoseContext ? { glucoseContext } : {}),
          });
          saved.push('Glucose');
        } catch (err) { failed.push('Glucose'); failureErrors.push({ name: 'Glucose', error: err }); }
      }

      if (hasKetones) {
        try {
          const normalized = normalizeMetricForStorage({
            type: 'KETONES', value: Number(ketones), userPreference: unitsPref,
          });
          await api.createMetricEntry({
            type: 'KETONES', normalizedValue: normalized.normalizedValue, rawUnit: normalized.rawUnit,
            valueJson: normalized.valueJson, timestamp, notes: notes || undefined,
          });
          saved.push('Ketones');
        } catch (err) { failed.push('Ketones'); failureErrors.push({ name: 'Ketones', error: err }); }
      }

      if (hasWeight) {
        try {
          const normalized = normalizeMetricForStorage({
            type: 'WEIGHT', value: Number(weight), userPreference: unitsPref,
          });
          await api.createMetricEntry({
            type: 'WEIGHT', normalizedValue: normalized.normalizedValue, rawUnit: normalized.rawUnit,
            valueJson: normalized.valueJson, timestamp, notes: notes || undefined,
          });
          saved.push('Weight');
        } catch (err) { failed.push('Weight'); failureErrors.push({ name: 'Weight', error: err }); }
      }

      if (hasWaist) {
        try {
          const normalized = normalizeMetricForStorage({
            type: 'WAIST', value: Number(waist), userPreference: unitsPref,
          });
          await api.createMetricEntry({
            type: 'WAIST', normalizedValue: normalized.normalizedValue, rawUnit: normalized.rawUnit,
            valueJson: normalized.valueJson, timestamp, notes: notes || undefined,
          });
          saved.push('Waist');
        } catch (err) { failed.push('Waist'); failureErrors.push({ name: 'Waist', error: err }); }
      }

      // Persist last-used date to the parent so the next entry defaults to it.
      onDateChange?.(entryDate);

      // Refresh once after all saves
      await refreshMetrics();
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['macro-progress'] });

      if (failed.length > 0) {
        // Log the real causes so production failures are diagnosable — the previous
        // bare `catch {}` blocks discarded these, leaving us blind to the actual error.
        // Status/code only (no field values) to avoid putting metric data in logs.
        console.error('[metrics] save failures', failureErrors.map(({ name, error }) => ({
          name,
          status: (error as { status?: number })?.status,
          code: (error as { code?: string })?.code,
          message: error instanceof Error ? error.message : String(error),
        })));
        const reason = failureErrors[0]?.error;
        const reasonMsg = reason instanceof Error ? reason.message : '';
        toast({
          variant: "destructive",
          title: "Some metrics failed to save",
          description: `${saved.length ? `Saved: ${saved.join(', ')}. ` : ''}Failed: ${failed.join(', ')}.${reasonMsg ? ` (${reasonMsg})` : ''}`,
        });
      } else {
        toast({
          title: "Metrics saved",
          description: `${saved.join(', ')} logged successfully.`,
        });
        resetForm();
        onClose();
      }
    } catch (error) {
      console.error('Failed to save metrics:', error);
      setFormError('An unexpected error occurred. Please try again.');
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading text-center">Log Health Metrics</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {/* Date picker — defaults to today, supports backdating without limit */}
          <div className="space-y-2">
            <Label htmlFor="entry-date">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  id="entry-date"
                  className={cn(
                    "w-full justify-start gap-2",
                    isBackfill && "border-amber-500 text-amber-600"
                  )}
                  data-testid="button-unified-metric-date"
                  disabled={isSubmitting}
                >
                  <CalendarIcon className="w-4 h-4" />
                  {isToday(entryDate)
                    ? `Today, ${format(entryDate, 'MMM d')}`
                    : format(entryDate, 'MMM d, yyyy')}
                  {isBackfill && <Clock className="w-3 h-3 ml-auto" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={entryDate}
                  onSelect={(date) => date && setEntryDate(date)}
                  disabled={(date) => isAfter(date, maxDate)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {isBackfill && (
              <p className="text-xs font-medium text-amber-600">
                Logging for {format(entryDate, 'MMM d, yyyy')}
              </p>
            )}
          </div>

          <div className="space-y-5">
            {/* Blood Pressure */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                <Label className="font-semibold">Blood Pressure ({unitLabels.bp})</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    type="number" inputMode="numeric" placeholder="Systolic"
                    value={systolic} onChange={(e) => setSystolic(e.target.value)}
                    className={cn("font-mono", errors.systolic && "border-red-500")}
                    disabled={isSubmitting}
                  />
                  {errors.systolic && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{errors.systolic}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    type="number" inputMode="numeric" placeholder="Diastolic"
                    value={diastolic} onChange={(e) => setDiastolic(e.target.value)}
                    className={cn("font-mono", errors.diastolic && "border-red-500")}
                    disabled={isSubmitting}
                  />
                  {errors.diastolic && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />{errors.diastolic}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Blood Glucose + Ketones */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Droplet className="w-4 h-4 text-[#004aad]" />
                  <Label className="font-semibold">Blood Glucose ({unitLabels.glucose})</Label>
                </div>
                <Input
                  type="number" inputMode="decimal" step="0.1" placeholder="Enter blood glucose"
                  value={glucose} onChange={(e) => setGlucose(e.target.value)}
                  className={cn("font-mono", errors.glucose && "border-red-500")}
                  disabled={isSubmitting}
                />
                {errors.glucose && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />{errors.glucose}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-500" />
                  <Label className="font-semibold">Ketones ({unitLabels.ketones})</Label>
                </div>
                <Input
                  type="number" inputMode="decimal" step="0.1" placeholder="Enter ketone level"
                  value={ketones} onChange={(e) => setKetones(e.target.value)}
                  className={cn("font-mono", errors.ketones && "border-red-500")}
                  disabled={isSubmitting}
                />
                {errors.ketones && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />{errors.ketones}
                  </p>
                )}
              </div>
            </div>

            {/* Glucose context — only when glucose has a value */}
            {hasGlucose && (
              <div className="space-y-2 -mt-2 pl-6">
                <Label className="text-sm text-muted-foreground">Glucose Context (optional)</Label>
                <Select
                  value={glucoseContext ?? undefined}
                  onValueChange={(v) => setGlucoseContext(v as GlucoseContext)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fasting">Fasting (Morning)</SelectItem>
                    <SelectItem value="post_meal_1h">1h Post-Meal</SelectItem>
                    <SelectItem value="post_meal_2h">2h Post-Meal</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Weight + Waist */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-blue-500" />
                  <Label className="font-semibold">Weight ({unitLabels.weight})</Label>
                </div>
                <Input
                  type="number" inputMode="decimal" step="0.1" placeholder="Enter weight"
                  value={weight} onChange={(e) => setWeight(e.target.value)}
                  className={cn("font-mono", errors.weight && "border-red-500")}
                  disabled={isSubmitting}
                />
                {errors.weight && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />{errors.weight}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-indigo-500" />
                  <Label className="font-semibold">Waist ({unitLabels.waist})</Label>
                </div>
                <Input
                  type="number" inputMode="decimal" step="0.1" placeholder="Enter waist measurement"
                  value={waist} onChange={(e) => setWaist(e.target.value)}
                  className={cn("font-mono", errors.waist && "border-red-500")}
                  disabled={isSubmitting}
                />
                {errors.waist && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />{errors.waist}
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="font-semibold">Notes (Optional)</Label>
              <Textarea
                placeholder="Add any notes about today's readings..."
                value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2} disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-w-[130px]"
              disabled={isSubmitting || !hasAnyValue}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Metrics"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

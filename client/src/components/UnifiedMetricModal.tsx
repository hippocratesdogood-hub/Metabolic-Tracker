import React, { useState } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useData } from '@/lib/dataAdapter';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { Heart, Droplet, Activity, Scale, Ruler, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getUnitLabels, normalizeMetricForStorage, type UnitsPreference } from '@shared/units';

interface UnifiedMetricModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

export default function UnifiedMetricModal({ isOpen, onClose }: UnifiedMetricModalProps) {
  const { refreshMetrics } = useData();
  const { user } = useAuth();
  const { toast } = useToast();
  const unitsPref = (user?.unitsPreference ?? "US") as UnitsPreference;
  const unitLabels = getUnitLabels(unitsPref);

  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [glucose, setGlucose] = useState('');
  const [glucoseContext, setGlucoseContext] = useState('fasting');
  const [ketones, setKetones] = useState('');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setSystolic(''); setDiastolic('');
    setGlucose(''); setGlucoseContext('fasting');
    setKetones(''); setWeight(''); setWaist('');
    setNotes(''); setErrors({}); setFormError(null);
  };

  React.useEffect(() => {
    if (isOpen) { setErrors({}); setFormError(null); }
  }, [isOpen]);

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
    if (!hasAnyValue) return;
    if (!validate()) return;

    setIsSubmitting(true);
    setFormError(null);
    const timestamp = new Date();
    const saved: string[] = [];
    const failed: string[] = [];

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
        } catch { failed.push('Blood Pressure'); }
      }

      if (hasGlucose) {
        try {
          const normalized = normalizeMetricForStorage({
            type: 'GLUCOSE', value: Number(glucose), userPreference: unitsPref,
          });
          await api.createMetricEntry({
            type: 'GLUCOSE', normalizedValue: normalized.normalizedValue, rawUnit: normalized.rawUnit,
            valueJson: { ...normalized.valueJson, context: glucoseContext }, timestamp, notes: notes || undefined,
          });
          saved.push('Glucose');
        } catch { failed.push('Glucose'); }
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
        } catch { failed.push('Ketones'); }
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
        } catch { failed.push('Weight'); }
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
        } catch { failed.push('Waist'); }
      }

      // Refresh once after all saves
      await refreshMetrics();
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['macro-progress'] });

      if (failed.length > 0) {
        toast({
          variant: "destructive",
          title: "Some metrics failed to save",
          description: `Saved: ${saved.join(', ')}. Failed: ${failed.join(', ')}.`,
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
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading text-center">Add Today's Health Metrics</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

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
                <Label className="text-sm text-muted-foreground">Glucose Context</Label>
                <Select value={glucoseContext} onValueChange={setGlucoseContext} disabled={isSubmitting}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fasting">Fasting (Morning)</SelectItem>
                    <SelectItem value="1hr">1h Post-Meal</SelectItem>
                    <SelectItem value="2hr">2h Post-Meal</SelectItem>
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

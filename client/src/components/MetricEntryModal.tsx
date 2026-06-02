import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import DatePicker from '@/components/DatePicker';
import { MetricType, useData } from '@/lib/dataAdapter';
import { useAuth } from '@/lib/auth';
import { format, startOfDay, isToday } from 'date-fns';
import { CalendarIcon, Clock, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getUnitLabels, normalizeMetricForStorage, fromKg, fromCm, fromMgdl, type UnitsPreference } from '@shared/units';
import type { MetricEntry } from '@shared/schema';

interface MetricEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: MetricType | null;
  lastUsedDate?: Date;
  onDateChange?: (date: Date) => void;
  /** When provided, the modal edits this existing entry instead of creating a new one. */
  editEntry?: MetricEntry | null;
}

/**
 * Pre-fill value for the edit form, converted from storage units to the user's
 * current display unit so the round-trip matches what the history table shows.
 */
function editDisplayValue(entry: MetricEntry, type: MetricType, unitsPref: UnitsPreference): string {
  const vj = (entry.valueJson ?? {}) as Record<string, any>;
  if (entry.normalizedValue != null) {
    switch (type) {
      case 'WEIGHT': return String(Math.round(fromKg(entry.normalizedValue, unitsPref === 'Metric' ? 'kg' : 'lbs') * 10) / 10);
      case 'WAIST': return String(Math.round(fromCm(entry.normalizedValue, unitsPref === 'Metric' ? 'cm' : 'inches') * 10) / 10);
      case 'GLUCOSE': return String(Math.round(fromMgdl(entry.normalizedValue, unitsPref === 'Metric' ? 'mmol/L' : 'mg/dL') * 10) / 10);
      case 'KETONES': return String(Math.round(entry.normalizedValue * 10) / 10);
    }
  }
  // Legacy entries without a normalizedValue: fall back to the raw entered value.
  return vj.value != null ? String(vj.value) : '';
}

type GlucoseContext = "fasting" | "post_meal_1h" | "post_meal_2h" | "random";

const baseTitles: Record<MetricType, string> = {
  BP: 'Blood Pressure',
  WAIST: 'Waist Circumference',
  GLUCOSE: 'Glucose',
  KETONES: 'Ketones',
  WEIGHT: 'Weight',
};

// Validation schemas with meaningful error messages
const glucoseSchema = z.object({
  value: z.coerce.number()
    .min(20, "Glucose seems too low - please verify (min 20 mg/dL)")
    .max(600, "Glucose seems too high - please verify (max 600 mg/dL)"),
});

const weightSchema = z.object({
  value: z.coerce.number()
    .min(50, "Weight seems too low - please verify (min 50 lbs)")
    .max(700, "Weight seems too high - please verify (max 700 lbs)"),
});

const waistSchema = z.object({
  value: z.coerce.number()
    .min(15, "Measurement seems too low - please verify")
    .max(100, "Measurement seems too high - please verify"),
});

const ketonesSchema = z.object({
  value: z.coerce.number()
    .min(0, "Value cannot be negative")
    .max(10, "Ketone level seems too high - please verify (max 10 mmol/L)"),
});

const bpSchema = z.object({
  systolic: z.coerce.number()
    .min(50, "Systolic too low - please verify (min 50)")
    .max(300, "Systolic too high - please verify (max 300)"),
  diastolic: z.coerce.number()
    .min(30, "Diastolic too low - please verify (min 30)")
    .max(200, "Diastolic too high - please verify (max 200)"),
}).refine(data => data.systolic > data.diastolic, {
  message: "Systolic must be higher than diastolic",
  path: ["systolic"],
});

export default function MetricEntryModal({ isOpen, onClose, type, lastUsedDate, onDateChange, editEntry }: MetricEntryModalProps) {
  const { addMetric, updateMetric } = useData();
  const isEditing = !!editEntry;
  const { user } = useAuth();
  const { toast } = useToast();
  const unitsPref = (user?.unitsPreference ?? "US") as UnitsPreference;
  const unitLabels = getUnitLabels(unitsPref);
  const [systolic, setSystolic] = React.useState('');
  const [diastolic, setDiastolic] = React.useState('');
  const [value, setValue] = React.useState('');
  const [context, setContext] = React.useState<GlucoseContext | null>(null);
  const [entryDate, setEntryDate] = React.useState<Date>(lastUsedDate ?? new Date());
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  // Sync local entryDate when parent's lastUsedDate changes (e.g. on modal re-open).
  React.useEffect(() => {
    if (isOpen && lastUsedDate) setEntryDate(lastUsedDate);
  }, [isOpen, lastUsedDate]);

  // When editing, pre-fill the form from the existing entry each time it opens.
  React.useEffect(() => {
    if (!isOpen || !editEntry) return;
    setEntryDate(new Date(editEntry.timestamp));
    const vj = (editEntry.valueJson ?? {}) as Record<string, any>;
    if (editEntry.type === 'BP') {
      setSystolic(vj.systolic != null ? String(vj.systolic) : '');
      setDiastolic(vj.diastolic != null ? String(vj.diastolic) : '');
    } else {
      setValue(editDisplayValue(editEntry, editEntry.type as MetricType, unitsPref));
    }
    setContext((editEntry.glucoseContext as GlucoseContext) ?? null);
  }, [isOpen, editEntry, unitsPref]);

  const maxDate = startOfDay(new Date());
  const isBackfill = !isToday(entryDate);

  // Clear errors when modal opens or type changes
  React.useEffect(() => {
    if (isOpen) {
      setErrors({});
      setFormError(null);
    }
  }, [isOpen, type]);

  // Get the appropriate schema for the metric type
  const getSchema = () => {
    switch (type) {
      case 'BP': return bpSchema;
      case 'GLUCOSE': return glucoseSchema;
      case 'WEIGHT': return weightSchema;
      case 'WAIST': return waistSchema;
      case 'KETONES': return ketonesSchema;
      default: return null;
    }
  };

  const validateForm = (): boolean => {
    const schema = getSchema();
    if (!schema) return false;

    setErrors({});
    setFormError(null);

    try {
      if (type === 'BP') {
        bpSchema.parse({ systolic: Number(systolic), diastolic: Number(diastolic) });
      } else {
        schema.parse({ value: Number(value) });
      }
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((e) => {
          const field = e.path[0] as string;
          newErrors[field] = e.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;

    // Validate before submission
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      // Build the normalized value payload shared by create and edit.
      const valuePayload = type === 'BP'
        ? (() => {
            const n = normalizeMetricForStorage({ type: 'BP', systolic: Number(systolic), diastolic: Number(diastolic), userPreference: unitsPref });
            return { type, normalizedValue: n.normalizedValue, rawUnit: n.rawUnit, valueJson: n.valueJson };
          })()
        : (() => {
            const n = normalizeMetricForStorage({ type: type as any, value: Number(value), userPreference: unitsPref });
            return {
              type,
              normalizedValue: n.normalizedValue,
              rawUnit: n.rawUnit,
              valueJson: n.valueJson,
              // Send context on every glucose edit so clearing it actually persists.
              ...(type === 'GLUCOSE' ? { glucoseContext: context ?? null } : {}),
            };
          })();

      if (isEditing && editEntry) {
        // Only send a timestamp when the entry's day actually moved, so an
        // unchanged edit preserves the original time-of-day.
        const dayChanged = format(entryDate, 'yyyy-MM-dd') !== format(new Date(editEntry.timestamp), 'yyyy-MM-dd');
        await updateMetric(editEntry.id, {
          ...valuePayload,
          ...(dayChanged ? { timestamp: format(entryDate, 'yyyy-MM-dd') } : {}),
        });
      } else {
        // Send backdated entries as YYYY-MM-DD (server converts to noon in user TZ).
        // Today's entries send a full Date so the actual timestamp is preserved.
        const timestampPayload: Date | string = isBackfill
          ? format(entryDate, 'yyyy-MM-dd')
          : new Date();
        await addMetric({ ...valuePayload, timestamp: timestampPayload });
      }

      // Show success toast
      const readingLabel = baseTitles[type].toLowerCase();
      toast({
        title: isEditing ? "Entry updated" : "Entry saved",
        description: isEditing
          ? `Your ${readingLabel} reading has been updated.`
          : `Your ${readingLabel} reading has been logged.`,
      });

      // Persist last-used date to the parent so the next entry defaults to it
      // (creation flow only — edits don't change the new-entry default).
      if (!isEditing) onDateChange?.(entryDate);

      // Reset value fields but keep entryDate — parent owns the persisted date.
      setSystolic('');
      setDiastolic('');
      setValue('');
      setContext(null);
      setErrors({});
      onClose();
    } catch (error) {
      console.error('Failed to add metric:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setFormError(`Failed to save entry: ${errorMessage}. Please try again.`);
      toast({
        variant: "destructive",
        title: "Save failed",
        description: "Unable to save your entry. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!type) return null;

  const dialogTitle = `${isEditing ? 'Edit' : 'Log'} ${baseTitles[type]}`;

  const units: Record<MetricType, string> = {
    BP: unitLabels.bp,
    WAIST: unitLabels.waist,
    GLUCOSE: unitLabels.glucose,
    KETONES: unitLabels.ketones,
    WEIGHT: unitLabels.weight,
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update your reading' : 'Enter your reading'}{isBackfill ? ` for ${format(entryDate, 'MMM d, yyyy')}` : isEditing ? '' : ' for today'}.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {/* Form-level error alert */}
          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="metric-date">Date</Label>
            <DatePicker value={entryDate} onChange={setEntryDate} max={maxDate} align="start">
              <Button variant="outline" className={cn("w-full justify-start gap-2", isBackfill && "border-amber-500 text-amber-600")} data-testid="button-metric-date">
                <CalendarIcon className="w-4 h-4" />
                {isToday(entryDate) ? `Today, ${format(entryDate, 'MMM d')}` : format(entryDate, 'MMM d, yyyy')}
                {isBackfill && <Clock className="w-3 h-3 ml-auto" />}
              </Button>
            </DatePicker>
            {isBackfill && (
              <p className="text-xs font-medium text-amber-600">
                Logging for {format(entryDate, 'MMM d, yyyy')}
              </p>
            )}
          </div>
          {type === 'BP' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="systolic">
                  Systolic (Top) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="systolic"
                  type="number"
                  inputMode="numeric"
                  placeholder="120"
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={!!errors.systolic}
                  aria-describedby={errors.systolic ? "systolic-error" : undefined}
                  className={cn("text-lg font-mono", errors.systolic && "border-red-500 focus:ring-red-500")}
                  disabled={isSubmitting}
                />
                {errors.systolic && (
                  <p id="systolic-error" className="text-sm text-red-500 flex items-center gap-1" role="alert">
                    <AlertCircle className="h-3 w-3" />
                    {errors.systolic}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="diastolic">
                  Diastolic (Bottom) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="diastolic"
                  type="number"
                  inputMode="numeric"
                  placeholder="80"
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={!!errors.diastolic}
                  aria-describedby={errors.diastolic ? "diastolic-error" : undefined}
                  className={cn("text-lg font-mono", errors.diastolic && "border-red-500 focus:ring-red-500")}
                  disabled={isSubmitting}
                />
                {errors.diastolic && (
                  <p id="diastolic-error" className="text-sm text-red-500 flex items-center gap-1" role="alert">
                    <AlertCircle className="h-3 w-3" />
                    {errors.diastolic}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="value">
                  Value ({units[type]}) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="value"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="0.0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={!!errors.value}
                    aria-describedby={errors.value ? "value-error" : "value-help"}
                    className={cn("text-2xl font-mono h-14 pl-4", errors.value && "border-red-500 focus:ring-red-500")}
                    disabled={isSubmitting}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                    {units[type]}
                  </span>
                </div>
                {errors.value ? (
                  <p id="value-error" className="text-sm text-red-500 flex items-center gap-1" role="alert">
                    <AlertCircle className="h-3 w-3" />
                    {errors.value}
                  </p>
                ) : (
                  <p id="value-help" className="text-sm text-muted-foreground">
                    Enter your {type === 'GLUCOSE' ? 'glucose' : type === 'WEIGHT' ? 'weight' : type === 'WAIST' ? 'waist' : 'ketone'} reading
                  </p>
                )}
              </div>

              {type === 'GLUCOSE' && (
                <div className="space-y-2">
                  <Label htmlFor="glucose-context">Context (optional)</Label>
                  <Select
                    value={context ?? undefined}
                    onValueChange={(v) => setContext(v as GlucoseContext)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="glucose-context" aria-label="Glucose measurement context">
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
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[100px]"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                isEditing ? "Save Changes" : "Save Log"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

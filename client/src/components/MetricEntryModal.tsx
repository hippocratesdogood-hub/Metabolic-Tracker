import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MetricType, useData } from '@/lib/dataAdapter';
import { format, subDays, startOfDay, isAfter, isBefore, isToday } from 'date-fns';
import { CalendarIcon, Clock, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface MetricEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: MetricType | null;
}

// Validation schemas with meaningful error messages
const glucoseSchema = z.object({
  value: z.coerce.number()
    .min(20, "Glucose seems too low - please verify (min 20 mg/dL)")
    .max(600, "Glucose seems too high - please verify (max 600 mg/dL)"),
  context: z.string().optional(),
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

export default function MetricEntryModal({ isOpen, onClose, type }: MetricEntryModalProps) {
  const { addMetric } = useData();
  const { toast } = useToast();
  const [systolic, setSystolic] = React.useState('');
  const [diastolic, setDiastolic] = React.useState('');
  const [value, setValue] = React.useState('');
  const [context, setContext] = React.useState('fasting');
  const [entryDate, setEntryDate] = React.useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const minDate = subDays(startOfDay(new Date()), 7);
  const maxDate = new Date();
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
        const data = type === 'GLUCOSE'
          ? { value: Number(value), context }
          : { value: Number(value) };
        schema.parse(data);
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
      if (type === 'BP') {
        await addMetric({
          type,
          valueJson: { systolic: Number(systolic), diastolic: Number(diastolic) },
          timestamp: entryDate,
        });
      } else {
        await addMetric({
          type,
          valueJson: { value: Number(value), context: type === 'GLUCOSE' ? context : undefined },
          timestamp: entryDate,
        });
      }

      // Show success toast
      toast({
        title: "Entry saved",
        description: `Your ${titles[type].replace('Log ', '').toLowerCase()} reading has been logged.`,
      });

      // Reset and close
      setSystolic('');
      setDiastolic('');
      setValue('');
      setEntryDate(new Date());
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

  const titles: Record<MetricType, string> = {
    BP: 'Log Blood Pressure',
    WAIST: 'Log Waist Circumference',
    GLUCOSE: 'Log Glucose',
    KETONES: 'Log Ketones',
    WEIGHT: 'Log Weight',
  };

  const units: Record<MetricType, string> = {
    BP: 'mmHg',
    WAIST: 'inches',
    GLUCOSE: 'mg/dL',
    KETONES: 'mmol/L',
    WEIGHT: 'lbs',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{titles[type]}</DialogTitle>
          <DialogDescription>
            Enter your reading{isBackfill ? ` for ${format(entryDate, 'MMM d, yyyy')}` : ' for today'}.
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start gap-2", isBackfill && "border-amber-500 text-amber-600")} data-testid="button-metric-date">
                  <CalendarIcon className="w-4 h-4" />
                  {isToday(entryDate) ? `Today, ${format(entryDate, 'MMM d')}` : format(entryDate, 'MMM d, yyyy')}
                  {isBackfill && <Clock className="w-3 h-3 ml-auto" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={entryDate}
                  onSelect={(date) => date && setEntryDate(date)}
                  disabled={(date) => isBefore(date, minDate) || isAfter(date, maxDate)}
                  initialFocus
                />
                <div className="p-2 border-t text-xs text-muted-foreground text-center">
                  Backfill entries up to 7 days
                </div>
              </PopoverContent>
            </Popover>
            {isBackfill && (
              <p className="text-xs text-amber-600">Backfilling for a past date</p>
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
                  <Label htmlFor="glucose-context">Context</Label>
                  <Select value={context} onValueChange={setContext} disabled={isSubmitting}>
                    <SelectTrigger id="glucose-context" aria-label="Glucose measurement context">
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
                "Save Log"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

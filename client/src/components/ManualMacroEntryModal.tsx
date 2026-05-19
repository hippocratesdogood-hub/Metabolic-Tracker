import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

interface ManualMacroEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Seeds the meal-type selector (parent's current selection / deep link). */
  defaultMealType: MealType;
  /** Seeds the date+time (parent's current entry date / deep link). */
  defaultDate: Date;
  /** Called after a successful save so the parent can invalidate queries. */
  onLogged: () => void;
}

// The five macros the spec requires on every manual entry. Calories must be
// explicit — manual entries must not perpetuate the calories-missing data
// quality issue (BACKLOG item 4). No fiber/sugar/sodium in v1.1 (spec §8.5).
const MACRO_FIELDS = [
  { key: 'calories', label: 'Calories', suffix: 'kcal' },
  { key: 'protein', label: 'Protein', suffix: 'g' },
  { key: 'fat', label: 'Fat', suffix: 'g' },
  { key: 'carbs', label: 'Total carbs', suffix: 'g' },
  { key: 'netCarbs', label: 'Net carbs', suffix: 'g' },
] as const;

type MacroKey = (typeof MACRO_FIELDS)[number]['key'];

const emptyMacros: Record<MacroKey, string> = {
  calories: '',
  protein: '',
  fat: '',
  carbs: '',
  netCarbs: '',
};

export default function ManualMacroEntryModal({
  isOpen,
  onClose,
  defaultMealType,
  defaultDate,
  onLogged,
}: ManualMacroEntryModalProps) {
  const [description, setDescription] = useState('');
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [time, setTime] = useState(format(defaultDate, 'HH:mm'));
  const [macros, setMacros] = useState<Record<MacroKey, string>>(emptyMacros);
  const [isSaving, setIsSaving] = useState(false);

  // Re-seed from the parent's context each time the modal opens so it
  // respects an already-set meal type / backfilled date (e.g. Day View
  // deep link). Reset the rest.
  useEffect(() => {
    if (isOpen) {
      setDescription('');
      setMealType(defaultMealType);
      setTime(format(defaultDate, 'HH:mm'));
      setMacros(emptyMacros);
    }
  }, [isOpen, defaultMealType, defaultDate]);

  const parsedMacros = MACRO_FIELDS.map(({ key }) => {
    const raw = macros[key].trim();
    const num = raw === '' ? NaN : Number(raw);
    return { key, raw, num, valid: raw !== '' && Number.isFinite(num) && num >= 0 };
  });

  const macrosComplete = parsedMacros.every((m) => m.valid);
  const canSubmit = description.trim().length > 0 && macrosComplete && !isSaving;

  const handleSubmit = async () => {
    // Belt-and-suspenders: the button is disabled when invalid, but guard
    // here too so the form can never persist a partial macro set.
    if (!description.trim()) {
      toast.error('Add a name or description for this meal');
      return;
    }
    if (!macrosComplete) {
      toast.error('Enter all five values: calories, protein, fat, total carbs, and net carbs');
      return;
    }

    const m = Object.fromEntries(
      parsedMacros.map(({ key, num }) => [key, num]),
    ) as Record<MacroKey, number>;

    // Build the timestamp from the parent's date + the chosen time.
    const [h, min] = time.split(':').map(Number);
    const when = new Date(defaultDate);
    when.setHours(h || 0, min || 0, 0, 0);

    setIsSaving(true);
    try {
      await api.createFoodEntry({
        inputType: 'text',
        mealType,
        rawText: description.trim(),
        timestamp: when,
        eaten_at: when.toISOString(),
        // Manual entry bypasses the AI path entirely: macros live in
        // userCorrectionsJson (the precedence winner everywhere), aiOutputJson
        // is left unset. totalCarbs mirrors carbs and fiber is 0 so the Day
        // View / macro-progress net-carb math stays exact (netCarbs is
        // explicit anyway).
        userCorrectionsJson: {
          macros: {
            calories: m.calories,
            protein: m.protein,
            fat: m.fat,
            carbs: m.carbs,
            totalCarbs: m.carbs,
            netCarbs: m.netCarbs,
            fiber: 0,
          },
        },
      });
      toast.success('Meal logged successfully!');
      onLogged();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log meal');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter macros manually</DialogTitle>
          <DialogDescription>
            Log a meal with your own nutrition values — no automatic analysis needed.
            All five values are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="manual-desc">Meal name / description</Label>
            <Input
              id="manual-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Grilled chicken salad with olive oil"
              maxLength={300}
              data-testid="input-manual-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Meal type</Label>
              <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                <SelectTrigger aria-label="Select meal type" data-testid="select-manual-meal-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Breakfast">Breakfast</SelectItem>
                  <SelectItem value="Lunch">Lunch</SelectItem>
                  <SelectItem value="Dinner">Dinner</SelectItem>
                  <SelectItem value="Snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-time">Time</Label>
              <Input
                id="manual-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                data-testid="input-manual-time"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {MACRO_FIELDS.map(({ key, label, suffix }) => {
              const field = parsedMacros.find((p) => p.key === key)!;
              const showError = field.raw !== '' && !field.valid;
              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`manual-${key}`}>
                    {label} <span className="text-muted-foreground font-normal">({suffix})</span>
                  </Label>
                  <Input
                    id={`manual-${key}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={macros[key]}
                    onChange={(e) => setMacros((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0"
                    aria-invalid={showError}
                    className={showError ? 'border-red-500 focus-visible:ring-red-500/30' : undefined}
                    data-testid={`input-manual-${key}`}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Net carbs = total carbs − fiber. Enter net carbs directly.
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-manual-save"
          >
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-2" /> Log meal</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

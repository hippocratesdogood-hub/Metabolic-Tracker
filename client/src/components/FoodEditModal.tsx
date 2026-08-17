import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Coffee, UtensilsCrossed, Moon, Cookie, Loader2, Pencil, Trash2, MessageSquare, Plus, X, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isContainerUnit, scaleByQuantity, scaleByGrams } from '@/lib/portionScaling';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

const mealIcons: Record<MealType, any> = {
  Breakfast: Coffee,
  Lunch: UtensilsCrossed,
  Dinner: Moon,
  Snack: Cookie,
};

type EditRow = {
  key: string;
  childId?: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  fat: number;
  totalCarbs: number;
  fiber: number;
  netCarbs: number;
  servingWeightGrams: number | null;
  altMeasures: any;
  source: string | null;
  sourceName: string | null;
  brand: string | null;
  unresolved?: boolean;
  _baseCal: number;
  _basePro: number;
  _baseFat: number;
  _baseTotalCarbs: number;
  _baseFiber: number;
  _baseNetCarbs: number;
  _baseGrams: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function withBases(row: Omit<EditRow, '_baseCal' | '_basePro' | '_baseFat' | '_baseTotalCarbs' | '_baseFiber' | '_baseNetCarbs' | '_baseGrams'>): EditRow {
  const qty = row.quantity || 1;
  return {
    ...row,
    _baseCal: Math.round(row.calories / qty),
    _basePro: round1(row.protein / qty),
    _baseFat: round1(row.fat / qty),
    _baseTotalCarbs: round1(row.totalCarbs / qty),
    _baseFiber: round1(row.fiber / qty),
    _baseNetCarbs: round1(row.netCarbs / qty),
    _baseGrams: row.servingWeightGrams && qty ? row.servingWeightGrams / qty : null,
  };
}

function rowFromChild(child: any): EditRow {
  const out = child.aiOutputJson || {};
  const m = out.macros || {};
  return withBases({
    key: child.id,
    childId: child.id,
    name: child.itemName || 'Item',
    quantity: Number(out.quantity) || 1,
    unit: out.unit || 'serving',
    calories: Number(m.calories) || 0,
    protein: Number(m.protein) || 0,
    fat: Number(m.fat) || 0,
    totalCarbs: Number(m.totalCarbs) || Number(m.carbs) || 0,
    fiber: Number(m.fiber) || 0,
    netCarbs: Number(m.netCarbs) || Number(m.carbs) || 0,
    servingWeightGrams: out.servingWeightGrams ?? null,
    altMeasures: out.altMeasures ?? null,
    source: out.source ?? null,
    sourceName: out.sourceName ?? null,
    brand: out.brand ?? null,
    unresolved: out.unresolved === true,
  });
}

function rowFromFood(f: any, i: number): EditRow {
  return withBases({
    key: `food-${Date.now()}-${i}`,
    name: f.name || 'Item',
    quantity: Number(f.quantity) || 1,
    unit: f.unit || 'serving',
    calories: Number(f.calories) || 0,
    protein: Number(f.protein) || 0,
    fat: Number(f.fat) || 0,
    totalCarbs: Number(f.totalCarbs) || Number(f.carbs) || 0,
    fiber: Number(f.fiber) || 0,
    netCarbs: Number(f.netCarbs) || Number(f.carbs) || 0,
    servingWeightGrams: f.servingWeightGrams ?? null,
    altMeasures: f.altMeasures ?? null,
    source: f.source ?? null,
    sourceName: f.sourceName ?? null,
    brand: f.brand ?? null,
    unresolved: f.unresolved === true || f.source === 'unresolved',
  });
}

function blankRow(): EditRow {
  return withBases({
    key: `new-${Date.now()}`,
    name: '',
    quantity: 1,
    unit: 'serving',
    calories: 0,
    protein: 0,
    fat: 0,
    totalCarbs: 0,
    fiber: 0,
    netCarbs: 0,
    servingWeightGrams: null,
    altMeasures: null,
    source: 'manual',
    sourceName: null,
    brand: null,
  });
}

export default function FoodEditModal({
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: any;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const originalMacros = entry.userCorrectionsJson?.macros || entry.aiOutputJson?.macros || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const [editedText, setEditedText] = useState(entry.rawText || '');
  const [editNote, setEditNote] = useState((entry.tags as any)?.personalNote || '');
  const [items, setItems] = useState<EditRow[] | null>(null);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [hasNewAnalysis, setHasNewAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load the meal's child item rows; meals saved before the parent/child
  // flow (or single legacy entries) fall back to the foods_detected snapshot.
  useEffect(() => {
    let cancelled = false;
    const foodsFallback = () => {
      const foods = entry.userCorrectionsJson?.foods_detected || entry.aiOutputJson?.foods_detected;
      return Array.isArray(foods) ? foods.map(rowFromFood) : [];
    };
    api.getFoodMeal(entry.id)
      .then(({ children }) => {
        if (cancelled) return;
        setItems(children.length > 0 ? children.map(rowFromChild) : foodsFallback());
      })
      .catch(() => {
        if (!cancelled) setItems(foodsFallback());
      });
    return () => { cancelled = true; };
  }, [entry.id]);

  const hasTextChanged = editedText.trim() !== (entry.rawText || '').trim();
  const hasNoteChanged = editNote.trim() !== ((entry.tags as any)?.personalNote || '').trim();
  const canSave = (itemsDirty && (items?.length ?? 0) > 0) || hasNoteChanged;

  const displayMacros = items && items.length > 0 && (itemsDirty || hasNewAnalysis)
    ? {
        calories: items.reduce((s, i) => s + (i.calories || 0), 0),
        protein: items.reduce((s, i) => s + (i.protein || 0), 0),
        carbs: items.reduce((s, i) => s + (i.netCarbs || 0), 0),
        fat: items.reduce((s, i) => s + (i.fat || 0), 0),
      }
    : originalMacros;

  const updateRow = (idx: number, updates: Partial<EditRow>) => {
    setItems(prev => {
      if (!prev || !prev[idx]) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
    setItemsDirty(true);
  };

  const handleReanalyze = async () => {
    if (!editedText.trim()) {
      toast.error('Please describe your meal');
      return;
    }
    setIsAnalyzing(true);
    try {
      const result: any = await api.analyzeFoodEntry(editedText);
      const detected = Array.isArray(result.foods_detected) ? result.foods_detected.map(rowFromFood) : [];
      const unresolved = (Array.isArray(result.unresolved) ? result.unresolved : []).map((phrase: string, i: number) =>
        withBases({
          key: `unresolved-${Date.now()}-${i}`,
          name: phrase,
          quantity: 1,
          unit: 'serving',
          calories: 0, protein: 0, fat: 0, totalCarbs: 0, fiber: 0, netCarbs: 0,
          servingWeightGrams: null,
          altMeasures: null,
          source: 'unresolved',
          sourceName: null,
          brand: null,
          unresolved: true,
        }),
      );
      setItems(detected.concat(unresolved));
      setItemsDirty(true);
      setHasNewAnalysis(true);
      if (unresolved.length > 0) {
        toast.warning(`${unresolved.length} item${unresolved.length === 1 ? ' was' : 's were'} not found — enter macros below.`);
      } else {
        toast.success('Macros updated!');
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to re-analyze';
      if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('Not authenticated')) {
        toast.error('Session expired — please log in again.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const currentTags = (entry.tags as Record<string, unknown>) || {};
      const tagsPayload = { ...currentTags, personalNote: editNote.trim() || undefined };

      if (itemsDirty && items && items.length > 0) {
        // Per-item save: replaces child rows and recomputes the parent
        // aggregate server-side, keeping Today's Nutrition in agreement.
        await api.updateFoodMeal(entry.id, {
          items: items.map(row => ({
            childId: row.childId,
            name: row.name.trim() || 'Item',
            quantity: row.quantity,
            unit: row.unit,
            calories: row.calories,
            protein: row.protein,
            fat: row.fat,
            totalCarbs: row.totalCarbs,
            fiber: row.fiber,
            netCarbs: row.netCarbs,
            servingWeightGrams: row.servingWeightGrams,
            altMeasures: row.altMeasures,
            source: row.source,
            sourceName: row.sourceName,
            brand: row.brand,
            unresolved: row.source === 'unresolved' ? true : undefined,
          })),
          rawText: hasNewAnalysis && hasTextChanged ? editedText : undefined,
          tags: tagsPayload,
        });
      } else {
        await api.updateFoodEntry(entry.id, { tags: tagsPayload } as any);
      }

      toast.success('Meal updated');
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.deleteFoodEntry(entry.id);
      toast.success('Meal deleted');
      onDeleted();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const MealEntryIcon = mealIcons[entry.mealType as MealType] || Cookie;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Edit Meal
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <MealEntryIcon className="w-3.5 h-3.5" />
            <span className="truncate">{entry.mealType || 'Meal'}</span>
            <span className="text-muted-foreground shrink-0">
              {format(new Date(entry.eatenAt || entry.timestamp), 'MMM d, h:mm a')}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">What did you eat?</Label>
            <Textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="resize-none min-h-[64px] text-sm"
              placeholder="e.g. 2 eggs, 1 slice sourdough toast, black coffee..."
              maxLength={1000}
            />
            {hasTextChanged && !hasNewAnalysis && (
              <p className="text-xs text-amber-600">Tap "Update Macros" to re-analyze with your changes (replaces the items below)</p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={handleReanalyze}
            disabled={isAnalyzing || !hasTextChanged}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Update Macros'
            )}
          </Button>

          {/* Per-item rows: edit, delete, add — the parent aggregate is
              recomputed on save so meal detail and Today's Nutrition agree. */}
          {items === null ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-xs">Loading items…</span>
            </div>
          ) : items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.key} className="bg-muted/30 rounded-lg p-2.5 relative">
                  <button
                    type="button"
                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                    onClick={() => { setItems(prev => (prev ? prev.filter((_, i) => i !== idx) : prev)); setItemsDirty(true); }}
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2 mb-1.5 pr-6">
                    <Input
                      value={item.name}
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                      placeholder="Item name"
                      className="h-7 text-sm font-medium border-none bg-transparent p-0 focus-visible:ring-0 flex-1 min-w-0"
                    />
                    {item.source === 'unresolved' ? (
                      <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title="Not found in the nutrition database — enter macros below">
                        Not found
                      </span>
                    ) : item.source === 'verified' ? (
                      <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title={`Matched from ${item.sourceName || 'a nutrition database'}`}>
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {item.sourceName || 'Database'}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <button
                      type="button"
                      className="w-6 h-6 rounded-full bg-muted hover:bg-accent flex items-center justify-center text-sm font-medium transition-colors"
                      onClick={() => updateRow(idx, scaleByQuantity(item, Math.max(0.5, (item.quantity || 1) - 0.5)))}
                    >
                      -
                    </button>
                    <span className="text-sm font-medium min-w-[60px] text-center">
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      type="button"
                      className="w-6 h-6 rounded-full bg-muted hover:bg-accent flex items-center justify-center text-sm font-medium transition-colors"
                      onClick={() => updateRow(idx, scaleByQuantity(item, (item.quantity || 1) + 0.5))}
                    >
                      +
                    </button>
                    {isContainerUnit(item.unit) && item.servingWeightGrams != null && item._baseGrams ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        ·
                        <Input
                          type="number"
                          min={1}
                          value={Math.round(item.servingWeightGrams)}
                          aria-label={`Weight of ${item.quantity} ${item.unit} in grams`}
                          className="h-6 w-16 px-1.5 text-xs text-right"
                          onChange={(e) => {
                            const newGrams = parseFloat(e.target.value);
                            if (!Number.isFinite(newGrams) || newGrams <= 0) return;
                            updateRow(idx, scaleByGrams(item, newGrams));
                          }}
                        />
                        g
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    {([
                      { key: 'calories', label: 'Cal', suffix: '' },
                      { key: 'protein', label: 'Pro', suffix: 'g' },
                      { key: 'fat', label: 'Fat', suffix: 'g' },
                      { key: 'netCarbs', label: 'Net C', suffix: 'g' },
                      { key: 'fiber', label: 'Fiber', suffix: 'g' },
                    ] as const).map(({ key, label, suffix }) => (
                      <div key={key}>
                        <div className="text-[10px] text-muted-foreground">{label}</div>
                        <Input
                          type="number"
                          value={item[key]}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const qty = item.quantity || 1;
                            const updates: Partial<EditRow> = { [key]: val } as any;
                            const merged = { ...item, ...updates };
                            if (key === 'netCarbs' || key === 'fiber') {
                              updates.totalCarbs = merged.netCarbs + merged.fiber;
                            }
                            // Keep the per-unit bases (and gram basis) anchored
                            // to hand-edited values so steppers stay consistent
                            const baseKeyMap: Record<string, keyof EditRow> = {
                              calories: '_baseCal', protein: '_basePro', fat: '_baseFat',
                              netCarbs: '_baseNetCarbs', fiber: '_baseFiber',
                            };
                            if (baseKeyMap[key]) {
                              (updates as any)[baseKeyMap[key]] = round1(val / qty);
                            }
                            if (key === 'netCarbs' || key === 'fiber') {
                              updates._baseTotalCarbs = round1((merged.netCarbs + merged.fiber) / qty);
                            }
                            if (item.servingWeightGrams && qty) {
                              updates._baseGrams = item.servingWeightGrams / qty;
                            }
                            if (item.source === 'unresolved') {
                              updates.source = 'manual';
                              updates.unresolved = false;
                            }
                            updateRow(idx, updates);
                          }}
                          className="h-6 text-xs text-center p-0 border-none bg-transparent focus-visible:ring-1 focus-visible:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        {suffix && <span className="text-[9px] text-muted-foreground">{suffix}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="w-full py-2 border border-dashed border-muted-foreground/30 rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1"
                onClick={() => { setItems(prev => [...(prev ?? []), blankRow()]); setItemsDirty(true); }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>
          ) : (
            <div className="text-center space-y-2 py-2">
              <p className="text-xs text-muted-foreground">No individual items recorded for this meal.</p>
              <button
                type="button"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                onClick={() => { setItems([blankRow()]); setItemsDirty(true); }}
              >
                <Plus className="w-3 h-3" />
                Add an item
              </button>
            </div>
          )}

          <div className={cn(
            "grid grid-cols-4 gap-2 text-center rounded-lg p-3",
            (itemsDirty || hasNewAnalysis) ? "bg-green-50 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-900/40" : "bg-muted/50"
          )}>
            <div>
              <div className="text-xs text-muted-foreground">Cals</div>
              <div className="font-bold text-sm">{Math.round(displayMacros.calories)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Protein</div>
              <div className="font-bold text-sm">{Math.round(displayMacros.protein)}g</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Carbs</div>
              <div className="font-bold text-sm">{Math.round(displayMacros.carbs)}g</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Fat</div>
              <div className="font-bold text-sm">{Math.round(displayMacros.fat)}g</div>
            </div>
          </div>
          {itemsDirty && (
            <p className="text-xs text-green-600 text-center">Totals recompute from the items above on save</p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              Personal note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              className="resize-none min-h-[48px] text-sm"
              placeholder="e.g. felt great after this, too heavy before workout..."
              maxLength={300}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {!confirmDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirm Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving || !canSave}>
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

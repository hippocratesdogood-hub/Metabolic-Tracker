import { useState } from 'react';
import { format } from 'date-fns';
import { Coffee, UtensilsCrossed, Moon, Cookie, Loader2, Pencil, Trash2, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

const mealIcons: Record<MealType, any> = {
  Breakfast: Coffee,
  Lunch: UtensilsCrossed,
  Dinner: Moon,
  Snack: Cookie,
};

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
  const [reanalyzedResult, setReanalyzedResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayMacros = reanalyzedResult?.macros || originalMacros;
  const hasTextChanged = editedText.trim() !== (entry.rawText || '').trim();
  const hasNoteChanged = editNote.trim() !== ((entry.tags as any)?.personalNote || '').trim();
  const hasNewAnalysis = reanalyzedResult !== null;
  const canSave = hasNewAnalysis || hasNoteChanged;

  const handleReanalyze = async () => {
    if (!editedText.trim()) {
      toast.error('Please describe your meal');
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await api.analyzeFoodEntry(editedText);
      setReanalyzedResult(result);
      toast.success('Macros updated!');
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
      const updates: any = {};
      const currentTags = (entry.tags as Record<string, unknown>) || {};
      updates.tags = { ...currentTags, personalNote: editNote.trim() || undefined };

      if (hasNewAnalysis) {
        const existingOutput = entry.userCorrectionsJson || entry.aiOutputJson || {};
        updates.rawText = editedText;
        updates.userCorrectionsJson = {
          ...existingOutput,
          macros: reanalyzedResult.macros,
          qualityScore: reanalyzedResult.qualityScore ?? existingOutput.qualityScore,
          notes: reanalyzedResult.notes ?? existingOutput.notes,
          foods_detected: reanalyzedResult.foods_detected ?? existingOutput.foods_detected,
        };
      }

      await api.updateFoodEntry(entry.id, updates);
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
      <DialogContent className="max-w-sm">
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
              className="resize-none min-h-[80px] text-sm"
              placeholder="e.g. 2 eggs, 1 slice sourdough toast, black coffee..."
              maxLength={1000}
            />
            {hasTextChanged && !hasNewAnalysis && (
              <p className="text-xs text-amber-600">Tap "Update Macros" to re-analyze with your changes</p>
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

          <div className={cn(
            "grid grid-cols-4 gap-2 text-center rounded-lg p-3",
            hasNewAnalysis ? "bg-green-50 ring-1 ring-green-200" : "bg-muted/50"
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
          {hasNewAnalysis && (
            <p className="text-xs text-green-600 text-center">Macros updated from AI analysis</p>
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

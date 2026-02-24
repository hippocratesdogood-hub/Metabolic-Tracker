import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Camera, Mic, MicOff, Loader2, CheckCircle2, Coffee, UtensilsCrossed, Moon, Cookie, CalendarIcon, Clock, X, Image, Heart, Pencil, Trash2, Flame, MessageSquare, Plus } from 'lucide-react';
import { format, subDays, startOfDay, isAfter, isBefore, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { DialogFooter } from '@/components/ui/dialog';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

const mealIcons: Record<MealType, any> = {
  Breakfast: Coffee,
  Lunch: UtensilsCrossed,
  Dinner: Moon,
  Snack: Cookie,
};

function suggestMealType(): MealType {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 15) return 'Lunch';
  if (hour >= 15 && hour < 21) return 'Dinner';
  return 'Breakfast';
}

const SERVING_OPTIONS = [0.5, 1, 1.5, 2, 3];

function scaleMacros(macros: any, multiplier: number) {
  if (!macros) return macros;
  return {
    calories: Math.round(macros.calories * multiplier),
    protein: Math.round(macros.protein * multiplier),
    carbs: Math.round(macros.carbs * multiplier),
    fat: Math.round(macros.fat * multiplier),
    fiber: macros.fiber != null ? Math.round(macros.fiber * multiplier) : undefined,
  };
}

function ServingPills({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">Servings:</span>
      {SERVING_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
            value === opt
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          {opt}x
        </button>
      ))}
    </div>
  );
}

function FoodEditModal({
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
      toast.error(err.message || 'Failed to re-analyze');
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
              {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
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
              <div className="font-bold text-sm">{displayMacros.calories}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Protein</div>
              <div className="font-bold text-sm">{displayMacros.protein}g</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Carbs</div>
              <div className="font-bold text-sm">{displayMacros.carbs}g</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Fat</div>
              <div className="font-bold text-sm">{displayMacros.fat}g</div>
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

export default function FoodLog() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const [input, setInput] = useState('');
  const [mealType, setMealType] = useState<MealType>(suggestMealType());
  const [entryDate, setEntryDate] = useState<Date>(new Date());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [personalNote, setPersonalNote] = useState('');
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [consentPending, setConsentPending] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  
  const minDate = subDays(startOfDay(new Date()), 7);
  const maxDate = new Date();

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image is too large. Please use an image under 10MB.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, or WebP).');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSelectedImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.onerror = () => {
      toast.error('Failed to read image. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    setSelectedImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVoiceClick = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast.error('Voice input is not supported on this device. Please type your meal instead.');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      toast.error('Microphone access denied. Please enable microphone in your browser settings.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        toast.info('Listening... Describe your meal');
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }
        
        setInput(finalTranscript || interimTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        
        switch (event.error) {
          case 'not-allowed':
          case 'permission-denied':
            toast.error('Microphone permission denied. Please allow access in Settings.');
            break;
          case 'no-speech':
            toast.info('No speech detected. Tap the mic and try again.');
            break;
          case 'network':
            toast.error('Network error. Please check your connection.');
            break;
          case 'aborted':
            break;
          default:
            toast.error(`Voice error: ${event.error}. Try typing instead.`);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (input.trim()) {
          toast.success('Got it! Tap "Log Meal" to analyze.');
        }
      };

      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      toast.error('Could not start voice input. Please type your meal instead.');
      setIsRecording(false);
    }
  };

  const { data: foodEntries = [], isLoading } = useQuery({
    queryKey: ['food'],
    queryFn: () => api.getFoodEntries(),
    staleTime: 0, // always refetch on mount so data is fresh after login
  });

  const { data: macroProgress } = useQuery({
    queryKey: ['macro-progress'],
    queryFn: () => api.getMacroProgress(),
    staleTime: 0, // always refetch on mount so tallies reflect DB state
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ['food-favorites'],
    queryFn: () => api.getFavorites(),
  });

  const { data: foodStreak } = useQuery({
    queryKey: ['food-streak'],
    queryFn: () => api.getFoodStreak(),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: (id: string) => api.toggleFavorite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-favorites'] });
      queryClient.invalidateQueries({ queryKey: ['food'] });
    },
  });

  const handleUseFavorite = (entry: any) => {
    const macros = entry.userCorrectionsJson?.macros || entry.aiOutputJson?.macros;
    const qualityScore = entry.userCorrectionsJson?.qualityScore || entry.aiOutputJson?.qualityScore;
    const notes = entry.userCorrectionsJson?.notes || entry.aiOutputJson?.notes;
    const foods_detected = entry.userCorrectionsJson?.foods_detected || entry.aiOutputJson?.foods_detected;

    setInput(entry.rawText || '');
    setMealType(entry.mealType as MealType || suggestMealType());
    setAnalysisResult({
      macros,
      qualityScore,
      notes,
      foods_detected,
      confidence: { low: 0.95, high: 0.99 },
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickLog = async (entry: any) => {
    const macros = entry.userCorrectionsJson?.macros || entry.aiOutputJson?.macros;
    if (!macros) {
      handleUseFavorite(entry);
      return;
    }
    try {
      await createFoodMutation.mutateAsync({
        inputType: 'text',
        mealType: entry.mealType || suggestMealType(),
        rawText: entry.rawText || 'Favorite meal',
        timestamp: new Date(),
        aiOutputJson: {
          foods_detected: entry.userCorrectionsJson?.foods_detected || entry.aiOutputJson?.foods_detected,
          macros,
          qualityScore: entry.userCorrectionsJson?.qualityScore || entry.aiOutputJson?.qualityScore,
          notes: entry.userCorrectionsJson?.notes || entry.aiOutputJson?.notes,
        },
      });
    } catch {
      // Error toast handled by mutation onError
    }
  };

  const createFoodMutation = useMutation({
    mutationFn: (entry: any) => api.createFoodEntry(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food'] });
      queryClient.invalidateQueries({ queryKey: ['macro-progress'] });
      queryClient.invalidateQueries({ queryKey: ['food-streak'] });
      toast.success('Meal logged successfully!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to log meal');
    }
  });

  const createMealMutation = useMutation({
    mutationFn: (data: any) => api.createFoodMeal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food'] });
      queryClient.invalidateQueries({ queryKey: ['macro-progress'] });
      queryClient.invalidateQueries({ queryKey: ['food-streak'] });
      toast.success('Meal logged successfully!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to log meal');
    }
  });

  const handleAcceptConsent = async () => {
    setConsentPending(true);
    try {
      await api.acceptAiConsent();
      await refreshUser();
      setShowConsentDialog(false);
      // Proceed with analysis after consent
      doAnalyze();
    } catch (err: any) {
      toast.error('Failed to save consent. Please try again.');
    } finally {
      setConsentPending(false);
    }
  };

  const handleAnalyze = async () => {
    if (!input.trim() && !selectedImage) {
      toast.error('Please add a photo or describe your meal');
      return;
    }

    // Check AI consent before analysis
    if (!user?.aiConsentGiven) {
      setShowConsentDialog(true);
      return;
    }

    doAnalyze();
  };

  const doAnalyze = async () => {
    setIsAnalyzing(true);
    toast.info('Analyzing your meal...');
    
    try {
      let result;
      if (selectedImage && selectedImageFile) {
        result = await api.analyzeFoodImage(selectedImageFile, input || undefined);
      } else if (selectedImage) {
        // Image exists but file was lost - convert back to file
        const response = await fetch(selectedImage);
        const blob = await response.blob();
        const file = new File([blob], 'meal.jpg', { type: 'image/jpeg' });
        result = await api.analyzeFoodImage(file, input || undefined);
      } else {
        result = await api.analyzeFoodEntry(input);
      }
      setAnalysisResult({
        ...result,
        mealType: result.suggestedMealType || mealType,
        hasImage: !!selectedImage,
      });
      // Populate editable items from AI response
      if (result.foods_detected && Array.isArray(result.foods_detected)) {
        setEditableItems(result.foods_detected.map((item: any, i: number) => {
          const qty = item.quantity || 1;
          const cals = item.calories || 0;
          const pro = item.protein || 0;
          const fat = item.fat || 0;
          const tc = item.totalCarbs || item.carbs || 0;
          const fib = item.fiber || 0;
          const nc = item.netCarbs || item.carbs || 0;
          return {
            id: `item-${Date.now()}-${i}`,
            name: item.name || 'Unknown item',
            quantity: qty,
            unit: item.unit || 'serving',
            calories: cals,
            protein: pro,
            fat,
            totalCarbs: tc,
            fiber: fib,
            netCarbs: nc,
            // Per-single-unit base values for scaling when quantity changes
            _baseCal: Math.round(cals / qty),
            _basePro: Math.round((pro / qty) * 10) / 10,
            _baseFat: Math.round((fat / qty) * 10) / 10,
            _baseTotalCarbs: Math.round((tc / qty) * 10) / 10,
            _baseFiber: Math.round((fib / qty) * 10) / 10,
            _baseNetCarbs: Math.round((nc / qty) * 10) / 10,
            confidence: item.confidence || 0.8,
            source: item.source || 'ai_estimate',
            sourceName: item.sourceName || null,
            brand: item.brand || null,
          };
        }));
      }
      if (result.suggestedMealType) {
        setMealType(result.suggestedMealType as MealType);
      }
      toast.success('Analysis complete!');
      // Auto-scroll to analysis results
      setTimeout(() => {
        analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (error: any) {
      console.error('Food analysis error:', error);
      toast.error(error.message || 'Failed to analyze meal. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!analysisResult) return;

    if (editableItems.length > 0) {
      // New flow: save individual items via batch endpoint
      await createMealMutation.mutateAsync({
        items: editableItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          protein: item.protein,
          fat: item.fat,
          totalCarbs: item.totalCarbs,
          fiber: item.fiber,
          netCarbs: item.netCarbs,
          source: item.source || 'ai_estimate',
          brand: item.brand || null,
        })),
        mealType,
        rawText: input || analysisResult.description || 'Photo analysis',
        timestamp: entryDate,
        qualityScore: analysisResult.qualityScore,
        notes: analysisResult.notes,
        inputType: selectedImage ? 'photo' : 'text',
        tags: personalNote.trim() ? { personalNote: personalNote.trim() } : undefined,
      });
    } else {
      // Legacy flow: save as single entry
      const savedMacros = scaleMacros(analysisResult.macros, servingMultiplier);
      await createFoodMutation.mutateAsync({
        inputType: selectedImage ? 'photo' : 'text',
        mealType,
        rawText: input || analysisResult.description || 'Photo analysis',
        timestamp: entryDate,
        aiOutputJson: {
          foods_detected: analysisResult.foods_detected,
          macros: savedMacros,
          qualityScore: analysisResult.qualityScore,
          notes: analysisResult.notes,
        },
        tags: personalNote.trim() ? { personalNote: personalNote.trim() } : undefined,
      });
    }

    setInput('');
    setAnalysisResult(null);
    setEditableItems([]);
    setServingMultiplier(1);
    setPersonalNote('');
    setMealType(suggestMealType());
    setEntryDate(new Date());
    clearImage();
  };
  
  const isBackfill = !isToday(entryDate);

  // Build per-item macro breakdown from today's food entries (for tooltip)
  const macroBreakdown = React.useMemo(() => {
    const todayEntries = foodEntries.filter((e: any) => {
      if (e.parentMealId) return false; // skip children
      return isToday(new Date(e.timestamp));
    });

    type BreakdownItem = { name: string; qty: string; value: number };
    const breakdown: Record<string, BreakdownItem[]> = {
      Calories: [], Protein: [], Fat: [], 'Net Carbs': [], Fiber: [],
    };

    for (const entry of todayEntries) {
      const foods = (entry as any).aiOutputJson?.foods_detected as any[] | undefined;
      const macros = (entry as any).userCorrectionsJson?.macros || (entry as any).aiOutputJson?.macros;

      if (foods && foods.length > 0) {
        for (const item of foods) {
          const name = item.name || 'Unknown';
          const qty = item.quantity && item.unit ? `${item.quantity} ${item.unit}` : '';
          breakdown.Calories.push({ name, qty, value: item.calories || 0 });
          breakdown.Protein.push({ name, qty, value: item.protein || 0 });
          breakdown.Fat.push({ name, qty, value: item.fat || 0 });
          breakdown['Net Carbs'].push({ name, qty, value: item.netCarbs ?? item.carbs ?? 0 });
          breakdown.Fiber.push({ name, qty, value: item.fiber || 0 });
        }
      } else if (macros) {
        // Legacy entry — show as single item
        const name = (entry as any).rawText || 'Meal';
        const qty = '';
        breakdown.Calories.push({ name, qty, value: macros.calories || 0 });
        breakdown.Protein.push({ name, qty, value: macros.protein || 0 });
        breakdown.Fat.push({ name, qty, value: macros.fat || 0 });
        breakdown['Net Carbs'].push({ name, qty, value: macros.netCarbs ?? macros.carbs ?? 0 });
        breakdown.Fiber.push({ name, qty, value: macros.fiber || 0 });
      }
    }

    // Sort each macro's items by contribution (highest first)
    for (const key of Object.keys(breakdown)) {
      breakdown[key].sort((a, b) => b.value - a.value);
    }

    return breakdown;
  }, [foodEntries]);

  const MealIcon = mealIcons[mealType];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">Food Log</h1>
        <p className="text-muted-foreground">Snap a photo or describe your meal.</p>
      </div>

      {macroProgress && (
        <Card className="border-none shadow-md bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">Today's Progress</h3>
              <span className="text-xs text-muted-foreground">{macroProgress.entriesCount} meals logged</span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Calories', consumed: macroProgress.consumed.calories, target: macroProgress.target?.calories || 0, color: 'bg-orange-500', unit: '' },
                { label: 'Protein', consumed: macroProgress.consumed.protein, target: macroProgress.target?.protein || 0, color: 'bg-blue-500', unit: 'g' },
                { label: 'Fat', consumed: macroProgress.consumed.fat, target: macroProgress.target?.fat || 0, color: 'bg-yellow-500', unit: 'g' },
                { label: 'Net Carbs', consumed: macroProgress.consumed.netCarbs ?? macroProgress.consumed.carbs, target: macroProgress.target?.carbs || 0, color: 'bg-red-500', unit: 'g' },
                { label: 'Fiber', consumed: macroProgress.consumed.fiber, target: macroProgress.target?.fiber || 0, color: 'bg-green-500', unit: 'g' },
              ].map(({ label, consumed, target, color, unit }) => {
                const pct = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
                const items = macroBreakdown[label] || [];
                return (
                  <Popover key={label}>
                    <PopoverTrigger asChild>
                      <button type="button" className="w-full text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 rounded">
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground">
                            {Math.round(consumed)}{unit}{target > 0 ? ` / ${target}${unit}` : ''}
                          </span>
                        </div>
                        {target > 0 && (
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500", color)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start" side="bottom">
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold">{label} Breakdown</span>
                          <div className={cn("w-2 h-2 rounded-full", color)} />
                        </div>
                        {items.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No items logged today</p>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {items.map((item, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <div className="flex-1 min-w-0 mr-2">
                                  <span className="font-medium truncate block">{item.name}</span>
                                  {item.qty && <span className="text-muted-foreground text-[10px]">{item.qty}</span>}
                                </div>
                                <span className="font-medium shrink-0">
                                  {Math.round(item.value)}{unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="border-t mt-2 pt-2 flex items-center justify-between text-xs font-semibold">
                          <span>Total</span>
                          <span>{Math.round(consumed)}{unit}{target > 0 ? ` / ${target}${unit}` : ''}</span>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
            {!macroProgress.target && (
              <p className="text-xs text-muted-foreground mt-3 italic">Set macro targets in your profile to see progress bars.</p>
            )}
          </CardContent>
        </Card>
      )}

      {foodStreak && (
        <Card className="border-none shadow-sm bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-950/30 dark:to-amber-950/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <span className="font-medium text-sm">Meal Streak</span>
                {foodStreak.streak > 0 && (
                  <span className="text-xs font-bold text-orange-600">{foodStreak.streak}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {foodStreak.daysLoggedThisWeek}/7 this week
              </span>
            </div>
            <div className="flex justify-between px-2">
              {foodStreak.weekDays.map((day) => {
                const isToday = day.date === new Date().toISOString().split('T')[0];
                return (
                  <div key={day.date} className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground font-medium">{day.dayLabel}</span>
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                      day.logged ? "bg-primary" : "bg-muted",
                      isToday && "ring-2 ring-primary/30"
                    )}>
                      {day.logged && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center italic">
              {foodStreak.message}
            </p>
          </CardContent>
        </Card>
      )}

      {favorites.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
            Favorites
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {favorites.map((fav: any) => {
              const macros = fav.userCorrectionsJson?.macros || fav.aiOutputJson?.macros;
              const FavIcon = mealIcons[fav.mealType as MealType] || Cookie;
              return (
                <div key={fav.id} className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => handleUseFavorite(fav)}
                    className="flex items-center gap-2 px-3 py-2 rounded-l-full border border-r-0 bg-background hover:bg-accent transition-colors text-sm max-w-[180px]"
                  >
                    <FavIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{fav.rawText || 'Meal'}</span>
                    {macros && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{macros.calories} cal</span>
                    )}
                  </button>
                  <button
                    onClick={() => handleQuickLog(fav)}
                    disabled={createFoodMutation.isPending}
                    className="px-2 py-2 rounded-r-full border border-l-0 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                    title="Quick log this meal"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Card className="border-none shadow-md overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                <SelectTrigger className="w-[140px]" aria-label="Select meal type" data-testid="select-meal-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Breakfast">
                    <div className="flex items-center gap-2">
                      <Coffee className="w-4 h-4" />
                      Breakfast
                    </div>
                  </SelectItem>
                  <SelectItem value="Lunch">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="w-4 h-4" />
                      Lunch
                    </div>
                  </SelectItem>
                  <SelectItem value="Dinner">
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      Dinner
                    </div>
                  </SelectItem>
                  <SelectItem value="Snack">
                    <div className="flex items-center gap-2">
                      <Cookie className="w-4 h-4" />
                      Snack
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("gap-2", isBackfill && "border-amber-500 text-amber-600")} data-testid="button-date-picker">
                    <CalendarIcon className="w-4 h-4" />
                    {isToday(entryDate) ? 'Today' : format(entryDate, 'MMM d')}
                    {isBackfill && <Clock className="w-3 h-3" />}
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
                <span className="text-xs text-amber-600 font-medium">Backfilling for {format(entryDate, 'MMM d')}</span>
              )}
            </div>

            <Textarea
              id="food-description"
              placeholder="e.g. 2 eggs, 1 slice sourdough toast, black coffee..."
              className="resize-none min-h-[100px] text-lg bg-transparent border-none focus-visible:ring-0 p-0 placeholder:text-muted-foreground/50"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Describe your meal"
              maxLength={1000}
              data-testid="input-food-description"
            />
            {input.length > 800 && (
              <p className="text-xs text-muted-foreground text-right">
                {input.length}/1000 characters
              </p>
            )}
            
            {selectedImage && (
              <div className="relative mb-4">
                <img 
                  src={selectedImage} 
                  alt="Selected food" 
                  className="w-full max-h-48 object-cover rounded-lg"
                />
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="absolute top-2 right-2 rounded-full w-8 h-8"
                  onClick={clearImage}
                  data-testid="button-clear-image"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  capture="environment"
                  className="hidden"
                  aria-label="Upload photo of your meal"
                  data-testid="input-camera-file"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "rounded-full text-muted-foreground hover:text-primary",
                    selectedImage && "text-primary"
                  )}
                  onClick={handleCameraClick}
                  aria-label={selectedImage ? "Change photo" : "Add photo of your meal"}
                  data-testid="button-camera"
                >
                  {selectedImage ? <Image className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                </Button>
                {hasSpeechRecognition && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "rounded-full text-muted-foreground hover:text-primary",
                      isRecording && "text-red-500 animate-pulse"
                    )}
                    onClick={handleVoiceClick}
                    aria-label={isRecording ? "Stop recording" : "Describe meal with voice"}
                    aria-pressed={isRecording}
                    data-testid="button-voice"
                  >
                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                )}
              </div>
              <Button 
                onClick={handleAnalyze} 
                disabled={(!input.trim() && !selectedImage) || isAnalyzing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6"
                data-testid="button-analyze"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Log Meal'
                )}
              </Button>
            </div>
          </div>

          {analysisResult && (
            <div ref={analysisRef} className="bg-secondary/10 p-4 border-t border-secondary/20 animate-in slide-in-from-top-4 fade-in duration-300">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                    Score: {analysisResult.qualityScore}/100
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {editableItems.length} item{editableItems.length !== 1 ? 's' : ''} detected
                  </span>
                </div>
              </div>

              {/* Editable item cards */}
              {editableItems.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {editableItems.map((item, idx) => (
                    <div key={item.id} className="bg-background rounded-lg p-3 shadow-sm relative">
                      <button
                        type="button"
                        className="absolute top-2 right-2 p-1 rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                        onClick={() => setEditableItems(prev => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex items-center gap-2 mb-1.5 pr-6">
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...editableItems];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setEditableItems(updated);
                          }}
                          className="h-7 text-sm font-medium border-none bg-transparent p-0 focus-visible:ring-0 flex-1 min-w-0"
                        />
                        {item.source === 'verified' ? (
                          <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            AI Est.
                          </span>
                        )}
                      </div>
                      {/* Quantity / serving row */}
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          className="w-6 h-6 rounded-full bg-muted hover:bg-accent flex items-center justify-center text-sm font-medium transition-colors"
                          onClick={() => {
                            const updated = [...editableItems];
                            const newQty = Math.max(0.5, (item.quantity || 1) - 0.5);
                            updated[idx] = {
                              ...updated[idx],
                              quantity: newQty,
                              calories: Math.round(item._baseCal * newQty),
                              protein: Math.round(item._basePro * newQty * 10) / 10,
                              fat: Math.round(item._baseFat * newQty * 10) / 10,
                              totalCarbs: Math.round(item._baseTotalCarbs * newQty * 10) / 10,
                              fiber: Math.round(item._baseFiber * newQty * 10) / 10,
                              netCarbs: Math.round(item._baseNetCarbs * newQty * 10) / 10,
                            };
                            setEditableItems(updated);
                          }}
                        >
                          -
                        </button>
                        <span className="text-sm font-medium min-w-[60px] text-center">
                          {item.quantity} {item.unit}
                        </span>
                        <button
                          type="button"
                          className="w-6 h-6 rounded-full bg-muted hover:bg-accent flex items-center justify-center text-sm font-medium transition-colors"
                          onClick={() => {
                            const updated = [...editableItems];
                            const newQty = (item.quantity || 1) + 0.5;
                            updated[idx] = {
                              ...updated[idx],
                              quantity: newQty,
                              calories: Math.round(item._baseCal * newQty),
                              protein: Math.round(item._basePro * newQty * 10) / 10,
                              fat: Math.round(item._baseFat * newQty * 10) / 10,
                              totalCarbs: Math.round(item._baseTotalCarbs * newQty * 10) / 10,
                              fiber: Math.round(item._baseFiber * newQty * 10) / 10,
                              netCarbs: Math.round(item._baseNetCarbs * newQty * 10) / 10,
                            };
                            setEditableItems(updated);
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 text-center">
                        {[
                          { key: 'calories', label: 'Cal', suffix: '' },
                          { key: 'protein', label: 'Pro', suffix: 'g' },
                          { key: 'fat', label: 'Fat', suffix: 'g' },
                          { key: 'netCarbs', label: 'Net C', suffix: 'g' },
                          { key: 'fiber', label: 'Fiber', suffix: 'g' },
                        ].map(({ key, label, suffix }) => (
                          <div key={key}>
                            <div className="text-[10px] text-muted-foreground">{label}</div>
                            <Input
                              type="number"
                              value={item[key]}
                              onChange={(e) => {
                                const updated = [...editableItems];
                                const val = parseFloat(e.target.value) || 0;
                                const qty = updated[idx].quantity || 1;
                                updated[idx] = { ...updated[idx], [key]: val };
                                if (key === 'netCarbs' || key === 'fiber') {
                                  updated[idx].totalCarbs = updated[idx].netCarbs + updated[idx].fiber;
                                }
                                // Recalculate base value so +/- buttons stay consistent
                                const baseKey = '_base' + key.charAt(0).toUpperCase() + key.slice(1);
                                const baseKeyMap: Record<string, string> = {
                                  calories: '_baseCal', protein: '_basePro', fat: '_baseFat',
                                  netCarbs: '_baseNetCarbs', fiber: '_baseFiber',
                                };
                                if (baseKeyMap[key]) {
                                  updated[idx][baseKeyMap[key]] = Math.round((val / qty) * 10) / 10;
                                }
                                if (key === 'netCarbs' || key === 'fiber') {
                                  updated[idx]._baseTotalCarbs = Math.round(((updated[idx].netCarbs + updated[idx].fiber) / qty) * 10) / 10;
                                }
                                setEditableItems(updated);
                              }}
                              className="h-6 text-xs text-center p-0 border-none bg-transparent focus-visible:ring-1 focus-visible:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            {suffix && <span className="text-[9px] text-muted-foreground">{suffix}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Add item button */}
                  <button
                    type="button"
                    className="w-full py-2 border border-dashed border-muted-foreground/30 rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1"
                    onClick={() => setEditableItems(prev => [...prev, {
                      id: `item-${Date.now()}`,
                      name: '',
                      quantity: 1,
                      unit: 'serving',
                      calories: 0,
                      protein: 0,
                      fat: 0,
                      totalCarbs: 0,
                      fiber: 0,
                      netCarbs: 0,
                      _baseCal: 0,
                      _basePro: 0,
                      _baseFat: 0,
                      _baseTotalCarbs: 0,
                      _baseFiber: 0,
                      _baseNetCarbs: 0,
                    }])}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>

                  {/* Running totals */}
                  <div className="grid grid-cols-5 gap-1.5 text-center bg-muted/50 rounded-lg p-2">
                    {[
                      { label: 'Cal', value: editableItems.reduce((s, i) => s + (i.calories || 0), 0), suffix: '' },
                      { label: 'Pro', value: editableItems.reduce((s, i) => s + (i.protein || 0), 0), suffix: 'g' },
                      { label: 'Fat', value: editableItems.reduce((s, i) => s + (i.fat || 0), 0), suffix: 'g' },
                      { label: 'Net C', value: editableItems.reduce((s, i) => s + (i.netCarbs || 0), 0), suffix: 'g' },
                      { label: 'Fiber', value: editableItems.reduce((s, i) => s + (i.fiber || 0), 0), suffix: 'g' },
                    ].map(({ label, value, suffix }) => (
                      <div key={label}>
                        <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
                        <div className="font-bold text-sm">{Math.round(value)}{suffix}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Legacy display for entries without per-item data */
                (() => {
                  const displayMacros = scaleMacros(analysisResult.macros, servingMultiplier);
                  return (
                    <>
                      <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                        <div className="bg-background rounded-lg p-2 shadow-sm">
                          <div className="text-xs text-muted-foreground font-medium">Cals</div>
                          <div className="font-bold">{displayMacros?.calories || 0}</div>
                        </div>
                        <div className="bg-background rounded-lg p-2 shadow-sm">
                          <div className="text-xs text-muted-foreground font-medium">Protein</div>
                          <div className="font-bold">{displayMacros?.protein || 0}g</div>
                        </div>
                        <div className="bg-background rounded-lg p-2 shadow-sm">
                          <div className="text-xs text-muted-foreground font-medium">Carbs</div>
                          <div className="font-bold">{displayMacros?.carbs || 0}g</div>
                        </div>
                        <div className="bg-background rounded-lg p-2 shadow-sm">
                          <div className="text-xs text-muted-foreground font-medium">Fat</div>
                          <div className="font-bold">{displayMacros?.fat || 0}g</div>
                        </div>
                      </div>
                      <div className="mb-4">
                        <ServingPills value={servingMultiplier} onChange={setServingMultiplier} />
                      </div>
                    </>
                  );
                })()
              )}

              {analysisResult.notes && (
                <p className="text-sm text-muted-foreground italic mb-3">
                  "{analysisResult.notes}"
                </p>
              )}

              <div className="mb-4">
                <Textarea
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  className="resize-none min-h-[40px] text-sm bg-background/50"
                  placeholder="Add a personal note (optional)... e.g. felt great after this"
                  maxLength={300}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setAnalysisResult(null); setEditableItems([]); }} data-testid="button-edit">Edit</Button>
                <Button
                  onClick={handleSave}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={createFoodMutation.isPending || createMealMutation.isPending || editableItems.length === 0 && !analysisResult.macros}
                  data-testid="button-confirm"
                >
                  {(createFoodMutation.isPending || createMealMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Confirm Log
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="font-heading font-semibold text-lg">Recent Meals</h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : foodEntries.filter((e: any) => !e.parentMealId).length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="p-8 text-center text-muted-foreground">
              No meals logged yet. Start by describing what you ate above!
            </CardContent>
          </Card>
        ) : (
          foodEntries.filter((e: any) => !e.parentMealId).map((entry: any) => {
            const macros = entry.userCorrectionsJson?.macros || entry.aiOutputJson?.macros;
            const qualityScore = entry.userCorrectionsJson?.qualityScore || entry.aiOutputJson?.qualityScore;
            const notes = entry.userCorrectionsJson?.notes || entry.aiOutputJson?.notes;
            const foodsDetected = entry.aiOutputJson?.foods_detected as any[] | undefined;
            const personalNoteText = (entry.tags as any)?.personalNote;
            const MealEntryIcon = mealIcons[entry.mealType as MealType] || Cookie;
            const isFavorite = !!(entry.tags as any)?.isFavorite;

            return (
              <Card key={entry.id} className="border-none shadow-sm cursor-pointer hover:shadow-md transition-shadow" data-testid={`card-food-${entry.id}`} onClick={() => setEditingEntry(entry)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
                      qualityScore >= 90 ? "bg-green-100 text-green-700" :
                      qualityScore >= 70 ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {qualityScore || '--'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MealEntryIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{entry.rawText || 'Food entry'}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {format(new Date(entry.timestamp), 'h:mm a')}
                        </span>
                      </div>
                      {foodsDetected && foodsDetected.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {foodsDetected.slice(0, 5).map((item: any, i: number) => (
                            <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                              {item.name}
                            </span>
                          ))}
                          {foodsDetected.length > 5 && (
                            <span className="text-[10px] text-muted-foreground">+{foodsDetected.length - 5} more</span>
                          )}
                        </div>
                      )}
                      {notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notes}
                        </p>
                      )}
                      {personalNoteText && (
                        <p className="text-xs text-muted-foreground/70 mt-1 italic flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 shrink-0" />
                          <span className="line-clamp-1">{personalNoteText}</span>
                        </p>
                      )}
                      {macros && (
                        <div className="flex gap-3 mt-2 text-xs font-medium text-muted-foreground">
                          <span>{macros.calories} cal</span>
                          <span>{macros.protein}g P</span>
                          <span>{macros.fat}g F</span>
                          <span>{macros.netCarbs ?? macros.carbs}g C</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate(entry.id); }}
                      className="shrink-0 p-1.5 rounded-full hover:bg-accent transition-colors"
                      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart className={cn(
                        "w-4 h-4 transition-colors",
                        isFavorite ? "text-rose-500 fill-rose-500" : "text-muted-foreground/40 hover:text-rose-400"
                      )} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {editingEntry && (
        <FoodEditModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null);
            queryClient.invalidateQueries({ queryKey: ['food'] });
            queryClient.invalidateQueries({ queryKey: ['macro-progress'] });
            queryClient.invalidateQueries({ queryKey: ['food-favorites'] });
            queryClient.invalidateQueries({ queryKey: ['food-streak'] });
          }}
          onDeleted={() => {
            setEditingEntry(null);
            queryClient.invalidateQueries({ queryKey: ['food'] });
            queryClient.invalidateQueries({ queryKey: ['macro-progress'] });
            queryClient.invalidateQueries({ queryKey: ['food-favorites'] });
            queryClient.invalidateQueries({ queryKey: ['food-streak'] });
          }}
        />
      )}

      <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>AI-Powered Meal Analysis</DialogTitle>
            <DialogDescription>
              This feature uses AI to estimate nutritional content from your meal descriptions and photos.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2 py-2">
            <p>Your food descriptions and photos will be sent to OpenAI's API for analysis. This means:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Meal text and images are processed by a third-party AI service</li>
              <li>Data is sent securely and not used to train AI models</li>
              <li>No personal identifiers are included in the requests</li>
            </ul>
            <p>You can skip AI analysis and enter nutritional data manually at any time.</p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConsentDialog(false)}>
              No Thanks
            </Button>
            <Button onClick={handleAcceptConsent} disabled={consentPending}>
              {consentPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                'I Agree'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

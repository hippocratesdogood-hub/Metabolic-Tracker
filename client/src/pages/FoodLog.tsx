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
import { Camera, Mic, MicOff, Loader2, CheckCircle2, Coffee, UtensilsCrossed, Moon, Cookie, CalendarIcon, Clock, X, Image, Heart, Pencil, Trash2, Flame, MessageSquare, Plus, ScanBarcode, ChefHat, ClipboardList } from 'lucide-react';
import BarcodeScannerModal, { type ScannedFoodItem } from '@/components/BarcodeScannerModal';
import RecipeBuilderModal from '@/components/RecipeBuilderModal';
import ManualMacroEntryModal from '@/components/ManualMacroEntryModal';
import FoodEditModal from '@/components/FoodEditModal';
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

/**
 * Seed the entry timestamp for a Day View deep link (`/food?date=YYYY-MM-DD`).
 * Logging for today uses the real current time; backfilling a past day uses a
 * meal-type-appropriate hour so timestamps don't all cluster at midnight
 * (which corrupts time-of-day clinical patterns). See BACKLOG item 6.
 */
function seedDeepLinkDate(dateStr: string, mealType: MealType): Date {
  const todayStr = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
  if (dateStr === todayStr) return new Date();
  const seeded = new Date(`${dateStr}T00:00:00`); // local midnight of that day
  switch (mealType) {
    case 'Breakfast': seeded.setHours(8, 0, 0, 0); break;
    case 'Lunch': seeded.setHours(12, 30, 0, 0); break;
    case 'Dinner': seeded.setHours(18, 30, 0, 0); break;
    case 'Snack': default: {
      const now = new Date();
      seeded.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }
  }
  return seeded;
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
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [consentPending, setConsentPending] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [recipeBuilderOpen, setRecipeBuilderOpen] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  // True after an AI-unavailable (503 AI_UNAVAILABLE) analyze attempt —
  // drives the inline non-AI logging affordances (D4). Cleared on a fresh
  // analyze attempt and after a successful save.
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const favoritesRef = useRef<HTMLDivElement>(null);
  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Read ?mealType= and ?date= once on mount so the Day View can deep-link
  // into a pre-filled add-food form. Defensive: ignore unknown values.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const mt = sp.get('mealType');
    const validMealType = mt && (['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const).includes(mt as MealType)
      ? (mt as MealType)
      : null;
    if (validMealType) {
      setMealType(validMealType);
    }
    const dt = sp.get('date');
    if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      // Anchor the time to now (today) or a meal-appropriate hour (past day)
      // so backfilled meals don't default to midnight. See BACKLOG item 6.
      const seeded = seedDeepLinkDate(dt, validMealType ?? suggestMealType());
      if (!isNaN(seeded.getTime())) setEntryDate(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          toast.success('Got it! Tap "Analyze Meal" to continue.');
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

    setAiUnavailable(false);
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
    setAiUnavailable(false);
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
        mealType: mealType,
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
      // Don't override user's meal type selection with AI suggestion
      toast.success('Analysis complete!');
      // Auto-scroll to analysis results
      setTimeout(() => {
        analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (error: any) {
      console.error('Food analysis error:', error);
      if (error?.code === 'AI_UNAVAILABLE') {
        // Patient-appropriate copy + surface the non-AI logging paths
        // inline (D2/D4). Never expose the server message, status, or
        // env/vendor internals here.
        setAiUnavailable(true);
        toast.error('Automatic meal analysis is temporarily unavailable. You can still log this meal — pick from your favorites, scan a barcode, or enter macros manually below.');
      } else {
        toast.error('Something went wrong analyzing your meal');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    // Decoupled from analysisResult (spec B1): a meal can be saved with no
    // AI analysis at all. The primary no-AI macro path is the manual-entry
    // modal (which saves directly); this branch is the safety net so the
    // inline Confirm Log flow never silently no-ops.

    // Clear previous coaching message before saving new meal
    setCoachingMessage(null);

    let newCoachingMessage: string | null = null;

    if (editableItems.length > 0) {
      // New flow: save individual items via batch endpoint
      const result = await createMealMutation.mutateAsync({
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
        rawText: input || analysisResult?.description || 'Photo analysis',
        timestamp: entryDate,
        eaten_at: entryDate.toISOString(),
        qualityScore: analysisResult?.qualityScore,
        notes: analysisResult?.notes,
        inputType: selectedImage ? 'photo' : 'text',
        tags: personalNote.trim() ? { personalNote: personalNote.trim() } : undefined,
      });
      newCoachingMessage = result.coachingMessage;
    } else if (analysisResult) {
      // Legacy flow: save as single entry
      const savedMacros = scaleMacros(analysisResult.macros, servingMultiplier);
      const result = await createFoodMutation.mutateAsync({
        inputType: selectedImage ? 'photo' : 'text',
        mealType,
        rawText: input || analysisResult.description || 'Photo analysis',
        timestamp: entryDate,
        eaten_at: entryDate.toISOString(),
        aiOutputJson: {
          foods_detected: analysisResult.foods_detected,
          macros: savedMacros,
          qualityScore: analysisResult.qualityScore,
          notes: analysisResult.notes,
        },
        tags: personalNote.trim() ? { personalNote: personalNote.trim() } : undefined,
      });
      newCoachingMessage = (result as any).coachingMessage ?? null;
    } else {
      // No analysis and no items — log the meal "unanalyzed" so it is
      // never lost (spec B1). Both jsonb fields stay null; it shows in
      // Day View with no macro contribution and no pending badge (B3).
      if (!input.trim()) {
        toast.error('Add a description, or use Favorites, a barcode, or manual macros');
        return;
      }
      const result = await createFoodMutation.mutateAsync({
        inputType: selectedImage ? 'photo' : 'text',
        mealType,
        rawText: input,
        timestamp: entryDate,
        eaten_at: entryDate.toISOString(),
        tags: personalNote.trim() ? { personalNote: personalNote.trim() } : undefined,
      });
      newCoachingMessage = (result as any).coachingMessage ?? null;
    }

    setInput('');
    setAnalysisResult(null);
    setAiUnavailable(false);
    setEditableItems([]);
    setServingMultiplier(1);
    setPersonalNote('');
    setMealType(suggestMealType());
    setEntryDate(new Date());
    clearImage();

    // Set new coaching message after form reset
    if (newCoachingMessage) {
      setCoachingMessage(newCoachingMessage);
    }
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
                // Use local date (YYYY-MM-DD) to match server's timezone-aware dates
                const isToday = day.date === new Date().toLocaleDateString("en-CA");
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
        <div className="space-y-2" ref={favoritesRef}>
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
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(macros.calories)} cal</span>
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
                    {isToday(entryDate) ? `Today ${format(entryDate, 'h:mm a')}` : format(entryDate, 'MMM d, h:mm a')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={entryDate}
                    onSelect={(date) => {
                      if (!date) return;
                      // Preserve the current time when changing the date
                      date.setHours(entryDate.getHours(), entryDate.getMinutes());
                      setEntryDate(new Date(date));
                    }}
                    disabled={(date) => isBefore(date, minDate) || isAfter(date, maxDate)}
                    initialFocus
                  />
                  <div className="px-3 py-2 border-t flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Input
                      type="time"
                      className="w-auto h-8 text-sm"
                      value={format(entryDate, 'HH:mm')}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        const updated = new Date(entryDate);
                        updated.setHours(h || 0, m || 0);
                        setEntryDate(updated);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">Meal time</span>
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
                    "rounded-full text-muted-foreground hover:text-primary h-11 w-11",
                    selectedImage && "text-primary"
                  )}
                  onClick={handleCameraClick}
                  aria-label={selectedImage ? "Change photo" : "Add photo of your meal"}
                  data-testid="button-camera"
                >
                  {selectedImage ? <Image className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                </Button>
                {hasSpeechRecognition && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "rounded-full text-muted-foreground hover:text-primary h-11 w-11",
                      isRecording && "text-red-500 animate-pulse"
                    )}
                    onClick={handleVoiceClick}
                    aria-label={isRecording ? "Stop recording" : "Describe meal with voice"}
                    aria-pressed={isRecording}
                    data-testid="button-voice"
                  >
                    {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-muted-foreground hover:text-primary h-11 w-11"
                  onClick={() => setBarcodeScannerOpen(true)}
                  aria-label="Scan barcode"
                  data-testid="button-barcode"
                >
                  <ScanBarcode className="w-6 h-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-muted-foreground hover:text-primary h-11 w-11"
                  onClick={() => setRecipeBuilderOpen(true)}
                  aria-label="Build a meal from recipe"
                  data-testid="button-recipe"
                >
                  <ChefHat className="w-6 h-6" />
                </Button>
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
                  'Analyze Meal'
                )}
              </Button>
            </div>

            {/* AI-unavailable inline affordances (spec D4). Shown only after
                an AI_UNAVAILABLE analyze attempt; surfaces the non-AI paths
                right where the patient is, not just in the toast. */}
            {aiUnavailable && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/20 p-3 space-y-2.5">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Automatic meal analysis is temporarily unavailable. You can still log this meal:
                </p>
                <div className="flex flex-wrap gap-2">
                  {favorites.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => favoritesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      data-testid="button-aiunavail-favorites"
                    >
                      <Heart className="w-4 h-4 mr-1.5 text-rose-500" />
                      Log from Favorites
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBarcodeScannerOpen(true)}
                    data-testid="button-aiunavail-barcode"
                  >
                    <ScanBarcode className="w-4 h-4 mr-1.5" />
                    Scan barcode
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualEntryOpen(true)}
                    data-testid="button-aiunavail-manual"
                  >
                    <ClipboardList className="w-4 h-4 mr-1.5" />
                    Enter macros manually
                  </Button>
                </div>
              </div>
            )}

            {/* Manual macro entry — first-class, always available (spec B2 /
                §8.4), not a fallback-only path. Hidden only while the richer
                AI-unavailable panel above already offers it. */}
            {!aiUnavailable && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setManualEntryOpen(true)}
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 transition-colors"
                  data-testid="button-manual-entry"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Enter macros manually
                </button>
              </div>
            )}
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

      {/* Coaching Message — shown after meal save */}
      {coachingMessage && (
        <Card className={cn(
          "border shadow-sm",
          coachingMessage.includes("Dr. Larson")
            ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/20"
            : "border-primary/20 bg-primary/5 dark:bg-primary/5"
        )}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={cn(
              "mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0",
              coachingMessage.includes("Dr. Larson")
                ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                : "bg-primary/10 text-primary"
            )}>
              <MessageSquare className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Coach</p>
              <p className="text-sm leading-relaxed">{coachingMessage}</p>
            </div>
          </CardContent>
        </Card>
      )}

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
                        {editingTimeId === entry.id ? (
                          <Input
                            type="time"
                            className="w-[100px] h-6 text-xs px-1"
                            defaultValue={format(new Date(entry.eatenAt || entry.timestamp), 'HH:mm')}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onBlur={async (e) => {
                              setEditingTimeId(null);
                              const [h, m] = e.target.value.split(':').map(Number);
                              const original = new Date(entry.eatenAt || entry.timestamp);
                              const updated = new Date(original);
                              updated.setHours(h || 0, m || 0);
                              if (updated.getTime() !== original.getTime()) {
                                try {
                                  await api.updateEatenAt(entry.id, updated);
                                  queryClient.invalidateQueries({ queryKey: ['food'] });
                                } catch { /* silent */ }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') setEditingTimeId(null);
                            }}
                          />
                        ) : (
                          <button
                            className="text-xs text-muted-foreground whitespace-nowrap shrink-0 hover:text-primary hover:underline cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setEditingTimeId(entry.id); }}
                            title="Click to edit meal time"
                          >
                            {(() => { const d = new Date(entry.eatenAt || entry.timestamp); return isToday(d) ? format(d, 'h:mm a') : format(d, 'MMM d, h:mm a'); })()}
                          </button>
                        )}
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
                          <span>{Math.round(macros.calories)} cal</span>
                          <span>{Math.round(macros.protein)}g P</span>
                          <span>{Math.round(macros.fat)}g F</span>
                          <span>{Math.round(macros.netCarbs ?? macros.carbs)}g C</span>
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
            <p>Your food descriptions and photos will be sent to a third-party AI analysis service. This means:</p>
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

      <BarcodeScannerModal
        isOpen={barcodeScannerOpen}
        onClose={() => setBarcodeScannerOpen(false)}
        onItemFound={(item) => {
          setAiUnavailable(false);
          // Add scanned item to editable items list
          setEditableItems(prev => [...prev, item]);
          // If no analysis result yet, create a minimal one so the items section renders
          if (!analysisResult) {
            setAnalysisResult({
              foods_detected: [],
              macros: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
              qualityScore: 100,
              notes: 'Items added via barcode scan',
            });
          }
        }}
      />

      <RecipeBuilderModal
        isOpen={recipeBuilderOpen}
        onClose={() => setRecipeBuilderOpen(false)}
        onMealLogged={() => {
          queryClient.invalidateQueries({ queryKey: ['food'] });
          queryClient.invalidateQueries({ queryKey: ['food-streak'] });
        }}
      />

      <ManualMacroEntryModal
        isOpen={manualEntryOpen}
        onClose={() => setManualEntryOpen(false)}
        defaultMealType={mealType}
        defaultDate={entryDate}
        onLogged={() => {
          setAiUnavailable(false);
          queryClient.invalidateQueries({ queryKey: ['food'] });
          queryClient.invalidateQueries({ queryKey: ['macro-progress'] });
          queryClient.invalidateQueries({ queryKey: ['food-streak'] });
        }}
      />
    </div>
  );
}

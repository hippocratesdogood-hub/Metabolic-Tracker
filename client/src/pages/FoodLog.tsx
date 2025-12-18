import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Camera, Mic, Loader2, CheckCircle2, Coffee, UtensilsCrossed, Moon, Cookie, CalendarIcon, Clock } from 'lucide-react';
import { format, subDays, startOfDay, isAfter, isBefore, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

const mealIcons: Record<MealType, any> = {
  Breakfast: Coffee,
  Lunch: UtensilsCrossed,
  Dinner: Moon,
  Snack: Cookie,
};

function suggestMealType(): MealType {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return 'Breakfast';
  if (hour >= 10 && hour < 14) return 'Lunch';
  if (hour >= 17 && hour < 21) return 'Dinner';
  return 'Snack';
}

export default function FoodLog() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [mealType, setMealType] = useState<MealType>(suggestMealType());
  const [entryDate, setEntryDate] = useState<Date>(new Date());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  
  const minDate = subDays(startOfDay(new Date()), 7);
  const maxDate = new Date();

  const { data: foodEntries = [], isLoading } = useQuery({
    queryKey: ['food'],
    queryFn: () => api.getFoodEntries(),
  });

  const { data: macroProgress } = useQuery({
    queryKey: ['macro-progress'],
    queryFn: () => api.getMacroProgress(),
  });

  const createFoodMutation = useMutation({
    mutationFn: (entry: any) => api.createFoodEntry(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food'] });
      queryClient.invalidateQueries({ queryKey: ['macro-progress'] });
      toast.success('Meal logged successfully!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to log meal');
    }
  });

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    
    try {
      const result = await api.analyzeFoodEntry(input);
      setAnalysisResult({
        ...result,
        mealType: result.suggestedMealType || mealType,
      });
      if (result.suggestedMealType) {
        setMealType(result.suggestedMealType as MealType);
      }
    } catch (error: any) {
      toast.error('Failed to analyze meal');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!analysisResult) return;
    
    await createFoodMutation.mutateAsync({
      inputType: 'text',
      mealType,
      rawText: input,
      timestamp: entryDate,
      aiOutputJson: {
        foods_detected: analysisResult.foods_detected,
        macros: analysisResult.macros,
        qualityScore: analysisResult.qualityScore,
        notes: analysisResult.notes,
      },
    });
    
    setInput('');
    setAnalysisResult(null);
    setMealType(suggestMealType());
    setEntryDate(new Date());
  };
  
  const isBackfill = !isToday(entryDate);

  const MealIcon = mealIcons[mealType];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">Food Log</h1>
        <p className="text-muted-foreground">Snap a photo or describe your meal.</p>
      </div>

      {macroProgress?.target && (
        <Card className="border-none shadow-md bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">Today's Progress</h3>
              <span className="text-xs text-muted-foreground">{macroProgress.entriesCount} meals logged</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Protein</div>
                <div className="font-bold text-primary">{macroProgress.consumed.protein}g</div>
                <div className="text-xs text-muted-foreground">/ {macroProgress.target.protein || 0}g</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Carbs</div>
                <div className="font-bold text-primary">{macroProgress.consumed.carbs}g</div>
                <div className="text-xs text-muted-foreground">/ {macroProgress.target.carbs || 0}g</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Fat</div>
                <div className="font-bold text-primary">{macroProgress.consumed.fat}g</div>
                <div className="text-xs text-muted-foreground">/ {macroProgress.target.fat || 0}g</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Calories</div>
                <div className="font-bold text-primary">{macroProgress.consumed.calories}</div>
                <div className="text-xs text-muted-foreground">/ {macroProgress.target.calories || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-md overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                <SelectTrigger className="w-[140px]" data-testid="select-meal-type">
                  <div className="flex items-center gap-2">
                    <MealIcon className="w-4 h-4" />
                    <SelectValue />
                  </div>
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
              placeholder="e.g. 2 eggs, 1 slice sourdough toast, black coffee..." 
              className="resize-none min-h-[100px] text-lg bg-transparent border-none focus-visible:ring-0 p-0 placeholder:text-muted-foreground/50"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              data-testid="input-food-description"
            />
            
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary" data-testid="button-camera">
                  <Camera className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary" data-testid="button-voice">
                  <Mic className="w-5 h-5" />
                </Button>
              </div>
              <Button 
                onClick={handleAnalyze} 
                disabled={!input.trim() || isAnalyzing}
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
            <div className="bg-secondary/10 p-4 border-t border-secondary/20 animate-in slide-in-from-top-4 fade-in duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                    Score: {analysisResult.qualityScore}/100
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Confidence: {Math.round((analysisResult.confidence?.low || 0.7) * 100)}-{Math.round((analysisResult.confidence?.high || 0.9) * 100)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Cals</div>
                  <div className="font-bold">{analysisResult.macros.calories}</div>
                </div>
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Protein</div>
                  <div className="font-bold">{analysisResult.macros.protein}g</div>
                </div>
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Carbs</div>
                  <div className="font-bold">{analysisResult.macros.carbs}g</div>
                </div>
                <div className="bg-background rounded-lg p-2 shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium">Fat</div>
                  <div className="font-bold">{analysisResult.macros.fat}g</div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground italic mb-4">
                "{analysisResult.notes}"
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAnalysisResult(null)} data-testid="button-edit">Edit</Button>
                <Button 
                  onClick={handleSave} 
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={createFoodMutation.isPending}
                  data-testid="button-confirm"
                >
                  {createFoodMutation.isPending ? (
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
        ) : foodEntries.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="p-8 text-center text-muted-foreground">
              No meals logged yet. Start by describing what you ate above!
            </CardContent>
          </Card>
        ) : (
          foodEntries.map((entry: any) => {
            const macros = entry.userCorrectionsJson?.macros || entry.aiOutputJson?.macros;
            const qualityScore = entry.userCorrectionsJson?.qualityScore || entry.aiOutputJson?.qualityScore;
            const notes = entry.userCorrectionsJson?.notes || entry.aiOutputJson?.notes;
            const MealEntryIcon = mealIcons[entry.mealType as MealType] || Cookie;
            
            return (
              <Card key={entry.id} className="border-none shadow-sm" data-testid={`card-food-${entry.id}`}>
                <CardContent className="p-4 flex gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
                    qualityScore >= 90 ? "bg-green-100 text-green-700" :
                    qualityScore >= 70 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {qualityScore || '--'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <MealEntryIcon className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium truncate">{entry.rawText || 'Food entry'}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.timestamp), 'h:mm a')}
                      </span>
                    </div>
                    {notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {notes}
                      </p>
                    )}
                    {macros && (
                      <div className="flex gap-3 mt-2 text-xs font-medium text-muted-foreground">
                        <span>{macros.protein}g P</span>
                        <span>{macros.carbs}g C</span>
                        <span>{macros.fat}g F</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Search, ChefHat, X, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecipeIngredient {
  foodName: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutritionixFoodId?: string | null;
}

interface SavedRecipe {
  id: string;
  name: string;
  totalServings: string;
  ingredients: Array<{
    id: string;
    foodName: string;
    quantity: string;
    unit: string | null;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
  }>;
  totalMacros: { calories: number; protein: number; carbs: number; fat: number };
  perServingMacros: { calories: number; protein: number; carbs: number; fat: number };
}

interface RecipeBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMealLogged: () => void;
}

export default function RecipeBuilderModal({ isOpen, onClose, onMealLogged }: RecipeBuilderModalProps) {
  // Build tab state
  const [recipeName, setRecipeName] = useState('');
  const [totalServings, setTotalServings] = useState(1);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQty, setSearchQty] = useState(1);
  const [searchUnit, setSearchUnit] = useState('serving');
  const [isLooking, setIsLooking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingBuilt, setIsLoggingBuilt] = useState(false);
  const [buildServingsToLog, setBuildServingsToLog] = useState(1);

  // My Recipes tab state
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [servingsByRecipe, setServingsByRecipe] = useState<Record<string, number>>({});
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Active tab
  const [tab, setTab] = useState<'build' | 'saved'>('build');

  // Reset build form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRecipeName('');
      setTotalServings(1);
      setIngredients([]);
      setSearchQuery('');
      setSearchQty(1);
      setSearchUnit('serving');
      setBuildServingsToLog(1);
      setTab('build');
      setExpandedId(null);
    }
  }, [isOpen]);

  // Load saved recipes when the "My Recipes" tab opens
  useEffect(() => {
    if (isOpen && tab === 'saved') {
      loadSavedRecipes();
    }
  }, [isOpen, tab]);

  const loadSavedRecipes = async () => {
    setIsLoadingRecipes(true);
    try {
      const data = await api.getRecipes();
      setSavedRecipes(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load recipes');
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  // ── Build tab actions ──
  const addIngredient = async () => {
    if (!searchQuery.trim()) {
      toast.error('Enter a food name');
      return;
    }
    setIsLooking(true);
    try {
      const result = await api.lookupNutrition(searchQuery.trim(), searchQty, searchUnit);
      setIngredients(prev => [
        ...prev,
        {
          foodName: searchQuery.trim(),
          quantity: searchQty,
          unit: searchUnit,
          calories: result.calories || 0,
          protein: result.protein || 0,
          carbs: result.netCarbs ?? result.totalCarbs ?? 0,
          fat: result.fat || 0,
        },
      ]);
      setSearchQuery('');
      setSearchQty(1);
      setSearchUnit('serving');
      toast.success('Ingredient added');
    } catch (err: any) {
      const msg = err.message || 'Lookup failed';
      if (msg.includes('404') || msg.includes('No nutrition')) {
        toast.error('No match found for that food — try a different name');
      } else if (msg.includes('429') || msg.includes('rate')) {
        toast.error('Nutrition search is busy — wait a moment and try again');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsLooking(false);
    }
  };

  const removeIngredient = (index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  // Live totals
  const totalMacros = ingredients.reduce(
    (acc, i) => {
      acc.calories += i.calories;
      acc.protein += i.protein;
      acc.carbs += i.carbs;
      acc.fat += i.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const perServing = {
    calories: totalMacros.calories / (totalServings || 1),
    protein: totalMacros.protein / (totalServings || 1),
    carbs: totalMacros.carbs / (totalServings || 1),
    fat: totalMacros.fat / (totalServings || 1),
  };

  const canBuildSave = recipeName.trim().length > 0 && ingredients.length > 0 && totalServings > 0;

  const handleSaveRecipe = async (): Promise<string | null> => {
    if (!canBuildSave) return null;
    setIsSaving(true);
    try {
      const saved = await api.createRecipe({
        name: recipeName.trim(),
        totalServings,
        ingredients,
      });
      toast.success(`Recipe "${recipeName.trim()}" saved`);
      return saved?.id || null;
    } catch (err: any) {
      toast.error(err.message || 'Failed to save recipe');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogBuiltRecipe = async () => {
    if (!canBuildSave) return;
    setIsLoggingBuilt(true);
    try {
      // Save first so we can log it via recipeId (and it's saved for reuse)
      const saved = await api.createRecipe({
        name: recipeName.trim(),
        totalServings,
        ingredients,
      });
      if (!saved?.id) throw new Error('Recipe save did not return an id');

      // Log the requested servings
      await api.logRecipeAsMeal({
        recipeId: saved.id,
        servingsEaten: buildServingsToLog,
        mealType: suggestMealType(),
      });

      toast.success(`Logged ${buildServingsToLog} serving${buildServingsToLog === 1 ? '' : 's'} of "${recipeName.trim()}"`);
      onMealLogged();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to log recipe');
    } finally {
      setIsLoggingBuilt(false);
    }
  };

  // ── My Recipes tab actions ──
  const handleLogSaved = async (recipe: SavedRecipe) => {
    const servings = servingsByRecipe[recipe.id] || 1;
    setLoggingId(recipe.id);
    try {
      await api.logRecipeAsMeal({
        recipeId: recipe.id,
        servingsEaten: servings,
        mealType: suggestMealType(),
      });
      toast.success(`Logged ${servings} serving${servings === 1 ? '' : 's'} of "${recipe.name}"`);
      onMealLogged();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to log recipe');
    } finally {
      setLoggingId(null);
    }
  };

  const handleDeleteSaved = async (recipeId: string) => {
    setDeletingId(recipeId);
    try {
      await api.deleteRecipe(recipeId);
      toast.success('Recipe deleted');
      setSavedRecipes(prev => prev.filter(r => r.id !== recipeId));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete recipe');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="w-5 h-5" />
            Recipe Builder
          </DialogTitle>
          <DialogDescription>
            Build reusable meals or log a saved recipe with scaled macros.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'build' | 'saved')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="build">Build New</TabsTrigger>
            <TabsTrigger value="saved">My Recipes</TabsTrigger>
          </TabsList>

          {/* ────── Build New tab ────── */}
          <TabsContent value="build" className="space-y-4 mt-4">
            {/* Step 1: Recipe name */}
            <div>
              <Label htmlFor="recipe-name">Recipe name</Label>
              <Input
                id="recipe-name"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="e.g. Turkey Chili"
                className="mt-1"
              />
            </div>

            {/* Step 2: Add ingredients */}
            <div className="space-y-2">
              <Label>Add ingredients</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Food name (e.g. chicken breast)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(); } }}
                  className="flex-1 min-w-0"
                />
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  value={searchQty}
                  onChange={(e) => setSearchQty(Number(e.target.value) || 0)}
                  className="w-20 shrink-0"
                  placeholder="Qty"
                />
                <Input
                  value={searchUnit}
                  onChange={(e) => setSearchUnit(e.target.value)}
                  className="w-24 shrink-0"
                  placeholder="Unit"
                />
                <Button
                  onClick={addIngredient}
                  disabled={isLooking || !searchQuery.trim()}
                  size="icon"
                  className="shrink-0"
                  aria-label="Add ingredient"
                >
                  {isLooking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              {/* Ingredient list */}
              {ingredients.length > 0 && (
                <div className="border rounded-md divide-y">
                  {ingredients.map((ing, i) => (
                    <div key={i} className="p-2 flex items-center justify-between gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{ing.foodName}</div>
                        <div className="text-xs text-muted-foreground">
                          {ing.quantity} {ing.unit} · {Math.round(ing.calories)} cal · {Math.round(ing.protein)}P / {Math.round(ing.carbs)}C / {Math.round(ing.fat)}F
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeIngredient(i)}
                        aria-label={`Remove ${ing.foodName}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 3: Total servings */}
            <div>
              <Label htmlFor="total-servings">This recipe makes</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="total-servings"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={totalServings}
                  onChange={(e) => setTotalServings(Number(e.target.value) || 1)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">serving{totalServings === 1 ? '' : 's'}</span>
              </div>
            </div>

            {/* Live per-serving summary */}
            <div className={cn(
              "grid grid-cols-4 gap-2 text-center rounded-lg p-3",
              ingredients.length > 0 ? "bg-primary/5" : "bg-muted/50"
            )}>
              <div>
                <div className="text-xs text-muted-foreground">Cals / svg</div>
                <div className="font-bold text-sm">{Math.round(perServing.calories)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Protein</div>
                <div className="font-bold text-sm">{Math.round(perServing.protein)}g</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Carbs</div>
                <div className="font-bold text-sm">{Math.round(perServing.carbs)}g</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Fat</div>
                <div className="font-bold text-sm">{Math.round(perServing.fat)}g</div>
              </div>
            </div>

            {/* Step 4: Save and/or log */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleSaveRecipe}
                disabled={!canBuildSave || isSaving || isLoggingBuilt}
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Recipe
              </Button>
              <div className="flex gap-2 flex-1">
                <Input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={buildServingsToLog}
                  onChange={(e) => setBuildServingsToLog(Number(e.target.value) || 1)}
                  className="w-20 shrink-0"
                  aria-label="Servings to log"
                />
                <Button
                  className="flex-1"
                  onClick={handleLogBuiltRecipe}
                  disabled={!canBuildSave || isSaving || isLoggingBuilt}
                >
                  {isLoggingBuilt ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Log {buildServingsToLog} serving{buildServingsToLog === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ────── My Recipes tab ────── */}
          <TabsContent value="saved" className="space-y-3 mt-4">
            {isLoadingRecipes ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : savedRecipes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No saved recipes yet. Build one in the "Build New" tab.
              </div>
            ) : (
              savedRecipes.map((recipe) => {
                const servings = servingsByRecipe[recipe.id] || 1;
                const scaledCals = recipe.perServingMacros.calories * servings;
                const scaledPro = recipe.perServingMacros.protein * servings;
                const scaledCarbs = recipe.perServingMacros.carbs * servings;
                const scaledFat = recipe.perServingMacros.fat * servings;
                const isExpanded = expandedId === recipe.id;

                return (
                  <div key={recipe.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="text-left flex-1 min-w-0"
                        onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
                      >
                        <div className="font-medium truncate">{recipe.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'} · makes {Number(recipe.totalServings)} svg · {Math.round(recipe.perServingMacros.calories)} cal/svg
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => handleDeleteSaved(recipe.id)}
                        disabled={deletingId === recipe.id}
                        aria-label={`Delete ${recipe.name}`}
                      >
                        {deletingId === recipe.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
                        {recipe.ingredients.map((ing) => (
                          <div key={ing.id}>• {Number(ing.quantity)} {ing.unit || ''} {ing.foodName}</div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={servings}
                        onChange={(e) => setServingsByRecipe(prev => ({
                          ...prev,
                          [recipe.id]: Number(e.target.value) || 1,
                        }))}
                        className="w-20 shrink-0 h-9"
                        aria-label="Servings to log"
                      />
                      <div className="flex-1 text-xs text-muted-foreground">
                        {Math.round(scaledCals)} cal · {Math.round(scaledPro)}P / {Math.round(scaledCarbs)}C / {Math.round(scaledFat)}F
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleLogSaved(recipe)}
                        disabled={loggingId === recipe.id}
                      >
                        {loggingId === recipe.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Plus className="w-3 h-3 mr-1" />
                        )}
                        Log
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function suggestMealType(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return 'Breakfast';
  if (hour >= 10 && hour < 14) return 'Lunch';
  if (hour >= 17 && hour < 21) return 'Dinner';
  return 'Snack';
}

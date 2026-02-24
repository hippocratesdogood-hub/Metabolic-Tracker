/**
 * Nutrition Database Lookup Service
 *
 * Searches Open Food Facts (primary) and USDA FoodData Central (fallback)
 * for brand-name food products. Returns verified nutrition data when a
 * confident match is found; otherwise the caller falls back to AI estimates.
 */

import cache, { cacheKeys } from './cache';

// ── Types ──────────────────────────────────────────────────────────────────

interface NutritionMatch {
  name: string;
  brand: string | null;
  servingSize: string;
  calories: number;
  protein: number;
  fat: number;
  totalCarbs: number;
  fiber: number;
  netCarbs: number;
  source: 'openfoodfacts' | 'usda';
  sourceId: string | null;
  matchConfidence: number;
}

export interface EnrichedFoodItem {
  [key: string]: any;
  source: 'verified' | 'ai_estimate';
  sourceName: string | null;
  brand: string | null;
  matchConfidence: number;
}

// ── Skip patterns ──────────────────────────────────────────────────────────
// Generic/vague descriptions that food databases won't match well
const SKIP_PATTERNS = [
  /^(a |some |a few |handful of )/i,
  /^(leftover|homemade|home.?made)/i,
  /\b(about|roughly|approximately)\b/i,
];

// ── Service ────────────────────────────────────────────────────────────────

class NutritionLookupService {
  /**
   * Search for a food item across databases. Returns the best confident
   * match, or null if nothing meets the threshold.
   */
  async searchFood(query: string): Promise<NutritionMatch | null> {
    if (!query || query.trim().length < 3) return null;
    if (SKIP_PATTERNS.some(p => p.test(query))) return null;

    const cacheKey = cacheKeys.nutritionLookup(query);
    const cached = cache.get<NutritionMatch | null>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;
    // Cache stores null for "searched but no match" — check explicitly
    if (cache.get<string>(`${cacheKey}:miss`) === 'miss') return null;

    // Search OFF and USDA in parallel (cuts latency roughly in half)
    const usdaKey = process.env.USDA_API_KEY;
    const [offResult, usdaResult] = await Promise.allSettled([
      this.searchOpenFoodFacts(query),
      usdaKey ? this.searchUSDA(query) : Promise.resolve([] as NutritionMatch[]),
    ]);

    // Try OFF results first (better branded food coverage)
    if (offResult.status === 'fulfilled' && offResult.value.length > 0) {
      const bestOFF = this.pickBestMatch(query, offResult.value);
      if (bestOFF) {
        cache.set(cacheKey, bestOFF, 60 * 60 * 1000); // 1 hour
        return bestOFF;
      }
    } else if (offResult.status === 'rejected') {
      console.error('[NutritionLookup] OFF search failed:', offResult.reason);
    }

    // Try USDA results as fallback
    if (usdaResult.status === 'fulfilled' && usdaResult.value.length > 0) {
      const bestUSDA = this.pickBestMatch(query, usdaResult.value);
      if (bestUSDA) {
        cache.set(cacheKey, bestUSDA, 60 * 60 * 1000);
        return bestUSDA;
      }
    } else if (usdaResult.status === 'rejected') {
      console.error('[NutritionLookup] USDA search failed:', usdaResult.reason);
    }

    // No confident match — cache the miss to avoid repeated lookups
    cache.set(`${cacheKey}:miss`, 'miss', 30 * 60 * 1000); // 30 min
    return null;
  }

  /**
   * Enrich an array of AI-detected food items with database lookups.
   * Items that match get verified macros; others keep AI estimates.
   */
  async enrichFoodsDetected(foods: any[]): Promise<EnrichedFoodItem[]> {
    const results = await Promise.allSettled(
      foods.map(async (item) => {
        const match = await this.searchFood(item.name);

        if (match && match.matchConfidence >= 0.6) {
          return {
            ...item,
            calories: match.calories,
            protein: match.protein,
            fat: match.fat,
            totalCarbs: match.totalCarbs,
            fiber: match.fiber,
            netCarbs: match.netCarbs,
            source: 'verified' as const,
            sourceName: match.source === 'openfoodfacts'
              ? 'Open Food Facts'
              : 'USDA FoodData Central',
            brand: match.brand,
            matchConfidence: match.matchConfidence,
            _aiEstimate: {
              calories: item.calories,
              protein: item.protein,
              fat: item.fat,
              totalCarbs: item.totalCarbs,
              fiber: item.fiber,
              netCarbs: item.netCarbs,
            },
          };
        }

        return {
          ...item,
          source: 'ai_estimate' as const,
          sourceName: null,
          brand: null,
          matchConfidence: match?.matchConfidence || 0,
        };
      })
    );

    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { ...foods[i], source: 'ai_estimate' as const, sourceName: null, brand: null, matchConfidence: 0 }
    );
  }

  // ── Open Food Facts ────────────────────────────────────────────────────

  private async searchOpenFoodFacts(query: string): Promise<NutritionMatch[]> {
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.searchParams.set('search_terms', query);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', 'true');
    url.searchParams.set('page_size', '5');
    url.searchParams.set('fields',
      'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MetabolicTracker/1.0 (health-app)' },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return (data.products || [])
      .map((p: any) => this.normalizeOFFResult(p))
      .filter((r: NutritionMatch | null): r is NutritionMatch => r !== null);
  }

  private normalizeOFFResult(product: any): NutritionMatch | null {
    const n = product.nutriments;
    if (!n) return null;

    const hasServing = n['energy-kcal_serving'] !== undefined;
    const suffix = hasServing ? '_serving' : '_100g';

    const calories = n[`energy-kcal${suffix}`] || 0;
    const protein = n[`proteins${suffix}`] || 0;
    const fat = n[`fat${suffix}`] || 0;
    const totalCarbs = n[`carbohydrates${suffix}`] || 0;
    const fiber = n[`fiber${suffix}`] || 0;

    // Skip products with clearly incomplete data
    if (calories === 0 && protein === 0 && fat === 0 && totalCarbs === 0) {
      return null;
    }

    return {
      name: product.product_name_en || product.product_name || '',
      brand: product.brands || null,
      servingSize: product.serving_size
        || (hasServing ? `${product.serving_quantity || '?'}g` : '100g'),
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      fiber: Math.round(fiber * 10) / 10,
      netCarbs: Math.round((totalCarbs - fiber) * 10) / 10,
      source: 'openfoodfacts',
      sourceId: product.code || null,
      matchConfidence: 0, // filled by caller
    };
  }

  // ── USDA FoodData Central ──────────────────────────────────────────────

  private async searchUSDA(query: string): Promise<NutritionMatch[]> {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) return [];

    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    url.searchParams.set('query', query);
    url.searchParams.set('dataType', 'Branded');
    url.searchParams.set('pageSize', '5');
    url.searchParams.set('api_key', apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return (data.foods || [])
      .map((f: any) => this.normalizeUSDAResult(f))
      .filter((r: NutritionMatch | null): r is NutritionMatch => r !== null);
  }

  private normalizeUSDAResult(food: any): NutritionMatch | null {
    const nutrients = food.foodNutrients || [];
    const getNutrient = (id: number): number => {
      const n = nutrients.find((x: any) => x.nutrientId === id);
      return n?.value || 0;
    };

    // USDA nutrient IDs
    const caloriesPer100g = getNutrient(1008);
    const proteinPer100g = getNutrient(1003);
    const fatPer100g = getNutrient(1004);
    const carbsPer100g = getNutrient(1005);
    const fiberPer100g = getNutrient(1079);

    if (caloriesPer100g === 0 && proteinPer100g === 0) return null;

    const servingSizeG = food.servingSize || 100;
    const factor = servingSizeG / 100;

    return {
      name: food.description || '',
      brand: food.brandName || food.brandOwner || null,
      servingSize: food.householdServingFullText || `${servingSizeG}g`,
      calories: Math.round(caloriesPer100g * factor),
      protein: Math.round(proteinPer100g * factor * 10) / 10,
      fat: Math.round(fatPer100g * factor * 10) / 10,
      totalCarbs: Math.round(carbsPer100g * factor * 10) / 10,
      fiber: Math.round(fiberPer100g * factor * 10) / 10,
      netCarbs: Math.round((carbsPer100g - fiberPer100g) * factor * 10) / 10,
      source: 'usda',
      sourceId: food.fdcId?.toString() || null,
      matchConfidence: 0,
    };
  }

  // ── Name matching ──────────────────────────────────────────────────────

  private calculateNameSimilarity(
    aiName: string,
    dbName: string,
    dbBrand: string | null,
  ): number {
    const aiLower = aiName.toLowerCase().trim();
    const dbLower = dbName.toLowerCase().trim();
    const brandLower = (dbBrand || '').toLowerCase().trim();

    let score = 0;

    // Signal 1: Brand name appears in AI name (strong signal)
    if (brandLower && brandLower.length > 2 && aiLower.includes(brandLower)) {
      score += 0.35;
    }

    // Signal 2: Core food words overlap (recall-weighted)
    // Recall (AI words found in DB) matters more than precision (DB words found in AI),
    // because DB names are often more specific (e.g., "Vanilla Blended Non-Fat Greek Yogurt")
    const aiWithoutBrand = brandLower
      ? aiLower.replace(brandLower, '').trim()
      : aiLower;
    const aiWords = new Set(aiWithoutBrand.split(/\s+/).filter(w => w.length > 2));
    const dbWords = new Set(dbLower.split(/\s+/).filter(w => w.length > 2));
    const intersection = [...aiWords].filter(w => dbWords.has(w)).length;
    const recall = aiWords.size > 0 ? intersection / aiWords.size : 0;
    const precision = dbWords.size > 0 ? intersection / dbWords.size : 0;
    const wordOverlap = recall * 0.7 + precision * 0.3;
    score += wordOverlap * 0.45;

    // Signal 3: One string contains the other
    if (aiLower.includes(dbLower) || dbLower.includes(aiLower)) {
      score += 0.20;
    }

    return Math.min(score, 1.0);
  }

  private pickBestMatch(
    query: string,
    candidates: NutritionMatch[],
  ): NutritionMatch | null {
    if (candidates.length === 0) return null;

    const scored = candidates
      .map(c => ({
        ...c,
        matchConfidence: this.calculateNameSimilarity(query, c.name, c.brand),
      }))
      .sort((a, b) => b.matchConfidence - a.matchConfidence);

    const best = scored[0];
    console.log(`[NutritionLookup] Best match for "${query}": "${best.name}" (brand: ${best.brand}) → confidence: ${best.matchConfidence.toFixed(3)}, ${best.matchConfidence >= 0.6 ? 'ACCEPTED' : 'REJECTED'}`);
    return best.matchConfidence >= 0.6 ? best : null;
  }
}

export const nutritionLookup = new NutritionLookupService();

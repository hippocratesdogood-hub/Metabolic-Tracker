/**
 * Nutrition Database Lookup Service
 *
 * Searches Open Food Facts (primary) and USDA FoodData Central (fallback)
 * for brand-name food products. Returns verified nutrition data when a
 * confident match is found; otherwise the caller falls back to AI estimates.
 */

import cache, { cacheKeys } from './cache';
import {
  contentTokens,
  coverageFor,
  LOOSE_MATCH_THRESHOLD,
  BRANDED_UPGRADE_MIN_COVERAGE,
} from './matchCoverage';

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

/** One resolved food in the route's foods_detected shape (Nutritionix-native analysis). */
export interface DetectedFoodItem {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  fat: number;
  totalCarbs: number;
  fiber: number;
  netCarbs: number;
  source: 'verified';
  sourceName: 'Nutritionix';
  brand: string | null;
  confidence: number;
  servingWeightGrams: number | null;
  altMeasures: Array<{ qty: number; measure: string; servingWeightGrams: number }> | null;
  /**
   * 'loose' when token coverage of the input by the matched names fell
   * below LOOSE_MATCH_THRESHOLD — the parser salvaged only part of what the
   * member typed (see matchCoverage.ts). Absent on full matches. Lexical
   * signal only: absence does NOT mean the match was verified correct.
   */
  matchQuality?: 'loose';
  /** The food names the parser did match, for "matched only X" UI copy. */
  matchedFrom?: string[];
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
    cache.set(`${cacheKey}:miss`, 'miss', 5 * 60 * 1000); // 5 min (short so retries happen sooner)
    return null;
  }

  /**
   * Enrich an array of AI-detected food items with database lookups.
   * Items that match get verified macros; others keep AI estimates.
   */
  async enrichFoodsDetected(foods: any[]): Promise<EnrichedFoodItem[]> {
    const results = await Promise.allSettled(
      foods.map(async (item) => {
        // Route through lookupItemMacros so the quantity AND unit (e.g.,
        // "2 slice mango") are honored. searchFood() alone doesn't know
        // about units, so it silently treated "2 slices" as "2 whole
        // mangoes" before this fix.
        const qty = item.quantity || 1;
        const unit = item.unit || 'serving';
        const match = await this.lookupItemMacros(item.name, qty, unit);

        if (match) {
          // Sanity check: reject matches where the macro profile is wildly
          // different from the AI estimate — indicates a wrong food matched
          // (e.g., "egg noodles" for "egg"). Compare already-scaled totals
          // since lookupItemMacros returns values for the full quantity.
          const aiCal = item.calories || 0;
          const aiPro = item.protein || 0;
          if (aiCal > 0 && match.calories > 0) {
            const calRatio = Math.max(aiCal, match.calories) / Math.min(aiCal, match.calories);
            const proRatio = aiPro > 1 && match.protein > 1
              ? Math.max(aiPro, match.protein) / Math.min(aiPro, match.protein)
              : 1;
            if (calRatio > 2.5 || proRatio > 2.5) {
              console.log(`[NutritionLookup] Rejecting match for "${item.name}" — macro mismatch (cal ratio: ${calRatio.toFixed(1)}, pro ratio: ${proRatio.toFixed(1)})`);
              return {
                ...item,
                source: 'ai_estimate' as const,
                sourceName: null,
                brand: null,
                matchConfidence: 0,
              };
            }
          }

          const sourceName =
            match.source === 'nutritionix' ? 'Nutritionix'
              : match.source === 'openfoodfacts' ? 'Open Food Facts'
              : match.source === 'usda' ? 'USDA FoodData Central'
              : null;

          return {
            ...item,
            calories: match.calories,
            protein: match.protein,
            fat: match.fat,
            totalCarbs: match.totalCarbs,
            fiber: match.fiber,
            netCarbs: match.netCarbs,
            source: 'verified' as const,
            sourceName,
            brand: null,
            matchConfidence: 0.95,
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
          matchConfidence: 0,
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
      signal: AbortSignal.timeout(10000),
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
    url.searchParams.set('dataType', 'Foundation,SR Legacy,Branded');
    url.searchParams.set('pageSize', '10');
    url.searchParams.set('api_key', apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
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

  /** Strip punctuation and split into clean word tokens */
  private tokenize(text: string): Set<string> {
    return new Set(
      text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
    );
  }

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

    // Signal 2: Core food words overlap (balanced recall + precision)
    const aiClean = brandLower
      ? aiLower.replace(brandLower, '').trim()
      : aiLower;
    const aiWords = this.tokenize(aiClean);
    const dbWords = this.tokenize(dbLower);
    const intersection = [...aiWords].filter(w => dbWords.has(w)).length;
    const recall = aiWords.size > 0 ? intersection / aiWords.size : 0;
    const precision = dbWords.size > 0 ? intersection / dbWords.size : 0;

    // For short queries (1-2 words), precision matters more to avoid
    // "egg" matching "Egg Noodles Enriched Cooked" — the DB name has many
    // extra words that signal it's a different food entirely.
    const isShortQuery = aiWords.size <= 2;
    const wordOverlap = isShortQuery
      ? recall * 0.3 + precision * 0.7
      : recall * 0.7 + precision * 0.3;
    score += wordOverlap * 0.45;

    // Signal 3: One string contains the other (compare cleaned versions)
    // For short queries, only reward if DB name is close in length (avoid "egg" → "Egg Noodles")
    const aiCleanFull = aiLower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const dbCleanFull = dbLower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (aiCleanFull.includes(dbCleanFull) || dbCleanFull.includes(aiCleanFull)) {
      const lengthRatio = Math.min(aiCleanFull.length, dbCleanFull.length) /
        Math.max(aiCleanFull.length, dbCleanFull.length);
      score += lengthRatio >= 0.5 ? 0.20 : 0.05;
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

  // ── Nutritionix Natural Nutrients ─────────────────────────────────────
  /**
   * Query Nutritionix /v2/natural/nutrients for a food item with quantity.
   * Returns macros for the specified quantity, or null if not configured/failed.
   * This is the most accurate source for natural language food descriptions.
   */
  async lookupNutritionix(
    food: string,
    quantity: number,
    unit: string
  ): Promise<NutritionMatch | null> {
    const appId = process.env.NUTRITIONIX_APP_ID;
    const appKey = process.env.NUTRITIONIX_APP_KEY;
    if (!appId || !appKey) return null;

    const query = `${quantity} ${unit} ${food}`;
    const cacheKey = cacheKeys.nutritionLookup(`nix:${query}`);
    const cached = cache.get<NutritionMatch | null>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;
    if (cache.get<string>(`${cacheKey}:miss`) === 'miss') return null;

    try {
      const response = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-id': appId,
          'x-app-key': appKey,
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`[Nutritionix] ${response.status} for "${query}"`);
        cache.set(`${cacheKey}:miss`, 'miss', 5 * 60 * 1000);
        return null;
      }

      const data = await response.json();
      const foods = data.foods || [];
      if (foods.length === 0) {
        cache.set(`${cacheKey}:miss`, 'miss', 5 * 60 * 1000);
        return null;
      }

      // Sum all returned foods (Nutritionix may split "2 cups yogurt" into one item)
      let calories = 0, protein = 0, fat = 0, totalCarbs = 0, fiber = 0;
      for (const f of foods) {
        calories += f.nf_calories || 0;
        protein += f.nf_protein || 0;
        fat += f.nf_total_fat || 0;
        totalCarbs += f.nf_total_carbohydrate || 0;
        fiber += f.nf_dietary_fiber || 0;
      }

      const result: NutritionMatch = {
        name: foods[0].food_name || food,
        brand: foods[0].brand_name || null,
        servingSize: `${quantity} ${unit}`,
        calories: Math.round(calories),
        protein: Math.round(protein * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        totalCarbs: Math.round(totalCarbs * 10) / 10,
        fiber: Math.round(fiber * 10) / 10,
        netCarbs: Math.round((totalCarbs - fiber) * 10) / 10,
        source: 'usda', // close enough — Nutritionix uses USDA data
        sourceId: null,
        matchConfidence: 0.95, // Nutritionix natural language is high confidence
      };

      cache.set(cacheKey, result, 60 * 60 * 1000);
      console.log(`[Nutritionix] "${query}" → ${result.calories} cal, ${result.protein}g protein`);
      return result;
    } catch (err) {
      console.error('[Nutritionix] Lookup failed:', err);
      cache.set(`${cacheKey}:miss`, 'miss', 5 * 60 * 1000);
      return null;
    }
  }

  /**
   * Look up macros for a parsed food item. Tries Nutritionix first,
   * then Open Food Facts / USDA, then returns null (caller uses LLM fallback).
   */
  async lookupItemMacros(
    food: string,
    quantity: number,
    unit: string
  ): Promise<{
    calories: number;
    protein: number;
    fat: number;
    totalCarbs: number;
    fiber: number;
    netCarbs: number;
    source: 'nutritionix' | 'openfoodfacts' | 'usda' | 'ai_estimate';
  } | null> {
    // 1. Nutritionix (best for natural language)
    const nix = await this.lookupNutritionix(food, quantity, unit);
    if (nix) {
      return {
        calories: nix.calories,
        protein: nix.protein,
        fat: nix.fat,
        totalCarbs: nix.totalCarbs,
        fiber: nix.fiber,
        netCarbs: nix.netCarbs,
        source: 'nutritionix',
      };
    }

    // 2. Open Food Facts / USDA (existing search)
    const dbMatch = await this.searchFood(food);
    if (dbMatch) {
      const qty = quantity || 1;
      return {
        calories: Math.round(dbMatch.calories * qty),
        protein: Math.round(dbMatch.protein * qty * 10) / 10,
        fat: Math.round(dbMatch.fat * qty * 10) / 10,
        totalCarbs: Math.round(dbMatch.totalCarbs * qty * 10) / 10,
        fiber: Math.round(dbMatch.fiber * qty * 10) / 10,
        netCarbs: Math.round(dbMatch.netCarbs * qty * 10) / 10,
        source: dbMatch.source,
      };
    }

    // 3. No match — caller should fall back to LLM
    return null;
  }

  /**
   * Nutritionix-native full-text analysis (food-analysis v1.2, P1).
   *
   * Sends the *entire* meal description to /v2/natural/nutrients, which does
   * its own NLP parsing AND returns sourced macros — no LLM required, so this
   * path keeps automatic analysis working when ANTHROPIC_API_KEY is unset
   * (e.g. BAA-gated off in prod).
   *
   * PHI note: only the food string is transmitted — never a patient
   * identifier. Do NOT add user-identifying headers or body fields (e.g.
   * x-remote-user-id) to this request; the de-identified posture is what keeps
   * this BAA-independent. There is a regression test guarding exactly this.
   *
   * Returns one item per detected food (in the route's foods_detected shape),
   * or null if not configured / the request failed / nothing parsed.
   */
  async analyzeNaturalText(rawText: string): Promise<DetectedFoodItem[] | null> {
    const detailed = await this.analyzeNaturalTextDetailed(rawText);
    if (!detailed || detailed.items.length === 0) return null;
    return detailed.items;
  }

  /**
   * Full-text analysis that also reports what could NOT be resolved.
   *
   * Nutritionix's natural endpoint silently omits phrases its NLP can't
   * match (branded foods like "1 RxBar" — the Aug 2026 silent-drop bug), so
   * a plain query gives no unmatched signal. In line_delimited mode the API
   * returns a per-line `errors` array instead:
   *   err_code 101 — no foods detected on the line → genuinely unresolved
   *   err_code 100 — multiple foods on one line → resolvable; re-sent as a
   *                  plain query and merged (otherwise "tuna and rice" on
   *                  one line would return nothing)
   *
   * The meal text is split into candidate lines on commas/newlines. Single
   * lines skip line_delimited (plain query, same signal: empty foods →
   * unresolved). On a hard request failure every line is reported as
   * unresolved rather than returning null — the UI can then offer manual
   * entry instead of silently losing the meal.
   *
   * Returns null only when Nutritionix is unconfigured or the input is
   * effectively empty.
   */
  async analyzeNaturalTextDetailed(rawText: string): Promise<{
    items: DetectedFoodItem[];
    unresolved: string[];
  } | null> {
    const appId = process.env.NUTRITIONIX_APP_ID;
    const appKey = process.env.NUTRITIONIX_APP_KEY;
    if (!appId || !appKey) return null;

    const query = (rawText || '').trim();
    if (query.length < 2) return null;

    type Detailed = { items: DetectedFoodItem[]; unresolved: string[] };
    const cacheKey = cacheKeys.nutritionLookup(`nix-nld:${query.toLowerCase()}`);
    const cached = cache.get<Detailed>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const lines = query
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Per-line raw foods, so partial-salvage detection can compare each
    // input line against what it actually matched.
    const lineFoods: Array<{ line: string; raw: any[] }> = [];
    let unresolved: string[] = [];

    if (lines.length <= 1) {
      const data = await this.nixNaturalRequest({ query }, appId, appKey);
      const raw = Array.isArray(data?.foods) ? data.foods : [];
      if (raw.length > 0) lineFoods.push({ line: query, raw });
      else unresolved.push(query);
    } else {
      const data = await this.nixNaturalRequest(
        { query: lines.join('\n'), line_delimited: true },
        appId,
        appKey,
      );
      if (!data) {
        // Hard failure: surface every line as unresolved so nothing is lost.
        unresolved = [...lines];
      } else {
        // Attribute foods to lines via metadata.original_input. Foods
        // without one (defensive — the live API always sets it in
        // line_delimited mode) are scored against the whole query, which
        // can only make their coverage more lenient, never a false flag.
        const byLine = new Map<string, any[]>(lines.map((l) => [l, []]));
        const push = (line: string, foods: any[]) =>
          byLine.set(line, [...(byLine.get(line) ?? []), ...foods]);
        for (const f of Array.isArray(data.foods) ? data.foods : []) {
          const origin = typeof f?.metadata?.original_input === 'string' ? f.metadata.original_input.trim() : '';
          push(byLine.has(origin) ? origin : query, [f]);
        }
        for (const err of Array.isArray(data.errors) ? data.errors : []) {
          const phrase = typeof err?.original_text === 'string' ? err.original_text.trim() : '';
          if (!phrase) continue;
          if (err.err_code === 100) {
            // Multiple foods on one line — the plain parser handles this.
            const sub = await this.nixNaturalRequest({ query: phrase }, appId, appKey);
            const subRaw = Array.isArray(sub?.foods) ? sub.foods : [];
            if (subRaw.length > 0) push(phrase, subRaw);
            else unresolved.push(phrase);
          } else {
            unresolved.push(phrase);
          }
        }
        byLine.forEach((raw, line) => {
          if (raw.length > 0) lineFoods.push({ line, raw });
        });
      }
    }

    // Partial-salvage pass. The natural parser can salvage one known word
    // from a phrase it didn't really understand ("in n out double double no
    // bun" → a 140-kcal "bun") and nothing in the response marks the loss.
    // Per line: compute token coverage of the input by the matched names;
    // on partial coverage try a branded upgrade (the phrase is often a real
    // product — Quest bar, In-N-Out burger); whatever is still below the
    // loose threshold is labeled matchQuality:'loose' for the UI.
    const items: DetectedFoodItem[] = [];
    for (const { line, raw } of lineFoods) {
      const matchedNames: string[] = [];
      for (const f of raw) {
        if (f?.food_name) matchedNames.push(String(f.food_name));
        if (f?.brand_name) matchedNames.push(String(f.brand_name));
        const tagItem = f?.tags?.item;
        if (tagItem) matchedNames.push(String(tagItem));
      }
      const { coverage, unmatched } = coverageFor(line, matchedNames);
      const mapped = this.mapNixFoods(raw);

      if (coverage < 1 && unmatched.length > 0) {
        const upgrade = await this.searchBrandedFood(line, {
          accept: (hit) => {
            const brandToks = contentTokens(hit.brand_name || '');
            const brandOverlap = unmatched.some((u) =>
              brandToks.some((b) => u === b || (u.length >= 3 && b.length >= 3 && (u.includes(b) || b.includes(u)))),
            );
            if (!brandOverlap) return false;
            const hitCov = coverageFor(line, [`${hit.brand_name || ''} ${hit.food_name || ''}`]).coverage;
            // One overlapping word is not enough — the product name must
            // account for most of the line, and beat the natural parse.
            return hitCov >= BRANDED_UPGRADE_MIN_COVERAGE && hitCov > coverage;
          },
        });
        if (upgrade) {
          items.push(upgrade);
          continue;
        }
      }

      if (coverage < LOOSE_MATCH_THRESHOLD) {
        const matchedFrom = raw.map((f: any) => String(f?.food_name || 'food'));
        for (const m of mapped) {
          m.matchQuality = 'loose';
          m.matchedFrom = matchedFrom;
        }
        console.warn(
          `[Nutritionix] loose match for "${line}": matched ${JSON.stringify(matchedFrom)}, unmatched tokens ${JSON.stringify(unmatched)}`,
        );
      }
      items.push(...mapped);
    }

    let result: Detailed = { items, unresolved };

    // Second pass: phrases the natural (common-foods) parser couldn't match
    // are often branded products ("1 RxBar") — try Nutritionix's branded
    // database before declaring them unresolved.
    if (result.unresolved.length > 0) {
      const stillUnresolved: string[] = [];
      for (const phrase of result.unresolved) {
        const branded = await this.searchBrandedFood(phrase);
        if (branded) result.items.push(branded);
        else stillUnresolved.push(phrase);
      }
      result = { items: result.items, unresolved: stillUnresolved };
    }

    if (result.unresolved.length > 0) {
      // De-identified (food text only) — this is the visibility the silent
      // drop never had. Grep target: "unresolved phrase".
      console.warn(
        `[Nutritionix] ${result.unresolved.length} unresolved phrase(s) for "${query}": ${result.unresolved.join(' | ')}`,
      );
    }
    console.log(`[Nutritionix] natural "${query}" → ${result.items.length} item(s), ${result.unresolved.length} unresolved`);
    cache.set(cacheKey, result, 60 * 60 * 1000);
    return result;
  }

  /**
   * Branded-food lookup for a phrase the natural-language parser couldn't
   * match: /v2/search/instant (branded results carry a nix_item_id), then
   * /v2/search/item for full nutrients. Live-verified against RXBAR, which
   * exists only in the branded database. A leading count ("2 RxBar") is
   * stripped for the search and scales the result. Same de-identified
   * posture as the natural requests: food text + API credentials only.
   *
   * Returns a DetectedFoodItem labeled with the real source (verified /
   * Nutritionix + brand), or null when nothing matches.
   */
  async searchBrandedFood(
    phrase: string,
    opts?: {
      /**
       * Custom acceptance test over the top instant-search hits (default:
       * first hit with a nix_item_id). Used by the salvage upgrade path,
       * which requires the product name to cover most of the input line.
       * Results are NOT cached when a predicate is supplied — acceptance
       * depends on caller context, so cached entries would cross-contaminate.
       */
      accept?: (hit: { brand_name: string | null; food_name: string | null }) => boolean;
    },
  ): Promise<DetectedFoodItem | null> {
    const appId = process.env.NUTRITIONIX_APP_ID;
    const appKey = process.env.NUTRITIONIX_APP_KEY;
    if (!appId || !appKey) return null;

    const cleaned = (phrase || '').trim();
    if (cleaned.length < 2) return null;

    // "2 RxBar" → search "RxBar", scale ×2. Only a leading bare count is
    // treated as a multiplier; measured amounts ("40 g protein bar") search verbatim.
    const qtyMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s+(\D.*)$/);
    const quantity = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
    const searchTerm = (qtyMatch ? qtyMatch[2] : cleaned).trim();
    if (searchTerm.length < 2 || quantity <= 0 || quantity > 50) return null;

    const useCache = !opts?.accept;
    const cacheKey = cacheKeys.nutritionLookup(`nix-branded:${quantity}|${searchTerm.toLowerCase()}`);
    if (useCache) {
      const cached = cache.get<DetectedFoodItem | 'miss'>(cacheKey);
      if (cached === 'miss') return null;
      if (cached !== undefined && cached !== null) return cached;
    }

    try {
      const headers = { 'x-app-id': appId, 'x-app-key': appKey };
      const instantRes = await fetch(
        `https://trackapi.nutritionix.com/v2/search/instant?query=${encodeURIComponent(searchTerm)}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      if (!instantRes.ok) {
        console.error(`[Nutritionix] instant ${instantRes.status} for "${searchTerm}"`);
        return null;
      }
      const instant = await instantRes.json();
      const candidates = (Array.isArray(instant.branded) ? instant.branded : [])
        .filter((b: any) => b?.nix_item_id)
        .slice(0, 5);
      const hit = opts?.accept
        ? candidates.find((b: any) => opts.accept!({ brand_name: b.brand_name ?? null, food_name: b.food_name ?? null }))
        : candidates[0];
      if (!hit) {
        if (useCache) cache.set(cacheKey, 'miss', 60 * 60 * 1000);
        return null;
      }

      const itemRes = await fetch(
        `https://trackapi.nutritionix.com/v2/search/item?nix_item_id=${encodeURIComponent(hit.nix_item_id)}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      if (!itemRes.ok) {
        console.error(`[Nutritionix] item ${itemRes.status} for "${hit.nix_item_id}"`);
        return null;
      }
      const itemData = await itemRes.json();
      const mapped = this.mapNixFoods(itemData.foods)[0];
      if (!mapped) {
        cache.set(cacheKey, 'miss', 60 * 60 * 1000);
        return null;
      }

      const round1 = (n: number) => Math.round(n * 10) / 10;
      const item: DetectedFoodItem = {
        ...mapped,
        // Brand in the display name so the match is auditable at a glance
        name: mapped.brand ? `${mapped.brand} ${mapped.name}` : mapped.name,
        quantity: mapped.quantity * quantity,
        calories: Math.round(mapped.calories * quantity),
        protein: round1(mapped.protein * quantity),
        fat: round1(mapped.fat * quantity),
        totalCarbs: round1(mapped.totalCarbs * quantity),
        fiber: round1(mapped.fiber * quantity),
        netCarbs: round1(mapped.netCarbs * quantity),
        servingWeightGrams:
          mapped.servingWeightGrams != null ? round1(mapped.servingWeightGrams * quantity) : null,
        // Branded search matches on name similarity (first hit may be a
        // different flavor) — flag lower confidence than an exact NLP parse.
        confidence: 0.7,
      };
      if (useCache) cache.set(cacheKey, item, 60 * 60 * 1000);
      console.log(`[Nutritionix] branded "${searchTerm}" → ${item.name}`);
      return item;
    } catch (err) {
      console.error('[Nutritionix] branded lookup failed:', err);
      return null;
    }
  }

  /**
   * Single POST to /v2/natural/nutrients. De-identified by design: only the
   * food description is sent, never a patient identifier (see PHI note
   * above; regression-tested). Returns the parsed body, or null on any
   * failure. line_delimited responses put per-line failures in `errors`
   * alongside a 200 status.
   */
  private async nixNaturalRequest(
    body: { query: string; line_delimited?: boolean },
    appId: string,
    appKey: string,
  ): Promise<any | null> {
    try {
      const response = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-id': appId,
          'x-app-key': appKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        console.error(`[Nutritionix] natural ${response.status} for "${body.query}"`);
        return null;
      }
      return await response.json();
    } catch (err) {
      console.error('[Nutritionix] natural analysis failed:', err);
      return null;
    }
  }

  private mapNixFoods(foods: any): DetectedFoodItem[] {
    if (!Array.isArray(foods)) return [];
    return foods.map((f: any) => {
      const totalCarbs = Math.round((f.nf_total_carbohydrate || 0) * 10) / 10;
      const fiber = Math.round((f.nf_dietary_fiber || 0) * 10) / 10;
      // Resolved portion weight + alternate serving sizes. Nutritionix picks
      // a container size invisibly (e.g. "1 can tuna" → 172 g); persisting
      // the grams is what lets the UI expose and correct that choice.
      const altMeasures = Array.isArray(f.alt_measures)
        ? f.alt_measures
            .filter((m: any) => m && typeof m.serving_weight === 'number' && m.measure)
            .map((m: any) => ({
              qty: typeof m.qty === 'number' ? m.qty : 1,
              measure: String(m.measure),
              servingWeightGrams: m.serving_weight,
            }))
        : null;
      return {
        name: f.food_name || 'food',
        quantity: f.serving_qty || 1,
        unit: f.serving_unit || 'serving',
        calories: Math.round(f.nf_calories || 0),
        protein: Math.round((f.nf_protein || 0) * 10) / 10,
        fat: Math.round((f.nf_total_fat || 0) * 10) / 10,
        totalCarbs,
        fiber,
        netCarbs: Math.round((totalCarbs - fiber) * 10) / 10,
        source: 'verified' as const,
        sourceName: 'Nutritionix' as const,
        brand: f.brand_name || null,
        confidence: 0.95,
        servingWeightGrams: typeof f.serving_weight_grams === 'number' ? f.serving_weight_grams : null,
        altMeasures: altMeasures && altMeasures.length > 0 ? altMeasures : null,
      };
    });
  }
}

export const nutritionLookup = new NutritionLookupService();

/**
 * Barcode Lookup Service
 *
 * Looks up food products by UPC/EAN barcode using USDA FoodData Central
 * (manufacturer-verified) with Open Food Facts as fallback (crowd-sourced).
 */

import cache from './cache';

export interface BarcodeResult {
  found: boolean;
  item?: {
    name: string;
    brand: string | null;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    fat: number;
    totalCarbs: number;
    fiber: number;
    netCarbs: number;
    confidence: number;
    source: 'verified';
    sourceName: string;
    servingSize: string;
  };
}

class BarcodeLookupService {
  private readonly CACHE_HIT_TTL = 60 * 60 * 1000; // 1 hour
  private readonly CACHE_MISS_TTL = 5 * 60 * 1000;  // 5 minutes
  private readonly TIMEOUT = 10000; // 10 seconds

  /**
   * Look up a food product by barcode (UPC-A, EAN-8, EAN-13, GTIN-14).
   * Queries USDA and OFF in parallel; prefers USDA (manufacturer data).
   */
  async lookupBarcode(barcode: string): Promise<BarcodeResult> {
    const cleaned = barcode.replace(/\D/g, '');
    if (cleaned.length < 8 || cleaned.length > 14) {
      return { found: false };
    }

    const cacheKey = `barcode:${cleaned}`;
    const cached = cache.get<BarcodeResult>(cacheKey);
    if (cached !== null) {
      console.log(`[BarcodeLookup] Cache hit for ${cleaned}`);
      return cached;
    }

    // Query both sources in parallel
    const [usdaResult, offResult] = await Promise.allSettled([
      this.lookupUSDA(cleaned),
      this.lookupOFF(cleaned),
    ]);

    const usda = usdaResult.status === 'fulfilled' ? usdaResult.value : null;
    const off = offResult.status === 'fulfilled' ? offResult.value : null;

    // Prefer USDA (manufacturer-verified) over OFF (crowd-sourced)
    const result = (usda?.found ? usda : null) || (off?.found ? off : null) || { found: false } as BarcodeResult;

    cache.set(cacheKey, result, result.found ? this.CACHE_HIT_TTL : this.CACHE_MISS_TTL);
    return result;
  }

  // ── USDA FoodData Central (Branded database) ────────────────────────

  private async lookupUSDA(barcode: string): Promise<BarcodeResult> {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) return { found: false };

    try {
      const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
      url.searchParams.set('query', barcode);
      url.searchParams.set('dataType', 'Branded');
      url.searchParams.set('pageSize', '5');
      url.searchParams.set('api_key', apiKey);

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(this.TIMEOUT),
      });

      if (!response.ok) return { found: false };
      const data = await response.json();

      // Find a result whose gtinUpc matches the barcode
      const foods = data.foods || [];
      const match = foods.find((f: any) => {
        const upc = (f.gtinUpc || '').replace(/^0+/, '');
        const query = barcode.replace(/^0+/, '');
        return upc === query;
      });

      if (!match) return { found: false };

      const nutrients = match.foodNutrients || [];
      const getNutrient = (id: number): number => {
        const n = nutrients.find((x: any) => x.nutrientId === id);
        return n?.value || 0;
      };

      const caloriesPer100g = getNutrient(1008);
      const proteinPer100g = getNutrient(1003);
      const fatPer100g = getNutrient(1004);
      const carbsPer100g = getNutrient(1005);
      const fiberPer100g = getNutrient(1079);

      if (caloriesPer100g === 0 && proteinPer100g === 0) return { found: false };

      const servingSizeG = match.servingSize || 100;
      const factor = servingSizeG / 100;

      const calories = Math.round(caloriesPer100g * factor);
      const protein = Math.round(proteinPer100g * factor * 10) / 10;
      const fat = Math.round(fatPer100g * factor * 10) / 10;
      const totalCarbs = Math.round(carbsPer100g * factor * 10) / 10;
      const fiber = Math.round(fiberPer100g * factor * 10) / 10;

      const name = match.description || 'Unknown Product';
      const brand = match.brandName || match.brandOwner || null;
      const servingSize = match.householdServingFullText || `${servingSizeG}g`;

      console.log(`[BarcodeLookup] USDA found "${brand ? brand + ' ' : ''}${name}" for ${barcode} (${servingSize})`);

      return {
        found: true,
        item: {
          name: brand ? `${brand} ${name}` : name,
          brand,
          quantity: 1,
          unit: 'serving',
          calories,
          protein,
          fat,
          totalCarbs,
          fiber,
          netCarbs: Math.round((totalCarbs - fiber) * 10) / 10,
          confidence: 0.97,
          source: 'verified',
          sourceName: 'USDA FoodData Central',
          servingSize,
        },
      };
    } catch (error: any) {
      console.error(`[BarcodeLookup] USDA error for ${barcode}:`, error.message);
      return { found: false };
    }
  }

  // ── Open Food Facts ──────────────────────────────────────────────────

  private async lookupOFF(barcode: string): Promise<BarcodeResult> {
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments,image_url`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'MetabolicTracker/1.0 (health-app)' },
        signal: AbortSignal.timeout(this.TIMEOUT),
      });

      if (!response.ok) return { found: false };

      const data = await response.json();
      if (data.status !== 1 || !data.product) return { found: false };

      const product = data.product;
      const n = product.nutriments;
      if (!n) return { found: false };

      // Compute per-serving macros from per-100g data (more reliable than
      // crowd-sourced _serving values). Scale by serving_quantity if available.
      const has100g = (n['energy-kcal_100g'] > 0) || (n['proteins_100g'] > 0);
      const servingQty = product.serving_quantity ? parseFloat(product.serving_quantity) : null;
      const factor = has100g && servingQty ? servingQty / 100 : 1;

      let calories: number, protein: number, fat: number, totalCarbs: number, fiber: number;
      if (has100g && servingQty) {
        calories = (n['energy-kcal_100g'] || 0) * factor;
        protein = (n['proteins_100g'] || 0) * factor;
        fat = (n['fat_100g'] || 0) * factor;
        totalCarbs = (n['carbohydrates_100g'] || 0) * factor;
        fiber = (n['fiber_100g'] || 0) * factor;
      } else if (has100g) {
        calories = n['energy-kcal_100g'] || 0;
        protein = n['proteins_100g'] || 0;
        fat = n['fat_100g'] || 0;
        totalCarbs = n['carbohydrates_100g'] || 0;
        fiber = n['fiber_100g'] || 0;
      } else if (n['energy-kcal_serving'] !== undefined) {
        calories = n['energy-kcal_serving'] || 0;
        protein = n['proteins_serving'] || 0;
        fat = n['fat_serving'] || 0;
        totalCarbs = n['carbohydrates_serving'] || 0;
        fiber = n['fiber_serving'] || 0;
      } else {
        calories = 0; protein = 0; fat = 0; totalCarbs = 0; fiber = 0;
      }

      if (calories === 0 && protein === 0 && fat === 0 && totalCarbs === 0) {
        return { found: false };
      }

      const name = product.product_name_en || product.product_name || 'Unknown Product';
      const brand = product.brands || null;
      const servingSize = product.serving_size
        || (servingQty ? `${servingQty}g` : '100g');

      console.log(`[BarcodeLookup] OFF found "${brand ? brand + ' ' : ''}${name}" for ${barcode} (${servingSize})`);

      return {
        found: true,
        item: {
          name: brand ? `${brand} ${name}` : name,
          brand,
          quantity: 1,
          unit: 'serving',
          calories: Math.round(calories),
          protein: Math.round(protein * 10) / 10,
          fat: Math.round(fat * 10) / 10,
          totalCarbs: Math.round(totalCarbs * 10) / 10,
          fiber: Math.round(fiber * 10) / 10,
          netCarbs: Math.round((totalCarbs - fiber) * 10) / 10,
          confidence: 0.95,
          source: 'verified',
          sourceName: 'Open Food Facts',
          servingSize,
        },
      };
    } catch (error: any) {
      console.error(`[BarcodeLookup] OFF error for ${barcode}:`, error.message);
      return { found: false };
    }
  }
}

export const barcodeLookup = new BarcodeLookupService();

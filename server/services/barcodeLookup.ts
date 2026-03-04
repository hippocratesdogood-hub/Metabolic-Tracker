/**
 * Barcode Lookup Service
 *
 * Looks up food products by UPC/EAN barcode using Open Food Facts API v2.
 * Returns verified nutrition data for scanned barcodes.
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
    sourceName: 'Open Food Facts';
    servingSize: string;
  };
}

class BarcodeLookupService {
  private readonly CACHE_HIT_TTL = 60 * 60 * 1000; // 1 hour
  private readonly CACHE_MISS_TTL = 5 * 60 * 1000;  // 5 minutes
  private readonly TIMEOUT = 10000; // 10 seconds

  /**
   * Look up a food product by barcode (UPC-A, EAN-8, EAN-13, GTIN-14)
   */
  async lookupBarcode(barcode: string): Promise<BarcodeResult> {
    // Validate barcode format: 8-14 digits
    const cleaned = barcode.replace(/\D/g, '');
    if (cleaned.length < 8 || cleaned.length > 14) {
      return { found: false };
    }

    // Check cache
    const cacheKey = `barcode:${cleaned}`;
    const cached = cache.get<BarcodeResult>(cacheKey);
    if (cached !== null) {
      console.log(`[BarcodeLookup] Cache hit for ${cleaned}`);
      return cached;
    }

    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${cleaned}?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments,image_url`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'MetabolicTracker/1.0 (health-app)' },
        signal: AbortSignal.timeout(this.TIMEOUT),
      });

      if (!response.ok) {
        console.log(`[BarcodeLookup] OFF returned ${response.status} for ${cleaned}`);
        const miss: BarcodeResult = { found: false };
        cache.set(cacheKey, miss, this.CACHE_MISS_TTL);
        return miss;
      }

      const data = await response.json();

      if (data.status !== 1 || !data.product) {
        console.log(`[BarcodeLookup] Product not found for ${cleaned}`);
        const miss: BarcodeResult = { found: false };
        cache.set(cacheKey, miss, this.CACHE_MISS_TTL);
        return miss;
      }

      const product = data.product;
      const n = product.nutriments;

      if (!n) {
        const miss: BarcodeResult = { found: false };
        cache.set(cacheKey, miss, this.CACHE_MISS_TTL);
        return miss;
      }

      // Compute per-serving macros from per-100g data (more reliable than
      // crowd-sourced _serving values). Scale by serving_quantity if available.
      const has100g = (n['energy-kcal_100g'] > 0) || (n['proteins_100g'] > 0);
      const servingQty = product.serving_quantity ? parseFloat(product.serving_quantity) : null;
      const factor = has100g && servingQty ? servingQty / 100 : 1;

      let calories: number, protein: number, fat: number, totalCarbs: number, fiber: number;
      if (has100g && servingQty) {
        // Best path: scale per-100g by actual serving weight
        calories = (n['energy-kcal_100g'] || 0) * factor;
        protein = (n['proteins_100g'] || 0) * factor;
        fat = (n['fat_100g'] || 0) * factor;
        totalCarbs = (n['carbohydrates_100g'] || 0) * factor;
        fiber = (n['fiber_100g'] || 0) * factor;
      } else if (has100g) {
        // No serving_quantity: use per-100g raw (regulation-required, more accurate
        // than crowd-sourced _serving values). Labeled "100g" in servingSize.
        calories = n['energy-kcal_100g'] || 0;
        protein = n['proteins_100g'] || 0;
        fat = n['fat_100g'] || 0;
        totalCarbs = n['carbohydrates_100g'] || 0;
        fiber = n['fiber_100g'] || 0;
      } else if (n['energy-kcal_serving'] !== undefined) {
        // Last resort: use _serving when no _100g data exists at all
        calories = n['energy-kcal_serving'] || 0;
        protein = n['proteins_serving'] || 0;
        fat = n['fat_serving'] || 0;
        totalCarbs = n['carbohydrates_serving'] || 0;
        fiber = n['fiber_serving'] || 0;
      } else {
        calories = 0; protein = 0; fat = 0; totalCarbs = 0; fiber = 0;
      }

      // Skip products with clearly incomplete data
      if (calories === 0 && protein === 0 && fat === 0 && totalCarbs === 0) {
        console.log(`[BarcodeLookup] Incomplete nutrition data for ${cleaned}`);
        const miss: BarcodeResult = { found: false };
        cache.set(cacheKey, miss, this.CACHE_MISS_TTL);
        return miss;
      }

      const name = product.product_name_en || product.product_name || 'Unknown Product';
      const brand = product.brands || null;
      const servingSize = product.serving_size
        || (servingQty ? `${servingQty}g` : '100g');

      const result: BarcodeResult = {
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

      console.log(`[BarcodeLookup] Found "${result.item!.name}" for ${cleaned} (${servingSize})`);
      cache.set(cacheKey, result, this.CACHE_HIT_TTL);
      return result;

    } catch (error: any) {
      console.error(`[BarcodeLookup] Error looking up ${cleaned}:`, error.message);
      return { found: false };
    }
  }
}

export const barcodeLookup = new BarcodeLookupService();

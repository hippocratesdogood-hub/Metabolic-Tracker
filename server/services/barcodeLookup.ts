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

      // Prefer per-serving data, fall back to per-100g
      const hasServing = n['energy-kcal_serving'] !== undefined;
      const suffix = hasServing ? '_serving' : '_100g';

      const calories = n[`energy-kcal${suffix}`] || 0;
      const protein = n[`proteins${suffix}`] || 0;
      const fat = n[`fat${suffix}`] || 0;
      const totalCarbs = n[`carbohydrates${suffix}`] || 0;
      const fiber = n[`fiber${suffix}`] || 0;

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
        || (hasServing ? `${product.serving_quantity || '?'}g` : '100g');

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

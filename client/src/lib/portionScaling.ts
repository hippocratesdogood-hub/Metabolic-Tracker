/**
 * Portion scaling for analyzed food items (food-analysis fixes, Aug 2026).
 *
 * Nutritionix resolves container words ("1 can tuna") to a gram weight the
 * user never sees. These helpers let the confirm UI expose that weight and
 * recompute macros when the user corrects it (e.g. 172 g drained can → their
 * actual 142 g can), scaling linearly from the per-gram values of the
 * original analysis so repeated edits don't accumulate rounding drift.
 */

export interface ScalableItem {
  quantity: number;
  servingWeightGrams: number | null;
  calories: number;
  protein: number;
  fat: number;
  totalCarbs: number;
  fiber: number;
  netCarbs: number;
  /** Per-single-unit base values captured at analysis time */
  _baseCal: number;
  _basePro: number;
  _baseFat: number;
  _baseTotalCarbs: number;
  _baseFiber: number;
  _baseNetCarbs: number;
  /** Grams per 1 unit quantity at analysis time (null when unknown) */
  _baseGrams: number | null;
}

/**
 * Container-style units whose real-world size is ambiguous (a "can" of tuna
 * is 142 g or 172 g depending on the can). For these the resolved gram
 * weight is surfaced as an editable field. Measured units (cup, tbsp, oz, g)
 * are unambiguous and stay quantity-driven.
 */
const CONTAINER_UNIT_RE =
  /\b(can|bar|package|packet|bottle|slice|jar|pouch|container|box|carton|tin|tub|serving)s?\b/i;

export function isContainerUnit(unit: string | null | undefined): boolean {
  return !!unit && CONTAINER_UNIT_RE.test(unit);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type MacroUpdates = {
  quantity: number;
  servingWeightGrams: number | null;
  calories: number;
  protein: number;
  fat: number;
  totalCarbs: number;
  fiber: number;
  netCarbs: number;
};

/**
 * Scale an item to a new total gram weight, keeping quantity unchanged
 * unless a new quantity is supplied. Returns the fields to merge into the
 * item. No-op (returns current values) when the item has no gram basis.
 */
export function scaleByGrams(
  item: ScalableItem,
  newTotalGrams: number,
  newQuantity?: number,
): MacroUpdates {
  const quantity = newQuantity ?? item.quantity;
  if (!item._baseGrams || item._baseGrams <= 0 || newTotalGrams <= 0) {
    return {
      quantity,
      servingWeightGrams: item.servingWeightGrams,
      calories: item.calories,
      protein: item.protein,
      fat: item.fat,
      totalCarbs: item.totalCarbs,
      fiber: item.fiber,
      netCarbs: item.netCarbs,
    };
  }
  // Per-gram values derived from the original analysis, not current state,
  // so repeated edits stay exact.
  const perGram = {
    cal: item._baseCal / item._baseGrams,
    pro: item._basePro / item._baseGrams,
    fat: item._baseFat / item._baseGrams,
    totalCarbs: item._baseTotalCarbs / item._baseGrams,
    fiber: item._baseFiber / item._baseGrams,
    netCarbs: item._baseNetCarbs / item._baseGrams,
  };
  return {
    quantity,
    servingWeightGrams: round1(newTotalGrams),
    calories: Math.round(perGram.cal * newTotalGrams),
    protein: round1(perGram.pro * newTotalGrams),
    fat: round1(perGram.fat * newTotalGrams),
    totalCarbs: round1(perGram.totalCarbs * newTotalGrams),
    fiber: round1(perGram.fiber * newTotalGrams),
    netCarbs: round1(perGram.netCarbs * newTotalGrams),
  };
}

/**
 * Scale an item to a new quantity. Gram-bearing items scale through their
 * current per-unit gram weight so a user's corrected size survives quantity
 * changes; gram-less items fall back to the per-unit base values (the
 * behavior the confirm UI has always had).
 */
export function scaleByQuantity(item: ScalableItem, newQuantity: number): MacroUpdates {
  if (
    item._baseGrams &&
    item._baseGrams > 0 &&
    item.servingWeightGrams &&
    item.servingWeightGrams > 0 &&
    item.quantity > 0
  ) {
    const gramsPerUnit = item.servingWeightGrams / item.quantity;
    return scaleByGrams(item, gramsPerUnit * newQuantity, newQuantity);
  }
  return {
    quantity: newQuantity,
    servingWeightGrams: item.servingWeightGrams,
    calories: Math.round(item._baseCal * newQuantity),
    protein: round1(item._basePro * newQuantity),
    fat: round1(item._baseFat * newQuantity),
    totalCarbs: round1(item._baseTotalCarbs * newQuantity),
    fiber: round1(item._baseFiber * newQuantity),
    netCarbs: round1(item._baseNetCarbs * newQuantity),
  };
}

/**
 * Parent-aggregate macro computation for parent/child meal entries.
 *
 * The invariant: /api/macro-progress and /api/log/day sum from the PARENT
 * row's (userCorrectionsJson ?? aiOutputJson).macros — child rows contribute
 * nothing — so every path that creates or edits child items MUST write a
 * parent aggregate computed exactly this way, or Today's Nutrition silently
 * disagrees with the meal detail. Used by POST /api/food/meal and
 * PUT /api/food/meal/:id.
 */

export interface MealItemMacros {
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  totalCarbs?: number | null;
  fiber?: number | null;
  netCarbs?: number | null;
}

export interface AggregateMacros {
  calories: number;
  protein: number;
  fat: number;
  totalCarbs: number;
  fiber: number;
  netCarbs: number;
  /** Legacy alias read by older clients/paths: mirrors netCarbs. */
  carbs: number;
}

export function computeAggregateMacros(items: MealItemMacros[]): AggregateMacros {
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const agg = { calories: 0, protein: 0, fat: 0, totalCarbs: 0, fiber: 0, netCarbs: 0, carbs: 0 };
  for (const item of items) {
    agg.calories += num(item.calories);
    agg.protein += num(item.protein);
    agg.fat += num(item.fat);
    agg.totalCarbs += num(item.totalCarbs);
    agg.fiber += num(item.fiber);
    agg.netCarbs += num(item.netCarbs);
  }
  agg.carbs = agg.netCarbs;
  return agg;
}

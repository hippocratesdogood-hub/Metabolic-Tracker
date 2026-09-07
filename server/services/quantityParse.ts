/**
 * Leading-quantity parsing for food phrases that bypass Nutritionix's own
 * natural-language parser — the branded-database and spell-correction paths.
 *
 * Nutritionix's natural endpoint understands "two eggs", "a couple of eggs",
 * "half an avocado" on its own (verified live Sept 2026). The branded and
 * spell-corrected paths do NOT go through that parser: they strip a leading
 * count, search on the rest, and scale the result. Before this module that
 * strip was a numerals-only regex, so "two Quest bars" searched "two Quest
 * bars", matched, and silently scaled by 1 (Sept 7 2026 production find).
 *
 * Returns `quantity: null` when the phrase carries no recognizable leading
 * quantity, so callers can distinguish "member said 1" from "we assumed 1".
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  dozen: 12,
};

/** Words that read as quantities and must never count as food tokens. */
export const QUANTITY_WORDS: readonly string[] = [
  ...Object.keys(NUMBER_WORDS),
  "a", "an", "couple", "half", "few", "several", "some",
];

export interface LeadingQuantity {
  /** Parsed count, or null when the phrase has no recognizable leading quantity. */
  quantity: number | null;
  /** The phrase with the quantity words removed (trimmed). Equals the input when quantity is null. */
  rest: string;
}

/**
 * Parse a leading quantity off a food phrase.
 *
 *   "2 Quest bars"        → 2,   "Quest bars"
 *   "two Quest bars"      → 2,   "Quest bars"
 *   "a couple of RxBars"  → 2,   "RxBars"
 *   "half a Quest bar"    → 0.5, "Quest bar"
 *   "a Quest bar"         → 1,   "Quest bar"      (article = explicit single)
 *   "1/2 protein bar"     → 0.5, "protein bar"
 *   "a dozen eggs"        → 12,  "eggs"
 *   "Quest bars"          → null, "Quest bars"    (nothing stated → caller assumes)
 *
 * Measured amounts ("40 g protein bar") are deliberately NOT treated as a
 * count: the numeral is followed by a unit the branded search should keep.
 */
export function parseLeadingQuantity(phrase: string): LeadingQuantity {
  const input = (phrase || "").trim();
  const none: LeadingQuantity = { quantity: null, rest: input };
  if (!input) return none;

  const lower = input.toLowerCase();
  const take = (re: RegExp, quantity: number): LeadingQuantity | null => {
    const m = lower.match(re);
    if (!m) return null;
    const rest = input.slice(m[0].length).trim();
    return rest.length > 0 ? { quantity, rest } : null;
  };

  // "half a", "half an", "half of a", "a half", "half"
  const half = take(/^(?:a\s+)?half(?:\s+of)?(?:\s+an?)?\s+/, 0.5);
  if (half) return half;

  // "a couple of", "a couple", "couple of"
  const couple = take(/^(?:a\s+)?couple(?:\s+of)?\s+/, 2);
  if (couple) return couple;

  // "a dozen", "dozen"
  const dozen = take(/^(?:a\s+)?dozen(?:\s+of)?\s+/, 12);
  if (dozen) return dozen;

  // Numerals: "2", "2.5", "1/2" — only when followed by a non-digit, non-unit
  // word so "40 g protein bar" stays a measured amount, not a count of 40.
  const numeral = lower.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+(?![\d])/);
  if (numeral) {
    const tok = numeral[1];
    const value = tok.includes("/")
      ? Number(tok.split("/")[0]) / Number(tok.split("/")[1])
      : parseFloat(tok);
    const rest = input.slice(numeral[0].length).trim();
    if (Number.isFinite(value) && value > 0 && rest && !isMeasureUnit(rest.split(/\s+/)[0])) {
      return { quantity: value, rest };
    }
    return none;
  }

  // Number words: "two Quest bars", "one RxBar"
  const word = lower.match(/^([a-z]+)\s+/);
  if (word) {
    const w = word[1];
    if (w in NUMBER_WORDS) {
      const rest = input.slice(word[0].length).trim();
      if (rest) return { quantity: NUMBER_WORDS[w], rest };
    }
    // Articles: "a Quest bar", "an RxBar" — an explicit single.
    if (w === "a" || w === "an") {
      const rest = input.slice(word[0].length).trim();
      if (rest) return { quantity: 1, rest };
    }
  }

  return none;
}

const MEASURE_UNITS = new Set([
  "g", "gram", "grams", "oz", "ounce", "ounces", "ml", "cup", "cups", "tbsp", "tsp",
  "lb", "lbs", "pound", "pounds", "kg", "l", "liter", "liters", "scoop", "scoops",
]);

function isMeasureUnit(tok: string): boolean {
  return MEASURE_UNITS.has(tok.toLowerCase());
}

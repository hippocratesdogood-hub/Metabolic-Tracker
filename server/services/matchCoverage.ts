/**
 * Partial-salvage detection (food-analysis follow-ups, Aug 2026).
 *
 * Nutritionix's natural parser can salvage one known word out of an unknown
 * phrase — "zzqx flurbganitz wafer" comes back as a verified "wafer", and
 * "in n out double double no bun" as a 140-kcal "bun" — with nothing in the
 * response marking the loss (no confidence score or match-ratio field
 * exists; verified live Aug 2026). The only available signal is comparing
 * the member's text against what matched: token coverage.
 *
 * Coverage = matched content tokens / content tokens, where content tokens
 * exclude quantities, units, connectors, dictation filler, and a minimal
 * cooking-descriptor list. Matching is substring in both directions
 * ("mayo"/"mayonnaise", "eggss"/"eggs", "chickenbreast"/"chicken") so typos
 * and shorthand don't read as misses.
 *
 * Validated against a 113-sentence live battery (typos, shorthand, run-ons,
 * dictation, regional dishes, homemade/leftovers, restaurant orders,
 * brands): 0/107 ordinary sentences produced a loose-match false positive
 * at the < 0.5 threshold. Coverage is a lexical signal only — it catches
 * missing words, never wrong meanings ("chipotle chicken bowl" matching
 * the pepper scores 1.0).
 */

const UNIT_STOP = new Set(
  `cup cups c tbsp tablespoon tablespoons tsp teaspoon teaspoons oz ounce ounces g gram grams
   lb lbs pound pounds slice slices can cans bar bars piece pieces serving servings bottle bottles
   glass bowl half quarter small sm medium med large lg grande venti tall scoop scoops handful
   splash inch squares`.split(/\s+/).filter(Boolean),
);
const CONNECT_STOP = new Set('a an the of with w and no on in my some plus extra side to from at'.split(' '));
const FILLER_STOP = new Set(
  `um uh like i had ate eat just please log this that morning today yesterday
   she he they made me for after gym one two three`.split(/\s+/).filter(Boolean),
);
const DESCRIPTOR_STOP = new Set('homemade home made leftover leftovers fresh baked'.split(' '));

const STOP = new Set<string>();
[UNIT_STOP, CONNECT_STOP, FILLER_STOP, DESCRIPTOR_STOP].forEach((set) => set.forEach((t) => STOP.add(t)));

/** Words in the member's text that identify food, after stripping amounts and filler. */
export function contentTokens(text: string): string[] {
  const out: string[] = [];
  for (const t of (text.toLowerCase().match(/[a-z]+/g) ?? [])) {
    if (t.length < 2 || STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

function tokenMatches(tok: string, nameTok: string): boolean {
  if (tok === nameTok) return true;
  return tok.length >= 3 && nameTok.length >= 3 && (tok.includes(nameTok) || nameTok.includes(tok));
}

function tokenCovered(tok: string, names: string[]): boolean {
  for (const name of names) {
    for (const nt of name.toLowerCase().match(/[a-z]+/g) ?? []) {
      if (tokenMatches(tok, nt)) return true;
    }
  }
  return false;
}

export interface CoverageResult {
  /** 0..1 fraction of content tokens accounted for by the matched names. 1 when there are no content tokens. */
  coverage: number;
  /** The member's words that nothing matched. */
  unmatched: string[];
}

/** How much of `text` is accounted for by the matched food names/tags/brands. */
export function coverageFor(text: string, matchedNames: string[]): CoverageResult {
  const toks = contentTokens(text);
  if (toks.length === 0) return { coverage: 1, unmatched: [] };
  const unmatched = toks.filter((t) => !tokenCovered(t, matchedNames));
  return { coverage: 1 - unmatched.length / toks.length, unmatched };
}

/** Below this, a line that DID return foods is marked a loose match. */
export const LOOSE_MATCH_THRESHOLD = 0.5;

/**
 * Acceptance bar for swapping a line's natural-parse result for a branded
 * product: the branded hit's full name must cover at least this fraction of
 * the line — one overlapping word is not enough ("morning fuel stack
 * gummies" must not become Maverik Adventure Fuel Gummies).
 */
export const BRANDED_UPGRADE_MIN_COVERAGE = 2 / 3;

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

import { QUANTITY_WORDS } from './quantityParse';

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
// Quantity words ("five Quest bars") are amounts, not food — without this,
// "five" counted as an unmatched food token and dragged coverage down.
const NUMBER_STOP = new Set(QUANTITY_WORDS);

const STOP = new Set<string>();
[UNIT_STOP, CONNECT_STOP, FILLER_STOP, DESCRIPTOR_STOP, NUMBER_STOP].forEach((set) => set.forEach((t) => STOP.add(t)));

// ---------------------------------------------------------------------------
// HEURISTIC — container plausibility (Sept 2026)
//
// Lexical coverage cannot catch a WRONG meaning: "a chipotle chicken bowl"
// resolves to a 14-kcal chipotle pepper plus 3 oz of chicken (201 kcal) with
// every word "matched" (coverage 1.0). The only cheap signal is arithmetic:
// when the member named a container that implies a composed meal and the
// resolved total is implausibly low, label the line a loose match so the
// confirm UI asks them to check it. This is a heuristic, not a parse — it
// will flag a genuine "bowl of berries" too. That is accepted: the label is a
// nudge to verify, never a block. Tune the threshold as real patients
// generate false positives.
// ---------------------------------------------------------------------------

/** Container words that imply a composed meal rather than a single ingredient. */
export const CONTAINER_WORDS = new Set(
  'bowl bowls plate plates platter burrito burritos wrap wraps sandwich sandwiches sub subs entree entrees combo'.split(' '),
);

/** Below this many kcal, a container line is flagged for the member to check. Tunable. */
export const CONTAINER_PLAUSIBILITY_MIN_KCAL = 300;

/** The container word the member used ("bowl", "burrito"), or null. Drives the confirm-UI copy. */
export function containerWordIn(text: string): string | null {
  for (const t of (text.toLowerCase().match(/[a-z]+/g) ?? [])) {
    if (CONTAINER_WORDS.has(t)) return t;
  }
  return null;
}

/** Does the member's text name a container from CONTAINER_WORDS? */
export function mentionsContainer(text: string): boolean {
  return containerWordIn(text) !== null;
}

/**
 * True when a container line resolved to fewer calories than a composed meal
 * plausibly has — the "chipotle = one pepper" failure shape.
 */
export function containerImplausible(text: string, totalKcal: number): boolean {
  return mentionsContainer(text) && totalKcal < CONTAINER_PLAUSIBILITY_MIN_KCAL;
}

// ---------------------------------------------------------------------------
// HEURISTIC — negation guard (Sept 2026)
//
// Nutritionix's natural parser ignores negation: "teriyaki bowl no rice"
// logs a bowl of rice (411 kcal), and the total is plausible enough that
// nothing else flags it. Patients managing carbs type "no bun / no rice /
// no cheese" constantly, so this is not an edge case. The guard is
// deliberately crude — correctness is the LLM path's job (post-BAA); this
// only makes sure the member SEES that an item they excluded was logged.
//
// An item is flagged when its canonical name (Nutritionix's tags.item, else
// the food name) IS the negated food — not when it merely mentions it. That
// is what keeps "double double no bun" → "Double-Double, Protein Style (Bun
// Replaced with Lettuce)" from false-flagging: its canonical item is the
// burger, and "bun" only appears in the descriptive suffix.
// ---------------------------------------------------------------------------

const NEGATION_CUE =
  /\b(?:no|without|w\/o|sans|minus|hold the|skip the|skip|leave off the|leave off)\s+(?:the\s+|any\s+|extra\s+)?([a-z]+)(?:[\s-]+([a-z]+))?/g;
const NEGATION_FOLLOWER_STOP = new Set('and or but with plus on in for please thanks thank instead extra side'.split(' '));

/** Foods the member explicitly excluded: "burger no bun, side salad without dressing" → ["bun", "dressing"]. */
export function negatedTerms(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  // exec loop rather than matchAll: the project's TS target predates
  // iterable RegExp results (see the existing Set-iteration error).
  const re = new RegExp(NEGATION_CUE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    const first = m[1];
    const second = m[2];
    // A cue followed by a connector ("no and …") is not a negation of anything.
    if (!first || first.length < 2 || STOP.has(first) || NEGATION_FOLLOWER_STOP.has(first)) continue;
    out.push(first);
    // "no sour cream", "without brown rice" — keep a two-word food when the
    // second word is not a connector; STOP words like "bowl" are dropped.
    if (second && second.length >= 2 && !STOP.has(second) && !NEGATION_FOLLOWER_STOP.has(second)) out.push(second);
  }
  const seen = new Set<string>();
  return out.filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
}

/**
 * If a resolved item's canonical name is one of the negated foods, return the
 * negated word (for the UI copy); otherwise null.
 */
export function negatedItemWord(canonicalName: string, terms: string[]): string | null {
  if (terms.length === 0) return null;
  // When Nutritionix honored the negation itself, the item's own name encodes
  // it ("greek salad without dressing", "burger no bun") — that item is the
  // corrected dish, not the excluded food. Live false positive, Sept 2026.
  const selfNegated = new Set(negatedTerms(canonicalName));
  const nameToks = canonicalName.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const term of terms) {
    if (selfNegated.has(term)) continue;
    if (nameToks.some((nt) => tokenMatches(term, nt))) return term;
  }
  return null;
}

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

/** Damerau-Levenshtein distance (with adjacent transposition), for typo tolerance. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** Typo-tolerant token match: exact, substring (len ≥3), or small edit distance. */
export function fuzzyTokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  const maxDist = Math.min(a.length, b.length) >= 6 ? 2 : 1;
  return editDistance(a, b) <= maxDist;
}

/**
 * Does an instant-search "common" suggestion plausibly denote the same food
 * the member typed, up to typos? True only when EVERY content token of the
 * suggestion fuzzy-matches a token of the member's line — "scrambled eggs"
 * matches "scrambled egs", but "teriyaki chicken rice bowls" does not match
 * a Chipotle order. Used to spell-correct typo lines that parsed to nothing,
 * without ever substituting a different dish.
 */
export function suggestionMatchesLine(suggestion: string, line: string): boolean {
  const sugg = contentTokens(suggestion);
  if (sugg.length === 0) return false;
  const lineToks = contentTokens(line);
  return sugg.every((s) => lineToks.some((l) => fuzzyTokenMatch(s, l)));
}

/**
 * Acceptance bar for swapping a line's natural-parse result for a branded
 * product: the branded hit's full name must cover at least this fraction of
 * the line — one overlapping word is not enough ("morning fuel stack
 * gummies" must not become Maverik Adventure Fuel Gummies).
 */
export const BRANDED_UPGRADE_MIN_COVERAGE = 2 / 3;

/**
 * Did the member's text NAME this brand? Exact token match, or a member
 * token that contains a brand token of ≥4 chars ("wendys" names "Wendy's").
 * Deliberately NOT the reverse: a member token contained in a brand token
 * does not count — "eggs" must never be read as naming "Eggsmart".
 */
export function brandTokenNamed(textTokens: string[], brandName: string | null | undefined): boolean {
  const brandToks = contentTokens(brandName || '');
  return textTokens.some((t) => brandToks.some((b) => t === b || (b.length >= 4 && t.includes(b))));
}

export interface BrandedHit {
  brand_name: string | null;
  food_name: string | null;
}

/**
 * Acceptance for the unresolved path (the line parsed to nothing): the
 * member must have named the brand (brand-conflict guard — a Chipotle order
 * must never log a Wahoo's bowl) AND the product's full name must cover
 * ≥2/3 of the phrase.
 */
export function acceptableBrandedDefault(searchTerm: string, hit: BrandedHit): boolean {
  if (!brandTokenNamed(contentTokens(searchTerm), hit.brand_name)) return false;
  const cov = coverageFor(searchTerm, [`${hit.brand_name || ''} ${hit.food_name || ''}`]).coverage;
  // Strictly above the bar: "morning fuel stack gummies" vs Maverik
  // Adventure Fuel Grizzly Gummies lands exactly AT 2/3 and must not pass.
  // Epsilon guards the float artifact where 1 - 1/3 lands one ulp above 2/3.
  return cov > BRANDED_UPGRADE_MIN_COVERAGE + 1e-9;
}

/**
 * Acceptance for the salvage-upgrade path (the line parsed partially): the
 * brand must be named by one of the UNMATCHED words specifically, the full
 * name must cover ≥2/3 of the line, and it must beat the natural parse.
 */
export function acceptableBrandedUpgrade(
  line: string,
  unmatchedTokens: string[],
  naturalCoverage: number,
  hit: BrandedHit,
): boolean {
  if (!brandTokenNamed(unmatchedTokens, hit.brand_name)) return false;
  const cov = coverageFor(line, [`${hit.brand_name || ''} ${hit.food_name || ''}`]).coverage;
  // Strictly above the bar (see acceptableBrandedDefault), and better than
  // what the natural parse already had.
  return cov > BRANDED_UPGRADE_MIN_COVERAGE + 1e-9 && cov > naturalCoverage;
}

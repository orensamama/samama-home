import type { MasterProduct, ShoppingItem } from "@/lib/shoppingData";

// Only fuzzy-suggest for names close in both edit distance AND length --
// keeps short/very different words (e.g. "עוף" vs "אגס") from randomly
// clearing the similarity bar.
const FUZZY_THRESHOLD = 0.7;
const MAX_LENGTH_GAP = 2;

/** Classic dynamic-programming edit distance, no external dependency. */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prevDiagonal = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const temp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prevDiagonal : 1 + Math.min(prevDiagonal, dp[i], dp[i - 1]);
      prevDiagonal = temp;
    }
  }
  return dp[m];
}

/** 1 = identical, 0 = nothing in common (relative to the longer string). */
export function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

export function findExactProductMatch(products: MasterProduct[], name: string): MasterProduct | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return products.find((product) => product.name.trim().toLowerCase() === key) ?? null;
}

/**
 * Best near-match for a typo'd product name (e.g. "בטטן" -> "בטטה") --
 * deliberately excludes exact matches, which are handled separately, so
 * the two never both fire for the same name.
 */
export function findFuzzyProductMatch(
  products: MasterProduct[],
  name: string
): { product: MasterProduct; score: number } | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;

  let best: { product: MasterProduct; score: number } | null = null;
  for (const product of products) {
    const candidate = product.name.trim().toLowerCase();
    if (candidate === key) continue;
    if (Math.abs(candidate.length - key.length) > MAX_LENGTH_GAP) continue;

    const score = nameSimilarity(key, candidate);
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = { product, score };
    }
  }
  return best;
}

/**
 * The active (in-cart, not-yet-completed) shopping-list row for a
 * resolved product identity, if one already exists -- used to bump its
 * quantity instead of inserting a duplicate line. Falls back to an exact
 * title match for one-off items that were never linked to an Arsenal
 * product in the first place.
 */
export function findExistingShoppingItem(
  matchedProduct: MasterProduct | null,
  name: string,
  shoppingItems: ShoppingItem[]
): ShoppingItem | null {
  const active = shoppingItems.filter((item) => item.in_cart && !item.completed);

  if (matchedProduct) {
    return active.find((item) => item.product_id === matchedProduct.id) ?? null;
  }

  const key = name.trim().toLowerCase();
  if (!key) return null;
  return active.find((item) => !item.product_id && item.title.trim().toLowerCase() === key) ?? null;
}

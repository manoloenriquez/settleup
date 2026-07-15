/**
 * Divide totalCents equally among n participants.
 * Distributes the remainder (totalCents % n) by giving one extra cent
 * to the first `remainder` participants.
 *
 * Example: equalSplit(100, 3) → [34, 33, 33]
 */
export function equalSplit(totalCents: number, n: number): number[] {
  if (n <= 0) throw new Error("n must be a positive integer");
  const base = Math.floor(totalCents / n);
  const remainder = totalCents % n;
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * Allocate totalCents proportionally to `weights` using largest-remainder
 * rounding so the result always sums to exactly totalCents.
 * Ties in fractional remainder are broken by lower index.
 */
function largestRemainderSplit(totalCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) throw new Error("weights must sum to a positive number");

  const exact = weights.map((w) => (totalCents * w) / totalWeight);
  const result = exact.map((v) => Math.floor(v));
  let leftover = totalCents - result.reduce((sum, v) => sum + v, 0);

  const byRemainder = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; leftover > 0 && k < byRemainder.length; k++, leftover--) {
    result[byRemainder[k]!.i]! += 1;
  }
  return result;
}

/**
 * Split totalCents by percentages (one per participant). Percentages must sum
 * to 100 (±0.01 to absorb float entry like 33.33+33.33+33.34).
 *
 * Example: percentSplit(10000, [60, 40]) → [6000, 4000]
 */
export function percentSplit(totalCents: number, percents: number[]): number[] {
  if (percents.length === 0) throw new Error("percents must not be empty");
  if (percents.some((p) => p < 0)) throw new Error("percents must be non-negative");
  const sum = percents.reduce((acc, p) => acc + p, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`percents must sum to 100 (got ${sum})`);
  }
  return largestRemainderSplit(totalCents, percents);
}

/**
 * Split totalCents by shares/weights (e.g. [2, 1, 1] = one member pays for
 * two people). Weights must all be positive.
 *
 * Example: sharesSplit(10000, [2, 1, 1]) → [5000, 2500, 2500]
 */
export function sharesSplit(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) throw new Error("weights must not be empty");
  if (weights.some((w) => w <= 0 || !Number.isFinite(w))) {
    throw new Error("weights must all be positive");
  }
  return largestRemainderSplit(totalCents, weights);
}

/**
 * Whether a set of resolved shares looks like an equal split.
 * Splits are stored as resolved cents per member, so an equal split of an
 * amount that doesn't divide evenly leaves at most a 1-cent spread.
 *
 * Example: isEqualShareSplit([34, 33, 33]) → true
 */
export function isEqualShareSplit(shareCents: number[]): boolean {
  if (shareCents.length === 0) return false;
  return Math.max(...shareCents) - Math.min(...shareCents) <= 1;
}

/**
 * Generate a URL-safe slug from a display name, guaranteed unique among `existing`.
 * Appends -2, -3 etc. until a non-conflicting slug is found.
 *
 * Example: generateSlug("John Doe", ["john-doe"]) → "john-doe-2"
 */
export function generateSlug(name: string, existing: string[]): string {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  if (!existing.includes(base)) return base;

  let suffix = 2;
  while (existing.includes(`${base}-${suffix}`)) {
    suffix++;
  }
  return `${base}-${suffix}`;
}

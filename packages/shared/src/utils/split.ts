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
 * Scale decimal weights (up to 6 places) to integers so allocation runs in
 * exact integer arithmetic. 33.33 → 3333 with scale 100.
 */
const ZERO = BigInt(0);
const ONE = BigInt(1);

function toIntegerWeights(weights: number[]): bigint[] {
  let places = 0;
  for (const w of weights) {
    const text = String(w);
    const exponent = /e-(\d+)$/.exec(text);
    if (exponent) {
      // 1e-7 style: enough places that the smallest weight keeps 6 digits.
      places = Math.max(places, Math.min(20, Number(exponent[1]) + 6));
      continue;
    }
    const dot = text.indexOf(".");
    if (dot >= 0) places = Math.max(places, Math.min(6, text.length - dot - 1));
  }
  // Scale with decimal string arithmetic so large scales stay exact in BigInt.
  return weights.map((w) => {
    const [whole = "0", frac = ""] = w.toFixed(places).split(".");
    return BigInt(whole + frac.padEnd(places, "0"));
  });
}

/**
 * Allocate totalCents proportionally to `weights` using largest-remainder
 * rounding so the result always sums to exactly totalCents.
 * Ties in fractional remainder are broken by lower index.
 *
 * Runs in BigInt so large amounts and decimal weights never lose a cent to
 * floating point: each share is floor(total·w / W) and the leftover cents go
 * to the largest exact remainders.
 */
function largestRemainderSplit(totalCents: number, weights: number[]): number[] {
  const ints = toIntegerWeights(weights);
  const totalWeight = ints.reduce((sum, w) => sum + w, ZERO);
  if (totalWeight <= ZERO) throw new Error("weights must sum to a positive number");

  const total = BigInt(totalCents);
  const parts = ints.map((w, i) => ({
    i,
    base: (total * w) / totalWeight,
    rem: (total * w) % totalWeight,
  }));
  const result = parts.map((p) => p.base);
  let leftover = total - result.reduce((sum, v) => sum + v, ZERO);

  const byRemainder = [...parts].sort((a, b) =>
    a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1,
  );
  for (let k = 0; leftover > ZERO && k < byRemainder.length; k++, leftover--) {
    result[byRemainder[k]!.i]! += ONE;
  }
  return result.map((v) => Number(v));
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

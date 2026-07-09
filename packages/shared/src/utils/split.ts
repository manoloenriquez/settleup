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

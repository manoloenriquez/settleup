// ---------------------------------------------------------------------------
// Offline sync core — retry backoff policy
// ---------------------------------------------------------------------------

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60 * 1000;
export const MAX_RETRYABLE_ATTEMPTS = 8;

/**
 * Exponential backoff with ±20% jitter: min(2s · 2^attempts, 5min).
 *
 * @param attempts — retryable attempts already consumed (≥ 1 after the first failure)
 * @param random — injectable RNG in [0, 1) so tests are deterministic
 */
export function nextAttemptDelayMs(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(1, attempts);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(base * jitter);
}

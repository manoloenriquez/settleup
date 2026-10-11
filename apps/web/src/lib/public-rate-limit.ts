type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

type PublicRateLimitOptions = {
  maxRequests: number;
  windowMs: number;
};

type HeaderReader = {
  get(name: string): string | null;
};

export function getClientIp(headers: HeaderReader): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return headers.get("x-real-ip") ?? "unknown";
}

export function checkPublicRateLimit(key: string, options: PublicRateLimitOptions): boolean {
  const now = Date.now();
  // This is an additional edge safeguard. The write RPC owns the shared limit.
  if (store.size >= 10000) {
    for (const [entryKey, entryValue] of store)
      if (entryValue.resetAt <= now) store.delete(entryKey);
    // Fail closed on new keys at capacity; active callers keep their own budget.
    if (store.size >= 10000 && !store.has(key)) return false;
  }
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }

  if (entry.count >= options.maxRequests) return false;

  entry.count += 1;
  return true;
}

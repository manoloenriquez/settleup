import { AI_LIMITS } from "@template/shared/constants";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS = AI_LIMITS.RATE_LIMIT_PER_MINUTE;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export type RateLimitBackend = {
  consumeRateLimit: (userId: string) => Promise<RateLimitResult>;
};

const rateLimitResultSchema = z.object({
  allowed: z.boolean(),
  retry_after_ms: z.number().int().nonnegative(),
});

export function createMemoryRateLimitBackend(): RateLimitBackend {
  const store = new Map<string, RateLimitEntry>();

  return {
    async consumeRateLimit(userId: string): Promise<RateLimitResult> {
      const now = Date.now();
      const entry = store.get(userId);

      if (!entry || now >= entry.resetAt) {
        store.set(userId, { count: 1, resetAt: now + WINDOW_MS });
        return { allowed: true, retryAfterMs: 0 };
      }

      if (entry.count >= MAX_REQUESTS) {
        return { allowed: false, retryAfterMs: entry.resetAt - now };
      }

      entry.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

function createDatabaseRateLimitBackend(fallback: RateLimitBackend): RateLimitBackend {
  return {
    async consumeRateLimit(userId: string): Promise<RateLimitResult> {
      try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc("consume_ai_rate_limit");
        if (error) {
          return fallback.consumeRateLimit(userId);
        }

        const parsed = rateLimitResultSchema.safeParse(data);
        if (!parsed.success) {
          return fallback.consumeRateLimit(userId);
        }

        return {
          allowed: parsed.data.allowed,
          retryAfterMs: parsed.data.retry_after_ms,
        };
      } catch {
        return fallback.consumeRateLimit(userId);
      }
    },
  };
}

function createDefaultRateLimitBackend(): RateLimitBackend {
  const memoryBackend = createMemoryRateLimitBackend();

  if (process.env.VITEST === "true") {
    return memoryBackend;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return memoryBackend;
  }

  return createDatabaseRateLimitBackend(memoryBackend);
}

let backend: RateLimitBackend = createDefaultRateLimitBackend();

export function setRateLimitBackendForTests(nextBackend: RateLimitBackend | null): void {
  backend = nextBackend ?? createDefaultRateLimitBackend();
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  return backend.consumeRateLimit(userId);
}

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
  /** Set when the shared limiter could not be consulted; the request is denied. */
  unavailable?: boolean;
};

const UNAVAILABLE_RETRY_MS = 5_000;

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

type RateLimitRpc = () => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Shared limiter backed by the `consume_ai_rate_limit` RPC.
 *
 * Fails closed: every caller bills a third-party provider, and a per-process
 * memory fallback cannot enforce a limit across serverless instances. When the
 * RPC errors or returns an unexpected shape the request is denied with a short
 * retry hint instead of being let through unmetered.
 */
export function createDatabaseRateLimitBackend(rpc: RateLimitRpc): RateLimitBackend {
  const unavailable = (reason: string): RateLimitResult => {
    console.error("[ai] consume_ai_rate_limit unavailable:", reason);
    return { allowed: false, retryAfterMs: UNAVAILABLE_RETRY_MS, unavailable: true };
  };

  return {
    async consumeRateLimit(): Promise<RateLimitResult> {
      try {
        const { data, error } = await rpc();
        if (error) return unavailable(error.message);

        const parsed = rateLimitResultSchema.safeParse(data);
        if (!parsed.success) return unavailable(parsed.error.message);

        return {
          allowed: parsed.data.allowed,
          retryAfterMs: parsed.data.retry_after_ms,
        };
      } catch (e) {
        return unavailable(e instanceof Error ? e.message : String(e));
      }
    },
  };
}

function createDefaultRateLimitBackend(): RateLimitBackend {
  // Tests and Supabase-less local setups keep the in-process limiter; any
  // environment that can reach the database uses the shared one.
  if (process.env.VITEST === "true") {
    return createMemoryRateLimitBackend();
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return createMemoryRateLimitBackend();
  }

  return createDatabaseRateLimitBackend(async () => {
    const supabase = await createClient();
    return supabase.rpc("consume_ai_rate_limit");
  });
}

let backend: RateLimitBackend = createDefaultRateLimitBackend();

export function setRateLimitBackendForTests(nextBackend: RateLimitBackend | null): void {
  backend = nextBackend ?? createDefaultRateLimitBackend();
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  return backend.consumeRateLimit(userId);
}

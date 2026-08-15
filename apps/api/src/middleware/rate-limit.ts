import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { createUserScopedClient } from "../lib/supabase";
import type { AuthEnv } from "./auth";

const rateLimitResultSchema = z.object({
  allowed: z.boolean(),
  retry_after_ms: z.number().int().nonnegative(),
});

/**
 * Consumes one rate-limit token per request via the `consume_ai_rate_limit`
 * RPC. The RPC relies on `auth.uid()`, so we pass the user's JWT explicitly.
 *
 * Must run AFTER `authMiddleware`.
 *
 * Fail-closed on RPC errors: this middleware only guards the OpenAI-billed
 * /ai/* routes, where an unenforced limit means unbounded third-party spend.
 * If the limiter backend (RPC) fails or returns an unparseable result we
 * return 503 rather than letting the request through unmetered. Non-billed
 * routes don't mount this middleware, so they are unaffected.
 */
export const rateLimitMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const token = c.get("token");
  const supabase = createUserScopedClient(token);

  const { data, error } = await supabase.rpc("consume_ai_rate_limit");
  if (error) {
    console.error("[rate-limit] consume_ai_rate_limit RPC failed:", error.message);
    return c.json(
      { data: null, error: "Rate limiter unavailable. Please try again shortly." },
      503,
    );
  }

  const parsed = rateLimitResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[rate-limit] unexpected consume_ai_rate_limit result:", parsed.error.message);
    return c.json(
      { data: null, error: "Rate limiter unavailable. Please try again shortly." },
      503,
    );
  }

  if (!parsed.data.allowed) {
    return c.json(
      {
        data: null,
        error: `Rate limited. Try again in ${Math.ceil(parsed.data.retry_after_ms / 1000)}s.`,
      },
      429,
    );
  }

  await next();
  return undefined;
});

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
 * Fail-open on RPC errors: if the RPC or parse fails, the request proceeds.
 * This mirrors the web fallback behavior — we prefer availability over
 * strict enforcement when the DB is misbehaving.
 */
export const rateLimitMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const token = c.get("token");
  const supabase = createUserScopedClient(token);

  const { data, error } = await supabase.rpc("consume_ai_rate_limit");
  if (error) {
    await next();
    return undefined;
  }

  const parsed = rateLimitResultSchema.safeParse(data);
  if (!parsed.success) {
    await next();
    return undefined;
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

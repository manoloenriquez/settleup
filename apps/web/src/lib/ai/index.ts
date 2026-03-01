import type { ApiResponse } from "@template/shared/types";
import type { z } from "zod";
import { createProvider } from "./provider";
import { checkRateLimit } from "./rate-limit";

export type { LLMProvider, LLMRequest, LLMResponse } from "./types";

export function isLLMEnabled(): boolean {
  return process.env.LLM_ENABLED === "true";
}

export async function generateJSON<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  userId: string;
}): Promise<ApiResponse<T>> {
  if (!isLLMEnabled()) {
    return { data: null, error: "LLM features are disabled" };
  }

  const rateCheck = checkRateLimit(opts.userId);
  if (!rateCheck.allowed) {
    return {
      data: null,
      error: `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.`,
    };
  }

  const provider = createProvider();
  const result = await provider.generate({
    system: opts.system,
    prompt: opts.prompt,
  });

  if (result.error !== null) {
    return { data: null, error: result.error };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.data.text);
  } catch {
    return { data: null, error: "LLM returned invalid JSON" };
  }

  const validated = opts.schema.safeParse(parsed);
  if (!validated.success) {
    return {
      data: null,
      error: `LLM output validation failed: ${validated.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  return { data: validated.data, error: null };
}

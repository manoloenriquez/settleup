import type { z } from "zod";
import type { ApiResponse } from "@template/shared";
import { resolveProvider } from "./provider";

export { resolveProvider } from "./provider";
export { resetProviderCache } from "./provider";

/**
 * Generate structured JSON output from the mobile AI provider.
 * Mirrors the web's generateJSON<T>() pattern.
 * Returns an error (never throws) when AI is unavailable — callers fall back to deterministic logic.
 */
export async function generateJSON<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}): Promise<ApiResponse<T>> {
  const provider = await resolveProvider();

  if (provider.name === "none") {
    return { data: null, error: "AI is not available on this device" };
  }

  const result = await provider.generate({ system: opts.system, prompt: opts.prompt });
  if (result.error !== null) {
    return { data: null, error: result.error };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.data.text);
  } catch {
    return { data: null, error: "AI returned invalid JSON" };
  }

  const validated = opts.schema.safeParse(parsed);
  if (!validated.success) {
    return {
      data: null,
      error: `AI output validation failed: ${validated.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  return { data: validated.data, error: null };
}

/**
 * Returns whether a real AI provider (Apple Intelligence or API) is active.
 */
export async function isAIAvailable(): Promise<boolean> {
  const provider = await resolveProvider();
  return provider.name !== "none";
}

/**
 * Returns the active provider name for display/debugging.
 */
export async function getProviderName() {
  const provider = await resolveProvider();
  return provider.name;
}

import type { LLMProvider } from "./types";
import { createOpenAIProvider } from "./openai";

let cachedProvider: LLMProvider | null = null;

export function createProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = createOpenAIProvider();
  return cachedProvider;
}

/** Reset the cached provider. Useful for tests. */
export function resetProviderCache(): void {
  cachedProvider = null;
}

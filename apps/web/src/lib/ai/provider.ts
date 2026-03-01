import type { LLMProvider } from "./types";
import { createOllamaProvider } from "./ollama";
import { createOpenAIProvider } from "./openai";

let cachedProvider: LLMProvider | null = null;

export function createProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.LLM_PROVIDER ?? "ollama";

  switch (providerName) {
    case "openai":
      cachedProvider = createOpenAIProvider();
      break;
    case "ollama":
    default:
      cachedProvider = createOllamaProvider();
      break;
  }

  return cachedProvider;
}

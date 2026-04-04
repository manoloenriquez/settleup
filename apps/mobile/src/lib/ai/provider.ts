import { Platform } from "react-native";
import type { MobileLLMProvider } from "./types";
import { createApiProvider } from "./api-provider";

let cachedProvider: MobileLLMProvider | null = null;

const noneProvider: MobileLLMProvider = {
  name: "none",
  isAvailable: async () => false,
  generate: async () => ({ data: null, error: "AI is not available on this device" }),
};

export async function resolveProvider(): Promise<MobileLLMProvider> {
  if (cachedProvider) return cachedProvider;

  // 1. Try Apple Intelligence on iOS
  if (Platform.OS === "ios") {
    try {
      // Dynamic import — avoids crashes on iOS < 26 where the module may fail to load
      const { apple } = await import("@react-native-ai/apple");

      if (apple.isAvailable()) {
        cachedProvider = createAppleIntelligenceProvider();
        return cachedProvider;
      }
    } catch {
      // @react-native-ai/apple not installed or not supported on this iOS version
    }
  }

  // 2. Fall back to web API backend
  const apiUrl = process.env["EXPO_PUBLIC_AI_API_URL"];
  if (apiUrl) {
    cachedProvider = createApiProvider(apiUrl);
    return cachedProvider;
  }

  // 3. No AI available — all features degrade to deterministic fallbacks
  cachedProvider = noneProvider;
  return cachedProvider;
}

export function resetProviderCache(): void {
  cachedProvider = null;
}

function createAppleIntelligenceProvider(): MobileLLMProvider {
  return {
    name: "apple-intelligence",
    isAvailable: async () => {
      try {
        const { apple } = await import("@react-native-ai/apple");
        return apple.isAvailable();
      } catch {
        return false;
      }
    },
    generate: async (request) => {
      try {
        const [{ apple }, { generateText }] = await Promise.all([
          import("@react-native-ai/apple"),
          import("ai"),
        ]);
        const { text } = await generateText({
          model: apple(),
          system: request.system,
          prompt: request.prompt,
        });
        return { data: { text }, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Apple Intelligence generation failed";
        return { data: null, error: msg };
      }
    },
  };
}

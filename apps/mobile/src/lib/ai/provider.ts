import { Platform } from "react-native";
import type { MobileLLMProvider } from "./types";
import { createApiProvider } from "./api-provider";
import { getAiApiBase } from "@/lib/api-base";

let cachedProvider: MobileLLMProvider | null = null;

export const AI_UNAVAILABLE_MESSAGE = __DEV__
  ? "AI is unavailable: no Apple Intelligence on this device and no API URL configured. Set EXPO_PUBLIC_AI_API_URL (or EXPO_PUBLIC_API_URL) in apps/mobile/.env."
  : "AI features aren't available in this build. You can still add expenses manually.";

const noneProvider: MobileLLMProvider = {
  name: "none",
  isAvailable: async () => false,
  generate: async () => ({ data: null, error: AI_UNAVAILABLE_MESSAGE }),
};

/**
 * Check if a TurboModule native module is linked in the binary.
 * Uses the low-level __turboModuleProxy directly — unlike getEnforcing(),
 * this returns null instead of throwing an invariant violation.
 */
function hasNativeModule(name: string): boolean {
  try {
    const proxy = (global as Record<string, unknown>).__turboModuleProxy;
    if (typeof proxy === "function") {
      return (proxy as (n: string) => unknown)(name) != null;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Safely load @react-native-ai/apple — only if the native module is present.
 * The package calls TurboModuleRegistry.getEnforcing() at module scope,
 * which throws an invariant violation that RN's error overlay intercepts
 * before JS try/catch can handle it. We must verify the module exists first.
 */
export function loadAppleAI(): { apple: { isAvailable(): boolean; (): unknown } } | null {
  if (Platform.OS !== "ios") return null;
  if (!hasNativeModule("NativeAppleEmbeddings")) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-ai/apple") as { apple: { isAvailable(): boolean; (): unknown } };
  } catch {
    return null;
  }
}

/**
 * Live per-call Apple Intelligence availability. Deliberately never cached:
 * availability can change at runtime (Apple Intelligence toggled off, model
 * assets evicted), so routing decisions must re-evaluate it every time.
 */
export function isAppleIntelligenceAvailable(): boolean {
  const appleModule = loadAppleAI();
  if (!appleModule) return false;
  try {
    return appleModule.apple.isAvailable();
  } catch {
    return false;
  }
}

export async function resolveProvider(): Promise<MobileLLMProvider> {
  if (cachedProvider) return cachedProvider;

  // 1. Try Apple Intelligence on iOS (requires native module in the binary)
  const appleModule = loadAppleAI();
  if (appleModule && appleModule.apple.isAvailable()) {
    cachedProvider = createAppleIntelligenceProvider(appleModule);
    return cachedProvider;
  }

  // 2. Fall back to web API backend
  const apiUrl = getAiApiBase();
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

function createAppleIntelligenceProvider(
  appleModule: { apple: { isAvailable(): boolean; (): unknown } },
): MobileLLMProvider {
  return {
    name: "apple-intelligence",
    isAvailable: async () => {
      try {
        return appleModule.apple.isAvailable();
      } catch {
        return false;
      }
    },
    generate: async (request) => {
      try {
        const { generateText } = await import("ai");
        const { text } = await generateText({
          model: appleModule.apple() as Parameters<typeof generateText>[0]["model"],
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

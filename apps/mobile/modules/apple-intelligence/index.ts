import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Thin JavaScript surface of the local `AppleIntelligence` Expo module. All
 * functions exchange JSON strings; the typed, Zod-validated API lives in
 * `apps/mobile/src/lib/ai/apple-intelligence.ts`. The module is absent on
 * Android and in builds without the native code, in which case every call
 * reports the `unsupported` status instead of throwing.
 */
type NativeAppleIntelligence = {
  getAvailability(): Promise<string>;
  analyzeReceipt(uri: string): Promise<string>;
  interpretExpense(json: string): Promise<string>;
  interpretSplit(json: string): Promise<string>;
  summarizeInsights(json: string): Promise<string>;
};

const native = requireOptionalNativeModule<NativeAppleIntelligence>("AppleIntelligence");

export function isNativeModuleLinked(): boolean {
  return native !== null;
}

export function getNativeModule(): NativeAppleIntelligence | null {
  return native;
}

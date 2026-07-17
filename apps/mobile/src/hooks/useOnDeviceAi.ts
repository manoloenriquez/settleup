import { useCallback, useEffect, useState } from "react";
import { isAppleIntelligenceAvailable } from "@/lib/ai/provider";
import {
  getOnDeviceAiIntent,
  setOnDeviceAiIntent,
  subscribeOnDeviceAiIntent,
} from "@/lib/settings/on-device-ai";

/**
 * Settings-screen state for the on-device receipt processing toggle.
 * `intent` is the persisted opt-in; `available` is live hardware capability
 * (re-checked on every mount, never persisted). Effective routing is
 * `intent && available`, decided per scan by shouldUseOnDevice().
 */
export function useOnDeviceAi(): {
  intent: boolean;
  setIntent: (value: boolean) => Promise<void>;
  available: boolean;
} {
  const [intent, setIntentState] = useState(getOnDeviceAiIntent());
  const [available] = useState(() => isAppleIntelligenceAvailable());

  useEffect(() => subscribeOnDeviceAiIntent(setIntentState), []);

  const setIntent = useCallback(async (value: boolean) => {
    await setOnDeviceAiIntent(value);
  }, []);

  return { intent, setIntent, available };
}

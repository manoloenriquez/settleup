import AsyncStorage from "@react-native-async-storage/async-storage";

// Device-scoped opt-in for on-device receipt processing. Local-only by design:
// the setting is only meaningful on Apple Intelligence-capable hardware, so
// syncing intent across devices buys nothing. Default OFF — cloud is baseline.
const STORAGE_KEY = "settleup.on_device_ai";

let intent = false;
let hydrated = false;
const listeners = new Set<(value: boolean) => void>();

/**
 * Load the persisted intent into the in-memory mirror. Called once at app
 * start; until it resolves, reads return false (safe default → cloud path).
 */
export async function hydrateOnDeviceAiSetting(): Promise<void> {
  if (hydrated) return;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    intent = stored === "true";
  } catch {
    intent = false;
  }
  hydrated = true;
  listeners.forEach((listener) => listener(intent));
}

/** Synchronous read of the user's persisted INTENT (not effective state). */
export function getOnDeviceAiIntent(): boolean {
  return intent;
}

export async function setOnDeviceAiIntent(value: boolean): Promise<void> {
  intent = value;
  hydrated = true;
  listeners.forEach((listener) => listener(intent));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // In-memory value still applies for this session; persist is best-effort.
  }
}

/** Subscribe to intent changes (used by the settings hook). */
export function subscribeOnDeviceAiIntent(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

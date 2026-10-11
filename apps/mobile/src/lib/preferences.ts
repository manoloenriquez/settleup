import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { currencyCodeSchema, defaultCurrencyForLocale, type CurrencyCode } from "@template/shared";

/**
 * Device-level preferences. They belong to the person holding the phone, not
 * to an account, so they survive sign-in and sign-out.
 */
const PREFERENCES_KEY = "talli:prefs:v1";

const preferencesSchema = z.object({
  version: z.literal(1),
  onboardingCompletedAt: z.string().nullable(),
  defaultCurrency: currencyCodeSchema,
});

export type Preferences = z.infer<typeof preferencesSchema>;

export function deviceLocale(): string | undefined {
  try {
    return new Intl.NumberFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

export function initialPreferences(): Preferences {
  return {
    version: 1,
    onboardingCompletedAt: null,
    defaultCurrency: defaultCurrencyForLocale(deviceLocale()),
  };
}

export async function loadPreferences(): Promise<Preferences> {
  const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (raw === null) return initialPreferences();
  try {
    const parsed = preferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : initialPreferences();
  } catch {
    return initialPreferences();
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferencesSchema.parse(preferences)));
}

export type { CurrencyCode };

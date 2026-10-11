import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CurrencyCode } from "@template/shared";
import {
  initialPreferences,
  loadPreferences,
  savePreferences,
  type Preferences,
} from "@/lib/preferences";

type PreferencesContextValue = {
  loaded: boolean;
  preferences: Preferences;
  onboarded: boolean;
  setDefaultCurrency: (currency: CurrencyCode) => Promise<void>;
  completeOnboarding: (currency: CurrencyCode) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [loaded, setLoaded] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences);
  const latest = useRef(preferences);

  useEffect(() => {
    let active = true;
    void loadPreferences()
      .then((stored) => {
        if (!active) return;
        latest.current = stored;
        setPreferences(stored);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(async (change: (current: Preferences) => Preferences) => {
    const next = change(latest.current);
    await savePreferences(next);
    latest.current = next;
    setPreferences(next);
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      loaded,
      preferences,
      onboarded: preferences.onboardingCompletedAt !== null,
      setDefaultCurrency: (currency) => update((current) => ({ ...current, defaultCurrency: currency })),
      completeOnboarding: (currency) =>
        update((current) => ({
          ...current,
          defaultCurrency: currency,
          onboardingCompletedAt: current.onboardingCompletedAt ?? new Date().toISOString(),
        })),
    }),
    [loaded, preferences, update],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used within <PreferencesProvider>");
  return context;
}

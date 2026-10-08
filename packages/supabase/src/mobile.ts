import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { LEDGER_HEADERS } from "./ledger";

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type MobileClientOptions = {
  url: string;
  anonKey: string;
  /** Provide AsyncStorage or SecureStore adapter for session persistence */
  storage?: StorageAdapter;
};

/**
 * Creates a Supabase client for Expo React Native apps.
 *
 * Pass an AsyncStorage / SecureStore adapter for session persistence.
 * Read public configuration in app source so Expo can inline it into the bundle.
 */
export function createMobileClient(options: MobileClientOptions): SupabaseClient<Database> {
  const { url, anonKey: key } = options;

  if (!url || !key) {
    throw new Error("Missing env vars: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient<Database>(url, key, {
    global: { headers: { ...LEDGER_HEADERS } },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      ...(options.storage ? { storage: options.storage } : {}),
    },
  });
}

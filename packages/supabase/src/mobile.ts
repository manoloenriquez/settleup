import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

interface MobileClientOptions {
  /** Provide AsyncStorage or SecureStore adapter for session persistence */
  storage?: StorageAdapter;
}

/**
 * Creates a Supabase client for Expo React Native apps.
 *
 * Pass an AsyncStorage / SecureStore adapter for session persistence.
 * Reads EXPO_PUBLIC_* env vars at runtime.
 */
export function createMobileClient(options: MobileClientOptions = {}) {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const key = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !key) {
    throw new Error(
      "Missing env vars: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      ...(options.storage ? { storage: options.storage } : {}),
    },
  });
}

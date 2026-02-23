import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Creates a Supabase client for use in Client Components.
 *
 * Call this once and store the result (e.g. in a module singleton or context).
 * It reads NEXT_PUBLIC_* env vars at runtime.
 */
export function createBrowserClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !key) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return _createBrowserClient<Database>(url, key);
}

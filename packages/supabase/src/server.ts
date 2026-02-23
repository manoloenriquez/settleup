import { createServerClient as _createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "./database.types";

export interface CookieAdapter {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: Array<{ name: string; value: string; options: CookieOptions }>) => void;
}

/**
 * Creates a Supabase client for use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Pass a CookieAdapter backed by Next.js `cookies()` (see apps/web/src/lib/supabase/server.ts).
 */
export function createServerClient(adapter: CookieAdapter) {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !key) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return _createServerClient<Database>(url, key, {
    cookies: {
      getAll: adapter.getAll,
      setAll: adapter.setAll,
    },
  });
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { LEDGER_HEADERS } from "./ledger";

/**
 * Creates an unauthenticated Supabase client using the anon key.
 * Use in Next.js Server Components for public queries (e.g. friend view via get_friend_view RPC).
 * Never call this from Client Components — import from browser.ts instead.
 */
export function createAnonClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !key) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient<Database>(url, key, { global: { headers: { ...LEDGER_HEADERS } } });
}

/**
 * Creates a Supabase client scoped to a user's access token.
 * Use from server-side route handlers that receive bearer tokens from mobile
 * clients so RLS and auth.uid() still apply normally.
 */
export function createUserScopedClient(token: string) {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !key) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient<Database>(url, key, {
    global: { headers: { ...LEDGER_HEADERS, Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

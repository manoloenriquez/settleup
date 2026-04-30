import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Anonymous Supabase client for JWT verification.
 * Uses the anon key — never the service role key.
 */
export function createAnonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing env vars: SUPABASE_URL and SUPABASE_ANON_KEY");
  }
  return createClient(url, key);
}

/**
 * Supabase client bound to a user's JWT so `auth.uid()` resolves
 * inside RLS policies and SECURITY INVOKER RPCs.
 */
export function createUserScopedClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing env vars: SUPABASE_URL and SUPABASE_ANON_KEY");
  }
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Privileged Supabase client using the service role key. Bypasses RLS.
 * Only call from server-side routes that have already authenticated the
 * caller via authMiddleware and are intentionally performing an admin
 * action (e.g. auth.admin.deleteUser for the caller's own account).
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

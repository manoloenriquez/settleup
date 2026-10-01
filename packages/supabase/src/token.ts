import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { LEDGER_HEADERS } from "./ledger";

/** No session storage or refresh: every request stays bound to this captured user JWT. */
export function createTokenClient(
  url: string,
  anonKey: string,
  token: string,
): SupabaseClient<Database> {
  if (!url || !anonKey || !token) throw new Error("Missing account sync configuration.");
  return createClient<Database>(url, anonKey, {
    accessToken: async () => token,
    global: { headers: { ...LEDGER_HEADERS } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

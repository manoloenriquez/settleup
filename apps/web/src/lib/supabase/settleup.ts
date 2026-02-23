import type { SupabaseClient, Database } from "@template/supabase";
import { createClient } from "./server";

/** Returns a Supabase server client for use with settleup schema tables. */
export async function createSettleUpDb(): Promise<SupabaseClient<Database>> {
  return createClient();
}

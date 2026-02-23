import { createClient } from "./server";

/** Returns a schema-scoped Supabase DB client for all settleup tables. */
export async function createSettleUpDb() {
  const supabase = await createClient();
  return supabase.schema("settleup");
}

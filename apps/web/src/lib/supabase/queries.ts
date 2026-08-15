import { cache } from "react";
import { AuthError, getSessionUser } from "./guards";
import { createClient } from "./server";
import type { Profile, User } from "@template/supabase";

/**
 * One deduplicated getUser() per request. cachedAuth and cachedProfile both
 * consume this, so a navigation that hits the layout (profile) AND a page or
 * several server actions (auth) pays a single Supabase auth round-trip
 * instead of one per wrapper.
 */
const cachedSessionUser = cache(getSessionUser);

/** Deduplicated auth check for Server Actions / pages (throws AuthError). */
export const cachedAuth = cache(async (): Promise<User> => {
  const user = await cachedSessionUser();
  if (!user) throw new AuthError("Authentication required.", "UNAUTHENTICATED");
  return user;
});

/**
 * Deduplicated profile fetch (layout greeting, account page). Shares the
 * getUser() with cachedAuth; adds only the profiles select.
 */
export const cachedProfile = cache(async (): Promise<Profile | null> => {
  const user = await cachedSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data ?? null;
});

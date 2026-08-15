import { getProfile, assertAuth } from "./guards";

/**
 * Request-scoped, deduplicated auth helpers.
 *
 * The React cache() wrappers live in ./guards (getSessionUser / getProfile),
 * so a navigation that hits the layout (profile) AND a page or several server
 * actions (auth) pays a single Supabase auth round-trip instead of one per
 * wrapper. These aliases exist so call sites can keep importing from
 * lib/supabase/queries.
 */

/** Deduplicated profile fetch (layout greeting, account page). Returns null when signed out. */
export const cachedProfile = getProfile;

/** Deduplicated auth check for Server Actions / pages (throws AuthError when unauthenticated). */
export const cachedAuth = assertAuth;

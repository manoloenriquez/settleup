import { cache } from "react";
import { getProfile, assertAuth } from "./guards";

/**
 * Deduplicated profile fetch.
 *
 * React's cache() deduplicates calls within a single render tree (per request),
 * so calling this from both the layout and a page costs only one DB round-trip.
 */
export const cachedProfile = cache(getProfile);

/**
 * Deduplicated auth check.
 *
 * When the group detail page calls 4 server actions in Promise.all,
 * each calls assertAuth(). React.cache() ensures only one JWT validation
 * per request.
 */
export const cachedAuth = cache(assertAuth);

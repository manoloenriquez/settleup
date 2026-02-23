import { cache } from "react";
import { getProfile } from "./guards";

/**
 * Deduplicated profile fetch.
 *
 * React's cache() deduplicates calls within a single render tree (per request),
 * so calling this from both the layout and a page costs only one DB round-trip.
 */
export const cachedProfile = cache(getProfile);

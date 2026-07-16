// ---------------------------------------------------------------------------
// Offline sync core — error classification
//
// Maps raw error information from a replay attempt (Postgres/PostgREST error
// code + message, or a fetch-layer failure) onto a SyncErrorClass that the
// engine acts on. The server-side contract:
//
//   PT409 — idempotency-key mismatch or compare-and-swap conflict
//   PT404 — target row no longer exists
//   23505 — unique violation on a replayed direct insert (already applied)
// ---------------------------------------------------------------------------

import type { OutboxError, SyncErrorClass } from "./types";

const NETWORK_MESSAGE_PATTERNS = [
  /failed to fetch/i, // Chromium fetch
  /network request failed/i, // React Native fetch
  /networkerror/i, // Firefox fetch
  /load failed/i, // Safari fetch
  /fetch failed/i, // undici / Node
  /internet connection appears to be offline/i,
  /could not connect to the server/i,
];

const TIMEOUT_MESSAGE_PATTERNS = [/abort/i, /timed? ?out/i];

/** PostgREST codes that indicate a transient condition worth retrying. */
const RETRYABLE_PG_CODES = new Set([
  "PGRST301", // JWT expired — succeeds after the client refreshes the session
  "PGRST302",
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "57014", // query_canceled (statement timeout)
  "08000", // connection_exception family
  "08003",
  "08006",
]);

export function classifySyncError(code: string | null, message: string): SyncErrorClass {
  if (code === "PT409") return "conflict";
  if (code === "PT404") return "not_found";
  if (code === "23505") return "duplicate";

  if (NETWORK_MESSAGE_PATTERNS.some((re) => re.test(message))) return "network";
  if (TIMEOUT_MESSAGE_PATTERNS.some((re) => re.test(message))) return "retryable";

  if (code !== null) {
    if (RETRYABLE_PG_CODES.has(code)) return "retryable";
    // HTTP 5xx surfaced as a bare status code by some transport layers.
    if (/^5\d\d$/.test(code)) return "retryable";
  }

  return "terminal";
}

export function toOutboxError(code: string | null, message: string): OutboxError {
  return { class: classifySyncError(code, message), code, message };
}

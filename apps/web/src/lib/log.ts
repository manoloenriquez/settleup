/**
 * Server-side error logging for Server Actions.
 *
 * Server Actions return a generic `ApiResponse` error string to the client (never
 * leaking DB/internal details). That's correct for security, but it also means the
 * underlying cause vanishes unless we log it server-side. This helper surfaces the
 * real error in server logs / the log aggregator so failures are diagnosable.
 */
export function logServerError(context: string, error: unknown): void {
  console.error(`[settleup] ${context}:`, error);
}

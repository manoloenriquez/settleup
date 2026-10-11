/**
 * Sent by every Talli client built from this repository. It tells the
 * database the caller understands per-currency ledgers (migration
 * 20260908163441_currency_ledger): restrictive RLS then shows non-PHP rows,
 * and writes to multi-currency groups are allowed. Clients without it (older
 * app builds) keep seeing PHP only and get PT426 "Update the app" for groups
 * that hold other currencies. Harmless before the migration is applied.
 */
export const LEDGER_HEADERS = { "x-ledger-version": "2" } as const;
